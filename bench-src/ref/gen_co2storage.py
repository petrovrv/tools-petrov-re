#!/usr/bin/env python3
# gen_co2storage.py - independent reference corpus for CO2 injection-well tubing pressure profiles.
# Uses only CoolProp PropsSI('D','V','P',p,'T',T,'CO2') and the Python standard library;
# independent of the tool code. Also full-solve cases (b01 ref_solve) from co2storage_solve_inputs.json.
# this script (os.path.dirname(os.path.abspath(__file__))).
import json, math, os
import CoolProp
from CoolProp.CoolProp import PropsSI

G, EPS, N, PMIN = 9.80665, 4.5e-5, 2000, 1e5
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "co2storage_ref.json")
NOTE = "tubing march RK4 N=2000 Colebrook, CoolProp HEOS"

class Skip(Exception):
    pass

def friction(re, d):
    if re < 2300.0:
        return 64.0 / re
    x = 1.0 / math.sqrt(0.02)  # x = 1/sqrt(f)
    for _ in range(200):
        xn = -2.0 * math.log10(EPS / (3.7 * d) + 2.51 * x / re)
        if abs(xn - x) < 1e-13:
            x = xn
            break
        x = xn
    return 1.0 / (x * x)

def rhs(s, p, depth, q, d, twh, tres):
    if p < PMIN or not math.isfinite(p):
        raise Skip
    z = depth - s
    T = twh + (tres - twh) * z / depth + 273.15
    try:  # model fix: (p,T) on/near saturation -> two-phase crossing, outside single-phase reference
        rho = PropsSI('D', 'P', p, 'T', T, 'CO2')
        mu = PropsSI('V', 'P', p, 'T', T, 'CO2')
    except ValueError as e:
        raise Skip from e
    v = q / (rho * math.pi * d * d / 4.0)
    re = rho * v * d / mu
    return -rho * G, friction(re, d) * rho * v * v / (2.0 * d)

def march(depth, bhp, q, d, twh, tres):
    h = depth / N
    p, hyd, fr = bhp, 0.0, 0.0
    f = lambda s, pp: rhs(s, pp, depth, q, d, twh, tres)
    for i in range(N):
        s = i * h
        k1 = f(s, p)
        k2 = f(s + h / 2, p + h / 2 * sum(k1))
        k3 = f(s + h / 2, p + h / 2 * sum(k2))
        k4 = f(s + h, p + h * sum(k3))
        hyd += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        fr += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        p += h / 6 * (sum(k1) + 2 * sum(k2) + 2 * sum(k3) + sum(k4))
        if p < PMIN:
            raise Skip
    return p, hyd, fr


# ---- b01 (Claude): independent full-solve reference (reservoir, capacity, injectivity, well sizing, WHP, cost) ----
def _rget(s, *keys, default=None):
    c = s.get('cost') or {}
    for d in (s, c):
        for k in keys:
            if k in d and d[k] is not None:
                return d[k]
    return default


def _rprops(p, T):
    if not (p >= 1e5):
        raise Skip('pressure below 1 bar')
    try:
        rho = PropsSI('D', 'P', p, 'T', T, 'HEOS::CO2')
        mu = PropsSI('V', 'P', p, 'T', T, 'HEOS::CO2')
    except ValueError as e:
        if 'Saturation pressure' not in str(e):
            raise Skip(str(e))
        # mechanics: (p,T) within 1e-4 % of p_sat -> evaluate 1e-5 relative above (liquid side); the column crosses saturation (tool warns two-phase risk)
        try:
            rho = PropsSI('D', 'P', p * (1 + 1e-5), 'T', T, 'HEOS::CO2')
            mu = PropsSI('V', 'P', p * (1 + 1e-5), 'T', T, 'HEOS::CO2')
        except ValueError as e2:
            raise Skip(str(e2))
    if not (math.isfinite(rho) and math.isfinite(mu)) or rho <= 0 or mu <= 0:
        raise Skip('invalid CO2 properties')
    return rho, mu


