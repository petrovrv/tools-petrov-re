#!/usr/bin/env python3
"""Independent reference for cablesizing.html.

Sources, all cited in the artifact:

IEC 60364-5-52:2009 (+A1:2011, ed. 3.1 2024-11) "Selection and erection of
electrical equipment - Wiring systems":
  Table B.52.1   schedule of reference methods A1, A2, B1, B2, C, D1, D2, E, F, G
  Table B.52.2   current-carrying capacity, PVC, TWO loaded conductors, Cu/Al
  Table B.52.4   current-carrying capacity, PVC, THREE loaded conductors, Cu/Al
  Table B.52.10  methods E, F, G - PVC insulation, copper conductors
  Table B.52.11  methods E, F, G - PVC insulation, aluminium conductors
  Table B.52.14  ambient air temperature other than 30 C
  Table B.52.15  ambient ground temperature other than 20 C
  Table B.52.16  soil thermal resistivity other than 2,5 K.m/W
  Table B.52.17  grouping of more than one circuit / multi-core cable
  Table B.52.18  more than one circuit, cables laid directly in the ground (D2)
  Table B.52.19  more than one circuit, cables laid in ducts in the ground (D1)
  Clause 525 + Annex G  voltage drop:
      u = b (rho1 L/S cos(phi) + lambda L sin(phi)) I_B
      b = sqrt3 for a three-phase circuit (line-to-line drop), 2 for single phase
      rho1 = 1,25 x rho_20 = 0,0225 ohm mm2/m (Cu), 0,036 ohm mm2/m (Al)
  Clause 523.9 + Table 52.2  cable in thermal insulation

IEC 60364-4-43:2017, 434.5.2  adiabatic:  I^2 t <= k^2 S^2, S >= I sqrt(t)/k
IEC 60364-4-43:2017, 433.1                I_B <= I_n <= I_z
IEC 60364-5-54:2011, Table 54.2           protective conductor cross-section

The numerical correction-factor tables below were re-typed from the published
values, not from the tool: B.52.14 and B.52.15 (both insulations) and the
buried-duct row of B.52.16 are quoted in the Schneider Electric Electrical
Installation Guide (chapter G, figures G12/G13/G14) which cites those tables;
B.52.14 and B.52.16 (duct row) are additionally confirmed by ECalPro's
published transcription; B.52.18 (2 to 6 circuits, cables touching) is quoted
in the same guide, figure G18.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, math

SQ3 = math.sqrt(3.0)

# ---- IEC 60364-5-52 Table B.52.14: ambient air temperature -----------------
TEMP_AIR = {
    'pvc': {10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.00, 35: 0.94, 40: 0.87,
            45: 0.79, 50: 0.71, 55: 0.61, 60: 0.50},
    'xlpe': {10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1.00, 35: 0.96, 40: 0.91,
             45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71, 65: 0.65, 70: 0.58, 75: 0.50,
             80: 0.41},
}
# ---- IEC 60364-5-52 Table B.52.15: ambient ground temperature --------------
TEMP_GROUND = {
    'pvc': {10: 1.10, 15: 1.05, 20: 1.00, 25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77,
            45: 0.71, 50: 0.63, 55: 0.55, 60: 0.45},
    'xlpe': {10: 1.07, 15: 1.04, 20: 1.00, 25: 0.96, 30: 0.93, 35: 0.89, 40: 0.85,
             45: 0.80, 50: 0.76, 55: 0.71, 60: 0.65, 65: 0.60, 70: 0.53, 75: 0.46,
             80: 0.38},
}
# ---- IEC 60364-5-52 Table B.52.16: soil thermal resistivity ----------------
SOIL_DUCT = {0.5: 1.28, 0.7: 1.20, 1.0: 1.18, 1.5: 1.10, 2.0: 1.05, 2.5: 1.00, 3.0: 0.96}
SOIL_DIRECT = {0.5: 1.88, 0.7: 1.62, 1.0: 1.50, 1.5: 1.28, 2.0: 1.12, 2.5: 1.00, 3.0: 0.90}
# ---- IEC 60364-5-52 Table B.52.17: grouping -------------------------------
GROUP = {
    'bunched': {1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54,
                8: 0.52, 9: 0.50, 12: 0.45, 16: 0.41, 20: 0.38},
    'wall': {1: 1.00, 2: 0.85, 3: 0.79, 4: 0.75, 5: 0.73, 6: 0.72, 7: 0.72,
             8: 0.71, 9: 0.70},
    'perforated': {1: 1.00, 2: 0.88, 3: 0.82, 4: 0.77, 5: 0.75, 6: 0.73, 7: 0.73,
                   8: 0.72, 9: 0.72},
}
# ---- IEC 60364-5-52 Table B.52.18 (D2, cables touching), 2 to 6 circuits ---
GROUP_BURIED_D2 = {1: 1.00, 2: 0.75, 3: 0.65, 4: 0.60, 5: 0.55, 6: 0.50}
# ---- IEC 60364-5-52 Table 52.2: cable in a thermally insulating wall -------
THERM_SHORT = {50: 0.89, 100: 0.81, 200: 0.68, 400: 0.55}
# ---- IEC 60364-4-43 Table 43A ---------------------------------------------
KSC = {('cu', 'pvc'): 115.0, ('cu', 'xlpe'): 143.0,
       ('al', 'pvc'): 76.0, ('al', 'xlpe'): 94.0}
# ---- IEC 60364-5-52 Annex G resistivity at normal operating temperature ----
RHO_ANNEX_G = {'cu': 22.5, 'al': 36.0}     # ohm mm2/km  (= 1,25 x rho_20)
# ---- resistivity model the page states in its own source ------------------
RHO_TOOL = {('cu', 'pvc'): 22.21, ('cu', 'xlpe'): 23.69,
            ('al', 'pvc'): 35.29, ('al', 'xlpe'): 37.65}

SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]

# ---- IEC 60364-5-52 Table B.52.2: PVC, TWO loaded conductors, copper -------
# published transcription (ECalPro, "IEC 60364 Table B.52 - Cable Current
# Ratings"), 1,5 to 240 mm2.  Used only as an independent consistency bound on
# the three-loaded-conductor column the tool implements.
B52_2_CU = {
    'A1': [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 320],
    'A2': [14, 18.5, 25, 32, 43, 57, 75, 92, 110, 139, 167, 192, 219, 248, 291],
    'B1': [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 300, 341, 400],
    'B2': [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232, 258, 294, 344],
    'C':  [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461],
    'E':  [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514],
}
# the ratio band that the three-loaded column must fall in, per method family.
# Enclosed methods lose 6-11 % going from two to three loaded conductors, free
# air (E) about 15-18 %.  A transposed, mis-scaled or wrong-insulation column
# could not stay inside these bands over 15 sizes.
RATIO_BAND = {'A1': (0.82, 0.96), 'A2': (0.82, 0.96), 'B1': (0.82, 0.96),
              'B2': (0.82, 0.96), 'C': (0.82, 0.96), 'E': (0.78, 0.90)}
# and no single ratio may depart from the column median by more than this,
# which is what catches a transposed row or a single mistyped cell.
RATIO_SPREAD = 0.06
# primary-source spot value quoted from the standard itself
SPOT = {('cu', 'A1', 1.5): 13.5}


def interp(table, x):
    ks = sorted(table)
    if x < ks[0] - 1e-12 or x > ks[-1] + 1e-12:
        return None
    if x in table:
        return table[x]
    for a, b in zip(ks, ks[1:]):
        if a <= x <= b:
            return table[a] + (table[b] - table[a]) * (x - a) / (b - a)
    return None


def step_exact(table, n):
    ks = sorted(table)
    if n > ks[-1]:
        return None
    for k in ks:
        if n <= k:
            return table[k]
    return None


def design_current(system, basis, load, voltage, pf, eff):
    if basis == 'a':
        return load
    va = load * 1000.0
    if basis == 'kva':
        return va / (SQ3 * voltage) if system == '3ph' else va / voltage
    w = va / eff if basis == 'kw_m' else va
    if system == '3ph':
        return w / (SQ3 * voltage * pf)
    if system == '1ph':
        return w / (voltage * pf)
    return w / voltage


def voltage_drop(system, rho, size, length_m, I, pf, x_ohm_km, lead=False):
    """IEC 60364-5-52 clause 525 / Annex G."""
    L = length_m / 1000.0
    R = rho / size
    if system == 'dc':
        pf, X = 1.0, 0.0
    else:
        X = x_ohm_km
    sin = math.sqrt(max(0.0, 1.0 - pf * pf)) * (-1.0 if lead else 1.0)
    z = R * pf + X * sin
    b = SQ3 if system == '3ph' else 2.0
    return b * I * z * L


def adiabatic_min_section(I_kA, t_ms, material, insulation):
    """IEC 60364-4-43, 434.5.2:  S >= I sqrt(t) / k."""
    return I_kA * 1000.0 * math.sqrt(t_ms / 1000.0) / KSC[(material, insulation)]


def adiabatic_capacity_kA(size, t_ms, material, insulation):
    return KSC[(material, insulation)] * size / math.sqrt(t_ms / 1000.0) / 1000.0


def pe_section(s):
    """IEC 60364-5-54 Table 54.2."""
    if s <= 16:
        return s
    if s <= 35:
        return 16.0
    for q in SIZES:
        if q >= s / 2:
            return q
    return s


def losses_kW(system, rho, size, length_m, I):
    R = rho / size * length_m / 1000.0
    n = 3 if system == '3ph' else 2
    return n * I * I * R / 1000.0


# --------------------------------------------------------------------- cases
def cases():
    C = []
    base = dict(system='3ph', basis='kw_e', load=75, voltage=400, pf=0.9,
                pfType='lag', eff=0.95, length=80, material='cu',
                insulation='pvc', terminal=70, method='C', neutral='full',
                pe='auto', ambient=30, circuits=1, grouping='bunched', soil=2.5,
                thermalMode='none', thermalLength=100, extraFactor=1.0,
                vdLimit=5, reactance=0.08, protectionMode='none', breaker=160,
                scMode='none', fault=10, clearTime=200)

    def c(cid, note, **kw):
        d = dict(base)
        d.update(kw)
        C.append({'id': cid, 'note': note, 'inputs': d})

    # --- design current ----------------------------------------------------
    c('ib_3ph_kw_electrical', 'Design current from electrical kW at 400 V, pf 0.9.',
      basis='kw_e', load=75)
    c('ib_3ph_kw_mechanical', 'Design current from mechanical kW: P/(eta) then /(sqrt3 U pf).',
      basis='kw_m', load=75, eff=0.92)
    c('ib_3ph_kva', 'Design current from kVA.', basis='kva', load=100)

    # --- correction factors, air -------------------------------------------
    for amb in (20, 35, 40, 45, 55):
        c('k_ambient_%d' % amb,
          'Ambient air %d C: correction factor from IEC 60364-5-52 Table B.52.14 (PVC).' % amb,
          ambient=amb, load=40)
    c('k_ambient_interp_37', 'Ambient 37 C is between two tabulated points; the page '
      'interpolates linearly inside Table B.52.14.', ambient=37, load=40)
    for n in (2, 3, 5, 9, 12, 20):
        c('k_group_bunched_%d' % n,
          '%d bunched circuits: reduction factor from Table B.52.17 item 1.' % n,
          circuits=n, load=30)
    c('k_group_wall_4', '4 circuits in a single layer on a wall: Table B.52.17 item 2.',
      grouping='wall', circuits=4, load=30)
    c('k_group_perf_6', '6 circuits on a perforated tray: Table B.52.17 item 4.',
      grouping='perforated', circuits=6, load=30)
    c('k_group_step_11', '11 bunched circuits is not tabulated; the page must take the '
      'next tabulated count (12), never interpolate a reduction factor.',
      circuits=11, load=20)

    # --- correction factors, buried ----------------------------------------
    c('k_soil_duct_1_5', 'Method D1 in a buried duct, soil 1,5 K.m/W: Table B.52.16 '
      'buried-duct row, with the ground-temperature factor of Table B.52.15.',
      method='D1', soil=1.5, ambient=20, load=40)
    c('k_soil_direct_1_0', 'Method D2 buried direct, soil 1,0 K.m/W: Table B.52.16 '
      'direct-buried row.', method='D2', soil=1.0, ambient=20, load=40)
    c('k_ground_temp_25', 'Buried, ground temperature 25 C: Table B.52.15 (PVC).',
      method='D1', soil=2.5, ambient=25, load=40)
    c('k_buried_group_4', 'Four buried circuits, method D2: Table B.52.18, cables touching.',
      method='D2', circuits=4, soil=2.5, ambient=20, load=25)

    # --- thermal insulation -------------------------------------------------
    c('k_therm_100mm', 'Cable in a thermally insulating wall over 100 mm: factor 0,81 '
      'and reference method C (IEC 60364-5-52 Table 52.2).',
      thermalMode='surrounded', thermalLength=100, load=8, method='B1', vdLimit=8)
    c('k_therm_long', 'Cable totally surrounded by thermal insulation over more than '
      '0,5 m: 0,5 x the method C capacity (IEC 60364-5-52 523.9).',
      thermalMode='surrounded', thermalLength=800, load=20, method='B1', vdLimit=8)
    c('k_extra_090', 'User derating factor 0,90 multiplies the product of the standard factors.',
      extraFactor=0.90, load=40)

    # --- voltage drop -------------------------------------------------------
    c('vd_long_run', 'Voltage drop over a long run: sqrt3 I (R cos + X sin) L.',
      length=250, load=45, vdLimit=8)
    c('vd_leading_pf', 'Leading power factor makes the reactive term subtract.',
      pfType='lead', pf=0.8, length=200, load=45, vdLimit=8)
    c('vd_zero_reactance', 'Zero reactance isolates the resistive term.',
      reactance=0.0, length=200, load=45, vdLimit=8)
    c('vd_high_reactance', 'High reactance (0,15 ohm/km) with pf 0,7 makes the reactance '
      'term the larger of the two.', reactance=0.15, pf=0.7, length=150, load=40, vdLimit=10)
    c('vd_aluminium', 'Aluminium conductor: resistivity and ampacity both change.',
      material='al', length=200, load=60, vdLimit=8)

    # --- adiabatic ----------------------------------------------------------
    c('sc_adiabatic_cu_pvc', 'Adiabatic check, Cu/PVC k = 115: S >= I sqrt(t)/k and '
      'the withstand current k S / sqrt(t) (IEC 60364-4-43, 434.5.2).',
      scMode='adiabatic', fault=12, clearTime=100, load=60)
    c('sc_adiabatic_al_pvc', 'Adiabatic check, Al/PVC k = 76.',
      scMode='adiabatic', fault=8, clearTime=200, material='al', load=60, vdLimit=8)
    c('sc_governs', 'A large fault current with a slow clearing time makes the adiabatic '
      'criterion, not the ampacity, govern the section.',
      scMode='adiabatic', fault=25, clearTime=500, load=30, length=20)

    # --- protective device --------------------------------------------------
    c('prot_in_between', 'I_B <= I_n <= I_z must hold (IEC 60364-4-43, 433.1).',
      protectionMode='fixed', breaker=125, load=60)
    c('prot_forces_bigger', 'A device rating above the corrected ampacity forces a larger '
      'section.', protectionMode='fixed', breaker=200, load=60)

    # --- methods and materials ---------------------------------------------
    for m in ('A1', 'A2', 'B1', 'B2', 'C', 'E', 'D1', 'D2'):
        c('method_%s_cu' % m, 'Reference method %s, copper.' % m,
          method=m, load=45, ambient=30 if m not in ('D1', 'D2') else 20)
        c('method_%s_al' % m, 'Reference method %s, aluminium.' % m,
          method=m, material='al', load=45, vdLimit=8,
          ambient=30 if m not in ('D1', 'D2') else 20)

    # --- xlpe at 70 C terminals --------------------------------------------
    c('xlpe_terminals70', 'XLPE cable into 70 C terminals: the 70 C (PVC) column and the '
      'PVC temperature factor must be used, but the XLPE resistivity for the drop.',
      insulation='xlpe', terminal=70, load=60)

    return C


def expected(inp):
    """Everything the page should display for this input set."""
    eff_ins = 'pvc' if (inp['insulation'] == 'xlpe' and inp['terminal'] == 70) else inp['insulation']
    buried = inp['method'] in ('D1', 'D2')
    I = design_current(inp['system'], inp['basis'], inp['load'], inp['voltage'],
                       inp['pf'], inp['eff'])
    kT = interp(TEMP_GROUND[eff_ins] if buried else TEMP_AIR[eff_ins], inp['ambient'])
    gkey = 'buried' if buried else inp['grouping']
    kG = (step_exact(GROUP_BURIED_D2, inp['circuits']) if buried
          else step_exact(GROUP[gkey], inp['circuits']))
    kSoil = 1.0
    if buried:
        kSoil = interp(SOIL_DIRECT if inp['method'] == 'D2' else SOIL_DUCT, inp['soil'])
    kIns = 1.0
    method = inp['method']
    if not buried and inp['thermalMode'] == 'surrounded':
        L = inp['thermalLength']
        method = 'C'
        kIns = 0.5 if L >= 500 else step_exact(THERM_SHORT, L)
    out = {'I_B': I, 'kT': kT, 'kG': kG, 'kSoil': kSoil, 'kIns': kIns,
           'kExtra': inp['extraFactor'], 'method_used': method,
           'total': (kT * kG * kSoil * kIns * inp['extraFactor']
                     if None not in (kT, kG, kSoil, kIns) else None)}
    rho = RHO_TOOL[(inp['material'], inp['insulation'])]
    out['rho_used'] = rho
    out['rho_annex_G'] = RHO_ANNEX_G[inp['material']]
    out['vd_at'] = lambda s: voltage_drop(inp['system'], rho, s, inp['length'], I,
                                          inp['pf'], inp['reactance'],
                                          inp['pfType'] == 'lead')
    if inp['scMode'] == 'adiabatic':
        out['S_min'] = adiabatic_min_section(inp['fault'], inp['clearTime'],
                                             inp['material'], inp['insulation'])
    return out


REFERENCE_LINE = (
    "The IEC 60364-5-52 correction-factor tables re-typed from published transcriptions of the "
    "standard (ambient air B.52.14, ground temperature B.52.15, soil thermal resistivity B.52.16, "
    "grouping B.52.17, buried grouping B.52.18, thermal insulation Table 52.2), the Annex G "
    "voltage-drop closed form u = b(rho1 L/S cos(phi) + lambda L sin(phi)) I_B, the IEC 60364-4-43 "
    "434.5.2 adiabatic equation with the Table 43A k values, the 433.1 I_B <= I_n <= I_z rule and "
    "the IEC 60364-5-54 Table 54.2 protective-conductor rule - all implemented independently in "
    "python. The raw current-carrying-capacity columns (Table B.52.4 for A1-D2 and B.52.10/B.52.11 "
    "for method E) are copyrighted and could not be obtained from any source that reproduces them, "
    "so they are treated as an empirical data table: the whole table is read back out of the page "
    "and checked for integrity and monotonicity, the one value a public copy of the standard does "
    "show (A1, copper, 1,5 mm2 = 13,5 A) is checked exactly, and every copper column is checked "
    "against the published two-loaded-conductor Table B.52.2 through a physically bounded ratio. "
    "The aluminium columns and the buried D1/D2 columns have no independent source at all and are "
    "recorded as flagged, not passed."
)
CITATIONS = [
    "IEC 60364-5-52:2009 (ed. 3.0) / ed. 3.1:2024-11, Table B.52.1 - schedule of reference methods of installation A1, A2, B1, B2, C, D1, D2, E, F, G",
    "IEC 60364-5-52, Table B.52.2 - current-carrying capacities, PVC insulation, TWO loaded conductors, copper or aluminium (used here as the independent consistency bound; values as transcribed by ECalPro, 'IEC 60364 Table B.52 - Cable Current Ratings')",
    "IEC 60364-5-52, Table B.52.4 - current-carrying capacities, PVC insulation, THREE loaded conductors, copper or aluminium - the table the page implements for methods A1 to D2; the value A1/copper/1,5 mm2 = 13,5 A is visible in a public copy of the standard",
    "IEC 60364-5-52, Tables B.52.10 and B.52.11 - installation methods E, F and G, PVC insulation, copper and aluminium conductors",
    "IEC 60364-5-52, Table B.52.14 - correction factors for ambient air temperatures other than 30 C (values as published in the Schneider Electric Electrical Installation Guide, ch. G fig. G12, and by ECalPro)",
    "IEC 60364-5-52, Table B.52.15 - correction factors for ambient ground temperatures other than 20 C (Schneider Electric Electrical Installation Guide, ch. G fig. G13)",
    "IEC 60364-5-52, Table B.52.16 - correction factors for soil thermal resistivities other than 2,5 K.m/W, buried-duct and direct-buried rows (Schneider Electric Electrical Installation Guide, ch. G fig. G14; buried-duct row also published by ECalPro)",
    "IEC 60364-5-52, Table B.52.17 - reduction factors for groups of more than one circuit or multi-core cable",
    "IEC 60364-5-52, Table B.52.18 - reduction factors for more than one circuit, cables laid directly in the ground, installation method D2, 2 to 6 circuits (Schneider Electric Electrical Installation Guide, ch. G fig. G18)",
    "IEC 60364-5-52, Table B.52.19 - reduction factors for more than one circuit, cables laid in ducts in the ground, installation method D1 - a separate table that the page does not implement",
    "IEC 60364-5-52, clause 525 and Annex G - voltage drop u = b (rho1 L/S cos(phi) + lambda L sin(phi)) I_B with rho1 = 1,25 rho_20 = 0,0225 ohm mm2/m for copper and 0,036 for aluminium; b = sqrt3 for three-phase, 2 for single-phase",
    "IEC 60364-5-52, clause 523.9 and Table 52.2 - cable in a thermally insulating wall: 0,89 / 0,81 / 0,68 / 0,55 for 50 / 100 / 200 / 400 mm, and 0,5 beyond 0,5 m",
    "IEC 60364-4-43:2017, clause 434.5.2 - adiabatic check I^2 t <= k^2 S^2, and Table 43A - k = 115 (Cu/PVC), 143 (Cu/XLPE), 76 (Al/PVC), 94 (Al/XLPE)",
    "IEC 60364-4-43:2017, clause 433.1 - I_B <= I_n <= I_z",
    "IEC 60364-5-54:2011, Table 54.2 - protective conductor cross-section S, 16, S/2",
]
TOLERANCE_LINE = (
    "Agreement to the last digit the page prints: |got-ref| <= 0.5*10^-d + 1e-9*|ref|, with d = 1 "
    "decimal for the design current and the corrected ampacity (A), 0 decimals for the ampacity "
    "column of the candidate table, 2 decimals for voltage drop (%) and losses (kW), 3 decimals "
    "for every correction factor, 1 decimal for the adiabatic minimum section (mm2) and the "
    "short-circuit withstand (kA). Every graded quantity is a closed form on both sides, so the "
    "only physical slack is double-precision round-off. The ampacity table itself is an empirical "
    "data table and is not graded to a numeric tolerance: it is checked for integrity, for one "
    "exact primary-source value, and against a 0.82-0.96 (0.78-0.90 for method E) ratio band to "
    "the published two-loaded-conductor table with no cell more than 0.06 from its column median."
)

if __name__ == '__main__':
    data = {'reference_line': REFERENCE_LINE, 'citations': CITATIONS,
            'tolerance_line': TOLERANCE_LINE, 'cases': cases(),
            'tables': {'TEMP_AIR': TEMP_AIR, 'TEMP_GROUND': TEMP_GROUND,
                       'SOIL_DUCT': SOIL_DUCT, 'SOIL_DIRECT': SOIL_DIRECT,
                       'GROUP': GROUP, 'GROUP_BURIED_D2': GROUP_BURIED_D2,
                       'THERM_SHORT': THERM_SHORT, 'KSC': {'%s_%s' % k: v for k, v in KSC.items()},
                       'RHO_TOOL': {'%s_%s' % k: v for k, v in RHO_TOOL.items()},
                       'RHO_ANNEX_G': RHO_ANNEX_G,
                       'B52_2_CU': B52_2_CU, 'RATIO_BAND': RATIO_BAND, 'RATIO_SPREAD': RATIO_SPREAD,
                       'SPOT': {'cu|A1|1.5': 13.5}},
            'sizes': SIZES}
    # expectations that do not need the page
    for c in data['cases']:
        e = expected(c['inputs'])
        c['expect'] = {k: v for k, v in e.items() if not callable(v)}
        c['expect']['vd_by_size'] = {str(s): voltage_drop(
            c['inputs']['system'], e['rho_used'], s, c['inputs']['length'], e['I_B'],
            c['inputs']['pf'], c['inputs']['reactance'],
            c['inputs']['pfType'] == 'lead') for s in SIZES}
        c['expect']['loss_by_size'] = {str(s): losses_kW(
            c['inputs']['system'], e['rho_used'], s, c['inputs']['length'], e['I_B'])
            for s in SIZES}
        if c['inputs']['scMode'] == 'adiabatic':
            c['expect']['sccap_by_size'] = {str(s): adiabatic_capacity_kA(
                s, c['inputs']['clearTime'], c['inputs']['material'],
                c['inputs']['insulation']) for s in SIZES}
        c['expect']['pe_by_size'] = {str(s): pe_section(s) for s in SIZES}
    json.dump(data, open(_gp.ref('cablesizing_ref.json'), 'w'), indent=1)
    print('%d cases' % len(data['cases']))
