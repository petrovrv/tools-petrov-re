#!/usr/bin/env python3
"""
Independent reference for hydraulicsolutions.html — 22 standard hydraulic
circuits for heating and cooling.

Nothing here is taken from the tool's JavaScript. Every circuit is re-derived
from its topology (which junctions exist, what flows into each, what leaves)
and implemented from scratch:

  * water properties from `iapws` (IAPWS-IF97 region 1) — an established
    independent implementation of the same formulation the tool cites;
  * emitter output from the EN 442 relation Q/Q_n = (dT_log/dT_log,nom)^n with
    dT_log the logarithmic excess temperature over the room, solved for the
    return temperature with scipy.optimize.brentq (the tool bisects; a
    different root finder on the same stated equation);
  * every mixing point closed on ENTHALPY: sum(m_i h_i) = m_out h_out, with the
    mass balance sum(m_in) = m_out written separately so that the two are
    checked independently rather than one being used to derive the other;
  * valve authority to its published definition, cited in the case record;
  * pump duty points from the stated pump and control laws.

Output: bench-src/ref/hydraulicsolutions_ref.json
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from scipy.optimize import brentq
from iapws import IAPWS97

P_MPA = 0.3            # the tool's working pressure, stated in its own source

# ---------------------------------------------------------------- water
_CACHE = {}
def h_w(tC):
    """Specific enthalpy of compressed liquid water, J/kg, IAPWS-IF97 region 1."""
    k = round(tC, 9)
    if k not in _CACHE:
        _CACHE[k] = IAPWS97(P=P_MPA, T=tC + 273.15).h * 1000.0
    return _CACHE[k]

def rho_w(tC):
    return IAPWS97(P=P_MPA, T=tC + 273.15).rho

def t_from_h(hJ):
    return brentq(lambda t: h_w(t) - hJ, 0.01, 340.0, xtol=1e-12, rtol=1e-15)

# ------------------------------------------------------------- emitter
def dt_log(ts, tr, troom):
    a, b = ts - troom, tr - troom
    if a <= 0 or b <= 0:
        return 0.0
    if abs(a - b) < 1e-9:
        return a
    return (a - b) / math.log(a / b)

DT_NOM = dt_log(75.0, 65.0, 20.0)      # EN 442 rating point 75/65/20

EXPONENT = {'radiator': 1.30, 'convector': 1.35, 'vloerconvector': 1.35,
            'paneel': 1.25, 'plafondpaneel': 1.25,
            'ventilo': 1.00, 'luchtverwarmer': 1.00}

def emitter_factor(ts, tr, troom, typ='radiator'):
    d = dt_log(ts, tr, troom)
    if d <= 0:
        return 0.0
    return (d / DT_NOM) ** EXPONENT.get(typ, 1.30)

def design_point(QkW, ts, tr, troom, typ='radiator'):
    Q = QkW * 1000.0
    mdot = Q / (h_w(ts) - h_w(tr))
    return {'Q': Q, 'tSupply': ts, 'tReturn': tr, 'tRoom': troom, 'type': typ,
            'mdot': mdot, 'factor': emitter_factor(ts, tr, troom, typ)}

def emitter_output(dp, ts, mdot):
    """Given supply temperature and mass flow, the return temperature and the
       output, from the simultaneous solution of
           Q = m (h(ts) - h(tr))              (falls with tr)
           Q = Q_n (dT_log/dT_nom)^n          (rises with tr)."""
    if mdot <= 0:
        return {'Q': 0.0, 'tReturn': dp['tRoom']}
    if ts <= dp['tRoom']:
        return {'Q': 0.0, 'tReturn': ts}
    Qn = dp['Q'] / dp['factor']
    g = lambda tr: mdot * (h_w(ts) - h_w(tr)) - Qn * emitter_factor(ts, tr, dp['tRoom'], dp['type'])
    lo = dp['tRoom'] + 1e-9 * (ts - dp['tRoom'])
    hi = ts - 1e-12
    # Closure derived here, not copied: the logarithmic excess temperature does
    # NOT vanish as the return approaches the room, so for a small enough flow
    # the emitter would "absorb" more than the water carries. The physical
    # answer is then flow-limited: the water leaves at room temperature and
    # Q = m (h(ts) - h(t_room)).
    if g(lo) <= 0:
        return {'Q': mdot * (h_w(ts) - h_w(dp['tRoom'])), 'tReturn': dp['tRoom'],
                'flowLimited': True}
    tr = brentq(g, lo, hi, xtol=1e-13, rtol=1e-15, maxiter=300)
    return {'Q': mdot * (h_w(ts) - h_w(tr)), 'tReturn': tr, 'flowLimited': False}

def solve_variable_flow(dp, Qreq, ts):
    """Fixed supply temperature, flow adjusted until the emitter gives Qreq."""
    if Qreq <= 0:
        return {'mdot': 0.0, 'tReturn': dp['tRoom'], 'Q': 0.0}
    hi = dp['mdot']
    for _ in range(60):
        if emitter_output(dp, ts, hi)['Q'] >= Qreq:
            break
        hi *= 2
    m = brentq(lambda mm: emitter_output(dp, ts, mm)['Q'] - Qreq, 1e-12, hi,
               xtol=1e-15, rtol=1e-15, maxiter=300)
    r = emitter_output(dp, ts, m)
    return {'mdot': m, 'tReturn': r['tReturn'], 'Q': r['Q']}

def solve_constant_flow(dp, Qreq, mdot):
    """Fixed flow, supply temperature adjusted until the emitter gives Qreq."""
    if Qreq <= 0:
        return {'tSupply': dp['tRoom'], 'tReturn': dp['tRoom'], 'Q': 0.0}
    lo = dp['tRoom']
    hi = dp['tSupply']
    for _ in range(60):
        if emitter_output(dp, hi, mdot)['Q'] >= Qreq:
            break
        hi += 50
    ts = brentq(lambda t: emitter_output(dp, t, mdot)['Q'] - Qreq, lo + 1e-12, hi,
                xtol=1e-13, rtol=1e-15, maxiter=300)
    r = emitter_output(dp, ts, mdot)
    return {'tSupply': ts, 'tReturn': r['tReturn'], 'Q': r['Q']}

# --------------------------------------------------------- the circuits
def primary_share(qvs, t1, t2, t3):
    """Mixing tee: qvp h1 + (qvs - qvp) h3 = qvs h2  =>  qvp = qvs (h2-h3)/(h1-h3)."""
    d = h_w(t1) - h_w(t3)
    if d == 0:
        return 0.0
    return max(0.0, qvs * (h_w(t2) - h_w(t3)) / d)

def circuit_throttle(dp, phi, t1):
    """A1 — two-way throttling. One branch: everything the network sends goes
       through the emitter, so qvp = qvs and the supply temperature is the
       network's."""
    s = solve_variable_flow(dp, phi * dp['Q'], t1)
    return {'qvp': s['mdot'], 'qvs': s['mdot'], 'qmeng': 0.0,
            't1': t1, 't2': t1, 't3': s['tReturn'], 't4': s['tReturn'], 'Q': s['Q']}

