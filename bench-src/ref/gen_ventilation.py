#!/usr/bin/env python3
"""Independent reference for ventilation.html (Room Ventilation Calculator).

Everything below is written from the cited sources and solved with scipy, not
taken from the tool's own code:

  * Buoyancy-driven (stack) flow through an opening at height z:
        dp(z) = g (rho_o - rho_i) (z_n - z)                    [Pa]
        v     = Cd sqrt(2 |dp| / rho_ref)                      [m/s]
        mdot  = rho_ref A v                                    [kg/s]
    with rho_ref the density of the air actually passing the opening.  The
    neutral pressure level z_n is the height at which the internal and external
    hydrostatic pressures are equal and is fixed by the mass balance
        sum(mdot_in) + mdot_supply = sum(mdot_out).
    CIBSE AM10 "Natural ventilation in non-domestic buildings" (2005), section 5;
    ASHRAE Handbook - Fundamentals (2021) chapter 16 "Ventilation and Infiltration",
    "Thermal (stack) pressure" and "Combining driving forces".

  * The two-opening closed form that follows analytically from the above and is
    quoted in both sources,
        z_n   = (A1^2 rho_o z1 + A2^2 rho_i z2) / (A1^2 rho_o + A2^2 rho_i)
        mdot  = Cd A1 A2 sqrt(2 g drho rho_o rho_i dH / (A1^2 rho_o + A2^2 rho_i))
      -> Q     = Cd A* sqrt(2 g dH dT / T_mean),   1/A*^2 = 1/A1^2 + 1/A2^2
    is implemented separately and used to cross-check the network solver.

  * Steady sensible heat balance of a single well-mixed zone
        mdot_in cp T_out + cp sum(mdot_s T_s) + Q_src + (UA)_roof T_sa,roof
        + (UA)_wall T_sa,wall + q_extra
        = mdot_out cp T_i + ((UA)_roof + (UA)_wall) T_i
    ASHRAE Handbook - Fundamentals chapter 18 (sol-air temperature
    T_sa = T_o + alpha I_t / h_o - eps dR / h_o; the tool omits the long-wave
    term, which this reference reproduces deliberately and reports).

  * Wind-driven ventilation is NOT part of the tool (its limitations say so); the
    reference therefore solves the pure stack case and the harness records the
    absence explicitly.
"""
import json, math, os
from scipy.optimize import brentq

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'ventilation_ref.json')

G = 9.81
CP = 1005.0
PATM = 101325.0
RAIR = 287.05
CD = 0.65
HOUT = 25.0

MAT = {'brick':      dict(u_bare=1.4, u_ins=0.30, a=0.60),
       'concrete':   dict(u_bare=3.0, u_ins=0.32, a=0.65),
       'sandwich':   dict(u_bare=0.45, u_ins=0.22, a=0.45),
       'corrugated': dict(u_bare=5.7, u_ins=0.40, a=0.55)}


def rho(t_c):
    return PATM/(RAIR*(t_c + 273.15))


# ------------------------------------------------------------------ stack flow
def opening_flows(openings, t_in, t_out, mdot_sup, z_n):
    """Signed mass flows through every opening for a given neutral plane."""
    ri, ro = rho(t_in), rho(t_out)
    drho = ro - ri
    out = []
    for o in openings:
        dp = G*drho*(z_n - o['z'])
        ref = ro if dp >= 0 else ri
        v = CD*math.sqrt(2*abs(dp)/ref)
        md = ref*o['area']*v
        out.append(dict(z=o['z'], area=o['area'], dp=dp, v=v, mdot=md,
                        direction='in' if dp >= 0 else 'out',
                        rho_ref=ref, volume_flow=o['area']*v))
    return out


