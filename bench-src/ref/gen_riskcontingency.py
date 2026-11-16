# Independent reference for riskcontingency.html (Cost & Schedule Risk, Monte Carlo).
# Written from the method in _tnd/riskcontingency/SPEC.md and the published sources, NOT ported from tnd-risk.js:
#   PERT (Vose 2008): beta(a, b) on [min, max] with a = 1 + 4 (ml - min)/(max - min), b = 1 + 4 (max - ml)/(max - min)
#   triangular and uniform from numpy; discrete risk events as Bernoulli(p) x impact
#   rank correlation by Iman & Conover (1982): van der Waerden scores, Cholesky of the target and of the scores' own correlation
#   duration = common activities + max over parallel paths (+ delays of the risks of the path) + delays at the end;
#   total cost = cost lines + risk costs + time cost x (D - D0) + damages(D)
#   damages: linear min(cap, damages/day x max(0, D - contract duration)), or Belgian works KB 14.01.2013 (AUR) art. 86 as written in the
#   ejustice text (_tnd/core/dl/aur_fr.txt, read 15.11.2026): R = 0.45 M n^2 / N^2, N = working days = floor(0.7 x calendar days) (par. 3),
#   N^2 -> 150 N when M <= 75 000 and N <= 150 (par. 1), total <= 5 % of M (up to 10 %, par. 6), totals below 75 EUR neglected (par. 6)
#   tool rules of SPEC (not from a source): exact ties between paths are shared 1/m; a non-positive-definite correlation target is shrunk x0.95 until it factors
#   variance shares (review R-1): covariance (Euler) share Cov(part, total) / Var(total) over the additive parts (cost lines, direct risk costs,
#   time-related cost = time cost x (D - D0) + damages); tolerance = 4 x the spread of the share over 40 batches of 10 000 runs + 0.003
# Large samples (N_REF) give the reference values; the tolerance of each Monte Carlo value is computed from the sampling
# error of the page's own run (n_page) so that the bench can compare a 10 000-run page with this reference.
# Run: _tnd/riskcontingency/venv/Scripts/python -I bench-src/ref/gen_riskcontingency.py  -> bench-src/ref/riskcontingency_ref.json
import json, math, pathlib, random, sys
import numpy as np
from scipy.stats import norm as _norm

HERE = pathlib.Path(__file__).resolve().parent
N_REF = 400_000
N_PAGE = 10_000
SLACK = 0.003


def tri_point(o, dist):
    d = o.get('dist', dist) or dist
    if d == 'fixed':
        v = o.get('ml', o.get('min', 0.0))
        return 'fixed', v, v, v
    mn, ml, mx = o.get('min'), o.get('ml'), o.get('max')
    if d == 'uniform' and ml is None:
        ml = (mn + mx) / 2
    return d, float(mn), float(ml), float(mx)


def draw(rng, spec, n):
    d, a, m, b = spec
    if d == 'fixed' or not b > a:
        return np.full(n, (a + b) / 2 if d == 'uniform' else m)
    if d == 'uniform':
        return rng.uniform(a, b, n)
    if d == 'triangular':
        return rng.triangular(a, m, b, n)
    al = 1 + 4 * (m - a) / (b - a)
    be = 1 + 4 * (b - m) / (b - a)
    return a + (b - a) * rng.beta(al, be, n)


def mean_of(spec):
    d, a, m, b = spec
    if d == 'fixed' or not b > a:
        return (a + b) / 2 if d == 'uniform' else m
    if d == 'uniform':
        return (a + b) / 2
    if d == 'triangular':
        return (a + m + b) / 3
    return (a + 4 * m + b) / 6


def iman_conover(cols, rho, rng):
    """reorder the columns (list of 1-d arrays, same n) so their rank correlation is near rho (uniform off-diagonal)."""
    k, n = len(cols), len(cols[0])
    target = np.full((k, k), rho)
    np.fill_diagonal(target, 1.0)
    f = 1.0
    while True:
        try:
            P = np.linalg.cholesky(target)
            break
        except np.linalg.LinAlgError:
            f *= 0.95
            target = np.where(np.eye(k) == 1, 1.0, target * 0.95)
    scores = _norm.ppf(np.arange(1, n + 1) / (n + 1))
    S = np.column_stack([rng.permutation(scores) for _ in range(k)])
    E = np.corrcoef(S, rowvar=False)
    Q = np.linalg.cholesky(E)
    T = S @ np.linalg.inv(Q).T @ P.T
    out = []
    for j in range(k):
        order = np.argsort(np.argsort(T[:, j]))
        out.append(np.sort(cols[j])[order])
    return out


