#!/usr/bin/env python3
"""gen_co2ship.py - independent reference corpus for a CO2-shipping calculator (CoolProp HEOS)."""
import json, math, os
from CoolProp.CoolProp import PropsSI

FL = 'HEOS::CO2'
DEF = dict(mdot=31.69, hours=8000, L=1000e3, mode='LP', cycle='closed', pIn=1.5e5, TIn=303.15,
           Tic=303.15, etaIs=0.82, rmax=3, Tcw=298.15, fCarnot=0.55, dTapp=5, Tcond=308.15,
           etaMotor=0.96, dehyE=7200, pHighOpen=65e5, cargo=10000, portH=12, loadRate=1500,
           weather=0.10, bufferFactor=1.5, boiloff=0.0015, portFee=40000, jettyCapex=25e6,
           nJetties=2, fuelPrice=520, fuelEF=3.114, elecPrice=80, co2Price=80, rate=0.08, life=25,
           liqCapexRef=45, liqExp=0.65, liqOm=0.04, shipOm=0.045, bufferCapex=1200, bufferOm=0.03,
           lpCapexFactor=0.75)
PLIQ = {'LP': 7e5, 'MP': 15e5}
SHIPS = [(7500, 55e6, 13.5, 17.5), (12000, 67e6, 14.5, 22.5),
         (20000, 90e6, 15.0, 27.5), (40000, 135e6, 15.5, 40.0)]

def h_pT(p, T): return PropsSI('H', 'P', p, 'T', T, FL)
def s_pT(p, T): return PropsSI('S', 'P', p, 'T', T, FL)
def h_ps(p, s): return PropsSI('H', 'P', p, 'S', s, FL)

def compress(p1, T1, p2, P):
    n = max(1, math.ceil(math.log(p2 / p1) / math.log(P['rmax'])))
    r = (p2 / p1) ** (1.0 / n)
    w, pin = 0.0, p1
    for i in range(n):
        T = T1 if i == 0 else P['Tic']
        pout = pin * r
        hin, sin = h_pT(pin, T), s_pT(pin, T)
        w += (h_ps(pout, sin) - hin) / P['etaIs']
        pin = pout
    return w

def interp(cargo):
    i = 0
    while i < len(SHIPS) - 2 and cargo > SHIPS[i + 1][0]:
        i += 1
    a, b = SHIPS[i], SHIPS[i + 1]
    f = (math.log(cargo) - math.log(a[0])) / (math.log(b[0]) - math.log(a[0]))
    fl = (cargo - a[0]) / (b[0] - a[0])
    ll = lambda ya, yb: math.exp(math.log(ya) + f * (math.log(yb) - math.log(ya)))
    return ll(a[1], b[1]), a[2] + fl * (b[2] - a[2]), ll(a[3], b[3])

def model(P):
    pL = PLIQ[P['mode']]
    Tsat = PropsSI('T', 'P', pL, 'Q', 0, FL)
    rhoL = PropsSI('D', 'P', pL, 'Q', 0, FL)
    if P['cycle'] == 'closed':
        Tev = Tsat - P['dTapp']
        cop = P['fCarnot'] * Tev / (P['Tcond'] - Tev)
        qref = h_pT(pL, P['Tic']) - PropsSI('H', 'P', pL, 'Q', 0, FL)
        w = (compress(P['pIn'], P['TIn'], pL, P) + qref / cop) / P['etaMotor'] + P['dehyE']
    else:
        c1 = compress(P['pIn'], P['TIn'], pL, P)
        c2 = compress(pL, P['Tic'], P['pHighOpen'], P)
        hB = h_pT(P['pHighOpen'], P['Tcw'])
        x = PropsSI('Q', 'P', pL, 'H', hB, FL)
        y = 1.0 - x
        w = (c1 + c2 / y) / P['etaMotor'] + P['dehyE']
    shipCapex, kn, fuelTpd = interp(P['cargo'])
    if P['mode'] == 'LP':
        shipCapex *= P['lpCapexFactor']
    v = kn * 0.514444
    tpy = P['mdot'] * 3600 * P['hours'] / 1000
    vol = P['cargo'] * 1000 / rhoL
    tLoad = vol / P['loadRate']
    tSail = 2 * P['L'] / v / 3600 * (1 + P['weather'])
    RT = tSail + 2 * (tLoad + P['portH'])
    tripsShip = 8760 * 0.95 / RT
    trips = tpy / P['cargo']
    fleet = math.ceil(trips / tripsShip)
    buffer = P['bufferFactor'] * P['cargo']
    dOut = P['L'] / v / 86400 * (1 + P['weather'])
    loss = P['cargo'] * P['boiloff'] * (dOut + tLoad / 24) * trips
    fuel = fuelTpd * (tSail / 24) * trips + 0.15 * fuelTpd * (2 * (tLoad + P['portH']) / 24) * trips
    liq = P['liqCapexRef'] * 1e6 * (tpy / 1e6) ** P['liqExp']
    ships = fleet * shipCapex
    buf = P['bufferCapex'] * buffer * 2
    jetty = P['jettyCapex'] * P['nJetties']
    r, n = P['rate'], P['life']
    crf = r * (1 + r) ** n / ((1 + r) ** n - 1)
    total = liq + ships + buf + jetty
    elecMWh = w * P['mdot'] * 3600 * P['hours'] / 3.6e9
    annual = (crf * total + P['liqOm'] * liq + P['shipOm'] * ships + P['bufferOm'] * (buf + jetty)
              + elecMWh * P['elecPrice'] + fuel * P['fuelPrice'] + P['portFee'] * 2 * trips
              + (fuel * P['fuelEF'] + loss) * P['co2Price'])
    return dict(kWh_t=w / 3600, TLiq_C=Tsat - 273.15, rhoL=rhoL, RT_h=RT,
                fleet=fleet, perTonne=annual / tpy)

def cases():
    out = []
    for m in ('LP', 'MP'):
        for c in ('closed', 'open'):
            o = dict(mode=m, cycle=c)
            if c == 'open':
                o['Tcw'] = 293.15
            out.append((f'{m}-{c}', f'{m} {c} cycle at defaults', o))
    for L in (300e3, 1000e3, 2500e3):
        out.append((f'L-{int(L / 1e3)}km', 'distance sweep, LP closed', dict(L=L)))
    for cg in (7500, 20000, 40000):
        out.append((f'cargo-{cg}t', 'ship size sweep, LP closed', dict(cargo=cg)))
    for md in (15, 52.08, 173.6):
        out.append((f'mdot-{md}kgs', 'flow sweep, LP closed', dict(mdot=md)))
    return out

def main():
    corpus = []
    for cid, note, ov in cases():
        P = dict(DEF, **ov)
        corpus.append(dict(id=cid, note=note, inputs=P, ref=model(P)))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'co2ship_ref.json')
    with open(path, 'w') as f:
        json.dump(corpus, f, indent=2)
    print(f'Wrote {len(corpus)} cases to {path}')

if __name__ == '__main__':
    main()