def _papay_z(p, T, sg):
    tpc = (169.2 + 349.5 * sg - 74.0 * sg ** 2) * 5.0 / 9.0
    ppc = (756.8 - 131.0 * sg - 3.6 * sg ** 2) * 6894.757293
    tpr, ppr = T / tpc, p / ppc
    return 1.0 - 3.53 * ppr / 10 ** (0.9813 * tpr) + 0.274 * ppr ** 2 / 10 ** (0.8157 * tpr)


def _ref_march(q, J, p_res, T_res, T_wh, depth, ID, nsteps=2000):
    area = math.pi * ID ** 2 / 4.0
    ds = depth / nsteps

    def temp(sv):
        z = depth - sv
        return T_wh + (T_res - T_wh) * z / depth

    def dpds(sv, p):
        rho, mu = _rprops(p, temp(sv))
        v = q / (rho * area)
        f = friction(rho * v * ID / mu, ID)
        return -rho * G + f * rho * v ** 2 / (2.0 * ID)  # mechanics: injection flows down, s points up -> friction raises p upward

    bhp = p_res + q / J
    p = bhp
    nodes = []
    rho, _ = _rprops(p, temp(0.0))
    nodes.append((rho, q / (rho * area)))
    for i in range(nsteps):
        sv = i * ds
        k1 = dpds(sv, p)
        k2 = dpds(sv + ds / 2, p + ds / 2 * k1)
        k3 = dpds(sv + ds / 2, p + ds / 2 * k2)
        k4 = dpds(sv + ds, p + ds * k3)
        p = p + ds / 6.0 * (k1 + 2 * k2 + 2 * k3 + k4)
        rho, _ = _rprops(p, temp(sv + ds))
        nodes.append((rho, q / (rho * area)))
    return bhp, p, nodes


def _ref_vlim(rho, C):
    if rho >= 300.0:
        return 1.22 * C / math.sqrt(rho)
    return min(175.0 * rho ** -0.43, 60.0)


def ref_solve(s):
    c = s.get('cost') or {}
    depth = s['depth']
    # 1. Reservoir
    T_res = s.get('T_res')
    if T_res is None:
        T_res = s['T_surf'] + s['gradT'] * depth
    p_res = s.get('p_res')
    if p_res is None:
        p_res = 101325.0 + s['rho_brine'] * G * depth
    p_frac = s['frac_grad'] * depth
    BHP_max = s['bhp_frac'] * p_frac

    # 2. Capacity
    rtype = str(_rget(s, 'reservoir_type', 'res_type', 'type', 'reservoir', default='saline')).lower()
    if rtype.startswith('dep'):
        p_i = s['p_i']
        Z = s.get('Z_i')
        if Z is None:
            Z = _papay_z(p_i, T_res, s['sg'])
        Bg = 101325.0 * Z * T_res / (p_i * 288.15)
        rho_c, _ = _rprops(s['refill_frac'] * p_i, T_res)
        M50 = s['E_dep'] * rho_c * s['RF'] * s['GIIP'] * Bg
    else:
        rho_c, _ = _rprops(p_res, T_res)
        E50 = s.get('E')
        if E50 is None:
            E50 = 0.020
        M50 = s['area'] * s['h'] * s['ntg'] * s['phi'] * rho_c * E50

    # 3. Injectivity
    p_mid = 0.5 * (BHP_max + p_res)
    rho_m, mu_m = _rprops(p_mid, T_res)
    J = rho_m * 2.0 * math.pi * s['k'] * s['krel'] * s['h'] / (
        mu_m * (math.log(s['re'] / s['rw']) + s['S']))
    if not (J > 0):
        raise Skip('non-positive injectivity')
    q_res = J * (BHP_max - p_res)
    if not (q_res > 0):
        raise Skip('BHP_max <= p_res')
    mdot = s['mdot']
    N_res = max(1, math.ceil(mdot / q_res))

    # 4-5. Tubing march + velocity limits
    C = _rget(s, 'C_erosion', default=100.0)
    sel = None
    for N in range(N_res, 41):
        q = mdot / N
        bhp, whp, nodes = _ref_march(q, J, p_res, T_res, s['T_wh'], depth, s['ID'])
        if all(v <= _ref_vlim(rho, C) for rho, v in nodes):
            sel = (N, q, bhp, whp, max(v for _, v in nodes))
            break
    if sel is None:
        raise Skip('no well count <= 40 satisfies velocity limits')
    N, q_well, BHP, WHP, v_max = sel
    spare = max(_rget(s, 'minSpare', 'min_spare', default=0),
                math.ceil(_rget(s, 'spare_frac', default=0.0) * N))
    Ntot = N + spare

    # 6. Cost
    loc = _rget(s, 'location', 'setting', 'offshore', default='onshore')
    offshore = loc is True or str(loc).lower() == 'offshore'
    if offshore:
        plat_key = _rget(s, 'platform')
        capex = Ntot * c['well_off'] + c['plat'][plat_key]
    else:
        capex = 1.1 * Ntot * c['well_on']
    decom = c['decom_frac'] * capex
    r, life = c['rate'], c['life']  # mechanics: tool key is 'rate'
    crf = r / (1.0 - (1.0 + r) ** -life) if r != 0 else 1.0 / life
    tpa = mdot * 365.25 * 86400.0 / 1000.0
    annual = (capex + decom) * crf + c['fixed_opex'] * capex + c['mmv'] * tpa
    LCOS = annual / tpa

    return {
        'T_res_K': T_res,
        'p_res_bar': p_res / 1e5,
        'BHP_max_bar': BHP_max / 1e5,
        'M50_Mt': M50 / 1e9,
        'J': J,
        'q_res': q_res,
        'N_res': N_res,
        'N': N,
        'Ntot': Ntot,
        'q_well': q_well,
        'BHP_bar': BHP / 1e5,
        'WHP_bar': WHP / 1e5,
        'v_max': v_max,
        'LCOS': LCOS,
        'capex_MEUR': capex / 1e6,
    }


