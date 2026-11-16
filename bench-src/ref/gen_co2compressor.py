#!/usr/bin/env python3
# gen_co2compressor.py -- Build an independent reference corpus for real-gas
# polytropic CO2 compression stages (stepwise polytropic path, N=400 sub-steps).
# Properties: CoolProp PropsSI, fluid 'CO2' (default HEOS backend); the CoolProp
# version is printed at run time for traceability.
# Independence: this script uses only CoolProp and the Python standard library.
# It does not import or reuse any code from the tool under test.
# Solve level: train() re-implements the full train (equal-ratio staging with
# intercooler dp, dense-phase pump, ship liquefaction, dehydration duty) from the
# module specification for the 7 presets -> kWh/t, electric power, outlet T.
# Output: co2compressor_ref.json, written next to this script.
import os
import json
import CoolProp
from CoolProp.CoolProp import PropsSI

FLUID = 'CO2'
N = 400
PAIRS = [(1.5, 3.0), (3.0, 6.0), (6.0, 12.0), (12.0, 24.0), (24.0, 45.0),
         (45.0, 80.0), (1.5, 4.0), (30.0, 60.0)]
T_IN_C = [30, 40]
ETAS = [0.75, 0.82]


def stage(p1_bar, p2_bar, t1_c, eta):
    p1, p2, t1 = p1_bar * 1e5, p2_bar * 1e5, t1_c + 273.15
    h_in = PropsSI('H', 'P', p1, 'T', t1, FLUID)
    s_in = PropsSI('S', 'P', p1, 'T', t1, FLUID)
    h, s = h_in, s_in
    for i in range(1, N + 1):
        p_i = p1 * (p2 / p1) ** (i / N)
        hs = PropsSI('H', 'P', p_i, 'S', s, FLUID)
        h = h + (hs - h) / eta
        s = PropsSI('S', 'P', p_i, 'H', h, FLUID)
    t2 = PropsSI('T', 'P', p2, 'H', h, FLUID)
    w_is = PropsSI('H', 'P', p2, 'S', s_in, FLUID) - h_in
    return t2 - 273.15, (h - h_in) / 1e3, w_is / 1e3


# ---- full-train reference (Claude, chunk b01, 2026-10-19) ----
import math

def _dp(p):
    return max(0.015 * p, 1e4)

def _pfinal(r, n, pin):
    p = pin
    p2 = pin
    for i in range(n):
        p2 = p * r
        if i < n - 1:
            p = p2 - _dp(p2)
    return p2

def _ratio(n, pin, pt):
    lo = 1e-6
    hi = max((pt / pin) ** (1.0 / n) * 1.5, 1.01)
    while _pfinal(hi, n, pin) < pt:
        hi *= 1.5
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        if _pfinal(mid, n, pin) < pt:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-14:
            break
    return 0.5 * (lo + hi)

def _run(n, r, x, pt):
    p, T, res = x['pin'], x['Tin'], []
    for i in range(n):
        p2 = pt if i == n - 1 else p * r
        T2, w, wis = stage(p / 1e5, p2 / 1e5, T - 273.15, x['etap'])
        res.append((p, p2, T2 + 273.15, w))
        if i < n - 1:
            p, T = p2 - _dp(p2), x['Tic']
    return res

def train(x):
    mdot, pin, pout = x['mdot'], x['pin'], x['pout']
    dest = x['dest']
    pump = False
    if dest == 'shipMP':
        pt = 15e5
    elif dest == 'shipLP':
        pt = 7e5
    else:
        pt = pout
        if x['pumpOn'] and pout > x['pSwitch']:
            if PropsSI('D', 'P', x['pSwitch'], 'T', x['Tpump'], FLUID) >= 600:
                pump, pt = True, x['pSwitch']
    rmax, nmax, Tmax = x['rmax'], int(x['nmax']), x['Tmax']
    n0 = 1 if pt <= pin else max(1, math.ceil(math.log(pt / pin) / math.log(rmax) - 1e-9))
    limited, st, nS = True, None, nmax
    for n in range(n0, nmax + 1):
        r = _ratio(n, pin, pt)
        s = _run(n, r, x, pt)
        if all(p2 / p1 <= rmax * (1 + 1e-9) and T2 <= Tmax for p1, p2, T2, w in s):
            limited, st, nS = False, s, n
            break
    if st is None:
        nS = max(1, nmax)
        st = _run(nS, _ratio(nS, pin, pt), x, pt)
    Pcomp = sum(mdot * w * 1e3 / (1 - x['loss']) / x['etaMotor'] for _, _, _, w in st)
    Ppump = Pliq = 0.0
    if pump:
        T2, w, wis = stage(x['pSwitch'] / 1e5, pout / 1e5, x['Tpump'] - 273.15, x['etaPump'])
        Ppump = mdot * w * 1e3 / x['etaPumpMotor']
        Tout, pOut = T2 + 273.15, pout
    elif dest in ('shipMP', 'shipLP'):
        pLiq = pt
        Tsat = PropsSI('T', 'P', pLiq, 'Q', 0, FLUID)
        Tliq = Tsat - 2.0
        Q = mdot * (PropsSI('H', 'P', pLiq, 'T', x['Tic'], FLUID)
                    - PropsSI('H', 'P', pLiq, 'T', Tliq, FLUID))
        Tevap, Tcond = Tsat - 5.0, x['Tcw'] + 10.0
        COP = 0.55 * Tevap / (Tcond - Tevap)
        Pliq = Q / COP * 1.05
        Tout, pOut = Tliq, pLiq
    else:
        Tout, pOut = x['Tic'], pout
    Pdehy = {'teg': 0.3, 'molsieve': 0.75}.get(x['dehy'], 0.0) * 3600.0 * mdot
    Ptot = Pcomp + Ppump + Pliq + Pdehy
    k = lambda P: P / mdot / 3600.0
    return {
        'nStages': nS,
        'P_el_MW': Ptot / 1e6,
        'kWh_t': k(Ptot),
        'comp_kWh_t': k(Pcomp),
        'pump_kWh_t': k(Ppump),
        'liq_kWh_t': k(Pliq),
        'Tout_C': Tout - 273.15,
        'pOut_bar': pOut / 1e5,
        'limited': limited,
    }