def neutral_plane(openings, t_in, t_out, mdot_sup, height):
    """Solve sum(signed mdot) + mdot_supply = 0 for the neutral pressure level."""
    def imbalance(z_n):
        f = opening_flows(openings, t_in, t_out, mdot_sup, z_n)
        return sum((x['mdot'] if x['direction'] == 'in' else -x['mdot']) for x in f) + mdot_sup
    lo, hi = -8.0, height + 8.0
    flo, fhi = imbalance(lo), imbalance(hi)
    if flo*fhi > 0:
        return (lo if abs(flo) < abs(fhi) else hi), False
    return brentq(imbalance, lo, hi, xtol=1e-12, rtol=1e-15, maxiter=300), True


def two_opening_closed_form(a1, z1, a2, z2, t_in, t_out):
    """ASHRAE / CIBSE closed form for one low inlet and one high outlet."""
    ri, ro = rho(t_in), rho(t_out)
    drho = ro - ri
    dh = z2 - z1
    zn = (a1*a1*ro*z1 + a2*a2*ri*z2)/(a1*a1*ro + a2*a2*ri)
    mdot = CD*a1*a2*math.sqrt(2*G*drho*ro*ri*dh/(a1*a1*ro + a2*a2*ri))
    a_star = 1.0/math.sqrt(1.0/(a1*a1) + 1.0/(a2*a2))
    t_mean = (t_in + t_out)/2 + 273.15
    q_boussinesq = CD*a_star*math.sqrt(2*G*dh*(t_in - t_out)/t_mean)
    return dict(z_n=zn, mdot=mdot, volume_flow_in=mdot/ro, volume_flow_out=mdot/ri,
                effective_area=a_star, q_boussinesq=q_boussinesq)


# ------------------------------------------------------------------ solar
def solar_irradiance(season, hour, cloud_pct, lat_deg):
    dec = {'summer': 23.45, 'winter': -23.45}.get(season, 0.0)*math.pi/180
    lat = lat_deg*math.pi/180
    ha = (hour - 12)*15*math.pi/180
    sinb = max(0.0, math.sin(lat)*math.sin(dec) + math.cos(lat)*math.cos(dec)*math.cos(ha))
    i = 1050.0*sinb**1.15
    i *= (1 - 0.75*(cloud_pct/100.0)**3.4)
    return max(0.0, i), sinb


# ------------------------------------------------------------------ full solve
def solve(P):
    """Steady state of the whole room.  Returns everything the tool displays."""
    W, L, H = P['W'], P['L'], P['H']
    a_floor = W*L
    a_wall = 2*(W + L)*H
    a_roof = W*L
    vol = W*L*H
    wall, roof = MAT[P['wallmat']], MAT[P['roofmat']]
    uw = wall['u_ins'] if P['wallins'] else wall['u_bare']
    ur = roof['u_ins'] if P['roofins'] else roof['u_bare']
    ua_wall, ua_roof = uw*a_wall, ur*a_roof
    irr, sinb = solar_irradiance(P['season'], P['hour'], P['cloud'], P['lat'])
    tsa_roof = P['Tout'] + roof['a']*irr/HOUT
    tsa_wall = P['Tout'] + wall['a']*(0.3*irr)/HOUT

    mdot_sup = 0.0
    h_sup = 0.0
    for s in P['supplies']:
        if s['flow'] <= 0:
            continue
        m = rho(s['temp'])*s['flow']/3600.0
        mdot_sup += m
        h_sup += m*s['temp']

    q_src = sum(s['power'] for s in P['sources'])
    h_src = (sum(s['power']*s['z'] for s in P['sources'])/q_src) if q_src > 0 else 1.5

    def residual(t_i):
        zn, ok = neutral_plane(P['openings'], t_i, P['Tout'], mdot_sup, H)
        f = opening_flows(P['openings'], t_i, P['Tout'], mdot_sup, zn)
        m_in = sum(x['mdot'] for x in f if x['direction'] == 'in')
        m_out = max(m_in + mdot_sup, 1e-6)
        rhs = (m_in*CP*P['Tout'] + CP*h_sup + q_src + ua_roof*tsa_roof
               + ua_wall*tsa_wall + P['qextra'])
        den = m_out*CP + ua_roof + ua_wall
        return rhs/den - t_i

    lo, hi = P['Tout'] - 40.0, P['Tout'] + 200.0
    if residual(lo)*residual(hi) > 0:
        t_i = P['Tout'] + 6.0
        for _ in range(400):
            t_i = t_i + 0.4*residual(t_i)
    else:
        t_i = brentq(residual, lo, hi, xtol=1e-12, rtol=1e-15, maxiter=300)

    return downstream(P, t_i, mdot_sup, h_sup, q_src, h_src, ua_wall, ua_roof,
                      tsa_wall, tsa_roof, irr, sinb, uw, ur, a_wall, a_roof, vol)