def simulate(inp, n, seed):
    rng = np.random.default_rng(seed)
    items = [tri_point(x, x.get('dist', 'pert')) for x in inp.get('items', [])]
    acts = inp.get('activities', [])
    aspec = [tri_point(a, a.get('dist', 'pert')) for a in acts]
    apath = [('' if str(a.get('path', '')).strip() in ('', '*') else str(a.get('path')).strip()) for a in acts]
    paths = []
    for p in apath:
        if p and p not in paths:
            paths.append(p)
    risks = inp.get('risks', [])

    def has(o):
        return o is not None and any(o.get(k) not in (None, 0) for k in ('min', 'ml', 'max'))

    icols = [draw(rng, s, n) for s in items]
    acols = [draw(rng, s, n) for s in aspec]
    rho_c, rho_t = inp.get('rhoCost', 0) or 0, inp.get('rhoTime', 0) or 0
    var_i = [j for j, c in enumerate(icols) if np.ptp(c) > 0]
    if rho_c and len(var_i) >= 2:
        new = iman_conover([icols[j] for j in var_i], rho_c, rng)
        for j, c in zip(var_i, new):
            icols[j] = c
    var_a = [j for j, c in enumerate(acols) if np.ptp(c) > 0]
    if rho_t and len(var_a) >= 2:
        new = iman_conover([acols[j] for j in var_a], rho_t, rng)
        for j, c in zip(var_a, new):
            acols[j] = c

    items_sum = np.sum(icols, axis=0) if icols else np.zeros(n)
    common = np.zeros(n)
    per = {p: np.zeros(n) for p in paths}
    for s, p, c in zip(aspec, apath, acols):
        if p:
            per[p] += c
        else:
            common += c
    rcost = np.zeros(n)
    end = np.zeros(n)
    emv = 0.0
    parts = {}
    for j, x in enumerate(items):
        parts[inp['items'][j].get('id', 'I%d' % (j + 1))] = icols[j]
    for k, x in enumerate(risks):
        d = x.get('dist', 'pert')
        occ = rng.random(n) < x['p']
        if has(x.get('cost')):
            cs = tri_point(x['cost'], d)
            rc_k = np.where(occ, draw(rng, cs, n), 0.0)
            rcost += rc_k
            parts[x.get('id', 'R%d' % (k + 1))] = rc_k
            emv += x['p'] * mean_of(cs)
        if has(x.get('time')):
            ts = tri_point(x['time'], d)
            dl = np.where(occ, draw(rng, ts, n), 0.0)
            p = str(x.get('path', '') or '').strip()
            if p in per:
                per[p] += dl
            else:
                end += dl
    if paths:
        stack = np.column_stack([per[p] for p in paths])
        longest = stack.max(axis=1)
        tied = stack >= longest[:, None] - 1e-9 * np.maximum(1.0, np.abs(longest))[:, None]
        weight = tied / tied.sum(axis=1, keepdims=True)  # exact ties share the lead 1/m (SPEC tool rule)
        crit = {p: float(np.mean(weight[:, j])) for j, p in enumerate(paths)}
    else:
        longest = np.zeros(n)
        crit = {}
    D = common + longest + end
    # deterministic plan
    d_common = sum(s[2] for s, p in zip(aspec, apath) if not p)
    d_paths = {p: sum(s[2] for s, q in zip(aspec, apath) if q == p) for p in paths}
    D0 = d_common + (max(d_paths.values()) if d_paths else 0.0)
    ld, cap, td = inp.get('ld', 0) or 0, inp.get('ldCap', 0) or 0, inp.get('targetDays')
    base_items = sum(s[2] for s in items)
    dmg = np.zeros(n)
    ld_plan = 0.0
    if inp.get('ldMode') == 'aur86':
        if td:
            M = inp.get('ldM') or base_items
            Nw = math.floor(0.7 * td + 1e-9)
            if M > 0 and Nw > 0:
                den = 150.0 * Nw if (M <= 75000 and Nw <= 150) else float(Nw) ** 2
                pct = inp.get('ldCapPct', 5)
                def fines(Dv):
                    late = np.maximum(0.0, np.asarray(Dv, dtype=float) - td)
                    r = np.minimum(0.45 * M * late ** 2 / den, pct / 100.0 * M)
                    return np.where(r < 75.0, 0.0, r)
                dmg = fines(D)
                ld_plan = float(fines([D0])[0])
    elif td and ld > 0:
        dmg = ld * np.maximum(0.0, D - td)
        ld_plan = ld * max(0.0, D0 - td)
        if cap > 0:
            dmg = np.minimum(dmg, cap)
            ld_plan = min(ld_plan, cap)
    tc = inp.get('timeCost', 0) or 0
    total = items_sum + rcost + tc * (D - D0) + dmg
    if tc != 0 or inp.get('ldMode') == 'aur86' or ld > 0:
        parts['TIME'] = tc * (D - D0) + dmg
    return dict(total=total, items=items_sum, D=D, dmg=dmg, crit=crit, D0=D0, parts=parts, base=base_items + ld_plan, base_items=base_items,
                ld_plan=ld_plan, emv=emv, items_mean=sum(mean_of(s) for s in items),
                has_sched=bool(acts) or any(has(x.get('time')) for x in risks))