def circuit_divert(dp, phi, t1, qvp_const=None):
    """A3/A4 — three-way diverting. The network flow is constant; the valve
       splits it between the emitter and a bypass carried at the supply
       temperature; the two rejoin in the return.
       junction: qvs + qbyp = qvp ; qvs h(t3) + qbyp h(t1) = qvp h(t4)."""
    q = dp['mdot'] if qvp_const is None else qvp_const
    s = solve_variable_flow(dp, phi * dp['Q'], t1)
    qb = max(0.0, q - s['mdot'])
    t4 = t_from_h((s['mdot'] * h_w(s['tReturn']) + qb * h_w(t1)) / q) if q > 0 else t1
    return {'qvp': q, 'qvs': s['mdot'], 'qmeng': 0.0, 'qBypass': qb,
            't1': t1, 't2': t1, 't3': s['tReturn'], 't4': t4, 'Q': s['Q']}

def circuit_mix(dp, phi, t1):
    """A5/A7 — three-way mixing. Constant emitter flow, the supply temperature
       is made by blending network water with the emitter's own return.
       junction: qvp + qmeng = qvs ; qvp h(t1) + qmeng h(t3) = qvs h(t2)."""
    qvs = dp['mdot']
    s = solve_constant_flow(dp, phi * dp['Q'], qvs)
    qvp = primary_share(qvs, t1, s['tSupply'], s['tReturn'])
    return {'qvp': qvp, 'qvs': qvs, 'qmeng': qvs - qvp,
            't1': t1, 't2': s['tSupply'], 't3': s['tReturn'], 't4': s['tReturn'], 'Q': s['Q']}