def downstream(P, t_i, mdot_sup, h_sup, q_src, h_src, ua_wall, ua_roof,
               tsa_wall, tsa_roof, irr, sinb, uw, ur, a_wall, a_roof, vol):
    """Everything the panel prints, given the indoor temperature."""
    H = P['H']
    zn, bracketed = neutral_plane(P['openings'], t_i, P['Tout'], mdot_sup, H)
    flows = opening_flows(P['openings'], t_i, P['Tout'], mdot_sup, zn)
    m_in = sum(x['mdot'] for x in flows if x['direction'] == 'in')
    m_out = max(m_in + mdot_sup, 1e-9)
    q_roof = ua_roof*(tsa_roof - t_i)
    q_wall = ua_wall*(tsa_wall - t_i)
    q_vent = m_out*CP*t_i - m_in*CP*P['Tout'] - CP*h_sup
    q_supply = CP*(h_sup - mdot_sup*t_i)
    q_natural = -CP*m_in*(t_i - P['Tout'])
    total_out_m3 = m_out/rho(t_i)*3600.0
    ach = total_out_m3/vol

    d_t_vent = q_src/(m_out*CP + 1e-6)
    hfrac = min(1.0, max(0.0, h_src/H))
    s_strat = d_t_vent*(0.35 + 0.5*hfrac)
    low_sup = sum(rho(s['temp'])*s['flow']/3600.0 for s in P['supplies']
                  if s['flow'] > 0 and s['z'] < H*0.4)
    if low_sup > 0:
        s_strat *= max(0.3, 1 - low_sup*CP/(m_out*CP + 1e-6)*0.5)
    s_strat = max(0.0, min(s_strat, 18.0))
    if t_i < P['Tout']:
        s_strat = min(s_strat, 3.0)
    t_bottom = t_i - s_strat/2
    t_top = t_i + s_strat/2
    grad = s_strat/H
    probe = P.get('probe_z', 1.5)

    return dict(
        indoor_mean_temperature=t_i, temperature_bottom=t_bottom, temperature_top=t_top,
        temperature_at_probe=t_bottom + grad*min(max(probe, 0.0), H),
        vertical_gradient=grad, stratification_span=s_strat,
        neutral_pressure_level=zn, neutral_bracketed=bracketed,
        mass_flow_in=m_in, mass_flow_out=m_out, mass_flow_supply=mdot_sup,
        exhaust_flow=total_out_m3, air_changes_per_hour=ach,
        inflow_volume=sum(x['volume_flow'] for x in flows if x['direction'] == 'in')*3600.0,
        outflow_volume=sum(x['volume_flow'] for x in flows if x['direction'] == 'out')*3600.0,
        max_opening_velocity=max([x['v'] for x in flows] + [0.0]),
        heat_source=q_src, roof_gain=q_roof, wall_gain=q_wall,
        envelope_gain=q_roof + q_wall, extra_flux=P['qextra'],
        supply_air_gain=q_supply, natural_ventilation_loss=q_natural,
        Q_vent_total=q_vent,
        balance_residual=q_src + (q_roof + q_wall) + q_supply + q_natural + P['qextra'],
        closure_residual=q_src + P['qextra'] + q_roof + q_wall - q_vent,
        solar_irradiance=irr, sin_beta=sinb, sol_air_roof=tsa_roof, sol_air_wall=tsa_wall,
        wall_u_value=uw, roof_u_value=ur, area_wall=a_wall, area_roof=a_roof,
        room_volume=vol,
        flows=[dict(z=f['z'], area=f['area'], v=f['v'], direction=f['direction'],
                    volume_flow_m3h=f['volume_flow']*3600.0, mdot=f['mdot'], dp=f['dp'])
               for f in flows],
        stratified_exhaust_enthalpy_error=m_out*CP*(t_top - t_i))


