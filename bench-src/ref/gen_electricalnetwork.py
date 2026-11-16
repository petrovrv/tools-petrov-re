#!/usr/bin/env python3
"""Independent reference for electricalnetwork.html.

Everything here is written from the standards listed below; no line of it is
derived from the tool's own JavaScript.

IEC 60909-0:2016 "Short-circuit currents in three-phase a.c. systems -
Part 0: Calculation of currents":

  6.1  eq. (3)/(4)   network feeder      Z_Q  = c * U_nQ^2 / S_kQ''
                                         R_Q/X_Q from the given X/R ratio
       eq. (5)       referral to LV      Z_Qt = Z_Q / t_r^2
  6.2  eq. (7)(8)(9) two-winding transformer
                     Z_T = (u_kr/100) * U_rT^2 / S_rT
                     R_T = P_krT / (3 I_rT^2) = P_krT * U_rT^2 / S_rT^2
                     X_T = sqrt(Z_T^2 - R_T^2)
  6.3.3 eq. (12b)    K_T = 0.95 * c_max / (1 + 0.6 x_T),  x_T = X_T S_rT/U_rT^2
  6.4                line impedance, resistance at conductor temperature
  6.8  eq. (26)      asynchronous motor  Z_M = (1/(I_LR/I_rM)) * U_rM/(sqrt3 I_rM)
  4.2  eq. (29)      three-phase         I_k'' = c U_n / (sqrt3 |Z_k|)
       eq. (34)      line-to-line        I_k2'' = c U_n / |Z_1 + Z_2|
       eq. (52)      line-to-earth       I_k1'' = sqrt3 c U_n / |Z_1+Z_2+Z_0|
  4.3.1.2 eq. (55)   i_p = kappa sqrt2 I_k''
          eq. (56)   kappa = 1.02 + 0.98 exp(-3 R/X)
  Table 1            c_max = 1.05/1.10, c_min = 0.95 for LV

IEC 60364-4-41:2005 411.4.4  Z_s * I_a <= U_0   (TN automatic disconnection)
IEC 60364-4-43 / 60364-5-54  adiabatic  S >= I sqrt(t) / k

The network solution uses two structurally different routes:
  (A) slack-node solution of the equivalent-voltage-source network - node f is
      held at c U_n/sqrt3, every other node floats, the linear system is solved
      for the remaining voltages and the fault current is summed at node f;
  (B) for feeders with no motor shunt, the analytic series impedance
      Z = Z_source + sum(Z_branch along the path), which is hand-checkable.
Their mutual deviation is recorded as `crosscheck`.

The load flow is solved by a Newton iteration on the complex nodal power
balance (scipy.optimize), not by a backward/forward sweep.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math, cmath, copy
import numpy as np
from scipy.optimize import fsolve

SQ3 = math.sqrt(3.0)

# conductor model of the page (documented in its own source as an effective
# project model); benchmark cases pin R20 explicitly with the r20 override
# wherever the answer must not depend on it.
RHO20 = {'cu': 18.56, 'al': 29.38}      # ohm mm2 / km at 20 C
ALPHA = {'cu': 0.00393, 'al': 0.00403}  # 1/K
KSC = {'cu': 115.0, 'al': 76.0}         # IEC 60364-4-43 table 43A, PVC


# ----------------------------------------------------------------- impedances
def z_network_feeder(g, mode):
    """IEC 60909-0:2016, 6.1 eq. (3)+(5)."""
    c = g['cMax'] if mode == 'max' else g['cMin']
    sk = (g['SkMax'] if mode == 'max' else g['SkMin']) * 1e6
    zmag = c * g['HV'] ** 2 / sk
    xr = g['XR']
    r = zmag / math.sqrt(1.0 + xr * xr)
    x = xr * r
    t = g['U'] / g['HV']          # LV/HV turns ratio
    return complex(r * t * t, x * t * t)


def z_transformer(g):
    """IEC 60909-0:2016, 6.2 eq. (7)-(9) and 6.3.3 eq. (12b)."""
    S = g['Sn'] * 1000.0
    zb = g['U'] ** 2 / S
    zt = g['uk'] / 100.0 * zb
    rt = g['Pk'] * 1000.0 * g['U'] ** 2 / (S * S)
    xt = math.sqrt(max(0.0, zt * zt - rt * rt))
    xpu = xt / zb
    kT = 0.95 * g['cMax'] / (1.0 + 0.6 * xpu) if g.get('applyKT') else 1.0
    return complex(rt, xt), kT, xpu


def z_source(g, mode):
    zt, kT, _ = z_transformer(g)
    if mode == 'operating':
        # IEC 60909-0:2016 6.1 eq. (3) defines Z_Q *from* a quoted I_kQ''/S_kQ'':
        # Z_Q = c U_nQ/(sqrt3 I_kQ''), i.e. the voltage factor is already inside
        # the quoted short-circuit power, so c U_nQ^2/S_kQ'' *is* the physical
        # feeder impedance and the same value is the right one for the operating
        # (load-flow) case.  The transformer is used uncorrected there, because
        # K_T is a short-circuit correction only (6.3.3).
        return z_network_feeder(g, 'max') + zt
    return z_network_feeder(g, mode) + kT * zt


def r20_of(b):
    if b.get('r20'):
        return float(b['r20'])
    return RHO20[b['material']] / float(b['section'])


def z_branch(b, temp):
    r = r20_of(b) * (1.0 + ALPHA[b['material']] * (temp - 20.0)) * b['length'] / 1000.0
    x = float(b.get('x', 0.0)) * b['length'] / 1000.0
    return complex(r, x)


def auto_pe(section):
    s = float(section)
    if s <= 16:
        return s
    if s <= 35:
        return 16.0
    sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400]
    for q in sizes:
        if q >= s / 2:
            return float(q)
    return s


def z_pe(b, temp):
    s = auto_pe(b['section']) if b.get('peAuto', True) else float(b['peSection'])
    mat = b['material'] if b.get('peAuto', True) else b['peMaterial']
    r = RHO20[mat] / s * (1.0 + ALPHA[mat] * (temp - 20.0)) * b['length'] / 1000.0
    x = float(b.get('peX', b.get('x', 0.0))) * b['length'] / 1000.0
    return complex(r, x)


def z_motor(n, U):
    """IEC 60909-0:2016, 6.8 eq. (26)."""
    if n['type'] != 'load' or n.get('kind') != 'motor' or not n.get('motorSC'):
        return None
    Ir = n['P'] * 1000.0 / (SQ3 * U * n['pf'] * n['eff'])
    zmag = U / (SQ3 * Ir * n['motorILR'])
    rx = n['motorRX']
    x = zmag / math.sqrt(1.0 + rx * rx)
    return complex(rx * x, x)


# --------------------------------------------------------------- network math
def build_admittance(state, mode, motors=True):
    g = state['globals']
    ids = [n['id'] for n in state['nodes']]
    idx = {k: i for i, k in enumerate(ids)}
    N = len(ids)
    temp = g['scMaxTemp'] if mode == 'max' else g['scMinTemp']
    Y = np.zeros((N, N), dtype=complex)
    Y[idx['LV'], idx['LV']] += 1.0 / z_source(g, mode)
    for n in state['nodes']:
        if n['id'] == 'LV':
            continue
        y = 1.0 / z_branch(n['branch'], temp)
        i, j = idx[n['parent']], idx[n['id']]
        Y[i, i] += y
        Y[j, j] += y
        Y[i, j] -= y
        Y[j, i] -= y
    if mode == 'max' and motors:
        for n in state['nodes']:
            zm = z_motor(n, g['U'])
            if zm is not None:
                Y[idx[n['id']], idx[n['id']]] += 1.0 / zm
    return ids, idx, Y, temp


def fault_solution(state, fault_id, mode, cfac, motors=True):
    """Route (A): equivalent voltage source at the fault point, node f held at
    E = c U_n / sqrt3, every other node floating.  IEC 60909-0 4.2."""
    ids, idx, Y, temp = build_admittance(state, mode, motors)
    N = len(ids)
    f = idx[fault_id]
    E = cfac * state['globals']['U'] / SQ3
    rest = [i for i in range(N) if i != f]
    V = np.zeros(N, dtype=complex)
    V[f] = E
    if rest:
        A = Y[np.ix_(rest, rest)]
        b = -Y[np.ix_(rest, [f])].flatten() * E
        V[rest] = np.linalg.solve(A, b)
    Ifault = (Y[f, :] @ V)           # current injected into node f from ground
    Zth = E / Ifault
    # branch currents in the equivalent-source network, from parent to child
    br = {}
    for n in state['nodes']:
        if n['id'] == 'LV':
            continue
        br[n['id']] = (V[idx[n['parent']]] - V[idx[n['id']]]) / z_branch(n['branch'], temp)
    br['MAIN'] = (0.0 - V[idx['LV']]) / z_source(state['globals'], mode)
    return {'E': E, 'Ik': abs(Ifault), 'Zth': Zth, 'V': V, 'branch': br, 'idx': idx}


def series_path_z(state, node_id, mode):
    """Route (B): analytic series impedance, valid when no motor shunt exists."""
    g = state['globals']
    temp = g['scMaxTemp'] if mode == 'max' else g['scMinTemp']
    z = z_source(g, mode)
    nd = {n['id']: n for n in state['nodes']}
    cur = node_id
    while cur != 'LV':
        z += z_branch(nd[cur]['branch'], temp)
        cur = nd[cur]['parent']
    return z


def kappa(z):
    """IEC 60909-0:2016, 4.3.1.2 eq. (56)."""
    return 1.02 + 0.98 * math.exp(-3.0 * z.real / z.imag)


def short_circuit(state, node_id):
    g = state['globals']
    smax = fault_solution(state, node_id, 'max', g['cMax'], motors=True)
    smax0 = fault_solution(state, node_id, 'max', g['cMax'], motors=False)
    smin = fault_solution(state, node_id, 'min', g['cMin'], motors=False)
    k = kappa(smax['Zth'])
    key = 'MAIN' if node_id == 'LV' else node_id
    zdev = smax['E'] / smax['branch'][key]
    if zdev.real < 0:
        zdev = -zdev
    out = {
        'IkMax': smax['Ik'], 'IkMaxNoMot': smax0['Ik'],
        'motorIk': max(0.0, smax['Ik'] - smax0['Ik']),
        'IkMin': smin['Ik'], 'Ik2Min': SQ3 / 2 * smin['Ik'],
        'kappa': k, 'ip': k * math.sqrt(2.0) * smax['Ik'],
        'Zmax': smax['Zth'],
        'deviceIkMax': abs(smax['branch'][key]),
        'deviceIkMin': abs(smin['branch'][key]),
        'deviceIk2Min': SQ3 / 2 * abs(smin['branch'][key]),
        'deviceIp': kappa(zdev) * math.sqrt(2.0) * abs(smax['branch'][key]),
        'SkMax': SQ3 * g['U'] * smax['Ik'] / 1e6,
    }
    # cross-check with the analytic series impedance where it is valid
    has_motor = any(z_motor(n, g['U']) is not None for n in state['nodes'])
    if not has_motor:
        out['xcheck_IkMax'] = g['cMax'] * g['U'] / SQ3 / abs(series_path_z(state, node_id, 'max'))
        out['xcheck_IkMin'] = g['cMin'] * g['U'] / SQ3 / abs(series_path_z(state, node_id, 'min'))
    return out


# -------------------------------------------------------------- load flow ref
def load_flow(state):
    """Newton solution of the complex nodal power balance (scipy fsolve)."""
    g = state['globals']
    U = g['U']
    E = U / SQ3
    ids = [n['id'] for n in state['nodes']]
    idx = {k: i for i, k in enumerate(ids)}
    N = len(ids)
    zs = z_source(g, 'operating')
    Y = np.zeros((N, N), dtype=complex)
    Y[idx['LV'], idx['LV']] += 1.0 / zs
    for n in state['nodes']:
        if n['id'] == 'LV':
            continue
        y = 1.0 / z_branch(n['branch'], g['loadTemp'])
        i, j = idx[n['parent']], idx[n['id']]
        Y[i, i] += y
        Y[j, j] += y
        Y[i, j] -= y
        Y[j, i] -= y
    S = np.zeros(N, dtype=complex)
    for n in state['nodes']:
        if n['type'] != 'load':
            continue
        P = n['P'] * 1000.0
        if n.get('kind') == 'motor':
            P = P / n['eff']
        Q = P * math.tan(math.acos(n['pf']))
        S[idx[n['id']]] = complex(P, Q) / 3.0       # per phase

    Isrc = np.zeros(N, dtype=complex)
    Isrc[idx['LV']] = E / zs

    def resid(v):
        V = v[:N] + 1j * v[N:]
        r = Y @ V - Isrc + np.conj(S / V)
        return np.concatenate([r.real, r.imag])

    v0 = np.concatenate([np.full(N, E), np.zeros(N)])
    sol, info, ier, msg = fsolve(resid, v0, full_output=True, xtol=1e-13)
    V = sol[:N] + 1j * sol[N:]
    assert ier == 1, msg
    assert np.max(np.abs(resid(sol))) < 1e-6

    Ibr = {}
    for n in state['nodes']:
        if n['id'] == 'LV':
            continue
        Ibr[n['id']] = (V[idx[n['parent']]] - V[idx[n['id']]]) / z_branch(n['branch'], g['loadTemp'])
    rootI = sum(Ibr[c['id']] for c in state['nodes'] if c['parent'] == 'LV')
    loss = 0.0
    for n in state['nodes']:
        if n['id'] == 'LV':
            continue
        loss += 3.0 * abs(Ibr[n['id']]) ** 2 * z_branch(n['branch'], g['loadTemp']).real
    return {'V': V, 'idx': idx, 'Ibr': Ibr, 'rootI': rootI, 'loss': loss,
            'Ptot': sum(S.real) * 3.0, 'Psrc': 3.0 * (V[idx['LV']] * np.conj(rootI)).real}


def earth_fault(state, node_id):
    g = state['globals']
    if g['earthing'] == 'TN':
        z = complex(g['ZeR'] / 1000.0, g['ZeX'] / 1000.0)
    elif g['earthing'] == 'TT':
        z = complex(g['RA'] + g['RB'], 0.0)
    else:
        return None
    nd = {n['id']: n for n in state['nodes']}
    cur = node_id
    while cur != 'LV':
        b = nd[cur]['branch']
        z += z_branch(b, g['scMinTemp']) + z_pe(b, g['scMinTemp'])
        cur = nd[cur]['parent']
    return {'If': g['cMin'] * g['U'] / SQ3 / abs(z), 'Z': z}


# ------------------------------------------------------------------ the cases
def br(section=50, length=40, material='cu', x=0.08, r20=None, method='C',
       ambient=30, circuits=1, grouping='bunched', breaker=None):
    b = {'material': material, 'section': section, 'auto': False, 'length': length,
         'method': method, 'ambient': ambient, 'circuits': circuits,
         'grouping': grouping, 'x': x, 'r20': r20, 'peAuto': True,
         'peMaterial': material, 'peSection': auto_pe(section), 'peX': x,
         'breaker': breaker or {'on': False, 'In': 160, 'Isd': 6, 'tsd': 0.2,
                                'Ii': 10, 'ti': 0.025, 't6': 5, 'Icu': 50, 'Icm': 0}}
    return b


def bus(id, parent, name, branch):
    return {'id': id, 'parent': parent, 'type': 'bus', 'name': name, 'P': 0,
            'pf': 0.95, 'eff': 1, 'kind': 'static', 'motorSC': False,
            'motorILR': 5, 'motorRX': 0.42, 'branch': branch}


def load(id, parent, name, P, pf=0.9, eff=1.0, kind='static', motorSC=False,
         ILR=5, RX=0.42, branch=None):
    return {'id': id, 'parent': parent, 'type': 'load', 'name': name, 'P': P,
            'pf': pf, 'eff': eff, 'kind': kind, 'motorSC': motorSC,
            'motorILR': ILR, 'motorRX': RX, 'branch': branch}


def globals_(**kw):
    g = {'U': 400, 'HV': 20000, 'Sn': 630, 'uk': 4.0, 'Pk': 6.5,
         'SkMax': 500, 'SkMin': 250, 'XR': 10, 'cMax': 1.05, 'cMin': 0.95,
         'applyKT': False, 'vdLimit': 5, 'loadTemp': 70, 'scMaxTemp': 20,
         'scMinTemp': 70, 'selMargin': 0.08, 'maxFaultTime': 5,
         'earthing': 'none', 'ZeR': 28, 'ZeX': 18, 'adsTime': 0.4,
         'RA': 50, 'RB': 1, 'Rcd': 300, 'RcdTime': 0.04,
         'mainBreaker': {'on': False, 'In': 1000, 'Isd': 4, 'tsd': 0.45,
                         'Ii': 0, 'ti': 0.05, 't6': 10, 'Icu': 50, 'Icm': 80}}
    g.update(kw)
    return g


def LV():
    return {'id': 'LV', 'parent': None, 'type': 'bus', 'name': 'Main LV bus',
            'P': 0, 'pf': 0.95, 'eff': 1, 'kind': 'static', 'motorSC': False,
            'motorILR': 5, 'motorRX': 0.42, 'branch': None}


def cases():
    out = []

    # 1 - hand-checkable: one feeder, R20 pinned, cable at 20 C for the max case
    st = {'version': 2, 'globals': globals_(), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 100, pf=0.9,
             branch=br(section=95, length=60, x=0.08, r20=0.193))]}
    out.append(('hand_single_feeder', 'L1', st,
                'Single 95 mm2 copper feeder, R20 pinned at 0.193 ohm/km, X 0.08 ohm/km, '
                '630 kVA / 4 % transformer, KT off - the whole chain is a hand sum of '
                'three series impedances.'))

    # 2 - same network, transformer correction factor KT enabled
    st = copy.deepcopy(st)
    st['globals']['applyKT'] = True
    out.append(('hand_single_feeder_KT', 'L1', st,
                'As above with the IEC 60909-0 6.3.3 transformer impedance correction '
                'factor KT = 0.95 cmax/(1+0.6 xT) enabled.'))

    # 3 - LV bus fault (transformer + network feeder only)
    st = {'version': 2, 'globals': globals_(uk=6, Sn=1000, Pk=10.5, SkMax=250,
                                            SkMin=150, XR=12, cMax=1.10,
                                            applyKT=True), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 200, pf=0.85,
             branch=br(section=185, length=25, x=0.08, r20=0.0991))]}
    out.append(('lv_bus_1000kVA', 'LV', st,
                '1000 kVA / 6 % transformer, cmax = 1.10, fault at the LV busbar: '
                'Ik'' is the transformer plus network-feeder impedance only.'))

    # 4 - aluminium feeder, long, min case dominated by cable resistance at 70 C
    st = {'version': 2, 'globals': globals_(scMinTemp=90, cMin=0.95), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 40, pf=0.85,
             branch=br(section=120, length=180, material='al', x=0.08, r20=0.2536))]}
    out.append(('aluminium_long_feeder', 'L1', st,
                '180 m aluminium feeder; minimum-current case at 90 C conductor '
                'temperature exercises the resistance temperature correction.'))

    # 5 - two levels in series
    st = {'version': 2, 'globals': globals_(), 'nodes': [
        LV(),
        bus('DB1', 'LV', 'DB-1', br(section=150, length=45, x=0.08, r20=0.124)),
        load('L1', 'DB1', 'Load 1', 60, pf=0.9,
             branch=br(section=35, length=30, x=0.09, r20=0.524))]}
    out.append(('two_level_series', 'L1', st,
                'Series bus + feeder: the driving-point impedance at the load is the '
                'sum of source, DB-1 feeder and load feeder impedances.'))

    # 6 - motor contribution at the bus where the motor sits
    st = {'version': 2, 'globals': globals_(), 'nodes': [
        LV(),
        bus('DB1', 'LV', 'DB-1', br(section=150, length=45, x=0.08, r20=0.124)),
        load('M1', 'DB1', 'Motor 1', 90, pf=0.88, eff=0.95, kind='motor',
             motorSC=True, ILR=6.0, RX=0.30,
             branch=br(section=70, length=25, x=0.08, r20=0.268))]}
    out.append(('motor_contribution', 'DB1', st,
                'One 90 kW motor with ILR/Ir = 6 feeding a bus fault: the motor branch '
                'is a shunt impedance IEC 60909-0 eq. (26) in parallel with the network.'))

    # 7 - two motors, fault at LV bus
    st = {'version': 2, 'globals': globals_(), 'nodes': [
        LV(),
        load('M1', 'LV', 'Motor 1', 75, pf=0.90, eff=0.94, kind='motor',
             motorSC=True, ILR=6.0, RX=0.30,
             branch=br(section=70, length=80, x=0.08, r20=0.268)),
        load('M2', 'LV', 'Motor 2', 45, pf=0.86, eff=0.92, kind='motor',
             motorSC=True, ILR=6.5, RX=0.35,
             branch=br(section=35, length=45, x=0.08, r20=0.524)),
        load('L1', 'LV', 'Lighting', 30, pf=0.96,
             branch=br(section=16, length=60, x=0.08, r20=1.15))]}
    out.append(('two_motors_lv_fault', 'LV', st,
                'Two motors on separate feeders; fault at the LV busbar. Checks that the '
                'motor contribution is the parallel sum of both motor branches and that '
                'the static load contributes nothing.'))

    # 8 - motor terminal fault (motor sits at the faulted node)
    st = copy.deepcopy(st)
    out.append(('two_motors_motor_terminal', 'M1', st,
                'Same network, fault at the terminals of motor M1: its own locked-rotor '
                'impedance is directly in parallel with the supply.'))

    # 9 - deep radial chain, four levels
    st = {'version': 2, 'globals': globals_(cMax=1.10, SkMax=800, SkMin=200), 'nodes': [
        LV(),
        bus('DB1', 'LV', 'DB-1', br(section=240, length=30, x=0.075, r20=0.0754)),
        bus('DB2', 'DB1', 'DB-2', br(section=95, length=40, x=0.08, r20=0.193)),
        bus('DB3', 'DB2', 'DB-3', br(section=50, length=35, x=0.08, r20=0.387)),
        load('L1', 'DB3', 'Load 1', 25, pf=0.9,
             branch=br(section=16, length=25, x=0.09, r20=1.15)),
        load('L2', 'DB2', 'Load 2', 45, pf=0.92,
             branch=br(section=35, length=20, x=0.09, r20=0.524)),
        load('L3', 'DB1', 'Load 3', 80, pf=0.88,
             branch=br(section=70, length=55, x=0.08, r20=0.268))]}
    out.append(('deep_chain_L1', 'L1', st,
                'Four levels of radial cable; also exercises the load-flow voltage drop '
                'accumulated along the whole path.'))
    out.append(('deep_chain_DB2', 'DB2', copy.deepcopy(st),
                'Same network, fault at DB-2.'))

    # 10 - high X/R source, kappa near its upper limit
    st = {'version': 2, 'globals': globals_(SkMax=2000, SkMin=1500, XR=30,
                                            uk=6, Sn=2000, Pk=18.0,
                                            cMax=1.10, applyKT=True), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 300, pf=0.9,
             branch=br(section=240, length=8, x=0.07, r20=0.0754))]}
    out.append(('stiff_source_high_XR', 'LV', st,
                'Stiff 2 MVA / 6 % transformer on a 2 GVA feeder with X/R = 30: kappa is '
                'close to its 1.8-2.0 range and i_p is the dominant number.'))

    # 11 - resistive network, kappa near 1.02
    st = {'version': 2, 'globals': globals_(), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 10, pf=0.9,
             branch=br(section=2.5, length=45, x=0.09, r20=7.41))]}
    out.append(('resistive_small_cable', 'L1', st,
                'Very small cable far from the transformer: R/X is large, kappa collapses '
                'towards 1.02 and Ik'' is set almost entirely by the cable resistance.'))

    # 12 - TN earth-fault loop
    st = {'version': 2, 'globals': globals_(earthing='TN', ZeR=28, ZeX=18,
                                            scMinTemp=70), 'nodes': [
        LV(),
        bus('DB1', 'LV', 'DB-1', br(section=95, length=40, x=0.08, r20=0.193)),
        load('L1', 'DB1', 'Load 1', 20, pf=0.9,
             branch=br(section=10, length=35, x=0.09, r20=1.83))]}
    out.append(('tn_earth_loop', 'L1', st,
                'TN earth-fault loop: Zs is the upstream loop plus phase and PE conductor '
                'of every feeder on the path; If = cmin U0 / |Zs| (IEC 60364-4-41 411.4.4).'))

    # 13 - load flow with a heavy motor, power balance and voltage drop
    st = {'version': 2, 'globals': globals_(loadTemp=70, vdLimit=8), 'nodes': [
        LV(),
        bus('DB1', 'LV', 'DB-1', br(section=185, length=70, x=0.08, r20=0.0991)),
        load('M1', 'DB1', 'Motor 1', 110, pf=0.87, eff=0.93, kind='motor',
             motorSC=False, branch=br(section=95, length=45, x=0.08, r20=0.193)),
        load('L1', 'DB1', 'Load 1', 90, pf=0.95,
             branch=br(section=70, length=90, x=0.08, r20=0.268))]}
    out.append(('loadflow_motor_and_static', 'L1', st,
                'Load flow: a 110 kW motor (input power P/eta) and a 90 kW static load on '
                'one sub-board. Checks branch current, bus voltage, cumulative voltage '
                'drop, cable losses and the generation = load + losses balance.'))

    # 14 - unity power factor, pure resistive drop
    st = {'version': 2, 'globals': globals_(loadTemp=20), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 150, pf=1.0,
             branch=br(section=120, length=100, x=0.0, r20=0.153))]}
    out.append(('loadflow_unity_pf', 'L1', st,
                'Unity power factor, zero cable reactance: the voltage drop is exactly '
                'R*I and the losses are exactly 3 I^2 R.'))

    # 15 - adiabatic thermal withstand with an unambiguous trip time
    st = {'version': 2, 'globals': globals_(cMax=1.10, SkMax=500), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 55, pf=0.9,
             branch=br(section=35, length=30, x=0.08, r20=0.524,
                       breaker={'on': True, 'In': 100, 'Isd': 6, 'tsd': 0.2,
                                'Ii': 8, 'ti': 0.05, 't6': 5, 'Icu': 50, 'Icm': 0}))]}
    out.append(('adiabatic_thermal', 'L1', st,
                'Breaker instantaneous pickup at 8 In = 800 A is far below the fault '
                'current, so the clearing time is exactly t_i = 0.05 s and the adiabatic '
                'minimum section S = I sqrt(t)/k (IEC 60364-4-43 table 43A, k = 115 for '
                'PVC-insulated copper) can be checked in closed form.'))

    # 16 - TT earthing
    st = {'version': 2, 'globals': globals_(earthing='TT', RA=2, RB=1, Rcd=300,
                                            RcdTime=0.04, adsTime=0.4), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 20, pf=0.9,
             branch=br(section=16, length=40, x=0.08, r20=1.15))]}
    out.append(('tt_earth_loop', 'L1', st,
                'TT system: the earth-fault loop is R_A + R_B plus the phase and PE '
                'conductors of the feeder, If = cmin U0/|Z| (IEC 60364-4-41 411.5).'))

    # 17 - PE conductor smaller than the phase conductor, manually set
    st = {'version': 2, 'globals': globals_(earthing='TN', ZeR=28, ZeX=18), 'nodes': [
        LV(),
        load('L1', 'LV', 'Load 1', 60, pf=0.9,
             branch=br(section=95, length=70, x=0.08, r20=0.193))]}
    st['nodes'][1]['branch']['peAuto'] = False
    st['nodes'][1]['branch']['peSection'] = 50
    st['nodes'][1]['branch']['peMaterial'] = 'al'
    st['nodes'][1]['branch']['peX'] = 0.09
    out.append(('tn_manual_pe', 'L1', st,
                'TN loop with an explicitly chosen 50 mm2 aluminium PE conductor and its '
                'own reactance, so the PE branch of the loop is not the phase conductor.'))

    return out


REFERENCE_LINE = (
    "Independent python implementation of IEC 60909-0:2016 written from the standard's "
    "own equations - network feeder Z_Q = c U_nQ^2/S_kQ'' referred by the turns ratio, "
    "two-winding transformer Z_T/R_T/X_T with the 6.3.3 impedance correction factor K_T, "
    "cable impedance with the resistance temperature correction, asynchronous-motor "
    "locked-rotor impedance eq. (26), the equivalent voltage source c U_n/sqrt3 at the "
    "fault point solved as a slack node of the nodal admittance system, kappa eq. (56) "
    "and i_p eq. (55), the line-to-line relation eq. (34) and the IEC 60364-4-41 earth "
    "fault loop; the load flow is a scipy Newton solution of the complex nodal power "
    "balance, structurally different from the tool's backward/forward sweep. Every "
    "motor-free case is cross-checked against the analytic series path impedance "
    "Z = Z_source + sum(Z_branch), which is also verified by hand for case "
    "hand_single_feeder."
)
CITATIONS = [
    "IEC 60909-0:2016, 6.1 eq. (3)-(5) - network feeder impedance Z_Q = c U_nQ^2/S_kQ'' and its referral Z_Qt = Z_Q/t_r^2",
    "IEC 60909-0:2016, 6.2 eq. (7)-(9) - two-winding transformer Z_T = (u_kr/100) U_rT^2/S_rT, R_T = P_krT/(3 I_rT^2), X_T = sqrt(Z_T^2-R_T^2)",
    "IEC 60909-0:2016, 6.3.3 - transformer impedance correction factor K_T = 0.95 c_max/(1+0.6 x_T)",
    "IEC 60909-0:2016, 6.8 eq. (26) - asynchronous motor Z_M = (1/(I_LR/I_rM)) U_rM/(sqrt3 I_rM)",
    "IEC 60909-0:2016, 4.2 eq. (29) - three-phase initial symmetrical current I_k'' = c U_n/(sqrt3 |Z_k|)",
    "IEC 60909-0:2016, 4.2 eq. (34) - line-to-line current I_k2'' = c U_n/|Z_1+Z_2| = (sqrt3/2) I_k3'' when Z_2 = Z_1",
    "IEC 60909-0:2016, 4.3.1.2 eq. (55)-(56) - i_p = kappa sqrt2 I_k'', kappa = 1.02 + 0.98 exp(-3 R/X)",
    "IEC 60909-0:2016, Table 1 - voltage factor c for low voltage (c_max 1.05/1.10, c_min 0.95)",
    "IEC 60364-4-41:2005, 411.4.4 - automatic disconnection in TN: Z_s I_a <= U_0, evaluated here as I_f = c_min U_0/|Z_s|",
]
TOLERANCE_LINE = (
    "Agreement to the last digit the page prints: |got-ref| <= 0.5*10^-d + 1e-9*|ref|, "
    "with d = 3 decimals for every kA/kappa figure in the selected-feeder panel, "
    "2 decimals for current (A), voltage (V), voltage drop (%) and cable losses (kW), "
    "and 1 decimal for the source-current KPI. Both sides evaluate the same closed-form "
    "IEC 60909 expressions, so the only physical slack is double-precision round-off; "
    "the tolerance is set by the display, not by what makes the tool pass."
)


def build():
    ref = {'cases': [], 'reference_line': REFERENCE_LINE, 'citations': CITATIONS,
           'tolerance_line': TOLERANCE_LINE}
    for cid, focus, state, note in cases():
        sc = short_circuit(state, focus)
        lf = load_flow(state)
        i = lf['idx'][focus]
        g = state['globals']
        Ull = abs(lf['V'][i]) * SQ3
        entry = {
            'id': cid, 'focus': focus, 'note': note, 'state': state,
            'expect': {
                'IkMax_kA': sc['IkMax'] / 1000.0,
                'IkMin_kA': sc['IkMin'] / 1000.0,
                'ip_kA': sc['ip'] / 1000.0,
                'kappa': sc['kappa'],
                'motorIk_kA': sc['motorIk'] / 1000.0,
                'deviceIkMax_kA': sc['deviceIkMax'] / 1000.0,
                'deviceIkMin_kA': sc['deviceIkMin'] / 1000.0,
                'deviceIk2Min_kA': sc['deviceIk2Min'] / 1000.0,
                'deviceIp_kA': sc['deviceIp'] / 1000.0,
                'Zmax_mOhm_R': sc['Zmax'].real * 1000.0,
                'Zmax_mOhm_X': sc['Zmax'].imag * 1000.0,
            },
            'lv': {
                'IkMax_kA': short_circuit(state, 'LV')['IkMax'] / 1000.0,
                'IkMin_kA': short_circuit(state, 'LV')['IkMin'] / 1000.0,
                'ip_kA': short_circuit(state, 'LV')['ip'] / 1000.0,
                'rootI_A': abs(lf['rootI']),
                'loss_kW': lf['loss'] / 1000.0,
                'Ptot_kW': lf['Ptot'] / 1000.0,
                'Psrc_kW': lf['Psrc'] / 1000.0,
            },
        }
        if focus != 'LV':
            entry['expect']['I_A'] = abs(lf['Ibr'][focus])
            entry['expect']['Ull_V'] = Ull
            entry['expect']['vd_pct'] = 100.0 * (g['U'] - Ull) / g['U']
        if 'xcheck_IkMax' in sc:
            entry['crosscheck'] = {
                'IkMax_kA_seriesZ': sc['xcheck_IkMax'] / 1000.0,
                'IkMin_kA_seriesZ': sc['xcheck_IkMin'] / 1000.0,
                'rel_IkMax': abs(sc['xcheck_IkMax'] - sc['IkMax']) / sc['IkMax'],
                'rel_IkMin': abs(sc['xcheck_IkMin'] - sc['IkMin']) / sc['IkMin'],
            }
        ef = earth_fault(state, focus) if g['earthing'] in ('TN', 'TT') and focus != 'LV' else None
        if ef:
            entry['expect']['If_kA'] = ef['If'] / 1000.0
        if focus != 'LV':
            nd = {n['id']: n for n in state['nodes']}[focus]
            bk = nd['branch']['breaker']
            if bk.get('on') and sc['deviceIkMax'] >= bk['Ii'] * bk['In'] > 0:
                t_clear = bk['ti']
                entry['expect']['trip_s'] = t_clear
                entry['expect']['Smin_mm2'] = (sc['deviceIkMax'] * math.sqrt(t_clear)
                                               / KSC[nd['branch']['material']])
        # power-balance invariant: source injection = load + cable losses
        entry['balance'] = {
            'Psrc_kW': lf['Psrc'] / 1000.0,
            'Pload_plus_loss_kW': (lf['Ptot'] + lf['loss']) / 1000.0,
            'rel': abs(lf['Psrc'] - lf['Ptot'] - lf['loss']) / max(1.0, abs(lf['Psrc'])),
        }
        ref['cases'].append(entry)
    return ref


HAND = """Worked example done by hand (case hand_single_feeder):

  Network feeder, IEC 60909-0 6.1 eq. (3):
    Z_Q  = c_max U_nQ^2 / S_kQ'' = 1.05 * 20000^2 / 500e6 = 0.840 ohm (HV side)
    X/R = 10  ->  R_Q = 0.840/sqrt(101) = 0.0835893 ohm, X_Q = 0.835893 ohm
    referred to 400 V: (400/20000)^2 = 4.0e-4
      R_Qt = 3.34357e-5 ohm,  X_Qt = 3.34357e-4 ohm
  Transformer 630 kVA, u_k = 4 %, P_k = 6.5 kW, IEC 60909-0 6.2 eq. (7)-(9):
    Z_b  = 400^2/630000 = 0.253968 ohm ;  Z_T = 0.04*0.253968 = 0.01015873 ohm
    I_rT = 630000/(sqrt3*400) = 909.327 A ; R_T = 6500/(3*909.327^2) = 0.00262006 ohm
    X_T  = sqrt(0.01015873^2 - 0.00262006^2) = 0.00981478 ohm
  Cable 95 mm2, 60 m, R20 = 0.193 ohm/km, X = 0.08 ohm/km, at 20 C:
    R_L = 0.193*0.060 = 0.01158 ohm ;  X_L = 0.08*0.060 = 0.0048 ohm
  Sum at the load terminals:
    R = 3.34357e-5 + 0.00262006 + 0.01158 = 0.01423350 ohm
    X = 3.34357e-4 + 0.00981478 + 0.0048   = 0.01494914 ohm
    |Z| = sqrt(2.025927e-4 + 2.234768e-4) = 0.02064146 ohm
  I_k'' = c_max U_n /(sqrt3 |Z|) = 1.05*400/(1.7320508*0.02064146) = 11747.4 A
  R/X = 0.952128 -> kappa = 1.02 + 0.98 exp(-3*0.952128) = 1.0763629
  i_p = kappa sqrt2 I_k'' = 1.0763629*1.4142136*11747.4 = 17881.4 A = 17.881 kA
Both figures reproduce the python reference to 5 significant digits.
"""

if __name__ == '__main__':
    data = build()
    data['hand_check'] = HAND
    with open(_gp.ref('electricalnetwork_ref.json'), 'w') as f:
        json.dump(data, f, indent=1)
    print(HAND)
    for c in data['cases']:
        x = c.get('crosscheck')
        print('%-28s %-5s Ik=%9.4f kA  ip=%9.4f  kappa=%.4f  xchk=%s  bal=%.2e' % (
            c['id'], c['focus'], c['expect']['IkMax_kA'], c['expect']['ip_kA'],
            c['expect']['kappa'],
            ('%.2e' % x['rel_IkMax']) if x else '   n/a  ',
            c['balance']['rel']))