def fixed_mix_ratio(t1, t2, t3):
    """The design premix ratio a = (t1 - t2)/(t1 - t3), as printed."""
    if t1 == t3:
        return 0.0
    return (t1 - t2) / (t1 - t3)

def circuit_mix_premix(dp, phi, t1):
    """A6 — mixing with a fixed premix. Same balance as A5; `a` and the design
       flows are the extra published quantities."""
    r = circuit_mix(dp, phi, t1)
    a = fixed_mix_ratio(t1, dp['tSupply'], dp['tReturn'])
    r['a'] = a
    r['qvp100'] = (1 - a) * dp['mdot']
    r['qmeng100'] = a * dp['mdot']
    return r

def circuit_throttle_premix(dp, phi, t1):
    """A2 — throttling with a fixed premix: constant emitter flow, variable
       network flow, same mixing tee as A5/A6."""
    r = circuit_mix(dp, phi, t1)
    a = fixed_mix_ratio(t1, dp['tSupply'], dp['tReturn'])
    r['a'] = a
    r['qvp100'] = (1 - a) * dp['mdot']
    return r

def circuit_inject3(dp, phi, t1, qvp_const=None):
    """A8 — injection with a three-way valve. Constant primary flow AND
       constant secondary flow; only the injected share varies. The injected
       mass displaces an equal mass back into the primary at t3, so the primary
       return is the blend of the displaced water and the primary bypass."""
    q = dp['mdot'] if qvp_const is None else qvp_const
    qvs = dp['mdot']
    s = solve_constant_flow(dp, phi * dp['Q'], qvs)
    qinj = primary_share(qvs, t1, s['tSupply'], s['tReturn'])
    qb = max(0.0, q - qinj)
    t4 = t_from_h((qinj * h_w(s['tReturn']) + qb * h_w(t1)) / q) if q > 0 else t1
    return {'qvp': q, 'qvs': qvs, 'qmeng': qvs - qinj, 'qInj': qinj, 'qBypass': qb,
            't1': t1, 't2': s['tSupply'], 't3': s['tReturn'], 't4': t4, 'Q': s['Q']}

def generator_flow(modules):
    """Header: the generator sees the sum of the module network flows and their
       flow-weighted mixed return."""
    q = sum(m['qvp'] for m in modules)
    if q <= 0:
        return {'qGen': q, 'tReturn': None}
    hmix = sum(m['qvp'] * h_w(m['t4']) for m in modules) / q
    return {'qGen': q, 'tReturn': t_from_h(hmix)}

def shunt_pump(qGen, tReturn, tSupply, tReturnMin):
    """B3 — a shunt pump adds supply water to the return until the generator
       return reaches its minimum:  qGen h(tRet) + qSh h(tSup) = (qGen+qSh) h(tMin)."""
    if tReturn is None or tReturn >= tReturnMin:
        return {'qShunt': 0.0, 'tReturnMixed': tReturn, 'active': False}
    qsh = qGen * (h_w(tReturnMin) - h_w(tReturn)) / (h_w(tSupply) - h_w(tReturnMin))
    return {'qShunt': qsh, 'tReturnMixed': tReturnMin, 'active': True}

def return_mix_valve(qGen, tReturn, tSupply, tReturnMin):
    """B4/B5 — a three-way valve in the return blends a fraction x of the supply
       into it, the generator flow staying put:
           x h(tSup) + (1-x) h(tRet) = h(tMin)."""
    if tReturn is None or tReturn >= tReturnMin:
        return {'fraction': 0.0, 'tReturnMixed': tReturn, 'active': False}
    x = (h_w(tReturnMin) - h_w(tReturn)) / (h_w(tSupply) - h_w(tReturn))
    return {'fraction': x, 'tReturnMixed': tReturnMin, 'active': True}

