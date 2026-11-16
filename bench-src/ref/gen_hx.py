import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math
import numpy as np
from math import exp, log, sqrt, factorial

# ===========================================================================
# INDEPENDENT closed-form effectiveness-NTU relations.
# Sources: W.M. Kays & A.L. London, "Compact Heat Exchangers", 3rd ed., Table 2-1;
#          R.K. Shah & D.P. Sekulic, "Fundamentals of Heat Exchanger Design", Table 3.3.
# ===========================================================================
def eps_counter(N, C):
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    if abs(C - 1) < 1e-12: return N / (1 + N)
    e = exp(-N * (1 - C))
    return (1 - e) / (1 - C * e)

def eps_parallel(N, C):
    if N <= 0: return 0.0
    return (1 - exp(-N * (1 + C))) / (1 + C)

def eps_cross_unmixed_approx(N, C):
    "The standard engineering approximation (Incropera Eq. 11.32)."
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    return 1 - exp((1 / C) * N**0.22 * (exp(-C * N**0.78) - 1))

def eps_cross_unmixed_exact(N, C, nmax=140):
    """EXACT series solution, Mason (1954) / Baclic:
       eps = 1 - e^-N - e^-(1+C)N * sum_{n>=1} C^n P_n(N),
       P_n(y) = 1/(n+1)! * sum_{j=1}^{n+1} (n+1-j)/j! * y^(n+j)"""
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    tot = 0.0
    for n in range(1, nmax + 1):
        Pn = 0.0
        for j in range(1, n + 2):
            Pn += (n + 1 - j) / factorial(j) * N**(n + j)
        Pn /= factorial(n + 1)
        term = C**n * Pn
        tot += term
        if n > 8 and term < 1e-18 * max(tot, 1e-30): break
    return 1 - exp(-N) - exp(-(1 + C) * N) * tot