def q_se(sample_sorted, q, n_page):
    """standard error of the q-quantile of an n_page-run sample, density from the reference quantiles"""
    h = 0.01
    lo, hi = np.quantile(sample_sorted, max(0.0, q - h)), np.quantile(sample_sorted, min(1.0, q + h))
    if hi <= lo:
        return 0.0
    dens = (min(1.0, q + h) - max(0.0, q - h)) / (hi - lo)
    return math.sqrt(q * (1 - q) / n_page) / dens


def p_se(p, n_page):
    return math.sqrt(max(p * (1 - p), 1.0 / n_page) / n_page)


def reference(inp, seed=1):
    n_page = int(inp.get('iterations', N_PAGE) or N_PAGE)
    s = simulate(inp, N_REF, seed)
    out = {'det': {'base': s['base'], 'D0': s['D0'], 'emv': s['emv'], 'items_mean': s['items_mean'], 'ld_plan': s['ld_plan']}, 'mc': {}}
    tot = np.sort(s['total'])
    mc = out['mc']

    def put(key, val, se):
        mc[key] = {'v': float(val), 'tol': float(4 * se + SLACK * max(abs(val), 1e-9))}

    sd = float(np.std(tot, ddof=1))
    put('cost.mean', tot.mean(), sd / math.sqrt(n_page))
    for q in (0.5, 0.8, 0.9):
        put('cost.p%d' % round(q * 100), np.quantile(tot, q), q_se(tot, q, n_page))
    put('cost.sd', sd, sd / math.sqrt(2 * (n_page - 1)) * 1.5)
    pb = float(np.mean(tot <= s['base'] + 1e-9 * max(1, abs(s['base']))))
    put('pBase', pb, p_se(pb, n_page))
    pe = float(np.mean(tot <= s['base'] + s['emv']))
    put('pBaseEmv', pe, p_se(pe, n_page))
    if s['has_sched']:
        dd = np.sort(s['D'])
        dsd = float(np.std(dd, ddof=1))
        put('dur.mean', dd.mean(), dsd / math.sqrt(n_page))
        for q in (0.5, 0.8):
            put('dur.p%d' % round(q * 100), np.quantile(dd, q), q_se(dd, q, n_page))
        qq = float(inp.get('q', 0.8) or 0.8)
        cq, dq = np.quantile(tot, qq), np.quantile(dd, qq)
        jcl = float(np.mean((s['total'] <= cq) & (s['D'] <= dq)))
        put('joint', jcl, p_se(jcl, n_page) * 1.5)
        put('ld.mean', s['dmg'].mean(), float(np.std(s['dmg'])) / math.sqrt(n_page))
        for p, v in s['crit'].items():
            put('crit.' + p, v, p_se(v, n_page))
        if inp.get('targetDays'):
            pt = float(np.mean(s['D'] <= inp['targetDays']))
            put('pTargetDays', pt, p_se(pt, n_page))
    # covariance (Euler) shares of the additive parts; tolerance from 40 batches of n_page runs
    tt = s['total'] - s['total'].mean()
    vt = float(np.mean(tt * tt))
    if vt > 0 and s['parts']:
        sh, nb = {}, N_REF // n_page
        for name, col in s['parts'].items():
            c = col - col.mean()
            v = float(np.mean(c * tt)) / vt
            b = []
            for i in range(nb):
                sl = slice(i * n_page, (i + 1) * n_page)
                tb = s['total'][sl] - s['total'][sl].mean()
                vb = float(np.mean(tb * tb))
                b.append(float(np.mean((col[sl] - col[sl].mean()) * tb)) / vb if vb > 0 else 0.0)
            sh[name] = {'v': v, 'tol': float(4 * np.std(b, ddof=1) + 0.003)}
        out['share'] = sh
        out['share_sum'] = float(sum(x['v'] for x in sh.values()))
    return out


