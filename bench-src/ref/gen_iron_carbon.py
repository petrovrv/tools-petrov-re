#!/usr/bin/env python3
"""
Independent reference for iron_carbon_diagram.html (Fe-Fe3C metastable
diagram).

Two kinds of reference are used, and they are kept strictly separate:

(A) PUBLISHED INVARIANT VALUES.  The accepted Fe-Fe3C invariant points are quoted
    from more than one authoritative source.  The sources genuinely disagree by
    more than any sensible display tolerance (e.g. the peritectic is given as
    1493 C / 0.16 wt%C by the Callister-type textbook diagram and as 1495 C /
    0.17 wt%C by the ASM-type evaluation), so each quantity is carried as a BAND
    [lo, hi] together with the individual source values, and the mutual spread is
    recorded as `crosscheck`.  Per the harness rule the tool is never called wrong
    where the references themselves disagree by more than the tolerance - such a
    case is flagged instead.

(B) EXACT LEVER-RULE ARITHMETIC.  This needs no external data at all: the runner
    extracts the phase-boundary compositions that the TOOL ITSELF places (by
    bisecting on its own phase-field labels) and then checks that the reported
    mass fractions satisfy, exactly,
        f_left + f_right = 1
        f_left = (C_right - c)/(C_right - C_left)
        c      = f_left*C_left + f_right*C_right      (mass balance)
    in every two-phase field of the diagram.

The proeutectoid/pearlite fractions of a hypoeutectoid steel are computed here in
python from the accepted eutectoid data, and cross-checked a second, structurally
different way through the total-ferrite balance
        W_alpha_total = W_proeutectoid + W_pearlite * (C_Fe3C - C_eutectoid)/(C_Fe3C - C_alpha)
which must reproduce the plain two-phase lever rule at the same point.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json

# ---------------------------------------------------------------- (A) sources
# Values as published.  Source keys:
#  CAL  - Callister-type textbook Fe-Fe3C diagram (the set 727/0.76, 1147/4.30,
#         1493/0.16, gamma_max 2.14, alpha_max 0.022, Fe3C 6.67, 912/1394/1538)
#  ASM  - ASM-type evaluation of the C-Fe system (1495/0.17 peritectic with
#         L=0.53 and delta=0.09, 1148/4.30 eutectic with gamma=2.08, 727/~0.77
#         eutectoid, 912/1394/1538)
#  ISP  - IspatGuru summary of the Fe-Fe3C diagram (4.26 %C eutectic, 0.76 %C
#         eutectoid at 727 C, gamma_max 2.14 at 1148 C, alpha_max 0.025 at 727 C,
#         910/1394/1538)
#  STO  - exact Fe3C stoichiometry from IUPAC atomic weights
SOURCES = {
    'CAL': 'Callister-type textbook Fe-Fe3C diagram (see e.g. the lecture handout '
           'https://eng.utq.edu.iq/wp-content/uploads/sites/4/2019/09/phase-diagram.pdf '
           'and Metallurgy e-learning notes): eutectoid 727 C, eutectic 1147 C / '
           '4.3 %C, peritectic 1493 C / 0.16-0.18 %C, alpha_max 0.022 %C, '
           'gamma_max 2.11-2.14 %C, Fe3C 6.67 %C, 912 / 1395 / 1538 C',
    'ASM': 'ASM-type evaluation of the C-Fe system as reproduced by '
           'https://metallurgysite.com/learning/matFeCdiagram.php and '
           'https://mechcodex.com/calculators/materials/fe-fe3c-phase-diagram '
           '(cited to ASM Handbook Vol. 3, Alloy Phase Diagrams): peritectic '
           '1495 C with L=0.53, delta=0.09, gamma=0.17 %C; eutectic 1148 C with '
           'L=4.3, gamma=2.08 %C; eutectoid 727 C, alpha_max 0.022 %C, '
           'gamma_max 2.14 %C, Fe3C 6.67 %C, 912 / 1395 / 1538 C',
    'ISP': 'IspatGuru, "The Iron-Carbon Phase Diagram", '
           'https://www.ispatguru.com/the-iron-carbon-phase-diagram/ : eutectic '
           '4.26 %C, eutectoid 0.76 %C at 727 C, gamma_max 2.14 %C at 1148 C, '
           'alpha_max 0.025 %C at 727 C, 910 / 1394 / 1538 C',
    'STO': 'Stoichiometry of Fe3C from IUPAC atomic weights '
           '(12.011 / (3*55.845 + 12.011) = 6.689 wt% C)',
}

FE3C_STOICH = 12.011 / (3 * 55.845 + 12.011) * 100.0

INVARIANTS = {
    # name: {values per source} -> band + preferred
    'eutectoid_T_C':      {'CAL': 727.0, 'ASM': 727.0, 'ISP': 727.0},
    'eutectoid_C_wt':     {'CAL': 0.76, 'ASM': 0.77, 'ISP': 0.76},
    'eutectic_T_C':       {'CAL': 1147.0, 'ASM': 1148.0, 'ISP': 1148.0},
    'eutectic_C_wt':      {'CAL': 4.30, 'ASM': 4.30, 'ISP': 4.26},
    'peritectic_T_C':     {'CAL': 1493.0, 'ASM': 1495.0},
    'peritectic_C_wt':    {'CAL': 0.16, 'ASM': 0.17},
    'peritectic_delta_C': {'CAL': 0.09, 'ASM': 0.09},
    'peritectic_L_C':     {'CAL': 0.53, 'ASM': 0.53},
    'gamma_max_C_wt':     {'CAL': 2.14, 'ASM': 2.14, 'ISP': 2.14},
    'alpha_max_C_wt':     {'CAL': 0.022, 'ASM': 0.022, 'ISP': 0.025},
    'Fe3C_C_wt':          {'CAL': 6.67, 'ASM': 6.67, 'STO': FE3C_STOICH},
    'alpha_gamma_T_C':    {'CAL': 912.0, 'ASM': 912.0, 'ISP': 910.0},
    'gamma_delta_T_C':    {'CAL': 1394.0, 'ASM': 1395.0, 'ISP': 1394.0},
    'melting_T_C':        {'CAL': 1538.0, 'ASM': 1538.0, 'ISP': 1538.0},
}

inv = {}
for k, v in INVARIANTS.items():
    vals = list(v.values())
    lo, hi = min(vals), max(vals)
    inv[k] = {'sources': v, 'band': [lo, hi],
              'spread_abs': hi - lo,
              'spread_rel': (hi - lo) / max(abs((lo + hi) / 2), 1e-30)}

# -------------------------------------------------- (B) microstructure targets
CA, CE, CC = 0.022, 0.76, 6.67       # alpha max, eutectoid, cementite


def micro(c):
    """Room-temperature microstructure of a plain Fe-C steel, standard lever rule."""
    if c < CA:
        return {'class': 'ferrite', 'parts': {'alpha': 1.0}}
    if c < CE:
        wp = (c - CA) / (CE - CA)
        return {'class': 'hypoeutectoid', 'parts': {'proeutectoid_ferrite': 1 - wp,
                                                    'pearlite': wp}}
    if abs(c - CE) < 1e-12:
        return {'class': 'eutectoid', 'parts': {'pearlite': 1.0}}
    wc = (c - CE) / (CC - CE)
    return {'class': 'hypereutectoid', 'parts': {'pearlite': 1 - wc,
                                                 'secondary_cementite': wc}}


def total_alpha_two_phase(c):
    """Plain two-phase lever rule alpha/(alpha+Fe3C) just below the eutectoid."""
    return (CC - c) / (CC - CA)


def total_alpha_via_micro(c):
    """Structurally different route: sum the ferrite in the proeutectoid
    constituent and the ferrite inside the pearlite lamellae."""
    m = micro(c)
    fa_in_pearlite = (CC - CE) / (CC - CA)
    if m['class'] == 'hypoeutectoid':
        return m['parts']['proeutectoid_ferrite'] + m['parts']['pearlite'] * fa_in_pearlite
    if m['class'] == 'eutectoid':
        return fa_in_pearlite
    return m['parts']['pearlite'] * fa_in_pearlite


micro_cases = []
for c in (0.10, 0.20, 0.40, 0.60, 0.76, 0.80, 1.00, 1.50, 2.00):
    m = micro(c)
    cc = abs(total_alpha_via_micro(c) - total_alpha_two_phase(c))
    micro_cases.append({
        'id': f'micro_C{c}', 'C_wt': c, 'class': m['class'], 'parts': m['parts'],
        'total_alpha_just_below_eutectoid': total_alpha_two_phase(c),
        'total_Fe3C_just_below_eutectoid': 1 - total_alpha_two_phase(c),
        'crosscheck': {'dev_total_alpha_two_routes': cc},
        'note': (f'{c} wt%C: constituent fractions from the standard lever rule with '
                 f'C_alpha={CA}, C_eutectoid={CE}, C_Fe3C={CC}. Cross-checked by '
                 f'summing the ferrite in the proeutectoid constituent and inside '
                 f'the pearlite; the two routes agree to {cc:.2e}.'),
    })

# --------------------------------------------------------- two-phase probe set
# One or more (C, T) points inside EVERY two-phase field of the diagram.
LEVER_POINTS = [
    {'id': 'lever_deltaL',    'C': 0.30, 'T': 1510, 'field': 'delta + L'},
    {'id': 'lever_deltaL2',   'C': 0.20, 'T': 1520, 'field': 'delta + L'},
    {'id': 'lever_deltagamma', 'C': 0.07, 'T': 1450, 'field': 'delta + gamma'},
    {'id': 'lever_gammaL',    'C': 2.50, 'T': 1300, 'field': 'gamma + L'},
    {'id': 'lever_gammaL2',   'C': 3.50, 'T': 1200, 'field': 'gamma + L'},
    {'id': 'lever_LFe3C',     'C': 6.00, 'T': 1200, 'field': 'L + Fe3C'},
    {'id': 'lever_LFe3C2',    'C': 5.80, 'T': 1160, 'field': 'L + Fe3C'},
    {'id': 'lever_alphagamma', 'C': 0.20, 'T': 800, 'field': 'alpha + gamma'},
    {'id': 'lever_alphagamma2', 'C': 0.35, 'T': 780, 'field': 'alpha + gamma'},
    {'id': 'lever_gammaFe3C', 'C': 3.00, 'T': 900, 'field': 'gamma + Fe3C'},
    {'id': 'lever_gammaFe3C2', 'C': 2.00, 'T': 1000, 'field': 'gamma + Fe3C'},
    {'id': 'lever_alphaFe3C', 'C': 0.80, 'T': 600, 'field': 'alpha + Fe3C'},
    {'id': 'lever_alphaFe3C2', 'C': 3.00, 'T': 400, 'field': 'alpha + Fe3C'},
    {'id': 'lever_alphaFe3C3', 'C': 0.40, 'T': 726, 'field': 'alpha + Fe3C'},
]

# ------------------------------------------------ boundary-probe reference set
# Compositions the tool must place at the invariant temperatures.  Probed by
# bisecting the tool's own phase-field labels at a temperature 0.5 C off the
# invariant line so the field sequence is unambiguous.
BOUNDARY_PROBES = [
    {'id': 'bnd_eutectoid', 'T': 727.0,
     'targets': {'alpha_max_C_wt': 0, 'eutectoid_C_wt': 1},
     'note': 'At the eutectoid temperature the alpha/(alpha+gamma) boundary is the '
             'maximum solubility of C in ferrite and the (alpha+gamma)/(gamma+Fe3C) '
             'boundary is the eutectoid composition.'},
    {'id': 'bnd_eutectic', 'T': 1147.0,
     'targets': {'gamma_max_C_wt': 0, 'eutectic_C_wt': 1},
     'note': 'At the eutectic temperature the gamma/(gamma+L) boundary is the maximum '
             'solubility of C in austenite and the (gamma+L)/(L+Fe3C) boundary is the '
             'eutectic composition.'},
    {'id': 'bnd_peritectic', 'T': 1493.0,
     'targets': {'peritectic_delta_C': 0, 'peritectic_L_C': 1},
     'note': 'At the peritectic temperature the delta/(delta+L) boundary is the maximum '
             'solubility of C in delta ferrite and the (delta+L)/L boundary is the '
             'peritectic liquid composition.'},
]

PURE_IRON = [
    {'id': 'fe_alpha_below', 'C': 0.0, 'T': 905, 'expect_phase': 'Ferrite'},
    {'id': 'fe_gamma_above', 'C': 0.0, 'T': 920, 'expect_phase': 'Austenite'},
    {'id': 'fe_gamma_below', 'C': 0.0, 'T': 1385, 'expect_phase': 'Austenite'},
    {'id': 'fe_delta_above', 'C': 0.0, 'T': 1400, 'expect_phase': 'δ-ferrite'},
    {'id': 'fe_delta_below', 'C': 0.0, 'T': 1530, 'expect_phase': 'δ-ferrite'},
    {'id': 'fe_liquid_above', 'C': 0.0, 'T': 1545, 'expect_phase': 'Liquid'},
]

OUT_OF_RANGE = [
    {'id': 'oor_C_high', 'C': 7.0, 'T': 700},
    {'id': 'oor_C_neg', 'C': -0.5, 'T': 700},
    {'id': 'oor_T_low', 'C': 1.0, 'T': 150},
    {'id': 'oor_T_high', 'C': 1.0, 'T': 1650},
]

ref = {
    'generator': 'ref/gen_iron_carbon.py',
    'reference': ('(a) published Fe-Fe3C invariant values quoted from several '
                  'authoritative sources and carried as bands because the sources '
                  'themselves disagree; (b) exact lever-rule arithmetic checked '
                  'against the phase-boundary compositions the tool itself places, '
                  'which needs no external data.'),
    'citations': list(SOURCES.values()),
    'source_keys': SOURCES,
    'invariants': inv,
    'micro_cases': micro_cases,
    'lever_points': LEVER_POINTS,
    'boundary_probes': BOUNDARY_PROBES,
    'pure_iron': PURE_IRON,
    'out_of_range': OUT_OF_RANGE,
    'constants_used_for_micro': {'C_alpha_max': CA, 'C_eutectoid': CE, 'C_Fe3C': CC},
}
with open(_gp.ref('iron_carbon_ref.json'), 'w') as f:
    json.dump(ref, f, indent=1, allow_nan=False)

print('Fe3C stoichiometric wt%%C = %.4f (tool/textbook rounded value 6.67)' % FE3C_STOICH)
print('\ninvariant reference bands (published scatter):')
for k, v in inv.items():
    print('  %-22s band %-16s spread %.4g (%.2g %%)  sources %s'
          % (k, str(v['band']), v['spread_abs'], 100 * v['spread_rel'],
             ','.join(v['sources'])))
print('\n0.40 wt%C just below 727 C:')
m = micro(0.40)
print('  pearlite            = %.5f' % m['parts']['pearlite'])
print('  proeutectoid ferrite= %.5f' % m['parts']['proeutectoid_ferrite'])
print('  total alpha (2-phase lever)   = %.6f' % total_alpha_two_phase(0.40))
print('  total alpha (constituent sum) = %.6f' % total_alpha_via_micro(0.40))
print('  agreement = %.2e' % abs(total_alpha_via_micro(0.40) - total_alpha_two_phase(0.40)))