def eps_cross_unmixed_numeric(N, C, m=400):
    """Second, fully independent reference for crossflow with both fluids
       unmixed: split the exchanger into mm x mm cells, treat each cell as a
       micro-exchanger (cell NTU is O(1/mm), so the cell arrangement does not
       matter to O(1/mm^2)), march along the anti-diagonals, Richardson-
       extrapolate in 1/mm. Cmin is on the hot side: UA/Ch = N, UA/Cc = N*C."""
    def solve(mm):
        dNh = N / mm                       # per-cell NTU on the Cmin (hot) side
        ec = eps_counter(dNh, C)           # cell effectiveness
        TH = np.zeros((mm + 1, mm)); TH[0, :] = 1.0
        TC = np.zeros((mm, mm + 1))        # TC[:, 0] = 0 (cold inlet)
        for d in range(2 * mm - 1):
            i = np.arange(max(0, d - mm + 1), min(mm - 1, d) + 1)
            j = d - i
            th = TH[i, j]; tc = TC[i, j]
            dTh = ec * (th - tc)           # = q / Ch_cell
            TH[i + 1, j] = th - dTh
            TC[i, j + 1] = tc + C * dTh    # = q / Cc_cell,  Cc_cell = Ch_cell / C
        return 1.0 - TH[mm, :].mean()
    a1 = solve(m // 2); b1 = solve(m)
    return b1 + (b1 - a1), abs(b1 - a1)

def eps_cross_cmax_mixed(N, C):
    "Cmax mixed, Cmin unmixed"
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    return (1 / C) * (1 - exp(-C * (1 - exp(-N))))

def eps_cross_cmin_mixed(N, C):
    "Cmin mixed, Cmax unmixed"
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    return 1 - exp(-(1 / C) * (1 - exp(-C * N)))

def eps_cross_both_mixed(N, C):
    if N <= 0: return 0.0
    if C < 1e-12: return 1 - exp(-N)
    return 1.0 / (1 / (1 - exp(-N)) + C / (1 - exp(-C * N)) - 1 / N)

def eps_st12(N, C):
    "1 shell pass, 2 (or 2n) tube passes - Kays & London"
    if N <= 0: return 0.0
    r = sqrt(1 + C * C)
    e = exp(-N * r)
    return 2.0 / ((1 + C) + r * (1 + e) / (1 - e))

def eps_stn(N, C, n):
    "n shell passes, 2n tube passes"
    if N <= 0: return 0.0
    e1 = eps_st12(N / n, C)
    if abs(C - 1) < 1e-12:
        return n * e1 / (1 + (n - 1) * e1)
    a = ((1 - e1 * C) / (1 - e1))**n
    return (a - 1) / (a - C)

# The production relation for crossflow with both fluids unmixed is the EXACT
# Mason (1954) series (cross-checked below against a finite-difference solution
# of the crossflow PDE). The Incropera Eq. 11.32 shortcut is carried separately
# as eps_cross_unmixed_approx so its deviation can still be reported.
REL = {'counter': eps_counter, 'parallel': eps_parallel,
       'cross': eps_cross_unmixed_exact, 'crossmix': eps_cross_cmax_mixed,
       'st12': eps_st12, 'st24': lambda N, C: eps_stn(N, C, 2)}

# --- LMTD and the F correction factor -------------------------------------
def lmtd(dt1, dt2):
    if abs(dt1 - dt2) < 1e-12: return dt1
    return (dt1 - dt2) / log(dt1 / dt2)

def F_bowman(P, R, n=1):
    """Bowman/TEMA F for n shell passes and 2n tube passes."""
    r = sqrt(R * R + 1)
    Px = P
    if n > 1:
        a = ((1 - P * R) / (1 - P))**(1.0 / n)
        Px = (a - 1) / (a - R)
    if abs(R - 1) < 1e-8:
        num = Px * r / (1 - Px)
        den = log((2 / Px - 1 - R + r) / (2 / Px - 1 - R - r))
        return num / den
    num = r * log((1 - Px) / (1 - Px * R))
    den = (R - 1) * log((2 / Px - 1 - R + r) / (2 / Px - 1 - R - r))
    return num / den

def F_from_epsNTU(arr, N, C):
    """F must satisfy Q = U A F LMTD_counterflow. With Q = eps Cmin dTmax and
       NTU = UA/Cmin this is F = eps / (NTU * lmtd_norm) where lmtd_norm is the
       counterflow LMTD of the actual terminal temperatures, normalised by dTmax."""
    eps = REL[arr](N, C)
    # dimensionless terminal temperatures, Cmin on the hot side, dTmax = 1
    tho = 1 - eps                 # hot outlet
    tco = eps * C                 # cold outlet   (Cc = Cmin/C)
    dt1 = 1 - tco                 # Thi - Tco
    dt2 = tho - 0                 # Tho - Tci
    if dt1 <= 0 or dt2 <= 0: return float('nan')
    L = lmtd(dt1, dt2)
    return eps / (N * L)

cases = []

# --- 1. eps-NTU library grid ----------------------------------------------
grid = []
for arr in ['counter', 'parallel', 'cross', 'crossmix', 'st12', 'st24']:
    for N in [0.25, 0.5, 1.0, 2.0, 4.0, 8.0]:
        for C in [0.0, 0.25, 0.5, 0.75, 1.0]:
            row = {'arr': arr, 'NTU': N, 'Cr': C, 'eps': REL[arr](N, C)}
            if arr == 'cross':
                row['eps_published_approx'] = eps_cross_unmixed_approx(N, C)
                row['eps_exact_series'] = eps_cross_unmixed_exact(N, C)
                num, _ = eps_cross_unmixed_numeric(N, C, 400) if C > 0 else (1 - exp(-N), 0)
                row['eps_numeric_pde'] = num
                row['eps'] = row['eps_exact_series']
                row['crosscheck_series_vs_pde'] = abs(row['eps_exact_series'] - num)
            grid.append(row)
cases.append({'id': 'eps-ntu-grid', 'kind': 'library',
  'note': 'Closed-form effectiveness-NTU relations (Kays & London Table 2-1 / '
          'Shah & Sekulic Table 3.3) evaluated in python; the tool is probed at '
          'exactly the same (arrangement, NTU, Cr).', 'points': grid})

# --- 2. crossflow both unmixed: exact vs the approximation the tool uses ---
xf = []
for N in [0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 6.0, 8.0]:
    for C in [0.25, 0.5, 0.75, 1.0]:
        ex = eps_cross_unmixed_exact(N, C)
        ap = eps_cross_unmixed_approx(N, C)
        num, step = eps_cross_unmixed_numeric(N, C, 1200)
        xf.append({'NTU': N, 'Cr': C, 'eps_exact_series': ex, 'eps_approx': ap,
                   'eps_numeric_pde': num, 'series_vs_pde_abs': abs(ex - num),
                   'approx_minus_exact': ap - ex,
                   'approx_rel_error': abs(ap - ex) / ex})
cases.append({'id': 'crossflow-exact-vs-approx', 'kind': 'analytic',
  'note': 'Exact Mason(1954) series solution for crossflow with both fluids '
          'unmixed vs the standard engineering approximation. A finite-difference '
          'solution of the crossflow PDE is carried as an independent crosscheck.',
  'points': xf})

# --- 3. mixed-crossflow variants the tool does NOT offer -------------------
mix = []
for N in [0.5, 1.0, 2.0, 4.0]:
    for C in [0.25, 0.5, 1.0]:
        mix.append({'NTU': N, 'Cr': C,
          'cmax_mixed_cmin_unmixed': eps_cross_cmax_mixed(N, C),
          'cmin_mixed_cmax_unmixed': eps_cross_cmin_mixed(N, C),
          'both_mixed': eps_cross_both_mixed(N, C)})
cases.append({'id': 'crossflow-mixed-variants', 'kind': 'analytic',
  'note': 'The three mixed-crossflow closed forms. The tool offers only one '
          '("Crossflow, Cmax mixed"); recorded so the label can be checked '
          'against the formula actually implemented.', 'points': mix})

# --- 4. limits -------------------------------------------------------------
lim = {'Cr0': [], 'Cr1': [], 'NTU0': []}
for arr in REL:
    for N in [0.5, 2.0, 5.0]:
        lim['Cr0'].append({'arr': arr, 'NTU': N, 'Cr': 0.0, 'eps': 1 - exp(-N),
                           'law': '1-exp(-NTU) for every arrangement when Cr=0'})
    for N in [0.5, 2.0, 5.0]:
        lim['Cr1'].append({'arr': arr, 'NTU': N, 'Cr': 1.0, 'eps': REL[arr](N, 1.0)})
    for arr2 in [arr]:
        lim['NTU0'].append({'arr': arr2, 'NTU': 1e-6, 'Cr': 0.5, 'eps': REL[arr2](1e-6, 0.5)})
cases.append({'id': 'eps-ntu-limits', 'kind': 'analytic',
  'note': 'Cr=0, Cr=1 and NTU->0 limits.', 'limits': lim})

# --- 5. Cr -> 1 continuity (the closed forms are removable singularities) ---
cont = []
for arr in REL:
    for N in [0.5, 2.0, 5.0]:
        vals = [REL[arr](N, c) for c in [0.99, 0.999, 0.9999, 0.999999, 1.0]]
        cont.append({'arr': arr, 'NTU': N, 'Cr_list': [0.99, 0.999, 0.9999, 0.999999, 1.0],
                     'eps': vals, 'max_jump_near_1': abs(vals[-1] - vals[-2])})
cases.append({'id': 'cr-to-1-continuity', 'kind': 'analytic', 'points': cont,
  'note': 'The counterflow and 2-4 shell relations have removable singularities at '
          'Cr=1; a correct implementation must be continuous there.'})

# --- 6. F correction factor -------------------------------------------------
ff = []
for arr in ['counter', 'parallel', 'cross', 'crossmix', 'st12', 'st24']:
    for N in [0.5, 1.0, 2.0, 3.0]:
        for C in [0.25, 0.5, 1.0]:
            eps = REL[arr](N, C)
            F = F_from_epsNTU(arr, N, C)
            row = {'arr': arr, 'NTU': N, 'Cr': C, 'eps': eps, 'F_from_epsNTU': F}
            if arr in ('st12', 'st24'):
                P = eps            # Cmin on the hot side -> P = (Tco-Tci)/(Thi-Tci) = eps*C ... see below
                # with Cmin = Ch: eps = (Thi-Tho)/(Thi-Tci) = P_hot ; R = Ch/Cc = C
                Ph = eps; Rh = C
                try:
                    row['F_bowman'] = F_bowman(Ph, Rh, 1 if arr == 'st12' else 2)
                    row['F_bowman_minus_F_epsNTU'] = row['F_bowman'] - F
                except Exception as e:
                    row['F_bowman'] = None
            ff.append(row)
cases.append({'id': 'f-correction-factor', 'kind': 'analytic', 'points': ff,
  'note': 'F defined by Q = U A F LMTD_counterflow, derived from the eps-NTU '
          'relation; for the shell-and-tube arrangements the Bowman/TEMA closed '
          'form is computed as a second, independent reference.'})

# --- 7. LMTD ---------------------------------------------------------------
lm = [{'dt1': a, 'dt2': b, 'lmtd': lmtd(a, b)} for a, b in
      [(50, 20), (15, 15), (100, 1), (30, 29.999999), (5, 5), (80, 2)]]
cases.append({'id': 'lmtd', 'kind': 'analytic', 'points': lm,
  'note': 'LMTD closed form including the equal-approach limit.'})

out = {'generated_by': 'bench-src/ref/gen_hx.py',
  'reference': 'Closed-form effectiveness-NTU relations, the exact Mason series for '
               'crossflow with both fluids unmixed (cross-checked against a '
               'finite-difference solution of the crossflow PDE), LMTD and the '
               'Bowman/TEMA F factor - all implemented independently in python.',
  'cases': cases}
json.dump(out, open(_gp.ref('heat-exchangers_ref.json'), 'w'), indent=1)

print('cases:', len(cases))
print('crossflow series vs PDE, max abs:', max(p['series_vs_pde_abs'] for p in xf))
print('approx vs exact, max rel:', max(p['approx_rel_error'] for p in xf))
for p in xf:
    if p['Cr'] == 1.0:
        print('  NTU=%.2f C=1 exact=%.6f approx=%.6f pde=%.6f' % (p['NTU'], p['eps_exact_series'], p['eps_approx'], p['eps_numeric_pde']))