def rand_case(r, k):
    dists = ['pert', 'triangular', 'uniform', 'fixed']
    items = []
    for j in range(r.randint(2, 8)):
        d = r.choice(dists)
        ml = round(r.uniform(1e4, 2e6), -2)
        mn = round(ml * r.uniform(0.7, 1.0), -2)
        mx = round(ml * r.uniform(1.0, 1.8), -2)
        items.append({'id': 'I%d' % (j + 1), 'dist': d, 'min': mn, 'ml': ml, 'max': mx})
    acts = []
    for j in range(r.randint(0, 5)):
        ml = r.randint(10, 120)
        acts.append({'id': 'A%d' % (j + 1), 'path': r.choice(['', 'A', 'B']), 'dist': r.choice(dists[:3]), 'min': int(ml * 0.8), 'ml': ml, 'max': int(ml * 1.5) + 1})
    paths = sorted({a['path'] for a in acts if a['path']})
    risks = []
    for j in range(r.randint(0, 4)):
        ml = round(r.uniform(1e4, 5e5), -2)
        rk = {'id': 'R%d' % (j + 1), 'p': round(r.uniform(0.05, 0.6), 2), 'dist': r.choice(['pert', 'triangular']),
              'cost': {'min': round(ml * 0.5, -2), 'ml': ml, 'max': round(ml * 2.5, -2)}, 'path': r.choice([''] + paths)}
        if acts and r.random() < 0.6:
            rk['time'] = {'min': 2, 'ml': 5, 'max': 15}
        risks.append(rk)
    D0 = None
    c = {'id': 'rnd-%02d' % k, 'iterations': 10000, 'seed': 1000 + k, 'q': r.choice([0.8, 0.9, 0.7]),
         'rhoCost': r.choice([0, 0, 0.3, 0.6]), 'rhoTime': r.choice([0, 0.3]), 'timeCost': r.choice([0, 0, 1500, 5000]),
         'items': items, 'activities': acts, 'risks': risks}
    if acts and r.random() < 0.4:
        c['ld'] = r.choice([2000, 8000])
        c['ldCap'] = r.choice([0, 100000])
        c['targetDays'] = sum(a['ml'] for a in acts)  # tighter than D0 when paths run in parallel
    return c