# ---- solve cases (Claude) ----
_SOLVE_NOTE = ("full solve: reservoir, capacity (P50), Darcy injectivity, per-node RP14E/NORSOK "
               "velocity sizing, RK4 N=2000 Colebrook tubing march, LCOS; CoolProp HEOS")
_REF_KEYS = ("N", "Ntot", "BHP_bar", "WHP_bar", "M50_Mt", "J", "q_res", "LCOS",
             "capex_MEUR", "BHP_max_bar", "p_res_bar", "T_res_K")


def solve_cases():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "co2storage_solve_inputs.json")
    with open(path, encoding="utf-8") as fh:
        entries = json.load(fh)
    out = []
    for entry in entries:
        inputs = entry["inputs"]
        case = {"id": entry["id"], "kind": "solve", "note": _SOLVE_NOTE, "inputs": inputs}
        try:
            r = ref_solve(inputs)
            case["ref"] = {k: r[k] for k in _REF_KEYS}
        except Skip as e:
            case.update(skipped=True, skip_reason=str(e), ref=None)
        out.append(case)
    return out


def main():
    print("CoolProp version:", CoolProp.__version__)
    cases = []
    for depth, bhp_bar in ((1000, 110), (2000, 220), (3000, 330)):
        tres = 10.0 + 0.03 * depth
        for q in (10, 25):
            for d in (0.1, 0.15):
                for twh in (10, 30):
                    c = {"id": f"wb-{depth}m-{bhp_bar}bar-q{q}-ID{d:.2f}-Twh{twh}",
                         "note": NOTE, "depth_m": depth, "BHP_bar": bhp_bar, "q_kg_s": q,
                         "ID_m": d, "T_wh_C": twh, "T_res_C": tres}
                    try:
                        p, hyd, fr = march(depth, bhp_bar * 1e5, q, d, twh, tres)
                        c["ref"] = {"WHP_bar": p / 1e5, "dp_hyd_bar": hyd / 1e5,
                                    "dp_fric_bar": fr / 1e5}
                    except Skip:
                        c["skipped"] = True
                        c["ref"] = None
                    cases.append(c)
    cases += solve_cases()
    with open(OUT, "w") as fh:
        json.dump(cases, fh, indent=2)
    print(f"wrote {len(cases)} cases ({sum(1 for c in cases if c.get('skipped'))} skipped) to {OUT}")

if __name__ == "__main__":
    main()
