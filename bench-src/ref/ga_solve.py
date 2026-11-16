#!/usr/bin/env python3
"""Reference solver driver: reads a request produced by run_gesloten-atmosfeer.mjs
(one entry per case: raw inputs + the sample times the page reported) and writes the
independently integrated reference state at exactly those times.

The reference is scipy.integrate.solve_ivp (adaptive, error-controlled, implicit/BDF
family) on the same ODE system re-implemented in bench-src/ref/ga_model.py — a different
integrator family from the page's fixed-step RK4.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, sys
sys.path.insert(0, _gp.REF_DIR)
import numpy as np
from ga_model import params, init_state, deriv, solution, observables, MM, saturated

req = json.load(open(sys.argv[1]))
out = {}
for c in req['cases']:
    P = params(**c['inputs'])
    times = [t * 3600.0 for t in c['times']]          # the page reports hours
    Y = solution(P, times)
    obs = [observables(P, Y[:, i]) for i in range(Y.shape[1])]
    # analytic / invariant quantities that owe nothing to either integration
    S0 = init_state(P)
    ana = {}
    if P['ua'] > 0 and P['oa'] == 0 and P['qc'] == 0 and P['vd'] == 0:
        ana['T_steady_C'] = P['thull'] + (P['N'] * P['qs'] + P['qe']) / P['ua']
    if P['oa'] == 0 and P['leak'] == 0 and P['fail'] != 'leak':
        ana['carbon_produced_mol'] = P['N'] * P['gco2_mol'] * P['dur']
    out[c['id']] = {
        'P': {k: P[k] for k in ('gco2_mol', 'go2_mol', 'gh2o_mol', 'gtr_mol', 'gwat_kg',
                                'rq', 'V', 'N', 'p0', 'oa', 'vs', 'vd', 'vtr', 'eta', 'leak',
                                'o2max', 'po2set', 'qc', 'qe', 'ua', 'dur', 'ftime', 'lkr')},
        'times_h': c['times'],
        'state': Y.T.tolist(),
        'obs': obs,
        'init_state': S0,
        'analytic': ana,
    }
json.dump(out, open(sys.argv[2], 'w'))
print('reference written for', len(out), 'cases')