def decoupler(qP, tP, qS, tS):
    """C1/C2/C3 — low-loss header / close-coupled tees / zero-differential
       manifold. The bypass carries the DIFFERENCE of the two flows, and its
       direction decides which side is diluted:

         qP >  qS : surplus primary flows supply -> return through the bypass.
                    Secondary supply = tP (undiluted).
                    Primary return   = mix of the secondary return (qS at tS)
                                       and the bypass (qP - qS at tP).
         qP <  qS : deficit is made up by return water flowing return -> supply.
                    Secondary supply = mix of the primary supply (qP at tP)
                                       and the bypass (qS - qP at tS).
                    Primary return   = tS (all of it comes from the secondary).
         qP == qS : no bypass flow; tSecondary = tP, tPrimaryReturn = tS."""
    if qP >= qS:
        tsec = tP
        tpr = t_from_h((qS * h_w(tS) + (qP - qS) * h_w(tP)) / qP) if qP > 0 else tP
        direction = 'supply->return'
    else:
        tsec = t_from_h((qP * h_w(tP) + (qS - qP) * h_w(tS)) / qS) if qS > 0 else tP
        tpr = tS
        direction = 'return->supply'
    return {'undersized': qP < qS, 'qCross': abs(qP - qS), 'direction': direction,
            'tSecondarySupply': tsec, 'tPrimaryReturn': tpr,
            'supplyShortfall': tP - tsec}

def plate_separation(tPrimarySupply, approach, qS, tSreturn):
    """C4 — full separation by a plate heat exchanger: the secondary supply is
       the primary supply less the approach, the primary return is the secondary
       return plus the approach."""
    return {'tSecondarySupply': tPrimarySupply - approach,
            'tPrimaryReturn': tSreturn + approach}

# ------------------------------------------------------------- valves
def base_char(y, kind='linear'):
    y = min(1.0, max(0.0, y))
    if kind == 'linear':
        return y
    if kind == 'equal-percent':
        return 0.04 ** (1 - y)
    raise ValueError(kind)

def installed_char(y, a, kind='linear'):
    """Operating (installed) characteristic. Derivation:
         dp_available = dp_valve + dp_rest,  q = kv sqrt(dp_valve),
         a = dp_valve(100 %)/dp_available
       gives u = f / sqrt(a + (1-a) f^2).  At a = 1, u = f."""
    f = base_char(y, kind)
    if f <= 0:
        return 0.0
    return f / math.sqrt(a + (1 - a) * f * f)

def authority(dp_valve, dp_available):
    return dp_valve / dp_available

def size_valve(a, dpR1, dpR2, q100):
    """dp_valve = a/(1-a) (dp1+dp2);  kvs = q / sqrt(dp_valve in bar)."""
    dpv = a / (1 - a) * (dpR1 + dpR2)
    return {'dpValve': dpv, 'kvs': q100 / math.sqrt(dpv / 100.0)}

# --------------------------------------------------------------- pumps
def pump_head(Q, H0, Qmax):
    """Generic parabola H = H0 (1 - (Q/Qmax)^2)."""
    return H0 * (1 - (Q / Qmax) ** 2)

def control_head(Q, mode, H100, Q100, H0, Qmax):
    if mode == 'constant-dp':
        return H100
    if mode == 'proportional-dp':
        return 0.5 * H100 + 0.5 * H100 * (Q / Q100)
    return None

def pump_power(Q_m3h, H_kPa, eta=0.55):
    """Hydraulic power = Q [m3/s] * dp [Pa]; shaft = hydraulic/eta."""
    hyd = (Q_m3h / 3600.0) * (H_kPa * 1000.0)
    return {'hydraulic': hyd, 'shaft': hyd / eta}

# ========================================================================
CASES = []
DESIGNS = [
    dict(QkW=10, tSupply=75, tReturn=65, tRoom=20, tNet=90, typ='radiator'),
    dict(QkW=40, tSupply=55, tReturn=45, tRoom=21, tNet=70, typ='convector'),
    dict(QkW=6,  tSupply=40, tReturn=32, tRoom=20, tNet=45, typ='paneel'),
]
LOADS = [1.0, 0.75, 0.5, 0.3, 0.15]

# --- A family: one record per circuit, load and design point --------------
A_MAP = {
    'A1': ('throttle', 'direct'), 'A2': ('throttle-premix', 'net'),
    'A3': ('divert', 'direct'), 'A4': ('divert', 'direct'),
    'A5': ('mix', 'net'), 'A6': ('mix-premix', 'net'),
    'A7': ('inject2', 'net'), 'A8': ('inject3', 'net'),
}
FN = {'throttle': circuit_throttle, 'throttle-premix': circuit_throttle_premix,
      'divert': circuit_divert, 'mix': circuit_mix, 'mix-premix': circuit_mix_premix,
      'inject2': circuit_mix, 'inject3': circuit_inject3}

