# Claude 23.10 run9: independent CoolProp reference corpus for ogh-core.js EOS
# glue 23.10: record 'comp' as the mole-fraction dict (test_core.js passes it to C.eos.tp)
"""Generate CoolProp (HEOS) reference points for GERG-2008/Leachman EOS testing."""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import CoolProp
import CoolProp.CoolProp as CP

SPECIES = {'co2': 'CO2', 'n2': 'Nitrogen', 'o2': 'Oxygen', 'ar': 'Argon',
           'h2': 'Hydrogen', 'ch4': 'Methane', 'co': 'CarbonMonoxide'}
COMPS = [{'h2': 1.0}, {'ch4': 1.0}, {'n2': 1.0}, {'co2': 1.0},
         {'ch4': 0.9, 'h2': 0.1}, {'ch4': 0.8, 'h2': 0.2}, {'ch4': 0.5, 'h2': 0.5},
         {'h2': 0.98, 'n2': 0.02}, {'ch4': 0.9, 'n2': 0.03, 'co2': 0.02, 'h2': 0.05}]
T_GRID = [250.0, 300.0, 350.0, 450.0]                 # K
P_GRID_MPA = [0.1, 1.0, 5.0, 10.0, 20.0, 35.0, 70.0]  # MPa
CO2_TC = 304.13
PHASES = {CP.iphase_liquid: 'liquid', CP.iphase_gas: 'gas', CP.iphase_twophase: 'twophase',
          CP.iphase_supercritical: 'supercritical', CP.iphase_supercritical_gas: 'supercritical_gas',
          CP.iphase_supercritical_liquid: 'supercritical_liquid',
          CP.iphase_critical_point: 'critical_point', CP.iphase_unknown: 'unknown'}


def comp_label(c):
    return next(iter(c)) if len(c) == 1 else ','.join(f'{k}:{v:g}' for k, v in c.items())


def make_state(c):
    st = CP.AbstractState('HEOS', '&'.join(SPECIES[k] for k in c))
    if len(c) > 1:
        st.set_mole_fractions([c[k] for k in c])
    return st


def co2_psat(T):
    try:
        return CP.PropsSI('P', 'T', T, 'Q', 0, 'HEOS::CO2')
    except Exception:
        return None


def main():
    points, skipped = [], 0
    for c in COMPS:
        label, st = comp_label(c), make_state(c)
        for T in T_GRID:
            psat = co2_psat(T) if label == 'co2' and T < CO2_TC else None
            for p_mpa in P_GRID_MPA:
                p = p_mpa * 1e6
                if psat and abs(p - psat) / psat < 0.05:
                    skipped += 1
                    continue
                try:
                    st.update(CP.PT_INPUTS, p, T)
                    rec = {'comp': dict(c), 'T': T, 'p': p, 'rho': st.rhomass(), 'h': st.hmass(),
                           's': st.smass(), 'cp': st.cpmass(), 'cv': st.cvmass(),
                           'w': st.speed_sound(), 'Z': st.compressibility_factor(),
                           'JT': st.first_partial_deriv(CP.iT, CP.iP, CP.iHmass)}
                    if not all(math.isfinite(v) for v in rec.values() if isinstance(v, float)):
                        raise ValueError('non-finite property')
                    ph = st.phase()
                    rec['phase'] = PHASES.get(ph, int(ph))
                    points.append(rec)
                except Exception:
                    skipped += 1
    out = Path(__file__).with_name('ogh_core_ref.json')
    meta = {'generator': 'gen_ogh_core.py', 'coolprop': CoolProp.__version__, 'backend': 'HEOS',
            'note': 'h,s reference states differ from OGH core: compare differences within the same comp group',
            'units': 'T K, p Pa, rho kg/m3, h J/kg, s/cp/cv J/kg/K, w m/s, JT K/Pa',
            'generated': datetime.now(timezone.utc).isoformat(), 'n': len(points), 'skipped': skipped}
    out.write_text(json.dumps({'meta': meta, 'eos': points}, indent=1))
    print(f'{out.name}: {len(points)} points, {skipped} skipped, CoolProp {CoolProp.__version__}')


if __name__ == '__main__':
    main()