HAND = [
    {'id': 'hand-pert', 'items': [{'dist': 'pert', 'min': 80, 'ml': 100, 'max': 160}], 'expect_mean': 640 / 6},
    {'id': 'hand-tri', 'items': [{'dist': 'triangular', 'min': 10, 'ml': 20, 'max': 60}], 'expect_mean': 30},
    {'id': 'hand-uniform', 'items': [{'dist': 'uniform', 'min': 0, 'ml': 5, 'max': 10}], 'expect_mean': 5, 'expect_p80': 8},
    {'id': 'hand-fixed', 'items': [{'dist': 'fixed', 'min': 7, 'ml': 7, 'max': 7}, {'dist': 'fixed', 'min': 3, 'ml': 3, 'max': 3}], 'expect_mean': 10, 'expect_p80': 10},
    {'id': 'hand-event', 'items': [{'dist': 'fixed', 'min': 1000, 'ml': 1000, 'max': 1000}], 'risks': [{'p': 0.3, 'cost': {'dist': 'fixed', 'min': 500, 'ml': 500, 'max': 500}}],
     'expect_mean': 1150, 'expect_p80': 1500, 'expect_p50': 1000},
    {'id': 'hand-merge', 'items': [{'dist': 'fixed', 'min': 1, 'ml': 1, 'max': 1}],
     'activities': [{'path': 'A', 'dist': 'pert', 'min': 80, 'ml': 100, 'max': 120}, {'path': 'B', 'dist': 'pert', 'min': 80, 'ml': 100, 'max': 120}, {'path': '', 'dist': 'fixed', 'min': 10, 'ml': 10, 'max': 10}],
     # merge bias (Clark 1961; two iid normal paths: E[max] = mu + sigma/sqrt(pi)); PERT(80,100,120): a = b = 3, sigma^2 = a b w^2/((a+b)^2 (a+b+1)), w = 40
     'expect_D0': 110, 'expect_dur_mean': 110 + math.sqrt(9 * 1600 / (36 * 7)) / math.sqrt(math.pi)},
    {'id': 'hand-tie', 'items': [{'dist': 'fixed', 'min': 1, 'ml': 1, 'max': 1}],
     'activities': [{'path': 'A', 'dist': 'fixed', 'min': 10, 'ml': 10, 'max': 10}, {'path': 'B', 'dist': 'fixed', 'min': 10, 'ml': 10, 'max': 10}], 'expect_crit_A': 0.5},
    # AUR art. 86 with N = 70, D ~ U(95, 115): E[R] = (1/20) x integral_{n0}^{15} k n^2 dn, k = 0.45e6/4900, n0 = sqrt(75/k) (totals under 75 EUR neglected); cap 50 000 not reached
    {'id': 'hand-aur86', 'items': [{'dist': 'fixed', 'min': 1e6, 'ml': 1e6, 'max': 1e6}], 'activities': [{'dist': 'uniform', 'min': 95, 'ml': 105, 'max': 115}],
     'ldMode': 'aur86', 'ldM': 1e6, 'ldCapPct': 5, 'targetDays': 100,
     'expect_ld': (0.45e6 / 4900 / 20) * (15 ** 3 - math.sqrt(75 / (0.45e6 / 4900)) ** 3) / 3},
    {'id': 'hand-euler', 'items': [{'dist': 'pert', 'min': 80, 'ml': 100, 'max': 160}, {'dist': 'uniform', 'min': 0, 'ml': 50, 'max': 100}], 'rhoCost': 0.5},
    {'id': 'hand-ldcap', 'items': [{'dist': 'fixed', 'min': 0, 'ml': 0, 'max': 0}], 'activities': [{'dist': 'uniform', 'min': 90, 'ml': 100, 'max': 110}],
     'ld': 100, 'ldCap': 500, 'targetDays': 100, 'expect_ld': 187.5},
    {'id': 'hand-corr', 'items': [{'dist': 'pert', 'min': 90, 'ml': 100, 'max': 130} for _ in range(6)], 'rhoCost': 0.7},
    {'id': 'hand-negcorr', 'items': [{'dist': 'uniform', 'min': 0, 'ml': 50, 'max': 100}, {'dist': 'uniform', 'min': 0, 'ml': 50, 'max': 100}], 'rhoCost': -0.8},
]