# ---- presets + solve cases (Claude, chunk b02) ----
MACH = {
    'IG':  {'etap': 0.83, 'rmax': 2.2, 'nmax': 8, 'Tmax': 433.15, 'loss': 0.03, 'etaMotor': 0.97},
    'INL': {'etap': 0.80, 'rmax': 3.5, 'nmax': 6, 'Tmax': 453.15, 'loss': 0.02, 'etaMotor': 0.97},
    'REC': {'etap': 0.82, 'rmax': 3.5, 'nmax': 6, 'Tmax': 423.15, 'loss': 0.06, 'etaMotor': 0.95},
}

BASE = dict(Tcw=298.15, Tpump=298.15, etaPump=0.75, etaPumpMotor=0.95)

_HOURS_S = 8000 * 3600


def _p(kg_yr, pin, Tin, pout, Tic, machine, dest, pumpOn, pSwitch, dehy):
    return dict(mdot=kg_yr / _HOURS_S, pin=pin, Tin=Tin, pout=pout, Tic=Tic,
                machine=machine, dest=dest, pumpOn=pumpOn, pSwitch=pSwitch, dehy=dehy)


PRESETS = {
    'amine_1mt_onshore_110':   _p(1.0e9, 1.6e5, 313.15, 110e5, 308.15, 'IG', 'pipeline', True, 80e5, 'teg'),
    'cement_4mt_offshore_150': _p(4.0e9, 1.3e5, 308.15, 150e5, 303.15, 'IG', 'pipeline', True, 85e5, 'teg'),
    'gas_phase_35bar_inl':     _p(2.0e9, 1.5e5, 313.15, 35e5, 313.15, 'INL', 'pipeline', False, 35e5, 'teg'),
    'ship_mp_15bar_1mt':       _p(1.0e9, 1.5e5, 313.15, 15e5, 303.15, 'IG', 'shipMP', False, 15e5, 'molsieve'),
    'ship_lp_7bar_1p5mt':      _p(1.5e9, 1.5e5, 313.15, 7e5, 303.15, 'IG', 'shipLP', False, 7e5, 'molsieve'),
    'biogas_50kt_rec_110':     _p(0.05e9, 1.05e5, 308.15, 110e5, 313.15, 'REC', 'pipeline', False, 110e5, 'teg'),
    'hp_ferment_nh3_110':      _p(0.2e9, 1.1e5, 303.15, 110e5, 308.15, 'IG', 'pipeline', True, 80e5, 'teg'),
}


def solve_cases():
    cases = []
    for pid, inputs in PRESETS.items():
        merged = {**BASE, **MACH[inputs['machine']], **inputs}
        ref = train(merged)
        case = {
            'id': 'solve-' + pid,
            'kind': 'solve',
            'preset': pid,
            'note': 'full train, CoolProp HEOS, equal-ratio staging',
            'inputs': dict(inputs),
            'ref': ref,
        }
        cases.append(case)
        print(f"{case['id']:<36} nStages={ref['nStages']:>2}  "
              f"kWh/t={ref['kWh_t']:8.2f}  Tout={ref['Tout_C']:7.2f} C")
    return cases


def main():
    print(f"CoolProp version: {CoolProp.__version__}")
    out = []
    for p1, p2 in PAIRS:
        for t in T_IN_C:
            for eta in ETAS:
                cid = f"st-{p1}-{p2}bar-{t}C-eta{eta}"
                try:
                    t2, w, wis = stage(p1, p2, t, eta)
                except Exception as exc:
                    print(f"SKIP {cid}: {exc}")
                    continue
                out.append({'id': cid,
                            'note': 'polytropic stage, CoolProp HEOS N=400',
                            'p1_bar': float(p1), 'p2_bar': float(p2),
                            'T1_C': float(t), 'eta_p': float(eta),
                            'ref': {'T2_C': float(t2), 'w_kJkg': float(w),
                                    'wis_kJkg': float(wis)}})
    out.extend(solve_cases())
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'co2compressor_ref.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(out)} cases to {path}")


if __name__ == '__main__':
    main()