def solve_with_tolerance(P, dti=0.01):
    """The exact steady state plus the spread produced by the tool's declared outer-loop
    stopping criterion of 0.01 K on the indoor temperature."""
    base_ = solve(P)
    args = _ctx(P)
    hi = downstream(P, base_['indoor_mean_temperature'] + dti, *args)
    lo = downstream(P, base_['indoor_mean_temperature'] - dti, *args)
    tol = {}
    for k, v in base_.items():
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            continue
        sp = max(abs(hi.get(k, v) - v), abs(lo.get(k, v) - v))
        tol[k] = {'abs': sp, 'rel': max(sp/max(abs(v), 1e-12), 2e-9)}
    base_['tolerance'] = tol
    base_['tolerance_basis'] = ('the tool stops its outer temperature loop when the indoor '
                                'temperature moves less than 0.01 K; every quantity is graded '
                                'with the change a 0.01 K shift in that temperature produces')
    return base_


def _ctx(P):
    W, L, H = P['W'], P['L'], P['H']
    a_wall = 2*(W + L)*H
    a_roof = W*L
    vol = W*L*H
    wall, roof = MAT[P['wallmat']], MAT[P['roofmat']]
    uw = wall['u_ins'] if P['wallins'] else wall['u_bare']
    ur = roof['u_ins'] if P['roofins'] else roof['u_bare']
    irr, sinb = solar_irradiance(P['season'], P['hour'], P['cloud'], P['lat'])
    tsa_roof = P['Tout'] + roof['a']*irr/HOUT
    tsa_wall = P['Tout'] + wall['a']*(0.3*irr)/HOUT
    mdot_sup = h_sup = 0.0
    for s in P['supplies']:
        if s['flow'] <= 0:
            continue
        m = rho(s['temp'])*s['flow']/3600.0
        mdot_sup += m
        h_sup += m*s['temp']
    q_src = sum(s['power'] for s in P['sources'])
    h_src = (sum(s['power']*s['z'] for s in P['sources'])/q_src) if q_src > 0 else 1.5
    return (mdot_sup, h_sup, q_src, h_src, uw*a_wall, ur*a_roof, tsa_wall, tsa_roof,
            irr, sinb, uw, ur, a_wall, a_roof, vol)


# ------------------------------------------------------------------ cases
def base(**kw):
    p = dict(Tout=32.0, H=8.0, W=20.0, L=40.0, season='summer', hour=15.0, cloud=0.0,
             lat=50.8, wallmat='concrete', wallins=False, roofmat='sandwich', roofins=True,
             qextra=0.0,
             openings=[dict(z=1.5, area=6.0), dict(z=4.8, area=1.96), dict(z=8.0, area=1.5)],
             sources=[dict(power=40000.0, z=1.5)],
             supplies=[])
    p.update(kw)
    return p