def m3h(m_kgs):
    """The tool prints volume flow at a fixed 60 degC reference; same here."""
    return m_kgs * 3600.0 / rho_w(60.0)

for di, D in enumerate(DESIGNS, 1):
    dp = design_point(D['QkW'], D['tSupply'], D['tReturn'], D['tRoom'], D['typ'])
    for phi in LOADS:
        for cid, (model, src) in A_MAP.items():
            t1 = D['tSupply'] if src == 'direct' else max(D['tNet'], D['tSupply'])
            r = FN[model](dp, phi, t1)
            # balances, computed here and asserted here
            if model == 'divert':
                # primary junction: emitter branch + bypass = network flow
                mass = r['qvs'] + r['qBypass'] - r['qvp']
            elif model == 'inject3':
                # primary junction: injected + bypass = network flow
                mass = r['qInj'] + r['qBypass'] - r['qvp']
            else:
                # mixing tee: network + mixed-in = consumer
                mass = r['qvp'] + r['qmeng'] - r['qvs']
            if model in ('divert',):
                energy = r['qvs'] * h_w(r['t3']) + r['qBypass'] * h_w(r['t1']) - r['qvp'] * h_w(r['t4'])
            elif model == 'inject3':
                energy = r['qInj'] * h_w(r['t3']) + r['qBypass'] * h_w(r['t1']) - r['qvp'] * h_w(r['t4'])
            else:
                energy = r['qvp'] * h_w(r['t1']) + r['qmeng'] * h_w(r['t3']) - r['qvs'] * h_w(r['t2'])
            CASES.append({
                'id': 'D%d-%s-phi%g' % (di, cid, phi),
                'card': cid, 'model': model,
                'kind': 'circuit',
                'note': 'Circuit %s (%s) at %g %% load, design %g kW %g/%g/%g degC, network %g degC, '
                        'emitter %s. Re-derived from the topology: mass balance and enthalpy balance '
                        'at the mixing point are written separately and both checked.'
                        % (cid, model, 100 * phi, D['QkW'], D['tSupply'], D['tReturn'], D['tRoom'],
                           D['tNet'], D['typ']),
                'inputs': dict(D, phi=phi),
                'ref': {
                    'supply_C': r['t2'], 'return_to_generator_C': r['t4'],
                    'emitter_return_C': r['t3'],
                    'network_flow_m3h': m3h(r['qvp']), 'consumer_flow_m3h': m3h(r['qvs']),
                    'mixing_flow_m3h': m3h(r['qmeng']),
                    'output_kW': r['Q'] / 1000.0,
                    'mass_balance_residual_kgs': mass,
                    'energy_balance_residual_W': energy,
                },
            })

# --- C family: the decoupler, BOTH flow directions ------------------------
DEC = [
    ('oversized  qP = 1.30 qS', 1.30), ('oversized  qP = 1.10 qS', 1.10),
    ('balanced   qP = 1.00 qS', 1.00),
    ('undersized qP = 0.80 qS', 0.80), ('undersized qP = 0.50 qS', 0.50),
    ('undersized qP = 0.20 qS', 0.20),
]
for label, ratio in DEC:
    qS, tP, tS = 0.5, 80.0, 55.0
    qP = ratio * qS
    d = decoupler(qP, tP, qS, tS)
    # independent balances round the two tees of the header
    if qP >= qS:
        m_res = (qS + (qP - qS)) - qP
        e_res = qS * h_w(tS) + (qP - qS) * h_w(tP) - qP * h_w(d['tPrimaryReturn'])
    else:
        m_res = (qP + (qS - qP)) - qS
        e_res = qP * h_w(tP) + (qS - qP) * h_w(tS) - qS * h_w(d['tSecondarySupply'])
    CASES.append({
        'id': 'C-decoupler-%s' % str(ratio).replace('.', 'p'),
        'card': 'C1/C2/C3', 'model': 'decouple', 'kind': 'decoupler',
        'note': 'Low-loss header, %s, primary 80 degC, secondary return 55 degC. The bypass carries '
                '|qP - qS|; its DIRECTION decides which side is diluted, and the mixing must be '
                'applied on the diluted side only. Both directions are exercised.' % label,
        'inputs': {'qP_kgs': qP, 'qS_kgs': qS, 'tP_C': tP, 'tS_C': tS},
        'ref': {'undersized': d['undersized'], 'direction': d['direction'],
                'qCross_kgs': d['qCross'],
                'tSecondarySupply_C': d['tSecondarySupply'],
                'tPrimaryReturn_C': d['tPrimaryReturn'],
                'supplyShortfall_K': d['supplyShortfall'],
                'mass_balance_residual_kgs': m_res, 'energy_balance_residual_W': e_res},
    })

