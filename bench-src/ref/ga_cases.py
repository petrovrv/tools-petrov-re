#!/usr/bin/env python3
"""Case definitions for the gesloten-atmosfeer benchmark (raw field values, as typed)."""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, sys
sys.path.insert(0, _gp.REF_DIR)
from ga_model import FIELDS, params

PRESETS = {
 'bld': dict(V=300, N=12, p0=101.3, T0=23, rh0=50, co20=600, oa=430, toa=18, vs=0, eta=0.9,
             o2max=0, po2set=21, vd=1200, tcoil=11, qc=6, tset=23, qe=1.5, ua=250, thull=18,
             vtr=0, etatr=0.5, leak=0, so2=0, ssorb=0, sratio=0.5, swat=0, sener=0, dur=24),
 'shp': dict(V=1200, N=25, p0=101.3, T0=24, rh0=55, co20=700, oa=750, toa=24, vs=0, eta=0.9,
             o2max=0, po2set=21, vd=3000, tcoil=9, qc=25, tset=24, qe=8, ua=900, thull=22,
             vtr=0, etatr=0.5, leak=0, so2=0, ssorb=0, sratio=0.5, swat=0, sener=0, dur=48),
 'bat': dict(V=6, N=3, p0=101.3, T0=22, rh0=55, co20=900, oa=0, toa=6, vs=60, eta=0.85,
             o2max=0.12, po2set=21, vd=0, tcoil=8, qc=0, tset=24, qe=0.4, ua=40, thull=6,
             vtr=0, etatr=0.5, leak=0.2, so2=6, ssorb=4, sratio=0.5, swat=0, sener=12, dur=24),
 'ssk': dict(V=1500, N=45, p0=101.3, T0=24, rh0=50, co20=1000, oa=0, toa=10, vs=1200, eta=0.75,
             o2max=1.9, po2set=20, vd=1500, tcoil=12, qc=60, tset=26, qe=45, ua=3000, thull=10,
             vtr=600, etatr=0.6, leak=0.05, so2=200, ssorb=180, sratio=0.5, swat=6000,
             sener=1400, dur=96),
 'ssn': dict(V=6000, N=120, p0=101.3, T0=24, rh0=45, co20=800, oa=0, toa=8, vs=6000, eta=0.85,
             o2max=6, po2set=20, vd=8000, tcoil=10, qc=300, tset=24, qe=250, ua=12000, thull=8,
             vtr=3000, etatr=0.7, leak=0.02, so2=12000, ssorb=900000, sratio=0.5, swat=400000,
             sener=3000000, dur=168),
 'cap': dict(V=10, N=3, p0=101.3, T0=23, rh0=45, co20=1500, oa=0, toa=-20, vs=60, eta=0.8,
             o2max=0.15, po2set=21, vd=150, tcoil=5, qc=1.2, tset=22, qe=0.8, ua=15, thull=15,
             vtr=20, etatr=0.5, leak=0.1, so2=25, ssorb=12, sratio=0.5, swat=60, sener=120, dur=120),
 'stn': dict(V=350, N=6, p0=101.3, T0=23, rh0=45, co20=2000, oa=0, toa=-40, vs=180, eta=0.9,
             o2max=0.35, po2set=21.5, vd=250, tcoil=6, qc=8, tset=23, qe=6, ua=60, thull=18,
             vtr=100, etatr=0.7, leak=0.06, so2=900, ssorb=600000, sratio=0.5, swat=1500,
             sener=900000, dur=240),
}

def case(cid, note, base='ssk', **kw):
    inp = dict(FIELDS)
    inp.update(PRESETS[base])
    inp.update(kw)
    return dict(id=cid, note=note, inputs=inp)

CASES = []
for k, note in [('bld', 'mechanically ventilated building preset'),
                ('shp', 'ship preset (outside-air ventilated)'),
                ('bat', 'lifeboat / small sealed capsule preset'),
                ('ssk', 'conventional submarine preset'),
                ('ssn', 'large submarine preset (168 h, hits the 60 000-step cap)'),
                ('cap', 'escape capsule preset'),
                ('stn', 'station module preset (240 h, hits the 60 000-step cap)')]:
    CASES.append(case('preset_' + k, note, base=k))

for f, note in [('co2', 'CO2 scrubber fails at 6 h'), ('o2', 'oxygen supply fails at 6 h'),
                ('deh', 'dehumidifier fails at 6 h'), ('heat', 'cooling plant fails at 6 h'),
                ('leak', 'hull leak opens at 6 h')]:
    CASES.append(case('fail_' + f, note, base='ssk', fail=f, ftime=6, dur=24, lkr=2))

CASES += [
 case('sorb_exhaust', 'CO2 sorbent exhausted mid-run (4 kg for 45 people)', base='ssk',
      ssorb=4, dur=24),
 case('o2_exhaust', 'oxygen store exhausted mid-run (5 kg for 45 people)', base='ssk',
      so2=5, dur=24),
 case('sealed_none', 'sealed volume, every removal device switched off — pure accumulation',
      base='ssk', vs=0, vd=0, vtr=0, oa=0, leak=0, o2max=0, qc=0, ua=4000, thull=20, dur=12),
 case('no_crew', 'no crew on board', base='ssk', N=0, dur=12),
 case('vent_only', 'outside air only, no scrubber', base='bld', vs=0, oa=800, dur=24),
 case('humid_sat', 'moisture with no sink: the gas phase must saturate and the surplus must leave as condensate',
      base='ssk', vd=0, ua=0, oa=0, qc=0, qs=20, qe=0, gh2o=0.6, rh0=90, dur=12),
 case('lowp', 'compartment at 40 kPa', base='ssk', p0=40, dur=24),
 case('highp', 'compartment at 130 kPa', base='ssk', p0=130, dur=24),
 case('runaway', 'thermal runaway that must be reported, not clamped', base='ssk',
      V=2, N=400, qs=150, qe=0, ua=0, qc=0, oa=0, vd=0, vs=0, vtr=0, leak=0, o2max=0,
      so2=0, ssorb=0, thull=20, toa=20, fail='none', dur=24),
]

if __name__ == '__main__':
    out = dict(tool='gesloten-atmosfeer', cases=CASES)
    for c in CASES:
        P = params(**c['inputs'])
        c['derived'] = {k: P[k] for k in ('gco2_mol', 'go2_mol', 'gh2o_mol', 'gtr_mol',
                                          'gwat_kg', 'rq', 'oa', 'vs', 'leak', 'o2max', 'dur')}
    json.dump(out, open(_gp.ref('gesloten-atmosfeer_ref.json'), 'w'), indent=1)
    print(len(CASES), 'cases')