def main():
    presets = json.loads((HERE / 'riskcontingency_presets.json').read_text(encoding='utf-8'))['presets']
    cases = []
    for p in presets:
        cases.append({'input': p, 'expect': reference(p, seed=11)})
    for h in HAND:
        inp = {k: v for k, v in h.items() if not k.startswith('expect_')}
        inp.setdefault('iterations', 10000)
        inp.setdefault('seed', 77)
        e = reference(inp, seed=12)
        hand = {k[7:]: v for k, v in h.items() if k.startswith('expect_')}
        # analytic checks of the reference itself
        if 'dur_mean' in hand:
            assert abs(e['mc']['dur.mean']['v'] - hand['dur_mean']) < 0.25, (e['mc']['dur.mean'], hand['dur_mean'])
        if 'crit_A' in hand:
            assert abs(e['mc']['crit.A']['v'] - 0.5) < 1e-12
        if 'share_sum' in e:
            assert abs(e['share_sum'] - 1) < 1e-9, (h['id'], e['share_sum'])
        if 'ld' in hand:
            assert abs(e['mc']['ld.mean']['v'] - hand['ld']) < max(0.01 * hand['ld'], 3), (h['id'], e['mc']['ld.mean'], hand['ld'])
        if 'mean' in hand:
            assert abs(e['mc']['cost.mean']['v'] - hand['mean']) <= e['mc']['cost.mean']['tol'] / 4 * 0.5 + 1e-9 + 0.002 * abs(hand['mean']), (h['id'], e['mc']['cost.mean'], hand['mean'])
        cases.append({'input': inp, 'expect': e, 'hand': hand})
    r = random.Random(20261115)
    for k in range(30):
        c = rand_case(r, k)
        cases.append({'input': c, 'expect': reference(c, seed=100 + k)})
    # findings of the presets (ahas), from the reference samples
    aha = {}
    ex = {c['input']['id']: c['expect'] for c in cases}
    s = ex['be-sewer']
    aha['be-sewer'] = (abs(s['det']['base'] - 5640000) < 1e-6 and 0.10 <= s['mc']['pBase']['v'] <= 0.14 and abs(s['mc']['cost.p80']['v'] - 5640000 - 564000) < 20000
                       and abs(s['share']['I2']['v'] - 0.25) < 0.025 and abs(s['share']['I1']['v'] - 0.30) < 0.025 and s['share']['I4']['v'] < 0.05
                       and abs(s['mc']['ld.mean']['v'] - 2500) < 400)
    epc = [p for p in presets if p['id'] == 'epc-fidic'][0]
    e0 = reference(dict(epc, rhoCost=0), seed=13)
    aha['epc-fidic'] = abs(ex['epc-fidic']['mc']['cost.p80']['v'] - 48e6 - 3.32e6) < 80000 and abs(e0['mc']['cost.p80']['v'] - 48e6 - 2.55e6) < 80000
    tr = [p for p in presets if p['id'] == 'equip-trafo'][0]
    one = dict(tr, activities=[a for a in tr['activities'] if not a['path'] or a['path'] == 'W'])
    t1 = reference(one, seed=14)
    t = ex['equip-trafo']
    aha['equip-trafo'] = t['det']['D0'] == 215 and abs(t['mc']['pTargetDays']['v'] - 0.13) < 0.02 and abs(t['mc']['ld.mean']['v'] - 97000) < 5000 and abs(t1['mc']['pTargetDays']['v'] - 0.35) < 0.03
    c = ex['client-budget']
    aha['client-budget'] = abs(c['det']['emv'] - 211583.333) < 1 and abs(c['mc']['pBaseEmv']['v'] - 0.32) < 0.02 and abs((c['mc']['cost.p80']['v'] - 4510000) / c['det']['emv'] - 2.6) < 0.12
    aha_vals = {'epc_rho0_p80': e0['mc']['cost.p80']['v'], 'trafo_one_chain_pTarget': t1['mc']['pTargetDays']['v'],
                'sewer_share_I1': s['share']['I1']['v'], 'sewer_share_I2': s['share']['I2']['v'], 'sewer_share_I4': s['share']['I4']['v'], 'sewer_aur_mean': s['mc']['ld.mean']['v']}
    out = {'tool': 'riskcontingency', 'n_ref': N_REF, 'n_page': N_PAGE, 'slack': SLACK, 'cases': cases, 'aha': aha, 'aha_values': aha_vals,
           'method': 'numpy beta/triangular/uniform sampling, Bernoulli events, own Iman-Conover, max over paths; tolerance 4 SE of the page run + 0.3 %'}
    (HERE / 'riskcontingency_ref.json').write_text(json.dumps(out, indent=0), encoding='utf-8')
    print('cases', len(cases), 'aha', aha, aha_vals)
    return 0 if all(aha.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