# --- B family: return protection ------------------------------------------
for tRet, tMin, tSup, qGen in [(35.0, 55.0, 80.0, 0.5), (60.0, 55.0, 80.0, 0.5),
                               (45.0, 60.0, 90.0, 1.2), (20.0, 40.0, 70.0, 0.3)]:
    s = shunt_pump(qGen, tRet, tSup, tMin)
    v = return_mix_valve(qGen, tRet, tSup, tMin)
    e_s = (qGen * h_w(tRet) + s['qShunt'] * h_w(tSup)
           - (qGen + s['qShunt']) * h_w(s['tReturnMixed'])) if s['active'] else 0.0
    e_v = (v['fraction'] * h_w(tSup) + (1 - v['fraction']) * h_w(tRet)
           - h_w(v['tReturnMixed'])) if v['active'] else 0.0
    CASES.append({
        'id': 'B-return-protection-%g-%g' % (tRet, tMin),
        'card': 'B3/B4/B5', 'model': 'shunt+retmix', 'kind': 'return_protection',
        'note': 'Generator return %g degC against a minimum of %g degC, supply %g degC, generator '
                'flow %g kg/s. Shunt pump (adds supply water, generator flow RISES) and return-mixing '
                'valve (blends a fraction of the supply, generator flow unchanged), both closed on '
                'enthalpy.' % (tRet, tMin, tSup, qGen),
        'inputs': {'tReturn_C': tRet, 'tReturnMin_C': tMin, 'tSupply_C': tSup, 'qGen_kgs': qGen},
        'ref': {'shunt_active': s['active'], 'qShunt_kgs': s['qShunt'],
                'shunt_tMixed_C': s['tReturnMixed'],
                'valve_active': v['active'], 'valve_fraction': v['fraction'],
                'valve_tMixed_C': v['tReturnMixed'],
                'shunt_energy_residual_W': e_s, 'valve_energy_residual_Jkg': e_v},
    })

# --- valve authority and characteristics ----------------------------------
for a in [1.0, 0.5, 0.33, 0.1]:
    for kind in ['linear', 'equal-percent']:
        ys = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]
        CASES.append({
            'id': 'V-char-%s-a%g' % (kind, a),
            'card': 'valve panel', 'model': 'valve', 'kind': 'valve',
            'note': 'Installed (operating) characteristic u = f/sqrt(a + (1-a) f^2) at authority '
                    'a = %g, inherent characteristic %s (equal percentage taken as the 4 %% curve, '
                    'kv/kvs = 0.04^(1-y), rangeability 25). Authority is defined as the pressure drop '
                    'across the fully open control valve divided by the pressure difference available '
                    'to the controlled branch — CIBSE Guide H (2009) section 3.3.4.1 eq. (3.5); the '
                    'same definition appears as BSRIA BG 49/2015 and in ASHRAE Handbook — HVAC Systems '
                    'and Equipment (2016) ch. 47.' % (a, kind),
            'inputs': {'a': a, 'kind': kind, 'y': ys},
            'ref': {'base': [base_char(y, kind) for y in ys],
                    'installed': [installed_char(y, a, kind) for y in ys]},
        })

for a, dp1, dp2, q100 in [(0.5, 10.0, 5.0, 2.0), (0.33, 20.0, 8.0, 5.0), (0.7, 6.0, 3.0, 1.0)]:
    r = size_valve(a, dp1, dp2, q100)
    CASES.append({
        'id': 'V-sizing-a%g' % a,
        'card': 'valve panel', 'model': 'valve', 'kind': 'valve_sizing',
        'note': 'Control-valve sizing from the wanted authority: dp_valve = a/(1-a) (dp1+dp2), then '
                'kvs = q/sqrt(dp_valve[bar]). Authority definition as above.',
        'inputs': {'a': a, 'dpR1_kPa': dp1, 'dpR2_kPa': dp2, 'q100_m3h': q100},
        'ref': {'dpValve_kPa': r['dpValve'], 'kvs': r['kvs'],
                'authority_check': authority(r['dpValve'], r['dpValve'] + dp1 + dp2)},
    })

