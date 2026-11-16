#!/usr/bin/env python3
"""Build bench-src/ref/ontvochtiging_ref.json"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, sys, math
sys.path.insert(0, _gp.REF_DIR)
import gen_ontv as G

BASE = dict(tout=28, rhout=60, press=101.3, troom=21, tdreq=-40, dtsafe=3, tsurf=15,
            np=4, gp=70, prod=0.1, vol=400, ach=0.05, adoor=2, dopen=2, kdoor=0.15,
            phi=1, flow=20000, dpfan=900, etafan=65, bf=0.05, adpmin=1, appr=4,
            tcond=45, etac=50, reheat='cond', tsfzlim=-40, mice=15, tdef=20,
            etadef=90, etarot=0.95, treg=120, fregmin=5, fregmax=30, dxreg=12,
            purge=8, carry=2, regsrc='elec', tehp=0, etachp=45, s_el=True,
            s_cw=True, s_gas=False, s_hw=True, thw=90, s_rec=False, trec=60)

CASES = []


def case(cid, note, over):
    P = dict(BASE); P.update(over)
    L, MS = G.run_all(P)
    L2, MS2 = G.run_all(P, scale=1.2)
    exp = dict(x_room=L['x_room'] * 1000.0, v_min=(L['internal'] / L['x_room'] / (P['flow'] / 3600.0 * L['mda'] / max(P['flow'] / 3600.0, 1e-12)) * 3600.0) if L['x_room'] > 0 else 0.0,
               td_sup=L['td_sup'], mw_unit=L['mw'] * 3600.0,
               internal=L['internal'] * 3600.0, total=L['total'] * 3600.0,
               x_sup=L['x_sup'] * 1000.0, mda=L['mda'], load_ok=L['ok'],
               above=L['above'])
    ms = {}
    for i, m in enumerate(MS):
        d = dict(ok=m['ok'], td_ach=m.get('td_ach'))
        if m['ok']:
            d.update(e=m['e'], qc=m.get('qc'), qh=m.get('qh'),
                     el=m.get('el'), water=m['mw'] * 3600.0, ts=m.get('ts'))
            if m['id'] == 'm2':
                d['t_dry'] = m.get('t_dry')
            if m['id'] == 'm3':
                d.update(m_reg=m.get('m_reg'), dx_reg=m.get('dx_reg') * 1000.0,
                         t_reg_ex=m.get('t_reg_ex'), rh_ex=m.get('rh_ex') * 100.0,
                         water_balance=m.get('water_balance'))
            if m['id'] == 'm4':
                d.update(t3=m.get('t3'), pc=m.get('pc'),
                         smer=m['mw'] * 3600.0 / max(m['el'], 1e-9))
            d['e_sens'] = MS2[i]['e'] if MS2[i].get('ok') else None
        else:
            d['reason'] = m.get('reason')
        ms['m%d' % (i + 1)] = d
    exp['methods'] = ms
    CASES.append(dict(id=cid, note=note, inputs=P, expect=exp))


case('td8-all-paths',
     'Moderate target: +8 degC supply dew point, all four paths in range',
     dict(tdreq=8, troom=22, tout=30, rhout=65, prod=2.0, np=10, flow=12000))
case('td2-cool-limit',
     'Target near the frost limit of a chilled-water coil',
     dict(tdreq=2, troom=20, tout=28, rhout=70, prod=1.5, flow=10000))
case('tdm5-freeze',
     'Sub-zero target: freeze-out on alternating coils and the rotor',
     dict(tdreq=-5, troom=5, tout=20, rhout=60, prod=0.4, flow=6000, mice=60,
          tsfzlim=-40))
case('tdm25-rotor',
     'Deep drying: only the desiccant rotor can reach the required dew point',
     dict(tdreq=-25, troom=18, tout=25, rhout=55, prod=0.2, flow=8000))
case('reheat-electric',
     'Electric reheat instead of condenser recovery - site energy must rise by '
     'the full reheat duty',
     dict(tdreq=8, troom=22, tout=30, rhout=65, prod=2.0, np=10, flow=12000,
          reheat='elec'))
case('reheat-gas',
     'Gas reheat at 90 % efficiency',
     dict(tdreq=8, troom=22, tout=30, rhout=65, prod=2.0, np=10, flow=12000,
          reheat='gas', s_gas=True))
case('regen-gas',
     'Gas-fired rotor regeneration at 90 % efficiency',
     dict(tdreq=-25, troom=18, tout=25, rhout=55, prod=0.2, flow=8000,
          regsrc='gas', s_gas=True))
case('regen-hotwater-too-cold',
     'Hot water at 90 degC cannot supply a 120 degC regeneration - the rotor '
     'must be refused',
     dict(tdreq=-25, troom=18, tout=25, rhout=55, prod=0.2, flow=8000,
          regsrc='hw', thw=90))
case('above-room',
     'Required dew point above the room temperature - every path refused',
     dict(tdreq=15, troom=10))
case('high-makeup',
     '30 % outdoor make-up air with a humid outdoor state',
     dict(tdreq=6, troom=22, tout=32, rhout=75, phi=30, prod=1.0, flow=15000))
case('low-pressure',
     'Reduced barometric pressure (2500 m site)',
     dict(tdreq=5, troom=20, tout=26, rhout=60, press=75, prod=1.0, flow=10000))
case('bypass-limited',
     'Large bypass factor: the coil cannot reach the required humidity ratio '
     'whatever the surface temperature',
     dict(tdreq=-2, troom=18, tout=28, rhout=60, prod=1.0, flow=8000, bf=0.35))

case('flow-too-small',
     'Treated air flow too small for the internal load: the supply humidity ratio '
     'would have to be negative, so every path is refused and the message must '
     'quote the room humidity ratio it names',
     dict(tdreq=-20, troom=18, tout=25, rhout=60, prod=5.0, flow=1000))

ref = dict(tool='ontvochtiging',
           generated_by='gen_ontv.py + gen_ontv_cases.py (independent python)',
           basis=['ASHRAE Handbook-Fundamentals (2017) Ch.1: Eq.(5)/(6) saturation '
                  'pressure over ice/water, Eq.(20) humidity ratio, Eq.(30) specific '
                  'enthalpy, Eq.(28) moist-air density, and the cooling/dehumidifying '
                  'energy balance q = m_da[(h1-h2) - (W1-W2) h_w]',
                  'Steady-flow mass and energy balances written out for each of the '
                  'four paths (room moisture balance, coil, reheat, desiccant rotor '
                  'with both sectors, heat-pump condenser/evaporator)'],
           cases=CASES)

# cross-check the ASHRAE ideal-gas property set against CoolProp real-gas
try:
    from CoolProp.HumidAirProp import HAPropsSI
    pts, dev_h, dev_x, dev_td = [], [], [], []
    for (t, rh, p) in [(30, .65, 101325), (22, .5, 101325), (5, .8, 101325),
                       (-5, .9, 101325), (20, .6, 75000), (35, .4, 101325)]:
        x_c = HAPropsSI('W', 'T', t + 273.15, 'R', rh, 'P', p)
        h_c = HAPropsSI('H', 'T', t + 273.15, 'R', rh, 'P', p) / 1000.0
        td_c = HAPropsSI('D', 'T', t + 273.15, 'R', rh, 'P', p) - 273.15
        x_a = G.x_from_pv(rh * G.pws(t), p)
        h_a = G.h(t, x_a)
        td_a = G.td_from_x(x_a, p)
        pts.append(dict(t=t, rh=rh, p=p, x_ashrae=x_a, x_coolprop=x_c,
                        h_ashrae=h_a, h_coolprop=h_c, td_ashrae=td_a,
                        td_coolprop=td_c))
        dev_x.append(abs(x_a - x_c) / max(x_c, 1e-9))
        dev_h.append(abs(h_a - h_c))
        dev_td.append(abs(td_a - td_c))
    ref['crosscheck'] = dict(
        what='ASHRAE ideal-gas moist air (the formulation the tool implements) vs '
             'CoolProp 8.0.0 HAPropsSI (ASHRAE RP-1485 real gas)',
        max_rel_humidity_ratio=max(dev_x),
        max_abs_enthalpy_kJ_per_kg=max(dev_h),
        max_abs_dewpoint_K=max(dev_td),
        points=pts,
        note='CoolProp uses a different enthalpy datum for moist air, so the '
             'enthalpy difference below is a datum offset and not an error; the '
             'humidity ratio and dew point are datum-free and agree to the values '
             'shown. Duties are computed from enthalpy DIFFERENCES, so the datum '
             'cancels. Where the two property sets differ by more than the '
             'tolerance the tool is flagged, not graded.')
except Exception as e:
    ref['crosscheck'] = dict(error=str(e))

json.dump(ref, open(_gp.ref('ontvochtiging_ref.json'), 'w'), indent=1)
print('cases', len(CASES))
for c in CASES:
    e = c['expect']
    ok = ''.join('1' if e['methods']['m%d' % i]['ok'] else '0' for i in (1, 2, 3, 4))
    print('%-24s ok=%s mw=%7.2f kg/h tdsup=%7.2f' % (c['id'], ok, e['mw_unit'], e['td_sup']))
print('crosscheck', {k: v for k, v in ref['crosscheck'].items() if k != 'points'})
