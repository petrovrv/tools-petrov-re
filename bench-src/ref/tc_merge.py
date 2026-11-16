#!/usr/bin/env python3
"""Merge the two reference runs (CoolProp 8.0.0 = primary, CoolProp 7.2.0 = crosscheck).

The page's WebAssembly build reports itself as CoolProp 7.2.1dev.  Running the same
independent cycle algebra against two library versions localises any disagreement that is
a property-library version difference rather than a cycle defect: where the two versions
differ by more than the grading tolerance the quantity is flagged, not graded.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json

a = json.load(open(_gp.tmp('ref_cp8.json')))    # primary
b = json.load(open(_gp.tmp('ref_cp72.json')))   # crosscheck
assert len(a['cases']) == len(b['cases'])

def walk(x, y, path, out):
    if isinstance(x, dict):
        for k in x:
            if k in y: walk(x[k], y[k], path+[k], out)
    elif isinstance(x, (int, float)) and isinstance(y, (int, float)) and not isinstance(x, bool):
        d = abs(x-y); r = d/abs(x) if x else d
        out['.'.join(path)] = {'v8': x, 'v72': y, 'abs': d, 'rel': r}

worst = 0.0; worstwhat = ''
for ca, cb in zip(a['cases'], b['cases']):
    assert ca['id'] == cb['id']
    if ca.get('ref') is None: continue
    cc = {}
    walk(ca['ref'], cb['ref'], [], cc)
    ca['ref_crosscheck'] = cb['ref']
    ca['crosscheck'] = {k: v['rel'] for k, v in cc.items() if v['rel'] > 1e-9}
    for k, v in cc.items():
        if v['rel'] > worst: worst, worstwhat = v['rel'], ca['id']+'.'+k

ref = {
 'tool': 'thermodynamiccycles',
 'generated_by': 'tcref.py — independent implementation of every cycle the page offers, written from the component-by-component first and second law (isentropic turbine/pump/compressor definitions, open-feedwater-heater bleed balances, flash-tank mass and energy balance, internal-heat-exchanger effectiveness), with fluid properties from CoolProp.',
 'primary_properties': 'CoolProp ' + a['coolprop_version'] + ' (python)',
 'crosscheck_properties': 'CoolProp ' + b['coolprop_version'] + ' (python, separate virtualenv) — the version whose equations of state match the WebAssembly build shipped with the page (CoolProp 7.2.1dev)',
 'crosscheck_note': 'Every reference quantity is computed with both property-library versions. Worst mutual deviation %.3e (%s). Quantities where the two versions disagree by more than the grading tolerance are flagged in the result file and are not graded, per the harness rule on disagreeing references.' % (worst, worstwhat),
 'cases': a['cases'],
}
json.dump(ref, open(_gp.ref('thermodynamiccycles_ref.json'), 'w'), indent=1)
print('worst crosscheck %.3e at %s' % (worst, worstwhat), '| cases', len(a['cases']))