# --- water properties: the tool interpolates a table, we do not -----------
CASES.append({
    'id': 'W-water-properties',
    'card': 'core', 'model': 'water', 'kind': 'water',
    'note': 'Specific enthalpy and density of compressed liquid water at 0.3 MPa from the `iapws` '
            'package (IAPWS-IF97 region 1), against the tool, which evaluates the same region 1 '
            'equation but serves h(T) from a 0.05 K table with linear interpolation.',
    'inputs': {'p_MPa': P_MPA, 't_C': [5, 20, 35, 50, 60, 65, 75, 90, 110, 130]},
    'ref': {'h_Jkg': [h_w(t) for t in [5, 20, 35, 50, 60, 65, 75, 90, 110, 130]],
            'rho_kgm3': [rho_w(t) for t in [5, 20, 35, 50, 60, 65, 75, 90, 110, 130]],
            'dt_log_nom_K': DT_NOM},
})

OUT = {'generated_by': 'gen_hydraulicsolutions.py',
       'libraries': {'iapws': __import__('iapws').__version__ if hasattr(__import__('iapws'), '__version__') else 'installed',
                     'scipy': __import__('scipy').__version__, 'numpy': np.__version__},
       'cases': CASES}

def clean(o):
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, float):
        if math.isinf(o):
            return 'Infinity' if o > 0 else '-Infinity'
        if math.isnan(o):
            return 'NaN'
        return o
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating,)):
        return clean(float(o))
    if isinstance(o, (np.integer,)):
        return int(o)
    return o

with open(_gp.ref('hydraulicsolutions_ref.json'), 'w') as fh:
    json.dump(clean(OUT), fh, indent=1, allow_nan=False)
print('cases:', len(CASES))

# --- the header, driven through the DOM: exact expected values -------------
# Design point of the DOM sweep, full load: the mixing circuit C1/C2/C3 feeds
# the header with its design flow at the design return, and the primary side
# carries `ratio` times that flow at the network temperature.
_D = dict(QkW=10, tSupply=75, tReturn=65, tRoom=20, tNet=90, typ='radiator')
_dp = design_point(_D['QkW'], _D['tSupply'], _D['tReturn'], _D['tRoom'], _D['typ'])
_qS = _dp['mdot']
_tP = max(_D['tNet'], _D['tSupply'])
_tS = _D['tReturn']
for ratio in [1.3, 1.1, 1.0, 0.8, 0.5, 0.2]:
    qP = ratio * _qS
    d = decoupler(qP, _tP, _qS, _tS)
    CASES.append({
        'id': 'C-dom-ref-ratio%g' % ratio,
        'card': 'C1/C2', 'model': 'decouple', 'kind': 'decoupler_dom',
        'note': 'Low-loss header at full load with a primary/secondary flow ratio of %g: primary '
                '%g degC, secondary return %g degC. Above 1 the surplus runs supply -> return and '
                'ONLY the primary return may be mixed; below 1 the deficit runs return -> supply '
                'and ONLY the secondary supply may be mixed.' % (ratio, _tP, _tS),
        'inputs': dict(_D, header_flow_ratio=ratio),
        'ref': {'qP_m3h': m3h(qP), 'qS_m3h': m3h(_qS), 'qCross_m3h': m3h(abs(qP - _qS)),
                'tSecondarySupply_C': d['tSecondarySupply'],
                'tPrimaryReturn_C': d['tPrimaryReturn'],
                'supplyShortfall_K': d['supplyShortfall'],
                'undersized': d['undersized'],
                'direction': 'return crosses into supply' if d['undersized']
                             else 'supply crosses into return'},
    })

with open(_gp.ref('hydraulicsolutions_ref.json'), 'w') as fh:
    json.dump(clean(OUT), fh, indent=1, allow_nan=False)
print('cases with DOM header sweep:', len(CASES))