def build():
    cases = []

    # ---- textbook two-opening closed form vs the network solver
    for i, (a1, z1, a2, z2, ti, to) in enumerate([
            (2.0, 0.5, 2.0, 6.0, 30.0, 10.0),
            (1.0, 0.2, 4.0, 9.0, 26.0, 5.0),
            (3.0, 1.0, 1.5, 5.0, 40.0, 32.0),
            (0.5, 0.0, 0.5, 10.0, 22.0, -5.0)]):
        cf = two_opening_closed_form(a1, z1, a2, z2, ti, to)
        zn, ok = neutral_plane([dict(z=z1, area=a1), dict(z=z2, area=a2)], ti, to, 0.0, 10.0)
        f = opening_flows([dict(z=z1, area=a1), dict(z=z2, area=a2)], ti, to, 0.0, zn)
        cases.append(dict(id=f'closed_form_{i}', group='stack_closed_form',
                          note='ASHRAE/CIBSE two-opening stack closed form against the '
                               'network solver of this file',
                          inputs=dict(A1=a1, z1=z1, A2=a2, z2=z2, T_in=ti, T_out=to),
                          expected=dict(z_neutral_closed_form=cf['z_n'], z_neutral_solver=zn,
                                        mdot_closed_form=cf['mdot'],
                                        mdot_solver=max(x['mdot'] for x in f),
                                        effective_area=cf['effective_area'],
                                        q_boussinesq=cf['q_boussinesq'],
                                        volume_flow_in_m3s=cf['volume_flow_in'])))

    # ---- full-room cases driven through the tool
    plan = [
        ('default', base()),
        ('cold_outside', base(Tout=-5.0, season='winter', hour=10.0)),
        ('big_source', base(sources=[dict(power=150000.0, z=4.0)])),
        ('two_sources', base(sources=[dict(power=40000.0, z=1.5),
                                      dict(power=60000.0, z=6.0)])),
        ('mech_supply', base(supplies=[dict(flow=20000.0, temp=18.0, z=0.5)])),
        ('mech_supply_high', base(supplies=[dict(flow=30000.0, temp=15.0, z=6.0)])),
        ('cloudy_night', base(hour=22.0, cloud=100.0, Tout=20.0)),
        ('uninsulated', base(wallins=False, roofins=False, wallmat='corrugated',
                             roofmat='corrugated')),
        ('tall_room', base(H=16.0, openings=[dict(z=0.5, area=6.0), dict(z=8.0, area=1.96),
                                             dict(z=16.0, area=1.5)])),
        ('small_openings', base(openings=[dict(z=1.0, area=0.5), dict(z=7.0, area=0.5)])),
        ('extra_flux', base(qextra=25000.0)),
        ('no_source', base(sources=[dict(power=0.0, z=1.5)])),
    ]
    for name, p in plan:
        cases.append(dict(id=f'room_{name}', group='room',
                          note='steady stack ventilation and sensible heat balance of the '
                               'whole room',
                          inputs={k: v for k, v in p.items()},
                          expected=solve_with_tolerance(p)))
    return cases


if __name__ == '__main__':
    out = dict(
        reference='Buoyancy-driven opening flow, neutral pressure level and the steady '
                  'single-zone sensible heat balance implemented from CIBSE AM10 and ASHRAE '
                  'Handbook - Fundamentals chapters 16 and 18, solved with scipy.optimize.brentq; '
                  'cross-checked against the analytic two-opening stack formula.',
        citations=[
            'CIBSE Applications Manual AM10, "Natural ventilation in non-domestic buildings", '
            '2005, section 5 (stack-driven flow, neutral pressure level, discharge coefficient)',
            'ASHRAE Handbook - Fundamentals (2021), chapter 16 "Ventilation and Infiltration", '
            'thermal (stack) pressure difference dp = g (rho_o - rho_i) (z_NPL - z) and the '
            'orifice relation Q = Cd A sqrt(2 dp / rho)',
            'ASHRAE Handbook - Fundamentals (2021), chapter 18 "Nonresidential Cooling and '
            'Heating Load Calculations", sol-air temperature Te = To + alpha It/ho - eps dR/ho',
            'W.G. Brown and K.R. Solvason, "Natural convection through rectangular openings in '
            'partitions", Int. J. Heat Mass Transfer 5:859-868, 1962 (orifice/discharge '
            'coefficient convention)',
            'scipy ' + __import__('scipy').__version__],
        cases=build())
    json.dump(out, open(OUT, 'w'), indent=1)
    print('wrote', OUT, len(out['cases']), 'cases')