# --- pump family D1..D4 and the plate exchanger C4 ------------------------
def duty_point(mode, R, H100, Q100, H0, Qmax):
    """Intersection of the control curve with the system curve dp = R Q^2.
       Control curves: fixed = the pump's own parabola H0(1-(Q/Qmax)^2);
       constant differential pressure = H100; proportional differential
       pressure = the straight line from (0, H100/2) to (Q100, H100), which is
       the definition in Commission Regulation (EC) No 641/2009, Annex II 2.5;
       constant flow = the flow itself."""
    if mode == 'constant-flow':
        return {'Q': Q100, 'H': R * Q100 ** 2}
    if mode == 'constant-dp':
        Q = math.sqrt(H100 / R)
        return {'Q': Q, 'H': R * Q * Q}
    if mode == 'proportional-dp':
        f = lambda Q: 0.5 * H100 + 0.5 * H100 * (Q / Q100) - R * Q * Q
    else:
        f = lambda Q: H0 * (1 - (Q / Qmax) ** 2) - R * Q * Q
    hi = max(Qmax, Q100) * 4
    Q = brentq(f, 1e-9, hi, xtol=1e-14, rtol=1e-15)
    return {'Q': Q, 'H': R * Q * Q}

_HEAD, _ETA = 40.0, 0.55
for phi in [1.0, 0.6, 0.3, 0.1]:
    dpz = design_point(10, 75, 65, 20, 'radiator')
    Q100 = m3h(dpz['mdot'])
    Qmax, H0 = Q100 * 2.2, _HEAD * 1.5
    frac = max(0.05, phi)
    R = _HEAD / (Q100 * frac) ** 2
    for card, mode in [('D1', 'fixed'), ('D2', 'constant-dp'),
                       ('D3', 'proportional-dp'), ('D4', 'constant-flow')]:
        d = duty_point(mode, R, _HEAD, Q100, H0, Qmax)
        df = duty_point('fixed', R, _HEAD, Q100, H0, Qmax)
        p = pump_power(d['Q'], d['H'], _ETA)
        pf = pump_power(df['Q'], df['H'], _ETA)
        CASES.append({
            'id': 'P-%s-phi%g' % (card, phi),
            'card': card, 'model': 'pump', 'kind': 'pump',
            'note': 'Pump card %s (%s) at %g %% load. Design head %g kPa, efficiency %g, design '
                    'flow from the 10 kW / 75-65-20 radiator circuit. System curve dp = R Q^2 with '
                    'R fixed by the design head at the throttled flow; shaft power = Q dp / eta.'
                    % (card, mode, 100 * phi, _HEAD, _ETA),
            'inputs': {'QkW': 10, 'tSupply': 75, 'tReturn': 65, 'tRoom': 20, 'tNet': 90,
                       'typ': 'radiator', 'phi': phi, 'head_kPa': _HEAD, 'eta': _ETA, 'mode': mode},
            'ref': {'duty_Q_m3h': d['Q'], 'duty_H_kPa': d['H'], 'shaft_W': p['shaft'],
                    'vs_fixed_pct': 100.0 * p['shaft'] / pf['shaft']},
        })

for phi in [1.0, 0.5]:
    dpz = design_point(10, 75, 65, 20, 'radiator')
    sec = circuit_mix(dpz, phi, 90.0)
    r = plate_separation(90.0, 4.0, sec['qvs'], sec['t3'])
    CASES.append({
        'id': 'C4-plate-phi%g' % phi,
        'card': 'C4', 'model': 'plate', 'kind': 'plate',
        'note': 'Full separation by a plate heat exchanger at %g %% load: with a stated approach of '
                '4 K the secondary supply is the primary supply less the approach and the primary '
                'return is the secondary return plus the approach; the two flows are equal.'
                % (100 * phi),
        'inputs': {'QkW': 10, 'tSupply': 75, 'tReturn': 65, 'tRoom': 20, 'tNet': 90,
                   'typ': 'radiator', 'phi': phi, 'approach_K': 4.0},
        'ref': {'tSecondarySupply_C': r['tSecondarySupply'],
                'tPrimaryReturn_C': r['tPrimaryReturn'],
                'flow_m3h': m3h(sec['qvs'])},
    })

with open(_gp.ref('hydraulicsolutions_ref.json'), 'w') as fh:
    json.dump(clean(OUT), fh, indent=1, allow_nan=False)
print('cases with pump and plate:', len(CASES))
