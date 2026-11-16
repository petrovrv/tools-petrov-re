/* mep-core.js — global MEPCore: shared core of the tools.petrov.re MEP Maintenance package
   (mepcriticality, mepstrategy, mepmonitoring, mepplanner, mepspares, meplifecycle).
   Sections: 1 CLASSES (equipment class library with failure modes), 2 TECHNIQUES (condition monitoring),
   3 STATUTORY (legal tasks retained regardless of economics, EU baseline), 4 TRADES, 5 register document
   (validate / import / export / CSV / presets), 6 ui.registerBar widget. Pure data + functions, no dependencies,
   UMD (browser global MEPCore, node module.exports). Every number carries provenance through `sources`
   (MEPCore.SOURCES); ranges without a public source are tagged kind `learning_assumption`.
   Planning aid only — not a substitute for manufacturer instructions and national regulations. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MEPCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.3.1';
var SCHEMA = 'tools.petrov.re/mep-maintenance/v1';
var STORAGE_KEY = 'mep.register.v1';
var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];

/* 7-language string in the fixed order en uk de nl fr es pl */
function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

function t(dict, lang) {
  if (dict == null) return '';
  if (typeof dict === 'string') return dict;
  if (lang && dict[lang] != null) return dict[lang];
  return dict.en != null ? dict.en : '';
}

/* fmt (D-MEP-11): Intl.NumberFormat(lang), default grouping — the same separators as the framework tables (DiagramUI.num):
   en 1,402.5; de/nl 1.402,5; es 1402,5 / 13.512 (es and pl group from 5 digits, CLDR minimumGroupingDigits 2); uk/fr/pl narrow / no-break space + decimal comma.
   Fixed digits (default by magnitude), U+2212 minus, no negative zero. null / non-finite -> '—'.
   Without Intl locale data: literal fallback with the same separators. */
var FMT_FALLBACK = { en: [',', '.', 4], uk: ['\u00A0', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: ['\u202F', ',', 4], es: ['.', ',', 5], pl: ['\u00A0', ',', 5] };
var FMT_CACHE = {};
function fmt(n, lang, digits) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
  var a = Math.abs(n);
  if (digits == null) digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : 3;
  digits = Math.max(0, Math.min(10, digits | 0));
  var l = LANGS.indexOf(lang) >= 0 ? lang : 'en';
  var s = a.toFixed(digits);
  var neg = n < 0 && Number(s) !== 0;
  var out = null, key = l + '|' + digits;
  try {
    var nf = FMT_CACHE[key];
    if (nf === undefined) {
      nf = (typeof Intl !== 'undefined' && Intl.NumberFormat) ? new Intl.NumberFormat(l, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : false;
      /* an engine without this locale's data falls back to its default locale: use the literals instead */
      if (nf && String(nf.resolvedOptions().locale).split('-')[0] !== l) nf = false;
      FMT_CACHE[key] = nf;
    }
    if (nf) out = nf.format(Number(s));
  } catch (e) { out = null; }
  if (out == null) {
    var f = FMT_FALLBACK[l], parts = s.split('.'), ip = parts[0];
    if (ip.length >= f[2]) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, f[0]);
    out = ip + (parts[1] ? f[1] + parts[1] : '');
  }
  return (neg ? '−' : '') + out;
}

/* =====================================================================================
   SOURCES — provenance of every number. kind: standard | regulation | public_guide |
   manufacturer | learning_assumption.  Public sources only.
   ===================================================================================== */
var SOURCES = {
  reg_1005_2009: { title: 'Regulation (EC) No 1005/2009 on substances that deplete the ozone layer, Art. 11(3): reclaimed / recycled HCFCs (e.g. R22) for servicing existing refrigeration, air-conditioning and heat-pump equipment only until 31.12.2014 (repealed and replaced by Regulation (EU) 2024/590)', edition: 'OJ L 286, 31.10.2009', url: 'https://eur-lex.europa.eu/eli/reg/2009/1005/oj', kind: 'regulation' },
  la_core: { title: 'Learning assumption of this tool package (engineering judgement; replace with site data)', edition: 'mep-core ' + VERSION + ', 2026-11', url: '', kind: 'learning_assumption' },
  nasa_rcm_2008: { title: 'NASA Reliability Centered Maintenance Guide for Facilities and Collateral Equipment', edition: 'September 2008', url: 'https://www.nasa.gov/wp-content/uploads/2023/06/nasa-rcmguide.pdf', kind: 'public_guide' },
  nasa_rcbea_2004: { title: 'NASA Reliability-Centered Building and Equipment Acceptance Guide', edition: 'July 2004', url: 'https://www.nasa.gov/wp-content/uploads/2023/06/rcbandeguidejul04.pdf', kind: 'public_guide' },
  doe_om_r3: { title: 'US DOE FEMP Operations & Maintenance Best Practices — A Guide to Achieving Operational Efficiency, Release 3.0 (PNNL-19634)', edition: 'August 2010', url: 'https://www.pnnl.gov/main/publications/external/technical_reports/PNNL-19634.pdf', kind: 'public_guide' },
  sae_ja1011: { title: 'SAE JA1011 Evaluation Criteria for Reliability-Centered Maintenance (RCM) Processes', edition: 'JA1011_202411 (revised November 2024)', url: 'https://saemobilus.sae.org/standards/ja1011_202411-evaluation-criteria-reliability-centered-maintenance-rcm-processes', kind: 'standard' },
  sae_ja1012: { title: 'SAE JA1012 A Guide to the Reliability-Centered Maintenance (RCM) Standard', edition: 'JA1012_201108 (revised August 2011)', url: 'https://saemobilus.sae.org/standards/ja1012_201108-a-guide-reliability-centered-maintenance-rcm-standard', kind: 'standard' },
  en15459_1: { title: 'EN 15459-1 Energy performance of buildings \u2014 Economic evaluation procedure for energy systems in buildings, Annex D (informative) Data for components: life span per component (min\u2013max, years); class typical lives are set within the Annex D span where a matching component is listed (pumps, fans, fan coil units, heat pumps, condensing boilers, air-conditioning units)', edition: '2017 (text read)', url: 'https://www.evs.ee/en/evs-en-15459-1-2017', kind: 'standard' },
  ashrae_life: { title: 'ASHRAE Service Life and Maintenance Cost Database (median equipment service life)', edition: 'online database, accessed 2026-11', url: 'https://costdatabase.ashrae.org/default.asp', kind: 'public_guide' },
  iso17359: { title: 'ISO 17359 Condition monitoring and diagnostics of machines — General guidelines', edition: '2018', url: 'https://www.iso.org/standard/71194.html', kind: 'standard' },
  iso20816_1: { title: 'ISO 20816-1 Mechanical vibration — Measurement and evaluation of machine vibration — Part 1: General guidelines', edition: '2026 (replaces 2016)', url: 'https://www.iso.org/standard/89921.html', kind: 'standard' },
  ieee1188: { title: 'IEEE 1188 Recommended Practice for Maintenance, Testing, and Replacement of Valve-Regulated Lead-Acid (VRLA) Batteries for Stationary Applications', edition: '2025 (supersedes 2005; the 2005 edition recommends quarterly ohmic measurements)', url: 'https://standards.ieee.org/ieee/1188/11656/', kind: 'standard' },
  nfpa70b: { title: 'NFPA 70B Standard for Electrical Equipment Maintenance', edition: '2026 (standard since 2023)', url: 'https://www.nfpa.org/codes-and-standards/nfpa-70b-standard-development/70b', kind: 'standard' },
  fgas_2024_573: { title: 'Regulation (EU) 2024/573 on fluorinated greenhouse gases, Art. 5 (leak checks) and Art. 6 (leakage detection systems)', edition: 'OJ L, 20.2.2024', url: 'https://eur-lex.europa.eu/eli/reg/2024/573/oj', kind: 'regulation' },
  epbd_2024_1275: { title: 'Directive (EU) 2024/1275 on the energy performance of buildings (recast), Art. 23 (inspections of heating, ventilation, air-conditioning) and Art. 24 (inspection reports); Art. 23(3) frequency, Art. 23(7) BACS exemption, transposition by 29.5.2026 (Art. 35)', edition: 'OJ L, 8.5.2024', url: 'https://eur-lex.europa.eu/eli/dir/2024/1275/oj', kind: 'regulation' },
  en12845: { title: 'EN 12845 Fixed firefighting systems \u2014 Automatic sprinkler systems \u2014 Design, installation and maintenance (clause 20: 20.2.2 weekly routine at intervals of no more than 7 days; 20.3.4.2.1 yearly automatic pump flow test at full load, no more than 12 months; clause numbers verified in the EN 12845:2015+A1:2019 text, the A2:2026 amendment was not read)', edition: '2015+A1:2019 (text read); 2015+A2:2026 current', url: 'https://www.sis.se/en/produkter/environment-health-protection-safety/protection-against-fire/firefighting/ss-en-128452015a22026/', kind: 'standard' },
  en50172: { title: 'EN 50172 Emergency escape lighting systems (routine tests: 7.2.3 monthly short function test, 7.2.4 annual full rated duration test in the EN 50172:2004 text; the 2024 edition that supersedes it was not read)', edition: '2004 (text read); 2024 current', url: 'https://knowledge.bsigroup.com/products/emergency-escape-lighting-systems-1', kind: 'standard' },
  hse_l8: { title: 'HSE L8 Legionnaires’ disease — The control of legionella bacteria in water systems, Approved Code of Practice and guidance', edition: '4th edition, 2013', url: 'https://www.hse.gov.uk/pubns/books/l8.htm', kind: 'public_guide' },
  hse_hsg274_2: { title: 'HSE HSG274 Part 2 Legionnaires\u2019 disease \u2014 The control of legionella bacteria in hot and cold water systems (Table 2.1 checks and frequencies)', edition: '2nd edition, 2024', url: 'https://www.hse.gov.uk/pubns/books/hsg274.htm', kind: 'public_guide' },
  nfpa110: { title: 'NFPA 110 Standard for Emergency and Standby Power Systems, chapter 8 (8.4.2 monthly exercise, 8.4.2.3 annual load bank, 8.4.6 transfer switches) \u2014 US reference', edition: '2025', url: 'https://www.nfpa.org/codes-and-standards/nfpa-110-standard-development/110', kind: 'standard' },
  bs5839_1: { title: 'BS 5839-1 Fire detection and fire alarm systems for buildings — Code of practice (servicing and user tests; national example, EN 54 covers products only)', edition: '2025', url: 'https://knowledge.bsigroup.com/products/fire-detection-and-fire-alarm-systems-for-buildings-design-installation-commissioning-and-maintenance-of-systems-in-non-domestic-premises-code-of-practice', kind: 'standard' },
  cibse_m: { title: 'CIBSE Guide M Maintenance engineering and management (M1\u2013M16), with M11 indicative economic life expectancy tables', edition: '2023 (life tables 2026)', url: 'https://www.cibse.org/guidem', kind: 'public_guide' },
  sfg20: { title: 'SFG20 standard maintenance specification for building services (task schedules, statutory = red criticality)', edition: 'online, continuously updated', url: 'https://www.sfg20.co.uk/what-is-sfg20', kind: 'public_guide' },
  en13306: { title: 'EN 13306 Maintenance \u2014 Maintenance terminology', edition: '2017', url: 'https://www.evs.ee/en/evs-en-13306-2017', kind: 'standard' },
  iso18434_1: { title: 'ISO 18434-1 Condition monitoring and diagnostics of machines \u2014 Thermography \u2014 Part 1: General procedures', edition: '2008 (confirmed 2023)', url: 'https://www.iso.org/standard/41648.html', kind: 'standard' },
  ieee450: { title: 'IEEE 450 Recommended Practice for Maintenance, Testing, and Replacement of Vented Lead-Acid Batteries for Stationary Applications', edition: '2020', url: 'https://standards.ieee.org/ieee/450/6772/', kind: 'standard' },
  nfpa25: { title: 'NFPA 25 Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems \u2014 US reference', edition: '2026', url: 'https://www.nfpa.org/codes-and-standards/nfpa-25-standard-development/25', kind: 'standard' },
  hse_hsg274_1: { title: 'HSE HSG274 Part 1 Legionnaires\u2019 disease \u2014 The control of legionella bacteria in evaporative cooling systems', edition: '2nd edition, 2024', url: 'https://www.hse.gov.uk/pubns/priced/hsg274part1.pdf', kind: 'public_guide' },
  en13015: { title: 'EN 13015 Maintenance for lifts and escalators \u2014 Rules for maintenance instructions', edition: '2001+A1:2008', url: 'https://www.evs.ee/en/search?query=EN%2013015', kind: 'standard' },
  uk_loler: { title: 'Lifting Operations and Lifting Equipment Regulations 1998 (SI 1998/2307), reg. 9 thorough examination \u2014 UK national example', edition: '1998', url: 'https://www.legislation.gov.uk/uksi/1998/2307/regulation/9', kind: 'regulation' },
  en378_4: { title: 'EN 378-4 Refrigerating systems and heat pumps \u2014 Safety and environmental requirements \u2014 Part 4: Operation, maintenance, repair and recovery', edition: '2016+A1:2019', url: 'https://www.evs.ee/en/search?query=EN%20378-4', kind: 'standard' }
};

/* =====================================================================================
   TRADES — rate_eur_h_default is a learning assumption (EU-average contractor rates, 2026); user rate wins.
   ===================================================================================== */
var TRADES = {
  hvac_mech: { id: 'hvac_mech', name: L('HVAC mechanic', 'Механік ОВіК', 'HLK-Monteur', 'Installatiemonteur W/K', 'Technicien CVC', 'Técnico de climatización', 'Mechanik HVAC'), rate_eur_h_default: 75, sources: ['la_core'] },
  electrician: { id: 'electrician', name: L('Electrician', 'Електрик', 'Elektriker', 'Elektromonteur', 'Électricien', 'Electricista', 'Elektryk'), rate_eur_h_default: 70, sources: ['la_core'] },
  plumber: { id: 'plumber', name: L('Plumber', 'Сантехнік', 'Sanitärinstallateur', 'Loodgieter', 'Plombier', 'Fontanero', 'Hydraulik'), rate_eur_h_default: 65, sources: ['la_core'] },
  fire: { id: 'fire', name: L('Fire systems technician', 'Технік систем протипожежного захисту', 'Brandschutztechniker', 'Brandbeveiligingsmonteur', 'Technicien sécurité incendie', 'Técnico de protección contra incendios', 'Technik systemów ppoż.'), rate_eur_h_default: 80, sources: ['la_core'] },
  controls: { id: 'controls', name: L('Controls / BMS technician', 'Технік автоматики / BMS', 'MSR-/GLT-Techniker', 'Regeltechnicus / GBS', 'Technicien régulation / GTB', 'Técnico de control / BMS', 'Technik automatyki / BMS'), rate_eur_h_default: 85, sources: ['la_core'] },
  specialist_vendor: { id: 'specialist_vendor', name: L('Specialist vendor (OEM service)', 'Спеціалізований підрядник (сервіс виробника)', 'Fachfirma (Herstellerservice)', 'Specialist (fabrieksservice)', 'Prestataire spécialisé (service constructeur)', 'Proveedor especializado (servicio del fabricante)', 'Serwis specjalistyczny (producenta)'), rate_eur_h_default: 120, sources: ['la_core'] }
};

/* =====================================================================================
   TECHNIQUES — pf_fraction = share of the P–F interval usable with this technique (detection point
   relative to the earliest detectable potential failure); costs per reading in EUR. Learning assumptions
   framed by ISO 17359 / NASA RCM Guide 2008 (chapter on predictive testing technologies).
   ===================================================================================== */
function tech(id, name, detects, pf_fraction, cost, skill, sources) {
  var x = TECH_EXTRA[id] || {};
  return { id: id, name: name, detects: detects, pf_fraction: pf_fraction, cost_per_reading_eur: cost, skill: skill, sources: sources,
    pod: x.pod, online_fixed_eur_y: x.online || null };
}
/* pod = probability that one reading taken inside the P–F window flags the defect; online_fixed_eur_y = yearly cost
   per asset of a permanently installed / BMS-based alternative (null = route-based only). Learning assumptions. */
var TECH_EXTRA = {
  vibration: { pod: 0.9, online: [800, 1500, 3000] }, ir_thermography: { pod: 0.8 }, oil_analysis: { pod: 0.85 },
  ultrasound_airborne: { pod: 0.8 }, motor_current: { pod: 0.7, online: [500, 1000, 2000] }, dp_trend: { pod: 0.95, online: [0, 50, 200] },
  bms_trend: { pod: 0.8, online: [0, 100, 500] }, battery_impedance: { pod: 0.85, online: [500, 1200, 2500] }, water_sampling: { pod: 0.6 },
  insulation_resistance: { pod: 0.7 }, visual_inspection: { pod: 0.5 }, performance_test: { pod: 0.8 }
};
var TECHNIQUES = {
  vibration: tech('vibration', L('Vibration analysis', 'Вібродіагностика', 'Schwingungsanalyse', 'Trillingsanalyse', 'Analyse vibratoire', 'Análisis de vibraciones', 'Analiza drgań'),
    ['bearing_wear', 'imbalance', 'misalignment', 'looseness', 'resonance'], 0.8, [15, 40, 80], 'specialist_vendor', ['iso17359', 'iso20816_1', 'nasa_rcm_2008', 'la_core']),
  ir_thermography: tech('ir_thermography', L('Infrared thermography', 'Інфрачервона термографія', 'Infrarot-Thermografie', 'Infraroodthermografie', 'Thermographie infrarouge', 'Termografía infrarroja', 'Termowizja'),
    ['hot_connection', 'overload', 'bearing_heat', 'insulation_loss', 'blocked_coil'], 0.6, [10, 30, 60], 'electrician', ['iso17359', 'nasa_rcm_2008', 'la_core']),
  oil_analysis: tech('oil_analysis', L('Oil / fuel analysis', 'Аналіз масла / палива', 'Öl-/Kraftstoffanalyse', 'Olie-/brandstofanalyse', 'Analyse d’huile / de combustible', 'Análisis de aceite / combustible', 'Analiza oleju / paliwa'),
    ['wear_metals', 'contamination', 'lubricant_degradation', 'acid', 'water_in_fuel'], 0.9, [30, 60, 120], 'specialist_vendor', ['iso17359', 'nasa_rcm_2008', 'la_core']),
  ultrasound_airborne: tech('ultrasound_airborne', L('Airborne ultrasound', 'Ультразвуковий контроль', 'Luftultraschall', 'Ultrasoon (lucht)', 'Ultrasons aériens', 'Ultrasonido aéreo', 'Ultradźwięki'),
    ['bearing_wear', 'leak', 'partial_discharge', 'valve_passing', 'steam_trap'], 0.85, [10, 25, 50], 'hvac_mech', ['iso17359', 'nasa_rcm_2008', 'la_core']),
  motor_current: tech('motor_current', L('Motor current signature analysis', 'Аналіз струму двигуна', 'Motorstromanalyse', 'Motorstroomanalyse', 'Analyse du courant moteur', 'Análisis de corriente del motor', 'Analiza prądu silnika'),
    ['rotor_bar', 'winding', 'load_change', 'belt_slip', 'eccentricity'], 0.6, [20, 50, 100], 'electrician', ['nasa_rcm_2008', 'la_core']),
  dp_trend: tech('dp_trend', L('Differential pressure trend', 'Тренд перепаду тиску', 'Differenzdruck-Trend', 'Drukverschiltrend', 'Suivi de pression différentielle', 'Tendencia de presión diferencial', 'Trend różnicy ciśnień'),
    ['filter_loading', 'strainer_blockage', 'coil_fouling'], 0.7, [0, 1, 5], 'controls', ['doe_om_r3', 'la_core']),
  bms_trend: tech('bms_trend', L('BMS trend / alarm analytics', 'Аналіз трендів і тривог BMS', 'GLT-Trend-/Alarmanalyse', 'GBS-trend-/alarmanalyse', 'Analyse des tendances et alarmes GTB', 'Análisis de tendencias y alarmas BMS', 'Analiza trendów i alarm BMS'),
    ['performance_loss', 'drift', 'short_cycling', 'temperature_deviation', 'runtime'], 0.5, [0, 2, 10], 'controls', ['doe_om_r3', 'la_core']),
  battery_impedance: tech('battery_impedance', L('Battery impedance / conductance test', 'Вимірювання імпедансу акумуляторів', 'Batterie-Impedanzmessung', 'Accu-impedantiemeting', 'Mesure d’impédance des batteries', 'Medición de impedancia de baterías', 'Pomiar impedancji akumulatorów'),
    ['battery_capacity', 'cell_dryout', 'connection_resistance'], 0.7, [50, 150, 300], 'electrician', ['ieee1188', 'la_core']),
  water_sampling: tech('water_sampling', L('Water sampling and analysis', 'Відбір і аналіз проб води', 'Wasserprobenahme und -analyse', 'Watermonsters en analyse', 'Prélèvement et analyse d’eau', 'Muestreo y análisis de agua', 'Pobieranie i analiza próbek wody'),
    ['legionella', 'corrosion', 'scaling', 'biofilm', 'inhibitor_loss'], 0.5, [40, 80, 150], 'plumber', ['hse_hsg274_2', 'la_core']),
  insulation_resistance: tech('insulation_resistance', L('Insulation resistance test', 'Вимірювання опору ізоляції', 'Isolationswiderstandsmessung', 'Isolatieweerstandsmeting', 'Mesure de résistance d’isolement', 'Medición de resistencia de aislamiento', 'Pomiar rezystancji izolacji'),
    ['insulation_loss', 'moisture', 'winding'], 0.6, [20, 50, 100], 'electrician', ['nfpa70b', 'nasa_rcm_2008', 'la_core']),
  visual_inspection: tech('visual_inspection', L('Visual / sensory inspection', 'Візуальний огляд', 'Sichtprüfung', 'Visuele inspectie', 'Inspection visuelle', 'Inspección visual', 'Oględziny'),
    ['leak', 'corrosion', 'belt_wear', 'noise', 'indicator'], 0.3, [5, 15, 30], 'hvac_mech', ['nasa_rcm_2008', 'la_core']),
  performance_test: tech('performance_test', L('Performance test (flow, capacity, combustion)', 'Випробування продуктивності', 'Leistungsprüfung (Volumenstrom, Leistung, Verbrennung)', 'Prestatietest (debiet, vermogen, verbranding)', 'Essai de performance (débit, puissance, combustion)', 'Prueba de rendimiento (caudal, capacidad, combustión)', 'Test wydajności (przepływ, moc, spalanie)'),
    ['performance_loss', 'impeller_wear', 'combustion_drift', 'fouling', 'refrigerant_undercharge'], 0.5, [100, 300, 800], 'hvac_mech', ['doe_om_r3', 'la_core'])
};

/* =====================================================================================
   STATUTORY — retained regardless of economics (D-MEP-5). EU baseline; national rules may be stricter.
   applies(asset) -> bool. Where the deciding field is unknown (null) the requirement is retained
   (conservative) and statutoryFor() marks it conditional.
   ===================================================================================== */
var JURIS_NOTE = L('EU baseline; national rules may be stricter.', 'Базовий рівень ЄС; національні норми можуть бути суворішими.', 'EU-Mindeststandard; nationale Vorschriften können strenger sein.', 'EU-basisniveau; nationale regels kunnen strenger zijn.', 'Socle UE ; les règles nationales peuvent être plus strictes.', 'Mínimo de la UE; las normas nacionales pueden ser más estrictas.', 'Minimum UE; przepisy krajowe mogą być surowsze.');
var REFRIGERANT_CLASSES = ['chiller_air', 'chiller_water', 'heat_pump', 'vrf'];
var HEATING_CLASSES = ['boiler_gas', 'heat_pump'];
var AC_CLASSES = ['chiller_air', 'chiller_water', 'vrf', 'ahu'];
function charge(a) { return a && typeof a.refrigerant_charge_t_co2e === 'number' ? a.refrigerant_charge_t_co2e : null; }
function inClass(a, list) { return !!a && list.indexOf(a['class']) >= 0; }
function fgasBand(lo, hi) {
  return function (a) {
    if (!inClass(a, REFRIGERANT_CLASSES)) return false;
    var c = charge(a);
    if (c == null) return lo === 5; /* unknown charge: keep the base (12-month) check, flagged conditional */
    if (a.hermetic === true && c < 10 && lo === 5) return false;
    return c >= lo && (hi == null || c < hi);
  };
}
function stat(o) { o.jurisdiction = JURIS_NOTE; return o; }
var STATUTORY = {
  fgas_leak_5: stat({ id: 'fgas_leak_5', name: L('F-gas leak check (5–50 t CO₂e)', 'Перевірка на витоки F-газів (5–50 т CO₂-екв.)', 'F-Gas-Dichtheitskontrolle (5–50 t CO₂e)', 'F-gassen lekcontrole (5–50 t CO₂-eq)', 'Contrôle d’étanchéité F-gaz (5–50 t éq. CO₂)', 'Control de fugas de gases F (5–50 t CO₂ eq)', 'Kontrola szczelności F-gazów (5–50 t CO₂e)'),
    interval_months: 12, interval_months_leak_detection: 24, interval_days: 365, trade: 'hvac_mech', hours: 2, applies: fgasBand(5, 50),
    basis: L('Reg. (EU) 2024/573 Art. 5: equipment with ≥ 5 t CO₂e checked at least every 12 months (24 months with a leakage detection system).', 'Регламент (ЄС) 2024/573, ст. 5: обладнання з ≥ 5 т CO₂-екв. перевіряється щонайменше кожні 12 місяців (24 місяці за наявності системи виявлення витоків).', 'VO (EU) 2024/573 Art. 5: Einrichtungen mit ≥ 5 t CO₂e mindestens alle 12 Monate (24 Monate mit Leckage-Erkennungssystem).', 'Verordening (EU) 2024/573 art. 5: installaties met ≥ 5 t CO₂-eq ten minste elke 12 maanden (24 maanden met lekdetectiesysteem).', 'Règl. (UE) 2024/573 art. 5 : équipements ≥ 5 t éq. CO₂ contrôlés au moins tous les 12 mois (24 mois avec système de détection des fuites).', 'Reglamento (UE) 2024/573 art. 5: equipos con ≥ 5 t CO₂ eq al menos cada 12 meses (24 meses con sistema de detección de fugas).', 'Rozp. (UE) 2024/573 art. 5: urządzenia ≥ 5 t CO₂e co najmniej co 12 miesięcy (24 miesiące z systemem wykrywania wycieków).'),
    source: 'fgas_2024_573' }),
  fgas_leak_50: stat({ id: 'fgas_leak_50', name: L('F-gas leak check (50–500 t CO₂e)', 'Перевірка на витоки F-газів (50–500 т CO₂-екв.)', 'F-Gas-Dichtheitskontrolle (50–500 t CO₂e)', 'F-gassen lekcontrole (50–500 t CO₂-eq)', 'Contrôle d’étanchéité F-gaz (50–500 t éq. CO₂)', 'Control de fugas de gases F (50–500 t CO₂ eq)', 'Kontrola szczelności F-gazów (50–500 t CO₂e)'),
    interval_months: 6, interval_months_leak_detection: 12, interval_days: 182, trade: 'hvac_mech', hours: 2, applies: fgasBand(50, 500),
    basis: L('Reg. (EU) 2024/573 Art. 5: ≥ 50 t CO₂e at least every 6 months (12 months with a leakage detection system).', 'Регламент (ЄС) 2024/573, ст. 5: ≥ 50 т CO₂-екв. щонайменше кожні 6 місяців (12 місяців із системою виявлення витоків).', 'VO (EU) 2024/573 Art. 5: ≥ 50 t CO₂e mindestens alle 6 Monate (12 Monate mit Leckage-Erkennungssystem).', 'Verordening (EU) 2024/573 art. 5: ≥ 50 t CO₂-eq ten minste elke 6 maanden (12 maanden met lekdetectiesysteem).', 'Règl. (UE) 2024/573 art. 5 : ≥ 50 t éq. CO₂ au moins tous les 6 mois (12 mois avec détection des fuites).', 'Reglamento (UE) 2024/573 art. 5: ≥ 50 t CO₂ eq al menos cada 6 meses (12 meses con detección de fugas).', 'Rozp. (UE) 2024/573 art. 5: ≥ 50 t CO₂e co najmniej co 6 miesięcy (12 miesięcy z wykrywaniem wycieków).'),
    source: 'fgas_2024_573' }),
  fgas_leak_500: stat({ id: 'fgas_leak_500', name: L('F-gas leak check (≥ 500 t CO₂e)', 'Перевірка на витоки F-газів (≥ 500 т CO₂-екв.)', 'F-Gas-Dichtheitskontrolle (≥ 500 t CO₂e)', 'F-gassen lekcontrole (≥ 500 t CO₂-eq)', 'Contrôle d’étanchéité F-gaz (≥ 500 t éq. CO₂)', 'Control de fugas de gases F (≥ 500 t CO₂ eq)', 'Kontrola szczelności F-gazów (≥ 500 t CO₂e)'),
    interval_months: 3, interval_months_leak_detection: 6, interval_days: 91, trade: 'hvac_mech', hours: 3, applies: fgasBand(500, null),
    basis: L('Reg. (EU) 2024/573 Art. 5: ≥ 500 t CO₂e at least every 3 months (6 months with a leakage detection system, which Art. 6 makes mandatory at this size).', 'Регламент (ЄС) 2024/573, ст. 5: ≥ 500 т CO₂-екв. щонайменше кожні 3 місяці (6 місяців із системою виявлення витоків, обов’язковою за ст. 6 для такого обсягу).', 'VO (EU) 2024/573 Art. 5: ≥ 500 t CO₂e mindestens alle 3 Monate (6 Monate mit Leckage-Erkennungssystem, das Art. 6 ab dieser Größe vorschreibt).', 'Verordening (EU) 2024/573 art. 5: ≥ 500 t CO₂-eq ten minste elke 3 maanden (6 maanden met lekdetectiesysteem, volgens art. 6 bij deze omvang verplicht).', 'Règl. (UE) 2024/573 art. 5 : ≥ 500 t éq. CO₂ au moins tous les 3 mois (6 mois avec détection des fuites, obligatoire à ce niveau selon l’art. 6).', 'Reglamento (UE) 2024/573 art. 5: ≥ 500 t CO₂ eq al menos cada 3 meses (6 meses con detección de fugas, obligatoria en este tamaño según el art. 6).', 'Rozp. (UE) 2024/573 art. 5: ≥ 500 t CO₂e co najmniej co 3 miesiące (6 miesięcy z systemem wykrywania wycieków, obowiązkowym od tej wielkości wg art. 6).'),
    source: 'fgas_2024_573' }),
  legionella_sentinel: stat({ id: 'legionella_sentinel', name: L('Legionella: monthly sentinel outlet temperatures', 'Легіонела: щомісячний контроль температури на контрольних точках', 'Legionellen: monatliche Temperaturkontrolle an Referenzentnahmestellen', 'Legionella: maandelijkse temperatuurcontrole op referentietappunten', 'Légionelle : relevé mensuel des températures aux points sentinelles', 'Legionela: control mensual de temperatura en puntos centinela', 'Legionella: comiesięczny pomiar temperatury w punktach kontrolnych'),
    interval_months: 1, interval_days: 30, trade: 'plumber', hours: 1.5, applies: function (a) { return inClass(a, ['dhw_calorifier']); },
    basis: L('HSE HSG274 Part 2: monthly temperature checks at sentinel outlets (hot ≥ 50 °C within 1 min) and of calorifier flow/return (60/50 °C). UK guidance used as public reference.', 'HSE HSG274 ч. 2: щомісячна перевірка температури на контрольних точках (гаряча ≥ 50 °C протягом 1 хв) та подачі/звороту бойлера (60/50 °C). Британська настанова як публічне джерело.', 'HSE HSG274 Teil 2: monatliche Temperaturkontrolle an Referenzstellen (Warmwasser ≥ 50 °C innerhalb 1 min) sowie Speichervor-/-rücklauf (60/50 °C). Britischer Leitfaden als öffentliche Referenz.', 'HSE HSG274 deel 2: maandelijkse temperatuurcontrole op referentietappunten (warm ≥ 50 °C binnen 1 min) en aanvoer/retour boiler (60/50 °C). Britse richtlijn als openbare referentie.', 'HSE HSG274 partie 2 : relevé mensuel aux points sentinelles (eau chaude ≥ 50 °C en 1 min) et départ/retour du ballon (60/50 °C). Guide britannique cité comme référence publique.', 'HSE HSG274 parte 2: control mensual en puntos centinela (ACS ≥ 50 °C en 1 min) e impulsión/retorno del acumulador (60/50 °C). Guía británica como referencia pública.', 'HSE HSG274 cz. 2: comiesięczny pomiar w punktach kontrolnych (c.w.u. ≥ 50 °C w ciągu 1 min) oraz zasilania/powrotu podgrzewacza (60/50 °C). Brytyjskie wytyczne jako publiczne źródło.'),
    source: 'hse_hsg274_2' }),
  legionella_calorifier_annual: stat({ id: 'legionella_calorifier_annual', name: L('Legionella: annual calorifier inspection / drain-down', 'Легіонела: щорічний огляд і спорожнення бойлера', 'Legionellen: jährliche Speicherinspektion / Entleerung', 'Legionella: jaarlijkse inspectie / aftappen boiler', 'Légionelle : inspection / vidange annuelle du ballon', 'Legionela: inspección / vaciado anual del acumulador', 'Legionella: coroczna inspekcja / opróżnienie podgrzewacza'),
    interval_months: 12, interval_days: 365, trade: 'plumber', hours: 4, applies: function (a) { return inClass(a, ['dhw_calorifier']); },
    basis: L('HSE HSG274 Part 2: calorifiers inspected annually for debris/sludge and drained/cleaned as indicated.', 'HSE HSG274 ч. 2: щорічний огляд бойлерів на відкладення та їх спорожнення/очищення за потреби.', 'HSE HSG274 Teil 2: jährliche Inspektion der Speicher auf Schlamm und Entleerung/Reinigung nach Befund.', 'HSE HSG274 deel 2: jaarlijkse inspectie op slib en aftappen/reinigen indien nodig.', 'HSE HSG274 partie 2 : inspection annuelle des ballons (boues) et vidange/nettoyage selon constat.', 'HSE HSG274 parte 2: inspección anual de lodos y vaciado/limpieza según hallazgos.', 'HSE HSG274 cz. 2: coroczna inspekcja osadów i opróżnienie/czyszczenie w razie potrzeby.'),
    source: 'hse_hsg274_2' }),
  sprinkler_weekly: stat({ id: 'sprinkler_weekly', name: L('Sprinkler: weekly pump start and alarm test', 'Спринклер: щотижневий тест пуску насоса і тривоги', 'Sprinkler: wöchentliche Pumpenstart- und Alarmprüfung', 'Sprinkler: wekelijkse pompstart- en alarmtest', 'Sprinkler : essai hebdomadaire de démarrage pompe et alarme', 'Rociadores: prueba semanal de arranque de bomba y alarma', 'Tryskacze: cotygodniowa próba rozruchu pompy i alarmu'),
    interval_months: 12 / 52, interval_days: 7, trade: 'fire', hours: 1, applies: function (a) { return inClass(a, ['sprinkler_pump']); },
    basis: L('EN 12845 clause 20.2.2 (weekly routine): automatic pump starting test, diesel engine run, alarm valve and water-motor alarm test.', 'EN 12845 п. 20.2.2 (щотижнева процедура): тест автоматичного пуску насоса, прогін дизеля, перевірка сигнального клапана і гідравлічного дзвону.', 'EN 12845 Abschnitt 20.2.2 (wöchentlich): automatischer Pumpenstart, Dieselprobelauf, Prüfung Alarmventil und Alarmglocke.', 'EN 12845 art. 20.2.2 (wekelijks): automatische pompstart, proefdraaien diesel, test alarmklep en waterturbinebel.', 'EN 12845 § 20.2.2 (hebdomadaire) : démarrage automatique des pompes, essai du moteur diesel, poste de contrôle et gong hydraulique.', 'EN 12845 apdo. 20.2.2 (semanal): arranque automático de bombas, prueba del motor diésel, válvula de alarma y campana hidráulica.', 'EN 12845 pkt 20.2.2 (co tydzień): automatyczny rozruch pomp, próba silnika diesla, zawór alarmowy i dzwon hydrauliczny.'),
    source: 'en12845' }),
  sprinkler_annual: stat({ id: 'sprinkler_annual', name: L('Sprinkler: annual pump flow test', 'Спринклер: щорічне випробування насоса на витрату', 'Sprinkler: jährliche Pumpen-Förderstromprüfung', 'Sprinkler: jaarlijkse pompdebiettest', 'Sprinkler : essai annuel de débit des pompes', 'Rociadores: prueba anual de caudal de bombas', 'Tryskacze: coroczna próba wydajności pompy'),
    interval_months: 12, interval_days: 365, trade: 'fire', hours: 4, applies: function (a) { return inClass(a, ['sprinkler_pump']); },
    basis: L('EN 12845 clause 20.3.4.2.1 (annual routine): each pump tested at full load against its nameplate pressure/flow.', 'EN 12845 п. 20.3.4.2.1 (щорічно): кожен насос випробовується при повному навантаженні за паспортними тиском/витратою.', 'EN 12845 Abschnitt 20.3.4.2.1 (jährlich): jede Pumpe unter Volllast gegen Typenschild-Druck/-Förderstrom geprüft.', 'EN 12845 art. 20.3.4.2.1 (jaarlijks): elke pomp op vollast getest tegen de typeplaatwaarden.', 'EN 12845 § 20.3.4.2.1 (annuel) : chaque pompe essayée à pleine charge selon sa plaque signalétique.', 'EN 12845 apdo. 20.3.4.2.1 (anual): cada bomba probada a plena carga frente a su placa.', 'EN 12845 pkt 20.3.4.2.1 (corocznie): każda pompa badana przy pełnym obciążeniu wg tabliczki znamionowej.'),
    source: 'en12845' }),
  emergency_lighting_monthly: stat({ id: 'emergency_lighting_monthly', name: L('Emergency lighting: monthly function test', 'Аварійне освітлення: щомісячний функціональний тест', 'Notbeleuchtung: monatliche Funktionsprüfung', 'Noodverlichting: maandelijkse functietest', 'Éclairage de sécurité : essai mensuel de fonctionnement', 'Alumbrado de emergencia: prueba mensual de funcionamiento', 'Oświetlenie awaryjne: comiesięczny test działania'),
    interval_months: 1, interval_days: 30, trade: 'electrician', hours: 1, applies: function (a) { return inClass(a, ['emergency_lighting']); },
    basis: L('EN 50172 § 7.2.3: short function test of every luminaire and sign on simulated mains failure, monthly; results logged.', 'EN 50172 § 7.2.3: щомісячний короткий тест кожного світильника і знака при імітації зникнення живлення; результати заносяться в журнал.', 'EN 50172 § 7.2.3: monatlicher Kurztest jeder Leuchte bei simuliertem Netzausfall; Ergebnis im Prüfbuch.', 'EN 50172 § 7.2.3: maandelijkse korte functietest van elk armatuur bij gesimuleerde netuitval; resultaten in logboek.', 'EN 50172 § 7.2.3 : essai bref mensuel de chaque luminaire sur coupure secteur simulée ; résultats consignés.', 'EN 50172 § 7.2.3: prueba breve mensual de cada luminaria con fallo de red simulado; resultados registrados.', 'EN 50172 § 7.2.3: comiesięczny krótki test każdej oprawy przy symulowanym zaniku zasilania; wyniki w dzienniku.'),
    source: 'en50172' }),
  emergency_lighting_annual: stat({ id: 'emergency_lighting_annual', name: L('Emergency lighting: annual full-duration test', 'Аварійне освітлення: щорічний тест на повну тривалість', 'Notbeleuchtung: jährlicher Volldauertest', 'Noodverlichting: jaarlijkse volledige-duurtest', 'Éclairage de sécurité : essai annuel d’autonomie complète', 'Alumbrado de emergencia: prueba anual de autonomía completa', 'Oświetlenie awaryjne: coroczny test pełnego czasu pracy'),
    interval_months: 12, interval_days: 365, trade: 'electrician', hours: 4, applies: function (a) { return inClass(a, ['emergency_lighting']); },
    basis: L('EN 50172 § 7.2.4: annual test for the full rated duration (typically 1 h or 3 h); timed before a period of low risk (§ 7.2.1).', 'EN 50172 § 7.2.4: щорічний тест на повну номінальну тривалість (зазвичай 1 або 3 год) перед періодом низького ризику (§ 7.2.1).', 'EN 50172 § 7.2.4: jährlicher Test über die volle Nenndauer (meist 1 h oder 3 h), vor einer Zeit geringen Risikos (§ 7.2.1).', 'EN 50172 § 7.2.4: jaarlijkse test over de volledige nominale duur (meestal 1 of 3 h), vóór een periode met laag risico (§ 7.2.1).', 'EN 50172 § 7.2.4 : essai annuel sur toute l’autonomie assignée (1 h ou 3 h), avant une période de faible risque (§ 7.2.1).', 'EN 50172 § 7.2.4: prueba anual de la autonomía nominal completa (1 h o 3 h), antes de un periodo de bajo riesgo (§ 7.2.1).', 'EN 50172 § 7.2.4: coroczny test pełnego znamionowego czasu (zwykle 1 h lub 3 h), przed okresem niskiego ryzyka (§ 7.2.1).'),
    source: 'en50172' }),
  epbd_heating: stat({ id: 'epbd_heating', name: L('EPBD inspection of heating system (> 70 kW)', 'Інспекція системи опалення за EPBD (> 70 кВт)', 'EPBD-Inspektion der Heizungsanlage (> 70 kW)', 'EPBD-keuring verwarmingsinstallatie (> 70 kW)', 'Inspection EPBD du système de chauffage (> 70 kW)', 'Inspección EPBD del sistema de calefacción (> 70 kW)', 'Kontrola EPBD instalacji grzewczej (> 70 kW)'),
    interval_months: 60, interval_months_over_290kw: 36, interval_days: 1826, trade: 'specialist_vendor', hours: 6, threshold_kw: 70,
    applies: function (a) { if (!inClass(a, HEATING_CLASSES) || (a && a.bacs_exempt === true)) return false; return !(a && typeof a.rated_kw === 'number' && a.rated_kw <= 70); },
    basis: L('Directive (EU) 2024/1275 Art. 23: heating, ventilation and air-conditioning systems (incl. combinations) over 70 kW effective rated output inspected at least every 5 years; over 290 kW at least every 3 years. Buildings meeting the BACS requirements of Art. 13(10)/(11) are exempt (Art. 23(7)). Applies through national transposition (deadline 29 May 2026).', 'Директива (ЄС) 2024/1275, ст. 23: системи опалення, вентиляції і кондиціонування (у т.ч. комбіновані) з ефективною номінальною потужністю понад 70 кВт інспектуються щонайменше раз на 5 років, понад 290 кВт — раз на 3 роки. Будівлі, що відповідають вимогам до BACS ст. 13(10)/(11), звільнені (ст. 23(7)). Діє через національне транспонування (строк 29.05.2026).', 'Richtlinie (EU) 2024/1275 Art. 23: Heizungs-, Lüftungs- und Klimaanlagen (auch kombiniert) über 70 kW Nennleistung mindestens alle 5 Jahre, über 290 kW mindestens alle 3 Jahre inspizieren. Gebäude mit GA-Systemen nach Art. 13(10)/(11) sind befreit (Art. 23(7)). Gilt über die nationale Umsetzung (Frist 29.05.2026).', 'Richtlijn (EU) 2024/1275 art. 23: verwarmings-, ventilatie- en airconditioningsystemen (ook gecombineerd) boven 70 kW nominaal vermogen ten minste elke 5 jaar keuren, boven 290 kW ten minste elke 3 jaar. Gebouwen met GBS volgens art. 13(10)/(11) zijn vrijgesteld (art. 23(7)). Geldt via nationale omzetting (uiterlijk 29-05-2026).', 'Directive (UE) 2024/1275 art. 23 : systèmes de chauffage, ventilation et climatisation (y compris combinés) de plus de 70 kW inspectés au moins tous les 5 ans ; plus de 290 kW au moins tous les 3 ans. Les bâtiments dotés d’un système d’automatisation conforme à l’art. 13(10)/(11) sont exemptés (art. 23(7)). S’applique via la transposition nationale (échéance 29/05/2026).', 'Directiva (UE) 2024/1275 art. 23: sistemas de calefacción, ventilación y aire acondicionado (incluidas combinaciones) de más de 70 kW inspeccionados al menos cada 5 años; de más de 290 kW al menos cada 3 años. Los edificios con sistemas de automatización conformes al art. 13(10)/(11) están exentos (art. 23(7)). Se aplica mediante la transposición nacional (plazo 29/05/2026).', 'Dyrektywa (UE) 2024/1275 art. 23: instalacje ogrzewania, wentylacji i klimatyzacji (także łączone) powyżej 70 kW kontrolowane co najmniej co 5 lat, powyżej 290 kW co najmniej co 3 lata. Budynki z systemami automatyki zgodnymi z art. 13(10)/(11) są zwolnione (art. 23(7)). Obowiązuje poprzez transpozycję krajową (termin 29.05.2026).'),
    source: 'epbd_2024_1275' }),
  epbd_ac: stat({ id: 'epbd_ac', name: L('EPBD inspection of air-conditioning / ventilation (> 70 kW)', 'Інспекція кондиціонування / вентиляції за EPBD (> 70 кВт)', 'EPBD-Inspektion der Klima-/Lüftungsanlage (> 70 kW)', 'EPBD-keuring airco-/ventilatie-installatie (> 70 kW)', 'Inspection EPBD climatisation / ventilation (> 70 kW)', 'Inspección EPBD de climatización / ventilación (> 70 kW)', 'Kontrola EPBD klimatyzacji / wentylacji (> 70 kW)'),
    interval_months: 60, interval_months_over_290kw: 36, interval_days: 1826, trade: 'specialist_vendor', hours: 6, threshold_kw: 70,
    applies: function (a) { if (!inClass(a, AC_CLASSES) || (a && a.bacs_exempt === true)) return false; return !(a && typeof a.rated_kw === 'number' && a.rated_kw <= 70); },
    basis: L('Directive (EU) 2024/1275 Art. 23: heating, ventilation and air-conditioning systems (incl. combinations) over 70 kW effective rated output inspected at least every 5 years; over 290 kW at least every 3 years. Buildings meeting the BACS requirements of Art. 13(10)/(11) are exempt (Art. 23(7)). Applies through national transposition (deadline 29 May 2026).', 'Директива (ЄС) 2024/1275, ст. 23: системи опалення, вентиляції і кондиціонування (у т.ч. комбіновані) з ефективною номінальною потужністю понад 70 кВт інспектуються щонайменше раз на 5 років, понад 290 кВт — раз на 3 роки. Будівлі, що відповідають вимогам до BACS ст. 13(10)/(11), звільнені (ст. 23(7)). Діє через національне транспонування (строк 29.05.2026).', 'Richtlinie (EU) 2024/1275 Art. 23: Heizungs-, Lüftungs- und Klimaanlagen (auch kombiniert) über 70 kW Nennleistung mindestens alle 5 Jahre, über 290 kW mindestens alle 3 Jahre inspizieren. Gebäude mit GA-Systemen nach Art. 13(10)/(11) sind befreit (Art. 23(7)). Gilt über die nationale Umsetzung (Frist 29.05.2026).', 'Richtlijn (EU) 2024/1275 art. 23: verwarmings-, ventilatie- en airconditioningsystemen (ook gecombineerd) boven 70 kW nominaal vermogen ten minste elke 5 jaar keuren, boven 290 kW ten minste elke 3 jaar. Gebouwen met GBS volgens art. 13(10)/(11) zijn vrijgesteld (art. 23(7)). Geldt via nationale omzetting (uiterlijk 29-05-2026).', 'Directive (UE) 2024/1275 art. 23 : systèmes de chauffage, ventilation et climatisation (y compris combinés) de plus de 70 kW inspectés au moins tous les 5 ans ; plus de 290 kW au moins tous les 3 ans. Les bâtiments dotés d’un système d’automatisation conforme à l’art. 13(10)/(11) sont exemptés (art. 23(7)). S’applique via la transposition nationale (échéance 29/05/2026).', 'Directiva (UE) 2024/1275 art. 23: sistemas de calefacción, ventilación y aire acondicionado (incluidas combinaciones) de más de 70 kW inspeccionados al menos cada 5 años; de más de 290 kW al menos cada 3 años. Los edificios con sistemas de automatización conformes al art. 13(10)/(11) están exentos (art. 23(7)). Se aplica mediante la transposición nacional (plazo 29/05/2026).', 'Dyrektywa (UE) 2024/1275 art. 23: instalacje ogrzewania, wentylacji i klimatyzacji (także łączone) powyżej 70 kW kontrolowane co najmniej co 5 lat, powyżej 290 kW co najmniej co 3 lata. Budynki z systemami automatyki zgodnymi z art. 13(10)/(11) są zwolnione (art. 23(7)). Obowiązuje poprzez transpozycję krajową (termin 29.05.2026).'),
    source: 'epbd_2024_1275' }),
  generator_annual_loadbank: stat({ id: 'generator_annual_loadbank', name: L('Standby generator: annual load bank test (if monthly runs are light)', 'Резервний генератор: щорічне випробування на баластне навантаження (якщо щомісячні прогони малонавантажені)', 'Notstromaggregat: jährlicher Lastbanktest (bei zu geringer Monatslast)', 'Noodstroomaggregaat: jaarlijkse loadbanktest (bij te lichte maandproef)', 'Groupe électrogène : essai annuel sur banc de charge (si essais mensuels trop peu chargés)', 'Grupo electrógeno: prueba anual con banco de carga (si las pruebas mensuales son de baja carga)', 'Agregat: coroczna próba na obciążnicy (gdy próby miesięczne są za słabo obciążone)'),
    interval_months: 12, interval_days: 365, trade: 'specialist_vendor', hours: 3, applies: function (a) { return inClass(a, ['generator']) && !(a && a.monthly_load_ok === true); },
    basis: L('NFPA 110 § 8.4.2.3 (US reference): diesel sets that do not meet the monthly load / exhaust-temperature criteria get a yearly load bank test — ≥ 50 % of nameplate for 30 min and ≥ 75 % for 60 min (1.5 h in total). Not required when monthly runs meet § 8.4.2 (set asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (довідково США): дизель-генератори, що не відповідають критеріям щомісячного навантаження / температури вихлопу, щороку випробовуються на баластне навантаження — ≥ 50 % номіналу 30 хв і ≥ 75 % 60 хв (разом 1,5 год). Не потрібне, якщо щомісячні прогони відповідають § 8.4.2 (asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (US-Referenz): Dieselaggregate, die die monatlichen Last-/Abgastemperaturkriterien nicht erfüllen, erhalten jährlich einen Lastbanktest — ≥ 50 % Nennleistung 30 min und ≥ 75 % 60 min (insgesamt 1,5 h). Entfällt, wenn die Monatsläufe § 8.4.2 erfüllen (asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (VS-referentie): dieselaggregaten die niet aan de maandelijkse belasting-/uitlaattemperatuurcriteria voldoen, krijgen jaarlijks een loadbanktest — ≥ 50 % nominaal 30 min en ≥ 75 % 60 min (samen 1,5 h). Niet nodig als de maandproeven aan § 8.4.2 voldoen (asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (référence US) : les groupes diesel ne satisfaisant pas aux critères mensuels de charge / température d’échappement subissent un essai annuel sur banc de charge — ≥ 50 % de la puissance nominale 30 min et ≥ 75 % 60 min (1,5 h au total). Inutile si les essais mensuels respectent le § 8.4.2 (asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (referencia de EE. UU.): los grupos diésel que no cumplen los criterios mensuales de carga / temperatura de escape requieren una prueba anual con banco de carga: ≥ 50 % de la potencia nominal 30 min y ≥ 75 % 60 min (1,5 h en total). No necesaria si las pruebas mensuales cumplen el § 8.4.2 (asset.monthly_load_ok).', 'NFPA 110 § 8.4.2.3 (odniesienie USA): agregaty diesla niespełniające comiesięcznych kryteriów obciążenia / temperatury spalin przechodzą coroczną próbę na obciążnicy — ≥ 50 % mocy znamionowej 30 min i ≥ 75 % 60 min (łącznie 1,5 h). Niepotrzebna, gdy próby miesięczne spełniają § 8.4.2 (asset.monthly_load_ok).'),
    source: 'nfpa110' }),
  ct_water_monitoring: stat({ id: 'ct_water_monitoring', name: L('Cooling tower: routine water treatment and microbiological checks', 'Градирня: регулярний контроль водопідготовки і мікробіології', 'Kühlturm: routinemäßige Wasserbehandlungs- und mikrobiologische Kontrollen', 'Koeltoren: routinematige waterbehandelings- en microbiologische controles', 'Tour aéroréfrigérante : contrôles courants du traitement d’eau et microbiologiques', 'Torre de refrigeración: controles rutinarios de tratamiento de agua y microbiológicos', 'Wieża chłodnicza: rutynowe kontrole uzdatniania wody i mikrobiologii'),
    interval_months: 12 / 52, interval_days: 7, trade: 'specialist_vendor', hours: 1, applies: function (a) { return inClass(a, ['cooling_tower']); },
    basis: L('HSE HSG274 Part 1: water treatment parameters checked at least weekly and microbiological activity (dip slides / TVC) monitored routinely; UK guidance used as public reference — national rules (e.g. DE 42. BImSchV) may set other intervals.', 'HSE HSG274 ч. 1: параметри водопідготовки перевіряються щонайменше щотижня, мікробіологічна активність (dip-slide / ЗМЧ) контролюється регулярно; британська настанова як публічне джерело — національні норми (напр. DE 42. BImSchV) можуть встановлювати інші інтервали.', 'HSE HSG274 Teil 1: Wasserbehandlungsparameter mindestens wöchentlich, mikrobiologische Aktivität (Eintauchnährböden / KBE) routinemäßig; britischer Leitfaden als öffentliche Referenz — nationale Regeln (z. B. 42. BImSchV) können andere Intervalle vorgeben.', 'HSE HSG274 deel 1: waterbehandelingsparameters minstens wekelijks, microbiologische activiteit (dipslides / kiemgetal) routinematig; Britse richtlijn als openbare referentie — nationale regels kunnen andere intervallen voorschrijven.', 'HSE HSG274 partie 1 : paramètres de traitement d’eau au moins hebdomadaires, activité microbiologique (lames gélosées / FMAT) suivie régulièrement ; guide britannique cité comme référence publique — les règles nationales (ex. FR ICPE 2921) peuvent fixer d’autres fréquences.', 'HSE HSG274 parte 1: parámetros de tratamiento de agua al menos semanalmente y actividad microbiológica (dip slides / aerobios) de forma rutinaria; guía británica como referencia pública; las normas nacionales (p. ej. ES RD 487/2022) pueden fijar otros intervalos.', 'HSE HSG274 cz. 1: parametry uzdatniania wody co najmniej co tydzień, aktywność mikrobiologiczna (dip-slide / ogólna liczba bakterii) rutynowo; brytyjskie wytyczne jako publiczne źródło — przepisy krajowe mogą określać inne interwały.'),
    source: 'hse_hsg274_1' }),
  ct_legionella_sampling: stat({ id: 'ct_legionella_sampling', name: L('Cooling tower: legionella sampling (laboratory)', 'Градирня: лабораторний аналіз на легіонелу', 'Kühlturm: Legionellenuntersuchung (Labor)', 'Koeltoren: legionellabemonstering (laboratorium)', 'Tour aéroréfrigérante : analyse légionelles (laboratoire)', 'Torre de refrigeración: muestreo de legionela (laboratorio)', 'Wieża chłodnicza: badanie na legionellę (laboratorium)'),
    interval_months: 3, interval_days: 91, trade: 'specialist_vendor', hours: 1, applies: function (a) { return inClass(a, ['cooling_tower']); },
    basis: L('HSE HSG274 Part 1: para 1.133: legionella sampling at least quarterly (more often after system changes or positive results). National rules may be stricter (e.g. DE 42. BImSchV \u00a7 7: monthly for cooling towers).', 'HSE HSG274 ч. 1: відбір проб на легіонелу щонайменше щокварталу (частіше після змін у системі або позитивних результатів). Національні норми можуть бути суворішими.', 'HSE HSG274 Teil 1: Abs. 1.133: Legionellenproben mindestens viertelj\u00e4hrlich (h\u00e4ufiger nach \u00c4nderungen oder positiven Befunden). Strenger in DE: 42. BImSchV \u00a7 7 (K\u00fchlt\u00fcrme monatlich).', 'HSE HSG274 deel 1: legionellabemonstering minstens elk kwartaal (vaker na wijzigingen of positieve uitslagen). Nationale regels kunnen strenger zijn.', 'HSE HSG274 partie 1 : analyse légionelles au moins trimestrielle (plus souvent après modification ou résultat positif). Les règles nationales peuvent être plus strictes.', 'HSE HSG274 parte 1: muestreo de legionela al menos trimestral (más frecuente tras cambios o resultados positivos). Las normas nacionales pueden ser más estrictas.', 'HSE HSG274 cz. 1: badanie na legionellę co najmniej raz na kwartał (częściej po zmianach lub wynikach dodatnich). Przepisy krajowe mogą być surowsze.'),
    source: 'hse_hsg274_1' }),
  ct_clean_disinfect: stat({ id: 'ct_clean_disinfect', name: L('Cooling tower: cleaning and disinfection', 'Градирня: очищення і дезінфекція', 'Kühlturm: Reinigung und Desinfektion', 'Koeltoren: reiniging en desinfectie', 'Tour aéroréfrigérante : nettoyage et désinfection', 'Torre de refrigeración: limpieza y desinfección', 'Wieża chłodnicza: czyszczenie i dezynfekcja'),
    interval_months: 6, interval_days: 182, trade: 'specialist_vendor', hours: 8, applies: function (a) { return inClass(a, ['cooling_tower']); },
    basis: L('HSE HSG274 Part 1 (2nd ed. 2024) para 1.87: frequency by risk assessment \u2014 at least every 3 months in a dirty environment, at least twice a year for comfort-cooling systems (default here), at least every 12 months for clean industrial use.', 'HSE HSG274 ч. 1 (2-ге вид. 2024), п. 1.87: періодичність за оцінкою ризиків \u2014 щонайменше кожні 3 місяці в забрудненому середовищі, щонайменше двічі на рік для систем комфортного охолодження (тут за замовчуванням), щонайменше кожні 12 місяців для чистих промислових застосувань.', 'HSE HSG274 Teil 1 (2. Aufl. 2024) Abs. 1.87: H\u00e4ufigkeit nach Gef\u00e4hrdungsbeurteilung \u2014 mindestens alle 3 Monate bei verschmutzter Umgebung, mindestens zweimal j\u00e4hrlich bei Komfortk\u00fchlung (hier Standard), mindestens alle 12 Monate bei sauberer Industrieanwendung.', 'HSE HSG274 deel 1 (2e druk 2024) par. 1.87: frequentie volgens risicoanalyse \u2014 minstens elke 3 maanden in een vuile omgeving, minstens tweemaal per jaar voor comfortkoeling (hier standaard), minstens elke 12 maanden voor schone industri\u00eble toepassingen.', 'HSE HSG274 partie 1 (2e \u00e9d. 2024) \u00a7 1.87 : fr\u00e9quence selon l\u2019analyse de risque \u2014 au moins tous les 3 mois en environnement sale, au moins deux fois par an pour la climatisation de confort (valeur par d\u00e9faut ici), au moins tous les 12 mois pour un usage industriel propre.', 'HSE HSG274 parte 1 (2.\u00aa ed. 2024) p\u00e1rr. 1.87: frecuencia seg\u00fan la evaluaci\u00f3n de riesgos: al menos cada 3 meses en entorno sucio, al menos dos veces al a\u00f1o en climatizaci\u00f3n de confort (valor por defecto aqu\u00ed), al menos cada 12 meses en uso industrial limpio.', 'HSE HSG274 cz. 1 (wyd. 2, 2024) pkt 1.87: cz\u0119stotliwo\u015b\u0107 wg oceny ryzyka \u2014 co najmniej co 3 miesi\u0105ce w brudnym otoczeniu, co najmniej dwa razy w roku dla klimatyzacji komfortu (tu domy\u015blnie), co najmniej co 12 miesi\u0119cy dla czystych zastosowa\u0144 przemys\u0142owych.'),
    source: 'hse_hsg274_1' }),
  fire_alarm_weekly: stat({ id: 'fire_alarm_weekly', name: L('Fire alarm: weekly user test (one call point)', 'Пожежна сигналізація: щотижневий тест користувачем (один ручний сповіщувач)', 'Brandmeldeanlage: wöchentlicher Betreibertest (ein Handmelder)', 'Brandmeldinstallatie: wekelijkse gebruikerstest (één handmelder)', 'Alarme incendie : essai hebdomadaire par l’exploitant (un déclencheur manuel)', 'Alarma de incendios: prueba semanal del usuario (un pulsador)', 'SSP: cotygodniowy test użytkownika (jeden ROP)'),
    interval_months: 12 / 52, interval_days: 7, trade: 'fire', hours: 0.25, applies: function (a) { return inClass(a, ['fire_alarm']); },
    basis: L('BS 5839-1 (UK code of practice; EN 54 covers products only): weekly test by the user, a different manual call point each week, result logged. National example.', 'BS 5839-1 (британський звід правил; EN 54 стосується лише виробів): щотижневий тест користувачем, щоразу інший ручний сповіщувач, запис у журнал. Національний приклад.', 'BS 5839-1 (britischer Praxisleitfaden; EN 54 regelt nur Produkte): wöchentlicher Betreibertest, jede Woche ein anderer Handmelder, Eintrag ins Betriebsbuch. Nationales Beispiel; in DE gilt DIN 14675 / VDE 0833.', 'BS 5839-1 (Britse praktijkcode; EN 54 betreft alleen producten): wekelijkse gebruikerstest, elke week een andere handmelder, vastgelegd in het logboek. Nationaal voorbeeld; in NL geldt NEN 2654-1.', 'BS 5839-1 (code de pratique britannique ; l’EN 54 ne vise que les produits) : essai hebdomadaire par l’exploitant, un déclencheur différent chaque semaine, consigné au registre. Exemple national ; en France, règles APSAD / NF S 61-933.', 'BS 5839-1 (código británico; la EN 54 solo trata productos): prueba semanal del usuario, un pulsador distinto cada semana, registrada. Ejemplo nacional; en España rige el RIPCI (RD 513/2017).', 'BS 5839-1 (brytyjski kodeks praktyki; EN 54 dotyczy tylko wyrobów): cotygodniowy test użytkownika, co tydzień inny ROP, wpis do książki. Przykład krajowy; w PL obowiązują przepisy ppoż. i PKN-CEN/TS 54-14.'),
    source: 'bs5839_1' }),
  fire_alarm_service: stat({ id: 'fire_alarm_service', name: L('Fire alarm: periodic service visit', 'Пожежна сигналізація: періодичне сервісне обслуговування', 'Brandmeldeanlage: wiederkehrende Wartung (Inspektion)', 'Brandmeldinstallatie: periodiek onderhoud', 'Alarme incendie : visite périodique de maintenance', 'Alarma de incendios: visita periódica de mantenimiento', 'SSP: okresowy przegląd serwisowy'),
    interval_months: 6, interval_days: 182, trade: 'fire', hours: 6, applies: function (a) { return inClass(a, ['fire_alarm']); },
    basis: L('BS 5839-1:2025 clause 43.2.1: inspection, test and service by a competent person at intervals of approximately 6 months (any time 5\u20137 months after the previous visit); the 12-monthly visit adds e.g. duct detector tests and zone-plan checks. UK code of practice as a national example.', 'BS 5839-1:2025 п. 43.2.1: огляд, тест і обслуговування компетентною особою приблизно раз на 6 місяців (через 5\u20137 місяців після попереднього візиту); щорічний візит додає, зокрема, перевірку канальних сповіщувачів і планів зон. Британський звід правил як національний приклад.', 'BS 5839-1:2025 Abschn. 43.2.1: Inspektion, Pr\u00fcfung und Wartung durch Fachkundige etwa alle 6 Monate (5\u20137 Monate nach dem letzten Besuch); der 12-Monats-Besuch erg\u00e4nzt u. a. Kanalmelderpr\u00fcfung und Meldebereichspl\u00e4ne. Britischer Leitfaden als nationales Beispiel.', 'BS 5839-1:2025 art. 43.2.1: inspectie, test en onderhoud door een deskundige ongeveer elke 6 maanden (5\u20137 maanden na het vorige bezoek); het jaarbezoek voegt o.a. kanaalmeldertests en controle van zoneplattegronden toe. Britse praktijkcode als nationaal voorbeeld.', 'BS 5839-1:2025 \u00a7 43.2.1 : inspection, essai et maintenance par une personne comp\u00e9tente environ tous les 6 mois (5 \u00e0 7 mois apr\u00e8s la visite pr\u00e9c\u00e9dente) ; la visite annuelle ajoute notamment l\u2019essai des d\u00e9tecteurs de gaine et la v\u00e9rification des plans de zones. Code britannique cit\u00e9 comme exemple national.', 'BS 5839-1:2025 apdo. 43.2.1: inspecci\u00f3n, prueba y mantenimiento por persona competente aproximadamente cada 6 meses (entre 5 y 7 meses tras la visita anterior); la visita anual a\u00f1ade, p. ej., la prueba de detectores de conducto y la verificaci\u00f3n de planos de zonas. C\u00f3digo brit\u00e1nico como ejemplo nacional.', 'BS 5839-1:2025 pkt 43.2.1: przegl\u0105d, test i serwis przez osob\u0119 kompetentn\u0105 mniej wi\u0119cej co 6 miesi\u0119cy (5\u20137 miesi\u0119cy po poprzedniej wizycie); wizyta roczna obejmuje dodatkowo m.in. test czujek kana\u0142owych i sprawdzenie plan\u00f3w stref. Brytyjski kodeks jako przyk\u0142ad krajowy.'),
    source: 'bs5839_1' }),
  lift_examination: stat({ id: 'lift_examination', name: L('Passenger lift: periodic thorough examination', 'Пасажирський ліфт: періодичний технічний огляд', 'Personenaufzug: wiederkehrende Prüfung', 'Personenlift: periodieke keuring', 'Ascenseur : contrôle technique périodique', 'Ascensor: inspección periódica', 'Dźwig osobowy: okresowe badanie techniczne'),
    interval_months: 6, interval_days: 182, trade: 'specialist_vendor', hours: 3, applies: function (a) { return inClass(a, ['lift']); },
    basis: L('No EU-wide in-service rule (Lifts Directive 2014/33/EU covers placing on the market; existing lifts are national competence). Examples: UK LOLER 1998 reg. 9(3)(a) \u2014 lifting equipment for persons thoroughly examined at least every 6 months (default here); DE BetrSichV Annex 2 sect. 2 \u2014 main inspection at most every 2 years plus an intermediate inspection.', 'Загальноєвропейського правила експлуатації немає (Директива 2014/33/ЄС регулює введення в обіг; наявні ліфти \u2014 національна компетенція). Приклади: UK LOLER 1998, п. 9(3)(a) \u2014 обладнання для підйому людей оглядається щонайменше кожні 6 місяців (тут за замовчуванням); DE BetrSichV, дод. 2, розд. 2 \u2014 основний огляд не рідше ніж раз на 2 роки плюс проміжний.', 'Keine EU-weite Betriebsregel (Aufzugsrichtlinie 2014/33/EU regelt das Inverkehrbringen; Bestandsaufz\u00fcge sind nationale Zust\u00e4ndigkeit). Beispiele: UK LOLER 1998 Reg. 9(3)(a) \u2014 Personenaufz\u00fcge mindestens alle 6 Monate (hier Standard); BetrSichV Anhang 2 Abschn. 2 \u2014 Hauptpr\u00fcfung h\u00f6chstens alle 2 Jahre plus Zwischenpr\u00fcfung.', 'Geen EU-brede gebruiksregel (Liftenrichtlijn 2014/33/EU betreft het in de handel brengen; bestaande liften zijn nationale bevoegdheid). Voorbeelden: UK LOLER 1998 reg. 9(3)(a) \u2014 personenhijsmiddelen minstens elke 6 maanden grondig onderzocht (hier standaard); DE BetrSichV bijlage 2 afd. 2 \u2014 hoofdkeuring hoogstens elke 2 jaar plus tussentijdse keuring.', 'Pas de r\u00e8gle europ\u00e9enne d\u2019exploitation (la directive 2014/33/UE vise la mise sur le march\u00e9 ; les ascenseurs existants rel\u00e8vent des \u00c9tats). Exemples : UK LOLER 1998 r\u00e8gl. 9(3)(a) \u2014 examen approfondi au moins tous les 6 mois pour le levage de personnes (valeur par d\u00e9faut ici) ; DE BetrSichV annexe 2 sect. 2 \u2014 contr\u00f4le principal au plus tous les 2 ans plus contr\u00f4le interm\u00e9diaire.', 'No hay norma de servicio a escala de la UE (la Directiva 2014/33/UE regula la comercializaci\u00f3n; los ascensores existentes son competencia nacional). Ejemplos: UK LOLER 1998 reg. 9(3)(a): examen exhaustivo al menos cada 6 meses para elevaci\u00f3n de personas (valor por defecto aqu\u00ed); DE BetrSichV anexo 2 secc. 2: inspecci\u00f3n principal como m\u00e1ximo cada 2 a\u00f1os m\u00e1s una intermedia.', 'Brak og\u00f3lnounijnej regu\u0142y eksploatacji (dyrektywa 2014/33/UE dotyczy wprowadzania do obrotu; istniej\u0105ce d\u017awigi to kompetencja krajowa). Przyk\u0142ady: UK LOLER 1998 reg. 9(3)(a) \u2014 urz\u0105dzenia do podnoszenia os\u00f3b badane co najmniej co 6 miesi\u0119cy (tu domy\u015blnie); DE BetrSichV za\u0142. 2 cz. 2 \u2014 badanie g\u0142\u00f3wne najwy\u017cej co 2 lata plus po\u015brednie.'),
    source: 'uk_loler' }),
  generator_monthly: stat({ id: 'generator_monthly', name: L('Standby generator: monthly load run', 'Резервний генератор: щомісячний прогін під навантаженням', 'Notstromaggregat: monatlicher Lastlauf', 'Noodstroomaggregaat: maandelijkse belastingproef', 'Groupe électrogène : essai mensuel en charge', 'Grupo electrógeno: prueba mensual en carga', 'Agregat prądotwórczy: comiesięczna próba pod obciążeniem'),
    interval_months: 1, interval_days: 30, trade: 'electrician', hours: 1.5, applies: function (a) { return inClass(a, ['generator']); },
    basis: L('NFPA 110 § 8.4.2 (US reference, often adopted contractually in the EU): monthly exercise ≥ 30 min under load (≥ 30 % of nameplate kW or minimum exhaust temperature); national rules may differ.', 'NFPA 110 § 8.4.2 (довідково США, часто приймається договором у ЄС): щомісячний прогін ≥ 30 хв під навантаженням (≥ 30 % номінальної потужності або мінімальна температура вихлопу); національні норми можуть відрізнятися.', 'NFPA 110 § 8.4.2 (US-Referenz, in der EU oft vertraglich übernommen): monatlich ≥ 30 min unter Last (≥ 30 % Nennleistung oder Mindestabgastemperatur); nationale Regeln können abweichen.', 'NFPA 110 § 8.4.2 (VS-referentie, in de EU vaak contractueel overgenomen): maandelijks ≥ 30 min onder belasting (≥ 30 % nominaal vermogen of minimale uitlaattemperatuur); nationale regels kunnen afwijken.', 'NFPA 110 § 8.4.2 (référence US, souvent reprise contractuellement dans l’UE) : essai mensuel ≥ 30 min en charge (≥ 30 % de la puissance nominale ou température d’échappement minimale) ; règles nationales possibles.', 'NFPA 110 § 8.4.2 (referencia de EE. UU., a menudo adoptada por contrato en la UE): prueba mensual ≥ 30 min en carga (≥ 30 % de la potencia nominal o temperatura mínima de escape); las normas nacionales pueden variar.', 'NFPA 110 § 8.4.2 (odniesienie USA, często przyjmowane umownie w UE): co miesiąc ≥ 30 min pod obciążeniem (≥ 30 % mocy znamionowej lub minimalna temperatura spalin); przepisy krajowe mogą się różnić.'),
    source: 'nfpa110' })
};

/* =====================================================================================
   CLASSES — equipment class library. typical ranges [lo, mid, hi]; provenance per field in
   class.provenance (source ids). Failure modes after RCM practice (SAE JA1011/JA1012, NASA RCM 2008).
   pf_days and mtbf_y are learning assumptions unless a source says otherwise.
   ===================================================================================== */
function fm(id, name, func, o) {
  return {
    id: id, name: name, 'function': func, evident: o.evident !== false, pattern: o.pattern || 'random',
    safety: !!o.safety, environment: !!o.environment, pf_days: o.pf || null, mtbf_y: o.mtbf,
    techniques: o.tech || [], time_task: o.time || null, ff_task: o.ff || null, statutory: o.statutory || [],
    repair_h: o.repair_h || null, sources: o.sources || ['nasa_rcm_2008', 'la_core']
  };
}
/* classes whose component EN 15459-1:2017 Annex D lists (life set inside its span); all others: ASHRAE whole-unit life only (bw-r1 CR-10) */
var EN15459_ANNEX_D = { pump: 1, fan: 1, fcu: 1, heat_pump: 1, boiler_gas: 1, vrf: 1, water_booster: 1 };
function cls(o) {
  o.provenance = o.provenance || {
    replacement_cost_eur: ['la_core'], mttr_h: ['la_core'], lead_time_days: ['la_core'],
    economic_life_y: EN15459_ANNEX_D[o.id] ? ['ashrae_life', 'en15459_1'] : ['ashrae_life']
  };
  return o;
}

/* shared function strings */
var F_AIR = L('Deliver conditioned air at design flow and temperature', 'Подавати оброблене повітря з проектною витратою і температурою', 'Konditionierte Luft mit Auslegungsvolumenstrom und -temperatur liefern', 'Behandelde lucht leveren met ontwerpdebiet en -temperatuur', 'Fournir l’air traité au débit et à la température de calcul', 'Suministrar aire tratado al caudal y temperatura de diseño', 'Dostarczać powietrze uzdatnione o projektowym przepływie i temperaturze');
var F_PUMP = L('Circulate water at design flow and head', 'Забезпечувати циркуляцію води з проектною витратою і напором', 'Wasser mit Auslegungsvolumenstrom und Förderhöhe umwälzen', 'Water circuleren met ontwerpdebiet en opvoerhoogte', 'Faire circuler l’eau au débit et à la hauteur de calcul', 'Hacer circular el agua al caudal y altura de diseño', 'Tłoczyć wodę z projektowym przepływem i wysokością podnoszenia');
var F_COOL = L('Produce chilled water at set-point and design capacity', 'Виробляти холодну воду з заданою температурою і проектною потужністю', 'Kaltwasser mit Sollwert und Auslegungsleistung erzeugen', 'Koud water leveren op setpoint en ontwerpvermogen', 'Produire l’eau glacée à la consigne et à la puissance nominale', 'Producir agua fría a la consigna y capacidad de diseño', 'Wytwarzać wodę lodową o zadanej temperaturze i mocy projektowej');
var F_HEAT = L('Produce heating water at set-point and design capacity, safely', 'Безпечно виробляти теплоносій із заданою температурою і проектною потужністю', 'Heizwasser mit Sollwert und Auslegungsleistung sicher erzeugen', 'Veilig verwarmingswater leveren op setpoint en ontwerpvermogen', 'Produire l’eau de chauffage à la consigne et à la puissance nominale, en sécurité', 'Producir agua de calefacción a la consigna y capacidad de diseño con seguridad', 'Bezpiecznie wytwarzać wodę grzewczą o zadanej temperaturze i mocy');
var F_UPS = L('Supply critical loads without interruption on mains failure for the design autonomy', 'Живити критичні навантаження без перерви при зникненні мережі протягом проектної автономії', 'Kritische Verbraucher bei Netzausfall unterbrechungsfrei für die Auslegungs-Autonomiezeit versorgen', 'Kritieke belastingen bij netuitval onderbrekingsvrij voeden gedurende de ontwerpautonomie', 'Alimenter sans coupure les charges critiques lors d’une panne secteur pendant l’autonomie prévue', 'Alimentar sin interrupción las cargas críticas ante fallo de red durante la autonomía de diseño', 'Zasilać bez przerwy odbiory krytyczne po zaniku sieci przez projektowy czas autonomii');
var F_GEN = L('Start automatically and carry the emergency/standby load within the required time', 'Автоматично запускатися і приймати аварійне/резервне навантаження за потрібний час', 'Automatisch starten und die Not-/Ersatzlast in der geforderten Zeit übernehmen', 'Automatisch starten en de nood-/reservebelasting binnen de vereiste tijd overnemen', 'Démarrer automatiquement et reprendre la charge de secours dans le délai requis', 'Arrancar automáticamente y asumir la carga de emergencia en el tiempo requerido', 'Uruchomić się automatycznie i przejąć obciążenie awaryjne w wymaganym czasie');
var F_SPR = L('Deliver sprinkler water at design pressure and flow on demand', 'Подавати воду в спринклерну мережу з проектним тиском і витратою за вимогою', 'Im Bedarfsfall Sprinklerwasser mit Auslegungsdruck und -menge liefern', 'Bij aanspraak sprinklerwater leveren met ontwerpdruk en -debiet', 'Fournir l’eau d’extinction à la pression et au débit de calcul sur sollicitation', 'Suministrar agua a los rociadores a la presión y caudal de diseño cuando se requiera', 'Dostarczyć wodę do tryskaczy z projektowym ciśnieniem i wydajnością na żądanie');
var F_EL = L('Illuminate escape routes and signs for the rated duration on mains failure', 'Освітлювати шляхи евакуації і знаки протягом номінального часу при зникненні живлення', 'Rettungswege und Zeichen bei Netzausfall für die Nenndauer beleuchten', 'Vluchtwegen en pictogrammen bij netuitval gedurende de nominale duur verlichten', 'Éclairer les chemins d’évacuation et les signaux pendant l’autonomie assignée', 'Iluminar recorridos de evacuación y señales durante la autonomía nominal', 'Oświetlać drogi ewakuacyjne i znaki przez znamionowy czas po zaniku zasilania');
var F_DHW = L('Store and deliver hot water at ≥ 60 °C (outlets ≥ 50 °C) to control legionella', 'Накопичувати і подавати гарячу воду ≥ 60 °C (на точках ≥ 50 °C) для контролю легіонели', 'Warmwasser mit ≥ 60 °C speichern und verteilen (Zapfstellen ≥ 50 °C) zur Legionellenkontrolle', 'Warm water opslaan en leveren op ≥ 60 °C (tappunten ≥ 50 °C) tegen legionella', 'Stocker et distribuer l’eau chaude à ≥ 60 °C (≥ 50 °C aux points de puisage) contre la légionelle', 'Acumular y distribuir ACS a ≥ 60 °C (puntos ≥ 50 °C) para controlar la legionela', 'Magazynować i dostarczać c.w.u. ≥ 60 °C (punkty ≥ 50 °C) dla kontroli legionelli');
var F_LV = L('Distribute power to outgoing circuits and isolate faults selectively and safely', 'Розподіляти живлення на відхідні лінії та селективно і безпечно відключати пошкодження', 'Energie auf Abgänge verteilen und Fehler selektiv und sicher abschalten', 'Energie verdelen over afgaande groepen en fouten selectief en veilig afschakelen', 'Distribuer l’énergie aux départs et isoler les défauts de façon sélective et sûre', 'Distribuir energía a las salidas y aislar las faltas de forma selectiva y segura', 'Rozdzielać energię na obwody odpływowe i selektywnie, bezpiecznie wyłączać zwarcia');

var F_FAN = L('Move air at design flow against system pressure', 'Переміщувати повітря з проектною витратою проти опору системи', 'Luft mit Auslegungsvolumenstrom gegen den Anlagendruck fördern', 'Lucht verplaatsen met ontwerpdebiet tegen de systeemdruk', 'Déplacer l’air au débit de calcul contre la pression du réseau', 'Mover aire al caudal de diseño contra la presión del sistema', 'Tłoczyć powietrze z projektowym przepływem wbrew oporom instalacji');
var F_CT = L('Reject condenser heat at design approach without creating a legionella hazard', 'Відводити тепло конденсатора з проектним наближенням без ризику легіонели', 'Verflüssigerwärme mit Auslegungskühlgrenzabstand abführen, ohne Legionellengefahr', 'Condensorwarmte afvoeren op ontwerpnadering zonder legionellagevaar', 'Évacuer la chaleur du condenseur à l’approche de calcul sans risque légionelle', 'Disipar el calor del condensador a la aproximación de diseño sin riesgo de legionela', 'Odprowadzać ciepło skraplania przy projektowym zbliżeniu bez zagrożenia legionellą');
var F_HP = L('Deliver heating (and cooling) water at set-point and design capacity', 'Подавати теплоносій (і холодоносій) із заданою температурою і проектною потужністю', 'Heiz- (und Kühl-)wasser mit Sollwert und Auslegungsleistung liefern', 'Verwarmings- (en koel)water leveren op setpoint en ontwerpvermogen', 'Fournir l’eau de chauffage (et de refroidissement) à la consigne et à la puissance nominale', 'Suministrar agua de calefacción (y refrigeración) a la consigna y capacidad de diseño', 'Dostarczać wodę grzewczą (i chłodzącą) o zadanej temperaturze i mocy');
var F_VRF = L('Heat and cool the served rooms at set-point', 'Опалювати і охолоджувати обслуговувані приміщення до заданої температури', 'Versorgte Räume auf Sollwert heizen und kühlen', 'Bediende ruimten verwarmen en koelen op setpoint', 'Chauffer et refroidir les locaux desservis à la consigne', 'Calentar y enfriar los locales servidos a la consigna', 'Ogrzewać i chłodzić obsługiwane pomieszczenia do zadanej temperatury');
var F_FCU = L('Condition the room air locally at set-point', 'Локально підтримувати задану температуру повітря в приміщенні', 'Raumluft lokal auf Sollwert konditionieren', 'Ruimtelucht lokaal op setpoint conditioneren', 'Traiter l’air de la pièce localement à la consigne', 'Acondicionar localmente el aire del local a la consigna', 'Lokalnie uzdatniać powietrze w pomieszczeniu do zadanej temperatury');
var F_BOOST = L('Maintain cold water pressure at all outlets', 'Підтримувати тиск холодної води в усіх точках водорозбору', 'Kaltwasserdruck an allen Entnahmestellen halten', 'Koudwaterdruk op alle tappunten handhaven', 'Maintenir la pression d’eau froide à tous les points de puisage', 'Mantener la presión de agua fría en todos los puntos de consumo', 'Utrzymywać ciśnienie wody zimnej we wszystkich punktach poboru');
var F_FA = L('Detect fire early and warn occupants reliably', 'Рано виявляти пожежу і надійно оповіщати людей', 'Brand früh erkennen und Personen zuverlässig warnen', 'Brand vroeg detecteren en aanwezigen betrouwbaar alarmeren', 'Détecter tôt l’incendie et alerter les occupants de façon fiable', 'Detectar pronto el incendio y avisar con fiabilidad a los ocupantes', 'Wcześnie wykrywać pożar i niezawodnie ostrzegać użytkowników');
var F_TX = L('Transform MV to LV at rated power without overheating', 'Перетворювати СН у НН з номінальною потужністю без перегріву', 'Mittel- auf Niederspannung mit Nennleistung ohne Überhitzung umspannen', 'MS naar LS transformeren op nominaal vermogen zonder oververhitting', 'Transformer la HTA en BT à puissance nominale sans surchauffe', 'Transformar MT a BT a potencia nominal sin sobrecalentamiento', 'Transformować SN na nn z mocą znamionową bez przegrzewania');
var F_BMS = L('Control plant to set-points and schedules, and report alarms', 'Керувати обладнанням за уставками і розкладами та передавати тривоги', 'Anlagen nach Sollwerten und Zeitplänen regeln und Alarme melden', 'Installaties regelen volgens setpoints en tijdschema’s en alarmen melden', 'Piloter les installations selon consignes et horaires et remonter les alarmes', 'Controlar las instalaciones según consignas y horarios y comunicar alarmas', 'Sterować instalacjami wg nastaw i harmonogramów oraz przekazywać alarmy');
var F_LIFT = L('Carry passengers between floors safely and reliably', 'Безпечно і надійно перевозити пасажирів між поверхами', 'Personen sicher und zuverlässig zwischen Geschossen befördern', 'Personen veilig en betrouwbaar tussen verdiepingen vervoeren', 'Transporter les personnes entre les étages en sécurité et de façon fiable', 'Transportar personas entre plantas con seguridad y fiabilidad', 'Bezpiecznie i niezawodnie przewozić osoby między kondygnacjami');

var CLASSES = {
  ahu: cls({ id: 'ahu', system: 'hvac',
    name: L('Air handling unit', 'Припливно-витяжна установка', 'Raumlufttechnisches Gerät (RLT)', 'Luchtbehandelingskast', 'Centrale de traitement d’air', 'Unidad de tratamiento de aire (UTA)', 'Centrala wentylacyjna'),
    typical: { replacement_cost_eur: [25000, 60000, 150000], mttr_h: [4, 12, 48], economic_life_y: [15, 20, 25], lead_time_days: [28, 70, 140] },
    failure_modes: [
      fm('fan_bearing', L('Fan / motor bearing wear', 'Знос підшипників вентилятора / двигуна', 'Lagerverschleiß Ventilator / Motor', 'Lagerslijtage ventilator / motor', 'Usure des roulements ventilateur / moteur', 'Desgaste de rodamientos ventilador / motor', 'Zużycie łożysk wentylatora / silnika'), F_AIR,
        { pattern: 'wearout', pf: [14, 60, 120], mtbf: [5, 10, 20], tech: ['vibration', 'ultrasound_airborne', 'ir_thermography'], repair_h: 6,
          time: L('Re-grease / replace bearings by running hours', 'Змащувати / замінювати підшипники за напрацюванням', 'Lager nach Betriebsstunden nachschmieren / tauschen', 'Lagers op draaiuren smeren / vervangen', 'Graisser / remplacer les roulements selon les heures de marche', 'Engrasar / sustituir rodamientos según horas de funcionamiento', 'Smarować / wymieniać łożyska wg motogodzin') }),
      fm('belt', L('Drive belt wear / slip', 'Знос / проковзування приводного паса', 'Keilriemenverschleiß / -schlupf', 'Slijtage / slip van de aandrijfriem', 'Usure / glissement de la courroie', 'Desgaste / deslizamiento de la correa', 'Zużycie / poślizg paska napędowego'), F_AIR,
        { pattern: 'wearout', pf: [7, 21, 45], mtbf: [1, 2, 4], tech: ['visual_inspection', 'motor_current'], repair_h: 1,
          time: L('Inspect, re-tension and replace belts as a set', 'Оглядати, натягувати і замінювати паси комплектом', 'Riemen prüfen, nachspannen und satzweise tauschen', 'Riemen inspecteren, opspannen en per set vervangen', 'Contrôler, retendre et remplacer les courroies par jeu', 'Inspeccionar, tensar y sustituir las correas por juegos', 'Sprawdzać, napinać i wymieniać paski kompletem') }),
      fm('filter_blinding', L('Filter loading (pressure drop rises)', 'Забруднення фільтрів (зростання перепаду тиску)', 'Filterbeladung (Druckverlust steigt)', 'Filtervervuiling (drukverlies stijgt)', 'Colmatage des filtres (perte de charge en hausse)', 'Colmatación de filtros (aumenta la pérdida de carga)', 'Zabrudzenie filtrów (wzrost oporu)'), F_AIR,
        { pattern: 'wearout', pf: [14, 45, 90], mtbf: [0.3, 0.5, 1], tech: ['dp_trend', 'bms_trend'], repair_h: 1,
          time: L('Replace filters at final pressure drop (or fixed interval if no Δp sensor)', 'Замінювати фільтри при кінцевому перепаді тиску (або за графіком без датчика Δp)', 'Filter bei End-Druckdifferenz tauschen (ohne Δp-Sensor nach Intervall)', 'Filters vervangen bij einddrukverschil (zonder Δp-sensor op interval)', 'Remplacer les filtres à la perte de charge finale (sinon à intervalle fixe)', 'Sustituir filtros a la pérdida de carga final (o a intervalo fijo sin sensor Δp)', 'Wymieniać filtry przy końcowym oporze (bez czujnika Δp — wg interwału)') }),
      fm('frost_protection', L('Frost protection fails to trip', 'Не спрацьовує захист від замерзання', 'Frostschutz löst nicht aus', 'Vorstbeveiliging schakelt niet af', 'La protection antigel ne déclenche pas', 'La protección antihielo no actúa', 'Zabezpieczenie przeciwzamrożeniowe nie zadziała'),
        L('Protect the heating coil against freezing', 'Захищати калорифер від замерзання', 'Heizregister vor Frost schützen', 'Verwarmingsbatterij tegen bevriezing beschermen', 'Protéger la batterie chaude contre le gel', 'Proteger la batería de calor contra la congelación', 'Chronić nagrzewnicę przed zamarznięciem'),
        { evident: false, pattern: 'hidden', mtbf: [5, 10, 20], tech: [], repair_h: 2,
          ff: L('Test frost thermostat trip, damper closure and valve opening before winter', 'Перед зимою перевіряти спрацювання термостата, закриття заслінки і відкриття клапана', 'Vor dem Winter Frostwächter-Auslösung, Klappenschluss und Ventilöffnung prüfen', 'Vóór de winter vorstthermostaat, klepsluiting en ventielopening testen', 'Avant l’hiver, tester le thermostat antigel, la fermeture du volet et l’ouverture de la vanne', 'Antes del invierno, probar termostato antihielo, cierre de compuerta y apertura de válvula', 'Przed zimą sprawdzić zadziałanie termostatu, zamknięcie przepustnicy i otwarcie zaworu') }),
      fm('fire_shutdown', L('Fire-alarm shutdown / smoke damper interlock fails', 'Не спрацьовує відключення від пожежної сигналізації / димова заслінка', 'Brandfallsteuerung / Rauchschutzklappe versagt', 'Brandmeldersturing / rookklep faalt', 'Asservissement incendie / clapet de désenfumage défaillant', 'Falla el paro por alarma de incendio / compuerta de humos', 'Nie działa wyłączenie ppoż. / klapa dymowa'),
        L('Stop the unit and close dampers on fire alarm', 'Зупиняти установку і закривати заслінки за сигналом пожежі', 'Gerät bei Brandalarm abschalten und Klappen schließen', 'Bij brandalarm de kast stoppen en kleppen sluiten', 'Arrêter la centrale et fermer les clapets sur alarme incendie', 'Parar la unidad y cerrar compuertas ante alarma de incendio', 'Zatrzymać centralę i zamknąć klapy po alarmie pożarowym'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: [], repair_h: 3,
          ff: L('Functional test of fire-alarm cause-and-effect for this unit', 'Функціональний тест матриці «пожежа → дія» для установки', 'Funktionsprüfung der Brandfallmatrix für dieses Gerät', 'Functionele test van de brandsturingsmatrix voor deze kast', 'Essai fonctionnel de la matrice incendie pour cette centrale', 'Prueba funcional de la matriz causa-efecto de incendio para esta unidad', 'Test funkcjonalny matrycy sterującej ppoż. dla tej centrali') })
    ],
    statutory: [], trades: ['hvac_mech', 'electrician', 'controls'], sources: ['ashrae_life', 'nasa_rcm_2008', 'doe_om_r3', 'la_core'] }),

  pump: cls({ id: 'pump', system: 'hvac',
    name: L('Circulating pump', 'Циркуляційний насос', 'Umwälzpumpe', 'Circulatiepomp', 'Pompe de circulation', 'Bomba de circulación', 'Pompa obiegowa'),
    typical: { replacement_cost_eur: [2000, 6000, 20000], mttr_h: [2, 6, 24], economic_life_y: [10, 15, 20], lead_time_days: [5, 21, 56] },
    failure_modes: [
      fm('bearing_wear', L('Bearing wear', 'Знос підшипників', 'Lagerverschleiß', 'Lagerslijtage', 'Usure des roulements', 'Desgaste de rodamientos', 'Zużycie łożysk'), F_PUMP,
        { pattern: 'wearout', pf: [14, 60, 120], mtbf: [5, 8, 15], tech: ['vibration', 'ultrasound_airborne', 'ir_thermography'], repair_h: 4,
          time: L('Replace bearings at fixed running hours', 'Замінювати підшипники за напрацюванням', 'Lager nach festen Betriebsstunden tauschen', 'Lagers na vaste draaiuren vervangen', 'Remplacer les roulements à heures fixes', 'Sustituir rodamientos a horas fijas', 'Wymieniać łożyska po ustalonych motogodzinach') }),
      fm('seal_leak', L('Mechanical seal leak', 'Протікання торцевого ущільнення', 'Undichtheit der Gleitringdichtung', 'Lekkage van de mechanische asafdichting', 'Fuite de garniture mécanique', 'Fuga del cierre mecánico', 'Wyciek uszczelnienia mechanicznego'), F_PUMP,
        { pattern: 'random', pf: [7, 30, 90], mtbf: [3, 6, 10], tech: ['visual_inspection'], repair_h: 4 }),
      fm('motor_winding', L('Motor winding insulation failure', 'Пробій ізоляції обмотки двигуна', 'Isolationsfehler der Motorwicklung', 'Isolatiefout motorwikkeling', 'Défaut d’isolement du bobinage moteur', 'Fallo de aislamiento del bobinado del motor', 'Uszkodzenie izolacji uzwojenia silnika'), F_PUMP,
        { pattern: 'random', pf: [30, 90, 180], mtbf: [10, 15, 25], tech: ['insulation_resistance', 'motor_current', 'ir_thermography'], repair_h: 6 }),
      fm('standby_changeover', L('Standby pump / auto-changeover fails on demand', 'Резервний насос / автоматичне перемикання не спрацьовує', 'Reservepumpe / automatische Umschaltung versagt im Bedarfsfall', 'Reservepomp / automatische omschakeling faalt bij aanspraak', 'La pompe de secours / la permutation automatique échoue', 'La bomba de reserva / conmutación automática falla', 'Pompa rezerwowa / automatyczne przełączenie zawodzi'),
        L('Take over the duty when the duty pump fails', 'Перебирати роботу при відмові робочого насоса', 'Bei Ausfall der Betriebspumpe übernehmen', 'Het bedrijf overnemen bij uitval van de bedrijfspomp', 'Prendre le relais si la pompe en service défaille', 'Asumir el servicio si falla la bomba en servicio', 'Przejąć pracę po awarii pompy podstawowej'),
        { evident: false, pattern: 'hidden', mtbf: [5, 10, 20], tech: [], repair_h: 2,
          ff: L('Force a changeover and run the standby pump under load', 'Примусово перемикати і запускати резервний насос під навантаженням', 'Umschaltung erzwingen und Reservepumpe unter Last betreiben', 'Omschakeling forceren en reservepomp onder belasting laten draaien', 'Forcer la permutation et faire tourner la pompe de secours en charge', 'Forzar la conmutación y hacer funcionar la bomba de reserva en carga', 'Wymusić przełączenie i uruchomić pompę rezerwową pod obciążeniem') })
    ],
    statutory: [], trades: ['hvac_mech', 'electrician'], sources: ['ashrae_life', 'en15459_1', 'nasa_rcm_2008', 'la_core'] }),

  chiller_air: cls({ id: 'chiller_air', system: 'hvac',
    name: L('Air-cooled chiller', 'Чилер з повітряним охолодженням', 'Luftgekühlter Kaltwassersatz', 'Luchtgekoelde koelmachine', 'Groupe d’eau glacée à condensation par air', 'Enfriadora condensada por aire', 'Agregat wody lodowej chłodzony powietrzem'),
    typical: { replacement_cost_eur: [60000, 150000, 400000], mttr_h: [8, 24, 120], economic_life_y: [15, 20, 25], lead_time_days: [42, 98, 182] },
    failure_modes: [
      fm('refrigerant_leak', L('Refrigerant leak', 'Витік холодоагенту', 'Kältemittelleckage', 'Koudemiddellekkage', 'Fuite de fluide frigorigène', 'Fuga de refrigerante', 'Wyciek czynnika chłodniczego'), F_COOL,
        { evident: false, pattern: 'random', environment: true, pf: [14, 60, 180], mtbf: [3, 6, 12], tech: ['ultrasound_airborne', 'bms_trend', 'performance_test'], repair_h: 8,
          ff: L('Leak check (detector / indirect method) per F-gas schedule', 'Перевірка на витоки (детектор / непрямий метод) за графіком F-газів', 'Dichtheitskontrolle (Detektor / indirekte Methode) nach F-Gas-Plan', 'Lekcontrole (detector / indirecte methode) volgens F-gassenschema', 'Contrôle d’étanchéité (détecteur / méthode indirecte) selon le calendrier F-gaz', 'Control de fugas (detector / método indirecto) según el calendario de gases F', 'Kontrola szczelności (detektor / metoda pośrednia) wg harmonogramu F-gaz') }),
      fm('compressor', L('Compressor wear / failure', 'Знос / відмова компресора', 'Verdichterverschleiß / -ausfall', 'Slijtage / uitval compressor', 'Usure / défaillance du compresseur', 'Desgaste / fallo del compresor', 'Zużycie / awaria sprężarki'), F_COOL,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [8, 12, 20], tech: ['oil_analysis', 'vibration', 'motor_current', 'performance_test'], repair_h: 24 }),
      fm('condenser_fouling', L('Condenser coil fouling', 'Забруднення конденсатора', 'Verschmutzung des Verflüssigerregisters', 'Vervuiling condensorbatterij', 'Encrassement de la batterie du condenseur', 'Ensuciamiento de la batería del condensador', 'Zabrudzenie wymiennika skraplacza'), F_COOL,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [0.5, 1, 2], tech: ['bms_trend', 'performance_test', 'visual_inspection'], repair_h: 3,
          time: L('Clean condenser coils (before the cooling season)', 'Очищати конденсатор (перед сезоном охолодження)', 'Verflüssiger reinigen (vor der Kühlsaison)', 'Condensor reinigen (vóór het koelseizoen)', 'Nettoyer le condenseur (avant la saison de froid)', 'Limpiar el condensador (antes de la temporada de frío)', 'Czyścić skraplacz (przed sezonem chłodniczym)') }),
      fm('safety_cutout', L('HP/LP safety cut-out fails to act', 'Не спрацьовує реле високого / низького тиску', 'HD/ND-Sicherheitsabschaltung versagt', 'HD/LD-beveiliging schakelt niet af', 'Le pressostat HP/BP de sécurité ne déclenche pas', 'El presostato de seguridad AP/BP no actúa', 'Presostat bezpieczeństwa WC/NC nie zadziała'),
        L('Stop the compressor at unsafe refrigerant pressure', 'Зупиняти компресор при небезпечному тиску холодоагенту', 'Verdichter bei unzulässigem Druck abschalten', 'Compressor stoppen bij onveilige druk', 'Arrêter le compresseur à pression dangereuse', 'Parar el compresor a presión insegura', 'Zatrzymać sprężarkę przy niebezpiecznym ciśnieniu'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: [], repair_h: 2,
          ff: L('Test HP/LP cut-out settings and trip', 'Перевіряти уставки і спрацювання реле тиску', 'Einstellung und Auslösung der Druckwächter prüfen', 'Instelling en uitschakeling drukschakelaars testen', 'Vérifier réglage et déclenchement des pressostats', 'Comprobar ajuste y disparo de los presostatos', 'Sprawdzić nastawy i zadziałanie presostatów') })
    ],
    statutory: ['fgas_leak_5', 'fgas_leak_50', 'fgas_leak_500', 'epbd_ac'], trades: ['hvac_mech', 'electrician', 'specialist_vendor'], sources: ['ashrae_life', 'nasa_rcm_2008', 'fgas_2024_573', 'la_core'] }),

  boiler_gas: cls({ id: 'boiler_gas', system: 'hvac',
    name: L('Gas boiler', 'Газовий котел', 'Gaskessel', 'Gasketel', 'Chaudière gaz', 'Caldera de gas', 'Kocioł gazowy'),
    typical: { replacement_cost_eur: [15000, 40000, 120000], mttr_h: [4, 12, 48], economic_life_y: [15, 20, 30], lead_time_days: [14, 42, 98] },
    failure_modes: [
      fm('combustion_drift', L('Burner / combustion drift (CO, efficiency)', 'Розлагодження пальника / горіння (CO, ККД)', 'Brenner-/Verbrennungsdrift (CO, Wirkungsgrad)', 'Verloop brander / verbranding (CO, rendement)', 'Dérive brûleur / combustion (CO, rendement)', 'Deriva del quemador / combustión (CO, rendimiento)', 'Rozregulowanie palnika / spalania (CO, sprawność)'), F_HEAT,
        { pattern: 'wearout', safety: true, pf: [30, 90, 180], mtbf: [1, 2, 4], tech: ['performance_test', 'bms_trend'], repair_h: 3,
          time: L('Annual service with flue-gas analysis and burner set-up', 'Щорічне ТО з аналізом димових газів і налаштуванням пальника', 'Jährliche Wartung mit Abgasanalyse und Brennereinstellung', 'Jaarlijks onderhoud met rookgasanalyse en branderafstelling', 'Entretien annuel avec analyse de combustion et réglage du brûleur', 'Mantenimiento anual con análisis de humos y ajuste del quemador', 'Coroczny przegląd z analizą spalin i regulacją palnika') }),
      fm('flame_safeguard', L('Flame failure safeguard fails to lock out', 'Не спрацьовує автоматика контролю полум’я', 'Flammenüberwachung verriegelt nicht', 'Vlambeveiliging vergrendelt niet', 'La sécurité de flamme ne se verrouille pas', 'El control de llama no bloquea', 'Zabezpieczenie zaniku płomienia nie blokuje'),
        L('Shut off gas on loss of flame', 'Перекривати газ при згасанні полум’я', 'Gaszufuhr bei Flammenverlust absperren', 'Gastoevoer afsluiten bij vlamverlies', 'Couper le gaz en cas de perte de flamme', 'Cortar el gas ante la pérdida de llama', 'Odciąć gaz po zaniku płomienia'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [15, 30, 60], tech: [], repair_h: 2,
          ff: L('Test flame failure lockout and gas valve proving', 'Перевіряти блокування при згасанні полум’я і герметичність газових клапанів', 'Flammenausfall-Verriegelung und Ventildichtheitskontrolle prüfen', 'Vlamuitvalvergrendeling en klepdichtheidscontrole testen', 'Tester la mise en sécurité sur perte de flamme et le contrôle d’étanchéité des vannes', 'Probar el bloqueo por fallo de llama y la verificación de estanqueidad de válvulas', 'Sprawdzić blokadę przy zaniku płomienia i kontrolę szczelności zaworów') }),
      fm('hx_scaling', L('Heat exchanger scaling / fouling', 'Накип / забруднення теплообмінника', 'Verkalkung / Verschmutzung des Wärmetauschers', 'Ketelsteen / vervuiling warmtewisselaar', 'Entartrage / encrassement de l’échangeur', 'Incrustación / ensuciamiento del intercambiador', 'Kamień / zanieczyszczenie wymiennika'), F_HEAT,
        { pattern: 'wearout', pf: [60, 180, 365], mtbf: [3, 6, 10], tech: ['water_sampling', 'performance_test', 'bms_trend'], repair_h: 8 }),
      fm('safety_valve', L('Pressure relief valve seized', 'Заклинювання запобіжного клапана', 'Sicherheitsventil festgesetzt', 'Overstortventiel vastgezet', 'Soupape de sûreté grippée', 'Válvula de seguridad agarrotada', 'Zawór bezpieczeństwa zablokowany'),
        L('Relieve overpressure safely', 'Безпечно скидати надлишковий тиск', 'Überdruck sicher abblasen', 'Overdruk veilig afblazen', 'Évacuer la surpression en sécurité', 'Aliviar la sobrepresión con seguridad', 'Bezpiecznie zrzucić nadciśnienie'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: [], repair_h: 2,
          ff: L('Ease / inspect safety valve and check discharge pipe', 'Підривати / оглядати запобіжний клапан і перевіряти скидну трубу', 'Sicherheitsventil anlüften / prüfen, Abblaseleitung kontrollieren', 'Overstortventiel lichten / inspecteren en afvoerleiding controleren', 'Soulager / inspecter la soupape et vérifier la conduite d’évacuation', 'Accionar / inspeccionar la válvula y revisar la descarga', 'Podrywać / sprawdzać zawór i przewód wyrzutowy') })
    ],
    statutory: ['epbd_heating'], trades: ['hvac_mech', 'specialist_vendor'], sources: ['ashrae_life', 'en15459_1', 'nasa_rcm_2008', 'epbd_2024_1275', 'la_core'] }),

  ups: cls({ id: 'ups', system: 'electrical',
    name: L('UPS (static)', 'ДБЖ (статичне)', 'USV (statisch)', 'UPS (statisch)', 'ASI (statique)', 'SAI (estático)', 'UPS (statyczny)'),
    typical: { replacement_cost_eur: [15000, 50000, 200000], mttr_h: [2, 8, 48], economic_life_y: [10, 15, 20], lead_time_days: [14, 42, 112] },
    failure_modes: [
      fm('battery_capacity_loss', L('Battery capacity loss (VRLA ageing)', 'Втрата ємності батарей (старіння VRLA)', 'Kapazitätsverlust der Batterie (VRLA-Alterung)', 'Capaciteitsverlies accu (veroudering VRLA)', 'Perte de capacité batterie (vieillissement VRLA)', 'Pérdida de capacidad de batería (envejecimiento VRLA)', 'Utrata pojemności akumulatorów (starzenie VRLA)'), F_UPS,
        { evident: false, pattern: 'wearout', pf: [60, 180, 365], mtbf: [3, 5, 8], tech: ['battery_impedance', 'ir_thermography'], repair_h: 6, sources: ['ieee1188', 'la_core'],
          time: L('Replace battery strings before end of design life (typically 4–5 years for 5-year VRLA)', 'Замінювати батареї до кінця проектного строку (зазвичай 4–5 років для VRLA 5 років)', 'Batteriestränge vor Ende der Gebrauchsdauer tauschen (meist 4–5 Jahre bei 5-Jahres-VRLA)', 'Accustrengen vóór einde ontwerplevensduur vervangen (meestal 4–5 jaar bij 5-jaars VRLA)', 'Remplacer les batteries avant la fin de vie (souvent 4–5 ans pour VRLA 5 ans)', 'Sustituir las baterías antes del fin de vida de diseño (4–5 años para VRLA de 5 años)', 'Wymieniać akumulatory przed końcem żywotności (zwykle 4–5 lat dla VRLA 5-letnich)'),
          ff: L('Discharge (autonomy) test under load', 'Розрядний тест (автономія) під навантаженням', 'Entladetest (Autonomie) unter Last', 'Ontlaadtest (autonomie) onder belasting', 'Essai de décharge (autonomie) en charge', 'Prueba de descarga (autonomía) en carga', 'Test rozładowania (autonomii) pod obciążeniem') }),
      fm('capacitors', L('DC / AC capacitor ageing', 'Старіння конденсаторів DC / AC', 'Alterung der DC-/AC-Kondensatoren', 'Veroudering DC-/AC-condensatoren', 'Vieillissement des condensateurs DC / AC', 'Envejecimiento de condensadores CC / CA', 'Starzenie kondensatorów DC / AC'), F_UPS,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [5, 7, 10], tech: ['ir_thermography', 'performance_test'], repair_h: 6,
          time: L('Replace capacitors at the manufacturer’s interval', 'Замінювати конденсатори з інтервалом виробника', 'Kondensatoren im Herstellerintervall tauschen', 'Condensatoren vervangen volgens fabrieksinterval', 'Remplacer les condensateurs à l’intervalle du constructeur', 'Sustituir condensadores según el intervalo del fabricante', 'Wymieniać kondensatory w interwale producenta') }),
      fm('cooling_fan', L('Cooling fan failure', 'Відмова вентилятора охолодження', 'Ausfall des Kühllüfters', 'Uitval koelventilator', 'Défaillance du ventilateur de refroidissement', 'Fallo del ventilador de refrigeración', 'Awaria wentylatora chłodzącego'), F_UPS,
        { pattern: 'wearout', pf: [14, 45, 90], mtbf: [4, 6, 8], tech: ['bms_trend', 'visual_inspection', 'ultrasound_airborne'], repair_h: 2 }),
      fm('bypass_transfer', L('Static bypass fails to transfer', 'Статичний байпас не перемикає', 'Statischer Bypass schaltet nicht um', 'Statische bypass schakelt niet over', 'Le bypass statique ne bascule pas', 'El bypass estático no conmuta', 'Bypass statyczny nie przełącza'),
        L('Transfer the load to bypass on inverter fault or overload', 'Переводити навантаження на байпас при несправності інвертора або перевантаженні', 'Last bei Wechselrichterfehler oder Überlast auf Bypass schalten', 'Belasting bij omvormerfout of overbelasting naar bypass schakelen', 'Basculer la charge sur bypass en cas de défaut onduleur ou surcharge', 'Transferir la carga al bypass ante fallo del inversor o sobrecarga', 'Przełączyć obciążenie na bypass przy awarii falownika lub przeciążeniu'),
        { evident: false, pattern: 'hidden', mtbf: [10, 20, 40], tech: [], repair_h: 4,
          ff: L('Supervised transfer test to bypass and back', 'Контрольований тест переходу на байпас і назад', 'Überwachter Umschalttest auf Bypass und zurück', 'Begeleide omschakeltest naar bypass en terug', 'Essai supervisé de bascule sur bypass et retour', 'Prueba supervisada de transferencia a bypass y retorno', 'Nadzorowany test przełączenia na bypass i z powrotem') })
    ],
    statutory: [], trades: ['electrician', 'specialist_vendor'], sources: ['ieee1188', 'nasa_rcm_2008', 'la_core'] }),

  generator: cls({ id: 'generator', system: 'electrical',
    name: L('Standby diesel generator', 'Резервний дизель-генератор', 'Netzersatzanlage (Diesel)', 'Noodstroomaggregaat (diesel)', 'Groupe électrogène diesel de secours', 'Grupo electrógeno diésel de emergencia', 'Agregat prądotwórczy diesel (rezerwowy)'),
    typical: { replacement_cost_eur: [40000, 120000, 400000], mttr_h: [4, 24, 96], economic_life_y: [20, 25, 30], lead_time_days: [56, 112, 210] },
    failure_modes: [
      fm('fail_to_start', L('Fails to start (starter battery, starter, fuel supply)', 'Не запускається (стартерна батарея, стартер, подача палива)', 'Startversagen (Starterbatterie, Anlasser, Kraftstoffzufuhr)', 'Start niet (startaccu, startmotor, brandstoftoevoer)', 'Ne démarre pas (batterie, démarreur, alimentation gazole)', 'No arranca (batería, motor de arranque, combustible)', 'Nie uruchamia się (akumulator, rozrusznik, zasilanie paliwem)'), F_GEN,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [2, 5, 10], tech: ['battery_impedance', 'visual_inspection'], repair_h: 3, sources: ['nfpa110', 'nasa_rcm_2008', 'la_core'],
          ff: L('Monthly start and load run; record start time and parameters', 'Щомісячний пуск і прогін під навантаженням; фіксувати час пуску і параметри', 'Monatlicher Start und Lastlauf; Startzeit und Werte protokollieren', 'Maandelijkse start en belastingproef; starttijd en waarden vastleggen', 'Démarrage et essai en charge mensuels ; consigner temps et paramètres', 'Arranque y prueba en carga mensuales; registrar tiempo y parámetros', 'Comiesięczny rozruch i próba pod obciążeniem; zapisać czas i parametry') }),
      fm('fuel_degradation', L('Fuel degradation / water and microbial contamination', 'Деградація палива / вода і мікробне забруднення', 'Kraftstoffalterung / Wasser und mikrobielle Verunreinigung', 'Brandstofveroudering / water en microbiële vervuiling', 'Dégradation du gazole / eau et contamination microbienne', 'Degradación del combustible / agua y contaminación microbiana', 'Degradacja paliwa / woda i skażenie mikrobiologiczne'), F_GEN,
        { evident: false, pattern: 'wearout', pf: [60, 180, 365], mtbf: [2, 4, 8], tech: ['oil_analysis'], repair_h: 6,
          time: L('Annual fuel sampling; polish or replace fuel as indicated', 'Щорічний відбір проб палива; очищення або заміна за результатами', 'Jährliche Kraftstoffprobe; Reinigung oder Austausch nach Befund', 'Jaarlijkse brandstofmonstername; reinigen of vervangen indien nodig', 'Prélèvement annuel du gazole ; filtration ou remplacement selon résultat', 'Muestreo anual del combustible; filtrado o sustitución según resultado', 'Coroczna próbka paliwa; filtracja lub wymiana wg wyników') }),
      fm('engine_wear', L('Engine wear (lubrication, cooling)', 'Знос двигуна (змащення, охолодження)', 'Motorverschleiß (Schmierung, Kühlung)', 'Motorslijtage (smering, koeling)', 'Usure moteur (lubrification, refroidissement)', 'Desgaste del motor (lubricación, refrigeración)', 'Zużycie silnika (smarowanie, chłodzenie)'), F_GEN,
        { pattern: 'wearout', pf: [90, 270, 540], mtbf: [10, 20, 30], tech: ['oil_analysis', 'vibration'], repair_h: 24,
          time: L('Annual service: oil, filters, coolant, belts (or by running hours)', 'Щорічне ТО: масло, фільтри, охолоджувальна рідина, паси (або за напрацюванням)', 'Jährliche Wartung: Öl, Filter, Kühlmittel, Riemen (oder nach Betriebsstunden)', 'Jaarlijks onderhoud: olie, filters, koelvloeistof, riemen (of op draaiuren)', 'Entretien annuel : huile, filtres, liquide de refroidissement, courroies (ou selon heures)', 'Mantenimiento anual: aceite, filtros, refrigerante, correas (o por horas)', 'Coroczny przegląd: olej, filtry, płyn chłodzący, paski (lub wg motogodzin)') }),
      fm('ats_transfer', L('Automatic transfer switch fails to transfer', 'АВР не перемикає', 'Netzumschalter (ATS) schaltet nicht um', 'Automatische omschakelaar schakelt niet om', 'L’inverseur de source automatique ne bascule pas', 'El conmutador automático de transferencia no conmuta', 'Układ SZR nie przełącza'),
        L('Connect the generator to the emergency busbar on mains failure', 'Підключати генератор до аварійних шин при зникненні мережі', 'Aggregat bei Netzausfall auf die Notstromschiene schalten', 'Aggregaat bij netuitval op de noodrail schakelen', 'Raccorder le groupe au jeu de barres de secours en cas de coupure', 'Conectar el grupo al embarrado de emergencia ante fallo de red', 'Podłączyć agregat do szyn awaryjnych po zaniku sieci'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: ['ir_thermography'], repair_h: 4, sources: ['nfpa110', 'la_core'],
          ff: L('Monthly transfer test with the load run', 'Щомісячний тест перемикання разом із прогоном', 'Monatlicher Umschalttest mit dem Lastlauf', 'Maandelijkse omschakeltest met de belastingproef', 'Essai mensuel de bascule avec l’essai en charge', 'Prueba mensual de transferencia con la prueba en carga', 'Comiesięczny test przełączenia z próbą pod obciążeniem') })
    ],
    statutory: ['generator_monthly', 'generator_annual_loadbank'], trades: ['electrician', 'specialist_vendor'], sources: ['nfpa110', 'ashrae_life', 'nasa_rcm_2008', 'la_core'] }),

  sprinkler_pump: cls({ id: 'sprinkler_pump', system: 'fire',
    name: L('Sprinkler pump set', 'Спринклерна насосна установка', 'Sprinklerpumpenanlage', 'Sprinklerpompset', 'Groupe de pompage sprinkler', 'Grupo de bombeo de rociadores', 'Zespół pomp tryskaczowych'),
    typical: { replacement_cost_eur: [30000, 70000, 180000], mttr_h: [4, 24, 96], economic_life_y: [20, 25, 30], lead_time_days: [28, 70, 140] },
    failure_modes: [
      fm('fail_to_start', L('Pump fails to start on pressure drop', 'Насос не запускається при падінні тиску', 'Pumpe startet bei Druckabfall nicht', 'Pomp start niet bij drukval', 'La pompe ne démarre pas sur chute de pression', 'La bomba no arranca por caída de presión', 'Pompa nie uruchamia się przy spadku ciśnienia'), F_SPR,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [3, 8, 15], tech: [], repair_h: 4, sources: ['en12845', 'la_core'],
          ff: L('Weekly automatic start test by opening the test drain', 'Щотижневий тест автоматичного пуску відкриттям випробувального зливу', 'Wöchentlicher automatischer Starttest durch Öffnen der Prüfleitung', 'Wekelijkse automatische starttest door openen van de testafvoer', 'Essai hebdomadaire de démarrage automatique par ouverture de la vidange d’essai', 'Prueba semanal de arranque automático abriendo el drenaje de prueba', 'Cotygodniowa próba automatycznego rozruchu przez otwarcie zaworu testowego') }),
      fm('diesel_driver', L('Diesel driver fails (batteries, fuel, cooling)', 'Відмова дизельного приводу (батареї, паливо, охолодження)', 'Dieselantrieb versagt (Batterien, Kraftstoff, Kühlung)', 'Dieselaandrijving faalt (accu’s, brandstof, koeling)', 'Défaillance du moteur diesel (batteries, gazole, refroidissement)', 'Falla el motor diésel (baterías, combustible, refrigeración)', 'Awaria napędu diesla (akumulatory, paliwo, chłodzenie)'), F_SPR,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [3, 6, 12], tech: ['oil_analysis', 'battery_impedance'], repair_h: 6, sources: ['en12845', 'la_core'],
          ff: L('Weekly diesel run with battery and fuel checks', 'Щотижневий прогін дизеля з перевіркою батарей і палива', 'Wöchentlicher Diesellauf mit Batterie- und Kraftstoffprüfung', 'Wekelijks proefdraaien diesel met controle van accu’s en brandstof', 'Essai hebdomadaire du diesel avec contrôle batteries et gazole', 'Prueba semanal del diésel con control de baterías y combustible', 'Cotygodniowa próba diesla z kontrolą akumulatorów i paliwa') }),
      fm('impeller_wear', L('Pump performance loss (impeller / wear rings)', 'Втрата продуктивності насоса (робоче колесо / ущільнювальні кільця)', 'Leistungsverlust (Laufrad / Spaltringe)', 'Prestatieverlies pomp (waaier / slijtringen)', 'Perte de performance (roue / bagues d’usure)', 'Pérdida de rendimiento (rodete / anillos de desgaste)', 'Spadek wydajności (wirnik / pierścienie uszczelniające)'), F_SPR,
        { pattern: 'wearout', safety: true, pf: [180, 365, 730], mtbf: [10, 15, 25], tech: ['performance_test', 'vibration'], repair_h: 12 }),
      fm('jockey_pump', L('Jockey (pressure maintenance) pump failure', 'Відмова насоса підтримання тиску (жокей-насоса)', 'Ausfall der Druckhaltepumpe (Jockeypumpe)', 'Uitval drukhoudpomp (jockeypomp)', 'Défaillance de la pompe de maintien de pression (jockey)', 'Fallo de la bomba jockey (mantenimiento de presión)', 'Awaria pompy utrzymującej ciśnienie (jockey)'),
        L('Keep the network pressurised without starting the main pump', 'Підтримувати тиск у мережі без пуску основного насоса', 'Netzdruck halten, ohne die Hauptpumpe zu starten', 'Netdruk handhaven zonder de hoofdpomp te starten', 'Maintenir le réseau en pression sans démarrer la pompe principale', 'Mantener la red presurizada sin arrancar la bomba principal', 'Utrzymywać ciśnienie w sieci bez uruchamiania pompy głównej'),
        { pattern: 'random', pf: [7, 30, 60], mtbf: [3, 6, 10], tech: ['bms_trend', 'visual_inspection'], repair_h: 4 })
    ],
    statutory: ['sprinkler_weekly', 'sprinkler_annual'], trades: ['fire', 'electrician'], sources: ['en12845', 'nasa_rcm_2008', 'la_core'] }),

  emergency_lighting: cls({ id: 'emergency_lighting', system: 'electrical',
    name: L('Emergency lighting system', 'Система аварійного освітлення', 'Sicherheitsbeleuchtungsanlage', 'Noodverlichtingsinstallatie', 'Installation d’éclairage de sécurité', 'Sistema de alumbrado de emergencia', 'Instalacja oświetlenia awaryjnego'),
    typical: { replacement_cost_eur: [10000, 35000, 100000], mttr_h: [1, 4, 24], economic_life_y: [10, 15, 20], lead_time_days: [7, 21, 56] },
    failure_modes: [
      fm('battery_duration', L('Battery cannot hold the rated duration', 'Батарея не забезпечує номінальну тривалість', 'Batterie hält die Nenndauer nicht', 'Accu haalt de nominale duur niet', 'La batterie ne tient pas l’autonomie assignée', 'La batería no mantiene la autonomía nominal', 'Akumulator nie utrzymuje znamionowego czasu'), F_EL,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [3, 4, 6], tech: [], repair_h: 0.5, sources: ['en50172', 'la_core'],
          ff: L('Annual full rated-duration discharge test', 'Щорічний розрядний тест на повну номінальну тривалість', 'Jährlicher Entladetest über die volle Nenndauer', 'Jaarlijkse ontlaadtest over de volledige nominale duur', 'Essai annuel de décharge sur toute l’autonomie', 'Prueba anual de descarga de autonomía completa', 'Coroczny test rozładowania przez pełny czas znamionowy') }),
      fm('lamp_driver', L('Lamp / LED driver fails in emergency mode', 'Відмова лампи / драйвера LED в аварійному режимі', 'Leuchtmittel / LED-Treiber versagt im Notbetrieb', 'Lamp / LED-driver faalt in noodbedrijf', 'Lampe / driver LED défaillant en mode secours', 'Falla la lámpara / driver LED en modo emergencia', 'Awaria źródła / zasilacza LED w trybie awaryjnym'), F_EL,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [5, 10, 15], tech: [], repair_h: 0.5, sources: ['en50172', 'la_core'],
          ff: L('Monthly short function test of every luminaire and sign', 'Щомісячний короткий тест кожного світильника і знака', 'Monatlicher Kurztest jeder Leuchte und jedes Zeichens', 'Maandelijkse korte test van elk armatuur en pictogram', 'Essai bref mensuel de chaque luminaire et signal', 'Prueba breve mensual de cada luminaria y señal', 'Comiesięczny krótki test każdej oprawy i znaku') }),
      fm('charger', L('Charging circuit failure', 'Відмова кола заряджання', 'Ausfall der Ladeschaltung', 'Uitval laadcircuit', 'Défaillance du circuit de charge', 'Fallo del circuito de carga', 'Awaria układu ładowania'), F_EL,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [8, 12, 20], tech: ['visual_inspection'], repair_h: 0.5,
          ff: L('Check charge indicators daily/monthly (self-test systems log automatically)', 'Перевіряти індикатори заряду щодня/щомісяця (системи самотестування реєструють автоматично)', 'Ladeanzeigen täglich/monatlich prüfen (Selbsttestsysteme protokollieren automatisch)', 'Laadindicatoren dagelijks/maandelijks controleren (zelftestsystemen loggen automatisch)', 'Vérifier les voyants de charge (les systèmes autotest enregistrent automatiquement)', 'Comprobar los indicadores de carga (los sistemas autotest registran automáticamente)', 'Sprawdzać wskaźniki ładowania (systemy autotestu rejestrują automatycznie)') })
    ],
    statutory: ['emergency_lighting_monthly', 'emergency_lighting_annual'], trades: ['electrician'], sources: ['en50172', 'la_core'] }),

  dhw_calorifier: cls({ id: 'dhw_calorifier', system: 'plumbing',
    name: L('DHW calorifier (legionella risk)', 'Бойлер ГВП (ризик легіонели)', 'Trinkwarmwasserspeicher (Legionellenrisiko)', 'Warmwaterboiler (legionellarisico)', 'Ballon d’ECS (risque légionelle)', 'Acumulador de ACS (riesgo de legionela)', 'Podgrzewacz c.w.u. (ryzyko legionelli)'),
    typical: { replacement_cost_eur: [5000, 15000, 40000], mttr_h: [4, 12, 48], economic_life_y: [15, 20, 25], lead_time_days: [14, 35, 84] },
    failure_modes: [
      fm('low_temperature', L('Stored / circulation temperature below 60/50 °C', 'Температура накопичення / циркуляції нижче 60/50 °C', 'Speicher-/Zirkulationstemperatur unter 60/50 °C', 'Opslag-/circulatietemperatuur onder 60/50 °C', 'Température de stockage / bouclage sous 60/50 °C', 'Temperatura de acumulación / recirculación por debajo de 60/50 °C', 'Temperatura zasobnika / cyrkulacji poniżej 60/50 °C'), F_DHW,
        { evident: false, pattern: 'random', safety: true, pf: [7, 14, 30], mtbf: [1, 3, 6], tech: ['bms_trend', 'water_sampling'], repair_h: 3, sources: ['hse_hsg274_2', 'hse_l8', 'la_core'],
          ff: L('Monthly flow/return and sentinel temperature checks', 'Щомісячна перевірка температури подачі/звороту і контрольних точок', 'Monatliche Vorlauf-/Rücklauf- und Referenzstellenkontrolle', 'Maandelijkse controle aanvoer/retour en referentietappunten', 'Relevé mensuel départ/retour et points sentinelles', 'Control mensual de impulsión/retorno y puntos centinela', 'Comiesięczna kontrola zasilania/powrotu i punktów kontrolnych') }),
      fm('sludge_scale', L('Sludge / scale accumulation in the vessel', 'Накопичення шламу / накипу в баці', 'Schlamm-/Kalkablagerung im Speicher', 'Slib-/kalkophoping in het vat', 'Accumulation de boues / tartre dans le ballon', 'Acumulación de lodos / cal en el depósito', 'Osady / kamień w zbiorniku'), F_DHW,
        { pattern: 'wearout', safety: true, pf: [90, 180, 365], mtbf: [1, 2, 4], tech: ['water_sampling', 'visual_inspection'], repair_h: 4, sources: ['hse_hsg274_2', 'la_core'],
          time: L('Annual inspection and drain-down / descale', 'Щорічний огляд і спорожнення / видалення накипу', 'Jährliche Inspektion und Entleerung / Entkalkung', 'Jaarlijkse inspectie en aftappen / ontkalken', 'Inspection annuelle et vidange / détartrage', 'Inspección anual y vaciado / desincrustación', 'Coroczna inspekcja i opróżnienie / odkamienianie') }),
      fm('circulation_pump', L('Secondary circulation / shunt pump failure', 'Відмова циркуляційного / шунтового насоса ГВП', 'Ausfall der Zirkulations-/Schichtladepumpe', 'Uitval circulatie-/shuntpomp', 'Défaillance de la pompe de bouclage / déstratification', 'Fallo de la bomba de recirculación / antiestratificación', 'Awaria pompy cyrkulacyjnej / mieszającej'), F_DHW,
        { pattern: 'random', safety: true, pf: [7, 21, 60], mtbf: [4, 7, 12], tech: ['bms_trend', 'vibration'], repair_h: 3 }),
      fm('tp_valve', L('Temperature & pressure relief valve seized', 'Заклинювання клапана скидання температури і тиску', 'Temperatur-/Druckbegrenzungsventil festgesetzt', 'Temperatuur-/drukveiligheidsklep vastgezet', 'Soupape température/pression grippée', 'Válvula de seguridad de temperatura/presión agarrotada', 'Zawór bezpieczeństwa temperatury/ciśnienia zablokowany'),
        L('Relieve overpressure / overtemperature safely', 'Безпечно скидати надлишковий тиск / температуру', 'Überdruck / Übertemperatur sicher abbauen', 'Overdruk / overtemperatuur veilig afvoeren', 'Évacuer surpression / surchauffe en sécurité', 'Aliviar sobrepresión / sobretemperatura con seguridad', 'Bezpiecznie zrzucić nadciśnienie / nadmierną temperaturę'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: [], repair_h: 1.5,
          ff: L('Manually operate the relief valve and check discharge', 'Вручну спрацьовувати клапан і перевіряти скидання', 'Ventil manuell anlüften und Ablauf prüfen', 'Klep handmatig lichten en afvoer controleren', 'Actionner manuellement la soupape et vérifier l’évacuation', 'Accionar manualmente la válvula y comprobar la descarga', 'Ręcznie poderwać zawór i sprawdzić odpływ') })
    ],
    statutory: ['legionella_sentinel', 'legionella_calorifier_annual'], trades: ['plumber', 'hvac_mech'], sources: ['hse_l8', 'hse_hsg274_2', 'ashrae_life', 'la_core'] }),

  lv_switchboard: cls({ id: 'lv_switchboard', system: 'electrical',
    name: L('LV main switchboard', 'Головний розподільний щит НН', 'NS-Hauptverteilung', 'LS-hoofdverdeelinrichting', 'TGBT (tableau général basse tension)', 'Cuadro general de baja tensión', 'Rozdzielnica główna nn'),
    typical: { replacement_cost_eur: [40000, 120000, 400000], mttr_h: [4, 24, 168], economic_life_y: [25, 30, 40], lead_time_days: [56, 112, 210] },
    failure_modes: [
      fm('connection_overheat', L('Loose / overheating connection', 'Ослаблене / перегріте з’єднання', 'Lockere / überhitzte Verbindung', 'Losse / oververhitte verbinding', 'Connexion desserrée / en surchauffe', 'Conexión floja / sobrecalentada', 'Luźne / przegrzane połączenie'), F_LV,
        { pattern: 'wearout', safety: true, pf: [30, 90, 365], mtbf: [5, 10, 20], tech: ['ir_thermography', 'ultrasound_airborne'], repair_h: 4, sources: ['nfpa70b', 'nasa_rcm_2008', 'la_core'],
          time: L('Re-torque connections during a planned shutdown', 'Підтягувати з’єднання під час планового відключення', 'Verbindungen bei geplanter Abschaltung nachziehen', 'Verbindingen natrekken tijdens geplande afschakeling', 'Resserrer les connexions lors d’une coupure programmée', 'Reapretar conexiones durante una parada programada', 'Dokręcać połączenia podczas planowego wyłączenia') }),
      fm('breaker_no_trip', L('Circuit breaker fails to trip', 'Автоматичний вимикач не спрацьовує', 'Leistungsschalter löst nicht aus', 'Vermogensschakelaar schakelt niet af', 'Le disjoncteur ne déclenche pas', 'El interruptor automático no dispara', 'Wyłącznik nie wyzwala'),
        L('Clear faults selectively', 'Селективно відключати пошкодження', 'Fehler selektiv abschalten', 'Fouten selectief afschakelen', 'Éliminer les défauts sélectivement', 'Despejar faltas de forma selectiva', 'Selektywnie wyłączać zwarcia'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [20, 40, 80], tech: [], repair_h: 4, sources: ['nfpa70b', 'la_core'],
          ff: L('Exercise breakers and test trip units (secondary injection) during shutdown', 'Перемикати вимикачі і перевіряти розчіплювачі (вторинна інжекція) під час відключення', 'Schalter betätigen und Auslöser prüfen (Sekundäreinspeisung) bei Abschaltung', 'Schakelaars bedienen en beveiligingen testen (secundaire injectie) tijdens afschakeling', 'Manoeuvrer les disjoncteurs et tester les déclencheurs (injection secondaire) à l’arrêt', 'Maniobrar los interruptores y probar los relés (inyección secundaria) en parada', 'Przełączać wyłączniki i badać wyzwalacze (wymuszenie wtórne) podczas wyłączenia') }),
      fm('insulation', L('Insulation degradation / tracking', 'Деградація ізоляції / поверхневі розряди', 'Isolationsalterung / Kriechströme', 'Isolatieveroudering / kruipstromen', 'Dégradation de l’isolement / cheminement', 'Degradación del aislamiento / descargas superficiales', 'Degradacja izolacji / upływy powierzchniowe'), F_LV,
        { pattern: 'wearout', safety: true, pf: [90, 365, 730], mtbf: [20, 30, 50], tech: ['insulation_resistance', 'ultrasound_airborne', 'ir_thermography'], repair_h: 12 }),
      fm('spd_end_of_life', L('Surge protective device at end of life', 'Пристрій захисту від перенапруг вичерпав ресурс', 'Überspannungsschutz am Lebensende', 'Overspanningsbeveiliging aan einde levensduur', 'Parafoudre en fin de vie', 'Protector contra sobretensiones al final de su vida', 'Ogranicznik przepięć zużyty'),
        L('Limit transient overvoltages', 'Обмежувати імпульсні перенапруги', 'Transiente Überspannungen begrenzen', 'Transiënte overspanningen begrenzen', 'Limiter les surtensions transitoires', 'Limitar las sobretensiones transitorias', 'Ograniczać przepięcia przejściowe'),
        { evident: false, pattern: 'hidden', mtbf: [5, 10, 20], tech: ['visual_inspection'], repair_h: 1,
          ff: L('Check SPD status indicators', 'Перевіряти індикатори стану ПЗІП', 'Statusanzeigen der Überspannungsableiter prüfen', 'Statusindicatoren overspanningsbeveiliging controleren', 'Contrôler les voyants d’état des parafoudres', 'Comprobar los indicadores de estado de los protectores', 'Sprawdzać wskaźniki stanu ograniczników') })
    ],
    statutory: [], trades: ['electrician', 'specialist_vendor'], sources: ['nfpa70b', 'ashrae_life', 'nasa_rcm_2008', 'la_core'] }),

  fan: cls({ id: 'fan', system: 'hvac',
    name: L('Supply / extract fan', 'Припливний / витяжний вентилятор', 'Zu-/Abluftventilator', 'Toevoer-/afzuigventilator', 'Ventilateur de soufflage / d’extraction', 'Ventilador de impulsión / extracción', 'Wentylator nawiewny / wywiewny'),
    typical: { replacement_cost_eur: [3000, 10000, 30000], mttr_h: [2, 6, 24], economic_life_y: [15, 20, 25], lead_time_days: [7, 28, 70] },
    failure_modes: [
      fm('bearing_wear', L('Bearing wear', 'Знос підшипників', 'Lagerverschleiß', 'Lagerslijtage', 'Usure des roulements', 'Desgaste de rodamientos', 'Zużycie łożysk'), F_FAN,
        { pattern: 'wearout', pf: [14, 60, 120], mtbf: [5, 10, 20], tech: ['vibration', 'ultrasound_airborne', 'ir_thermography'], repair_h: 4,
          time: L('Re-grease / replace bearings by running hours', 'Змащувати / замінювати підшипники за напрацюванням', 'Lager nach Betriebsstunden nachschmieren / tauschen', 'Lagers op draaiuren smeren / vervangen', 'Graisser / remplacer les roulements selon les heures de marche', 'Engrasar / sustituir rodamientos según horas de funcionamiento', 'Smarować / wymieniać łożyska wg motogodzin') }),
      fm('impeller_imbalance', L('Impeller fouling / imbalance', 'Забруднення / дисбаланс робочого колеса', 'Laufradverschmutzung / Unwucht', 'Vervuiling / onbalans waaier', 'Encrassement / balourd de la roue', 'Suciedad / desequilibrio del rodete', 'Zabrudzenie / niewyważenie wirnika'), F_FAN,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [3, 6, 10], tech: ['vibration', 'visual_inspection'], repair_h: 4,
          time: L('Clean impeller (kitchen / dusty extract)', 'Очищати робоче колесо (кухонна / запилена витяжка)', 'Laufrad reinigen (Küchen-/Staubabluft)', 'Waaier reinigen (keuken-/stoffige afzuiging)', 'Nettoyer la roue (extraction cuisine / poussiéreuse)', 'Limpiar el rodete (extracción de cocina / polvorienta)', 'Czyścić wirnik (wyciąg kuchenny / zapylony)') }),
      fm('belt_wear', L('Drive belt wear / slip', 'Знос / проковзування приводного паса', 'Keilriemenverschleiß / -schlupf', 'Slijtage / slip van de aandrijfriem', 'Usure / glissement de la courroie', 'Desgaste / deslizamiento de la correa', 'Zużycie / poślizg paska napędowego'), F_FAN,
        { pattern: 'wearout', pf: [7, 21, 45], mtbf: [1, 2, 4], tech: ['visual_inspection', 'motor_current'], repair_h: 1,
          time: L('Inspect, re-tension and replace belts as a set', 'Оглядати, натягувати і замінювати паси комплектом', 'Riemen prüfen, nachspannen und satzweise tauschen', 'Riemen inspecteren, opspannen en per set vervangen', 'Contrôler, retendre et remplacer les courroies par jeu', 'Inspeccionar, tensar y sustituir las correas por juegos', 'Sprawdzać, napinać i wymieniać paski kompletem') }),
      fm('motor_winding', L('Motor winding insulation failure', 'Пробій ізоляції обмотки двигуна', 'Isolationsfehler der Motorwicklung', 'Isolatiefout motorwikkeling', 'Défaut d’isolement du bobinage moteur', 'Fallo de aislamiento del bobinado del motor', 'Uszkodzenie izolacji uzwojenia silnika'), F_FAN,
        { pattern: 'random', pf: [30, 90, 180], mtbf: [10, 15, 25], tech: ['insulation_resistance', 'motor_current', 'ir_thermography'], repair_h: 6 })
    ],
    statutory: [], trades: ['hvac_mech', 'electrician'], sources: ['ashrae_life', 'en15459_1', 'nasa_rcm_2008', 'la_core'] }),

  chiller_water: cls({ id: 'chiller_water', system: 'hvac',
    name: L('Water-cooled chiller', 'Чилер з водяним охолодженням', 'Wassergekühlter Kaltwassersatz', 'Watergekoelde koelmachine', 'Groupe d’eau glacée à condensation par eau', 'Enfriadora condensada por agua', 'Agregat wody lodowej chłodzony wodą'),
    typical: { replacement_cost_eur: [100000, 250000, 600000], mttr_h: [8, 24, 168], economic_life_y: [20, 23, 30], lead_time_days: [56, 112, 210] },
    failure_modes: [
      fm('refrigerant_leak', L('Refrigerant leak', 'Витік холодоагенту', 'Kältemittelleckage', 'Koudemiddellekkage', 'Fuite de fluide frigorigène', 'Fuga de refrigerante', 'Wyciek czynnika chłodniczego'), F_COOL,
        { evident: false, pattern: 'random', environment: true, pf: [14, 60, 180], mtbf: [4, 8, 15], tech: ['ultrasound_airborne', 'bms_trend', 'performance_test'], repair_h: 8,
          ff: L('Leak check (detector / indirect method) per F-gas schedule', 'Перевірка на витоки (детектор / непрямий метод) за графіком F-газів', 'Dichtheitskontrolle (Detektor / indirekte Methode) nach F-Gas-Plan', 'Lekcontrole (detector / indirecte methode) volgens F-gassenschema', 'Contrôle d’étanchéité (détecteur / méthode indirecte) selon le calendrier F-gaz', 'Control de fugas (detector / método indirecto) según el calendario de gases F', 'Kontrola szczelności (detektor / metoda pośrednia) wg harmonogramu F-gaz') }),
      fm('compressor_bearing', L('Compressor bearing / lubrication wear', 'Знос підшипників / змащення компресора', 'Verdichterlager-/Schmierungsverschleiß', 'Slijtage compressorlagers / smering', 'Usure des paliers / de la lubrification du compresseur', 'Desgaste de cojinetes / lubricación del compresor', 'Zużycie łożysk / smarowania sprężarki'), F_COOL,
        { pattern: 'wearout', pf: [60, 180, 365], mtbf: [10, 15, 25], tech: ['oil_analysis', 'vibration', 'motor_current'], repair_h: 48 }),
      fm('condenser_fouling', L('Condenser tube fouling / scaling', 'Забруднення / накип у трубках конденсатора', 'Verschmutzung / Verkalkung der Verflüssigerrohre', 'Vervuiling / kalkaanslag condensorpijpen', 'Encrassement / entartrage des tubes du condenseur', 'Ensuciamiento / incrustación de los tubos del condensador', 'Zanieczyszczenie / kamień w rurach skraplacza'), F_COOL,
        { pattern: 'wearout', pf: [60, 120, 365], mtbf: [1, 2, 4], tech: ['bms_trend', 'performance_test', 'water_sampling'], repair_h: 8,
          time: L('Brush condenser tubes and review water treatment yearly', 'Щорічно чистити трубки конденсатора і перевіряти водопідготовку', 'Verflüssigerrohre jährlich bürsten, Wasseraufbereitung prüfen', 'Condensorpijpen jaarlijks borstelen, waterbehandeling controleren', 'Ramoner les tubes du condenseur et revoir le traitement d’eau chaque année', 'Cepillar los tubos del condensador y revisar el tratamiento de agua cada año', 'Co roku czyścić rury skraplacza i sprawdzać uzdatnianie wody') }),
      fm('safety_cutout', L('HP/LP safety cut-out fails to act', 'Не спрацьовує реле високого / низького тиску', 'HD/ND-Sicherheitsabschaltung versagt', 'HD/LD-beveiliging schakelt niet af', 'Le pressostat HP/BP de sécurité ne déclenche pas', 'El presostato de seguridad AP/BP no actúa', 'Presostat bezpieczeństwa WC/NC nie zadziała'),
        L('Stop the compressor at unsafe refrigerant pressure', 'Зупиняти компресор при небезпечному тиску холодоагенту', 'Verdichter bei unzulässigem Druck abschalten', 'Compressor stoppen bij onveilige druk', 'Arrêter le compresseur à pression dangereuse', 'Parar el compresor a presión insegura', 'Zatrzymać sprężarkę przy niebezpiecznym ciśnieniu'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [10, 20, 40], tech: [], repair_h: 2,
          ff: L('Test HP/LP cut-out settings and trip', 'Перевіряти уставки і спрацювання реле тиску', 'Einstellung und Auslösung der Druckwächter prüfen', 'Instelling en uitschakeling drukschakelaars testen', 'Vérifier réglage et déclenchement des pressostats', 'Comprobar ajuste y disparo de los presostatos', 'Sprawdzić nastawy i zadziałanie presostatów') })
    ],
    statutory: ['fgas_leak_5', 'fgas_leak_50', 'fgas_leak_500', 'epbd_ac'], trades: ['hvac_mech', 'specialist_vendor'], sources: ['ashrae_life', 'nasa_rcm_2008', 'fgas_2024_573', 'la_core'] }),

  cooling_tower: cls({ id: 'cooling_tower', system: 'hvac',
    name: L('Open cooling tower (evaporative)', 'Відкрита (випарна) градирня', 'Offener Verdunstungskühlturm', 'Open (verdampings)koeltoren', 'Tour aéroréfrigérante ouverte', 'Torre de refrigeración abierta (evaporativa)', 'Otwarta (wyparna) wieża chłodnicza'),
    typical: { replacement_cost_eur: [20000, 60000, 200000], mttr_h: [4, 24, 96], economic_life_y: [15, 20, 25], lead_time_days: [28, 70, 140] },
    failure_modes: [
      fm('legionella_growth', L('Water treatment failure — legionella proliferation', 'Збій водопідготовки — розмноження легіонели', 'Versagen der Wasseraufbereitung — Legionellenvermehrung', 'Falen waterbehandeling — legionellagroei', 'Défaillance du traitement d’eau — prolifération de légionelles', 'Fallo del tratamiento de agua: proliferación de legionela', 'Awaria uzdatniania wody — namnażanie legionelli'), F_CT,
        { evident: false, pattern: 'random', safety: true, pf: [7, 14, 30], mtbf: [1, 2, 5], tech: ['water_sampling', 'bms_trend'], repair_h: 8, sources: ['hse_hsg274_1', 'hse_l8', 'la_core'],
          ff: L('Routine microbiological and water-treatment checks; periodic legionella sampling', 'Регулярний мікробіологічний контроль і контроль водопідготовки; періодичний відбір проб на легіонелу', 'Regelmäßige mikrobiologische und Wasseraufbereitungskontrollen; periodische Legionellenproben', 'Routinematige microbiologische en waterbehandelingscontroles; periodieke legionellabemonstering', 'Contrôles microbiologiques et de traitement d’eau réguliers ; prélèvements légionelles périodiques', 'Controles microbiológicos y de tratamiento de agua; muestreo periódico de legionela', 'Regularne kontrole mikrobiologiczne i uzdatniania; okresowe badania na legionellę') }),
      fm('fill_fouling', L('Fill / basin fouling and scaling', 'Забруднення / накип зрошувача і чаші', 'Verschmutzung / Verkalkung von Rieseleinbauten und Becken', 'Vervuiling / kalkaanslag pakking en bassin', 'Encrassement / entartrage du garnissage et du bassin', 'Ensuciamiento / incrustación del relleno y la balsa', 'Zanieczyszczenie / kamień wypełnienia i niecki'), F_CT,
        { pattern: 'wearout', safety: true, pf: [60, 120, 270], mtbf: [0.5, 1, 2], tech: ['visual_inspection', 'performance_test', 'bms_trend'], repair_h: 12, sources: ['hse_hsg274_1', 'la_core'],
          time: L('Clean and disinfect the tower (at least yearly, more often if indicated)', 'Чистити і дезінфікувати градирню (щонайменше щорічно, частіше за потреби)', 'Kühlturm reinigen und desinfizieren (mindestens jährlich, bei Bedarf häufiger)', 'Koeltoren reinigen en desinfecteren (minstens jaarlijks, vaker indien nodig)', 'Nettoyer et désinfecter la tour (au moins annuellement, plus souvent si nécessaire)', 'Limpiar y desinfectar la torre (al menos anualmente, más si es necesario)', 'Czyścić i dezynfekować wieżę (co najmniej raz w roku, częściej w razie potrzeby)') }),
      fm('fan_gearbox', L('Fan gearbox / bearing wear', 'Знос редуктора / підшипників вентилятора', 'Verschleiß Ventilatorgetriebe / -lager', 'Slijtage ventilatortandwielkast / lagers', 'Usure du réducteur / des roulements du ventilateur', 'Desgaste del reductor / rodamientos del ventilador', 'Zużycie przekładni / łożysk wentylatora'), F_CT,
        { pattern: 'wearout', pf: [30, 120, 270], mtbf: [5, 10, 15], tech: ['oil_analysis', 'vibration'], repair_h: 12 }),
      fm('drift_eliminator', L('Drift eliminator damaged / displaced', 'Пошкоджений / зміщений краплевловлювач', 'Tropfenabscheider beschädigt / verschoben', 'Druppelvanger beschadigd / verschoven', 'Séparateur de gouttelettes endommagé / déplacé', 'Separador de gotas dañado / desplazado', 'Odkraplacz uszkodzony / przesunięty'),
        L('Limit aerosol drift from the tower', 'Обмежувати винесення аерозолю з градирні', 'Aerosolaustrag aus dem Kühlturm begrenzen', 'Aerosoluitworp uit de koeltoren beperken', 'Limiter l’entraînement d’aérosols', 'Limitar el arrastre de aerosoles de la torre', 'Ograniczać unoszenie aerozolu z wieży'),
        { evident: false, pattern: 'wearout', safety: true, pf: [30, 90, 180], mtbf: [3, 6, 10], tech: ['visual_inspection'], repair_h: 4,
          ff: L('Inspect drift eliminators at every cleaning', 'Оглядати краплевловлювачі під час кожного чищення', 'Tropfenabscheider bei jeder Reinigung prüfen', 'Druppelvangers bij elke reiniging inspecteren', 'Inspecter les séparateurs à chaque nettoyage', 'Inspeccionar los separadores en cada limpieza', 'Sprawdzać odkraplacze przy każdym czyszczeniu') })
    ],
    statutory: ['ct_water_monitoring', 'ct_legionella_sampling', 'ct_clean_disinfect'], trades: ['hvac_mech', 'specialist_vendor'], sources: ['hse_l8', 'hse_hsg274_1', 'ashrae_life', 'la_core'] }),

  heat_pump: cls({ id: 'heat_pump', system: 'hvac',
    name: L('Air-to-water heat pump', 'Тепловий насос «повітря–вода»', 'Luft/Wasser-Wärmepumpe', 'Lucht/water-warmtepomp', 'Pompe à chaleur air/eau', 'Bomba de calor aire-agua', 'Pompa ciepła powietrze–woda'),
    typical: { replacement_cost_eur: [15000, 50000, 150000], mttr_h: [4, 12, 72], economic_life_y: [15, 18, 20], lead_time_days: [28, 70, 140] },
    failure_modes: [
      fm('refrigerant_leak', L('Refrigerant leak', 'Витік холодоагенту', 'Kältemittelleckage', 'Koudemiddellekkage', 'Fuite de fluide frigorigène', 'Fuga de refrigerante', 'Wyciek czynnika chłodniczego'), F_HP,
        { evident: false, pattern: 'random', environment: true, pf: [14, 60, 180], mtbf: [4, 8, 15], tech: ['bms_trend', 'performance_test', 'ultrasound_airborne'], repair_h: 6,
          ff: L('Leak check (detector / indirect method) per F-gas schedule', 'Перевірка на витоки (детектор / непрямий метод) за графіком F-газів', 'Dichtheitskontrolle (Detektor / indirekte Methode) nach F-Gas-Plan', 'Lekcontrole (detector / indirecte methode) volgens F-gassenschema', 'Contrôle d’étanchéité (détecteur / méthode indirecte) selon le calendrier F-gaz', 'Control de fugas (detector / método indirecto) según el calendario de gases F', 'Kontrola szczelności (detektor / metoda pośrednia) wg harmonogramu F-gaz') }),
      fm('compressor', L('Compressor wear / failure', 'Знос / відмова компресора', 'Verdichterverschleiß / -ausfall', 'Slijtage / uitval compressor', 'Usure / défaillance du compresseur', 'Desgaste / fallo del compresor', 'Zużycie / awaria sprężarki'), F_HP,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [8, 12, 18], tech: ['motor_current', 'vibration', 'performance_test'], repair_h: 16 }),
      fm('defrost_fault', L('Defrost / evaporator icing fault', 'Несправність відтавання / обмерзання випарника', 'Abtaustörung / Vereisung des Verdampfers', 'Ontdooistoring / ijsvorming verdamper', 'Défaut de dégivrage / givrage de l’évaporateur', 'Fallo de desescarche / congelación del evaporador', 'Usterka odszraniania / oblodzenie parownika'), F_HP,
        { pattern: 'random', pf: [3, 7, 21], mtbf: [3, 6, 10], tech: ['bms_trend', 'visual_inspection'], repair_h: 3 }),
      fm('coil_fouling', L('Outdoor coil fouling', 'Забруднення зовнішнього теплообмінника', 'Verschmutzung des Außenregisters', 'Vervuiling buitenbatterij', 'Encrassement de la batterie extérieure', 'Ensuciamiento de la batería exterior', 'Zabrudzenie wymiennika zewnętrznego'), F_HP,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [0.5, 1, 2], tech: ['visual_inspection', 'bms_trend', 'performance_test'], repair_h: 2,
          time: L('Clean outdoor coil yearly', 'Щорічно очищати зовнішній теплообмінник', 'Außenregister jährlich reinigen', 'Buitenbatterij jaarlijks reinigen', 'Nettoyer la batterie extérieure chaque année', 'Limpiar la batería exterior cada año', 'Co roku czyścić wymiennik zewnętrzny') })
    ],
    statutory: ['fgas_leak_5', 'fgas_leak_50', 'fgas_leak_500', 'epbd_heating'], trades: ['hvac_mech', 'electrician', 'specialist_vendor'], sources: ['ashrae_life', 'en15459_1', 'fgas_2024_573', 'la_core'] }),

  vrf: cls({ id: 'vrf', system: 'hvac',
    name: L('VRF system (outdoor unit + indoor units)', 'VRF-система (зовнішній + внутрішні блоки)', 'VRF-System (Außen- + Innengeräte)', 'VRF-systeem (buiten- + binnenunits)', 'Système DRV (groupe extérieur + unités intérieures)', 'Sistema VRF (unidad exterior + unidades interiores)', 'System VRF (jednostka zewnętrzna + wewnętrzne)'),
    typical: { replacement_cost_eur: [20000, 60000, 200000], mttr_h: [4, 12, 72], economic_life_y: [12, 15, 20], lead_time_days: [14, 42, 98] },
    failure_modes: [
      fm('refrigerant_leak', L('Refrigerant leak (long pipework, many joints)', 'Витік холодоагенту (довгі трубопроводи, багато з’єднань)', 'Kältemittelleckage (lange Leitungen, viele Lötstellen)', 'Koudemiddellekkage (lange leidingen, veel verbindingen)', 'Fuite de fluide (réseau long, nombreux raccords)', 'Fuga de refrigerante (tubería larga, muchas uniones)', 'Wyciek czynnika (długie instalacje, wiele połączeń)'), F_VRF,
        { evident: false, pattern: 'random', environment: true, safety: true, pf: [14, 45, 120], mtbf: [3, 6, 12], tech: ['bms_trend', 'ultrasound_airborne', 'performance_test'], repair_h: 8, sources: ['fgas_2024_573', 'en378_4', 'la_core'],
          ff: L('Leak check (detector / indirect method) per F-gas schedule; check room leak detectors (EN 378)', 'Перевірка на витоки за графіком F-газів; перевірка кімнатних детекторів витоків (EN 378)', 'Dichtheitskontrolle nach F-Gas-Plan; Raum-Gaswarngeräte prüfen (EN 378)', 'Lekcontrole volgens F-gassenschema; ruimtelekdetectoren testen (EN 378)', 'Contrôle d’étanchéité selon le calendrier F-gaz ; tester les détecteurs d’ambiance (EN 378)', 'Control de fugas según calendario de gases F; probar los detectores de sala (EN 378)', 'Kontrola szczelności wg harmonogramu F-gaz; test czujników w pomieszczeniach (EN 378)') }),
      fm('compressor', L('Inverter compressor wear / failure', 'Знос / відмова інверторного компресора', 'Verschleiß / Ausfall des Inverterverdichters', 'Slijtage / uitval invertercompressor', 'Usure / défaillance du compresseur inverter', 'Desgaste / fallo del compresor inverter', 'Zużycie / awaria sprężarki inwerterowej'), F_VRF,
        { pattern: 'wearout', pf: [30, 90, 180], mtbf: [8, 12, 18], tech: ['bms_trend', 'performance_test', 'motor_current'], repair_h: 16 }),
      fm('inverter_board', L('Inverter / control board failure', 'Відмова інверторної / керуючої плати', 'Ausfall der Inverter-/Steuerplatine', 'Uitval inverter-/besturingsprint', 'Défaillance de la carte inverter / de commande', 'Fallo de la placa inverter / de control', 'Awaria płyty falownika / sterowania'), F_VRF,
        { pattern: 'random', mtbf: [6, 10, 15], tech: [], repair_h: 4 }),
      fm('condensate_drain', L('Indoor unit condensate drain blocked', 'Засмічення дренажу конденсату внутрішнього блока', 'Kondensatablauf des Innengeräts verstopft', 'Condensafvoer binnenunit verstopt', 'Évacuation des condensats de l’unité intérieure bouchée', 'Desagüe de condensados de la unidad interior obstruido', 'Zatkany odpływ skroplin jednostki wewnętrznej'),
        L('Remove condensate without leaks to the room', 'Відводити конденсат без протікань у приміщення', 'Kondensat ohne Leckage in den Raum abführen', 'Condensaat afvoeren zonder lekkage naar de ruimte', 'Évacuer les condensats sans fuite dans la pièce', 'Evacuar el condensado sin fugas al local', 'Odprowadzać skropliny bez przecieków do pomieszczenia'),
        { pattern: 'wearout', pf: [14, 30, 90], mtbf: [1, 2, 4], tech: ['visual_inspection'], repair_h: 1,
          time: L('Clean filters, drain trays and pumps of indoor units', 'Очищати фільтри, дренажні піддони і насоси внутрішніх блоків', 'Filter, Kondensatwannen und -pumpen der Innengeräte reinigen', 'Filters, lekbakken en condenspompen van binnenunits reinigen', 'Nettoyer filtres, bacs et pompes de relevage des unités intérieures', 'Limpiar filtros, bandejas y bombas de condensados de las unidades interiores', 'Czyścić filtry, tace i pompki skroplin jednostek wewnętrznych') })
    ],
    statutory: ['fgas_leak_5', 'fgas_leak_50', 'fgas_leak_500', 'epbd_ac'], trades: ['hvac_mech', 'specialist_vendor'], sources: ['ashrae_life', 'en15459_1', 'fgas_2024_573', 'la_core'] }),

  fcu: cls({ id: 'fcu', system: 'hvac',
    name: L('Fan coil units (group)', 'Фанкойли (група)', 'Gebläsekonvektoren (Gruppe)', 'Ventilatorconvectoren (groep)', 'Ventilo-convecteurs (groupe)', 'Fancoils (grupo)', 'Klimakonwektory (grupa)'),
    typical: { replacement_cost_eur: [800, 2000, 5000], mttr_h: [1, 3, 8], economic_life_y: [12, 15, 20], lead_time_days: [7, 21, 56] },
    failure_modes: [
      fm('fan_bearing', L('Fan motor / bearing failure', 'Відмова двигуна / підшипників вентилятора', 'Ausfall Lüftermotor / -lager', 'Uitval ventilatormotor / lagers', 'Défaillance moteur / roulements du ventilateur', 'Fallo del motor / rodamientos del ventilador', 'Awaria silnika / łożysk wentylatora'), F_FCU,
        { pattern: 'wearout', pf: [14, 45, 90], mtbf: [8, 12, 20], tech: ['ultrasound_airborne', 'visual_inspection'], repair_h: 2 }),
      fm('filter_blinding', L('Filter blinding', 'Забивання фільтра', 'Filterverstopfung', 'Filterverstopping', 'Colmatage du filtre', 'Colmatación del filtro', 'Zatkanie filtra'), F_FCU,
        { pattern: 'wearout', pf: [14, 45, 90], mtbf: [0.3, 0.5, 1], tech: ['visual_inspection'], repair_h: 0.3,
          time: L('Clean / replace filters (typically 2–4 times a year)', 'Очищати / замінювати фільтри (зазвичай 2–4 рази на рік)', 'Filter reinigen / tauschen (meist 2–4-mal jährlich)', 'Filters reinigen / vervangen (meestal 2–4 keer per jaar)', 'Nettoyer / remplacer les filtres (2 à 4 fois par an en général)', 'Limpiar / sustituir filtros (normalmente 2–4 veces al año)', 'Czyścić / wymieniać filtry (zwykle 2–4 razy w roku)') }),
      fm('condensate_drain', L('Condensate tray / drain blocked', 'Засмічення піддону / дренажу конденсату', 'Kondensatwanne / -ablauf verstopft', 'Lekbak / condensafvoer verstopt', 'Bac / évacuation des condensats bouché', 'Bandeja / desagüe de condensados obstruido', 'Zatkana taca / odpływ skroplin'), F_FCU,
        { pattern: 'wearout', pf: [14, 30, 90], mtbf: [1, 2, 4], tech: ['visual_inspection'], repair_h: 0.5,
          time: L('Clean and disinfect condensate trays yearly', 'Щорічно чистити і дезінфікувати піддони конденсату', 'Kondensatwannen jährlich reinigen und desinfizieren', 'Lekbakken jaarlijks reinigen en desinfecteren', 'Nettoyer et désinfecter les bacs chaque année', 'Limpiar y desinfectar las bandejas cada año', 'Co roku czyścić i dezynfekować tace skroplin') }),
      fm('valve_actuator', L('Control valve / actuator stuck', 'Заклинювання регулювального клапана / приводу', 'Regelventil / Stellantrieb klemmt', 'Regelafsluiter / aandrijving zit vast', 'Vanne de régulation / servomoteur bloqué', 'Válvula de control / actuador agarrotado', 'Zablokowany zawór regulacyjny / siłownik'), F_FCU,
        { pattern: 'random', pf: [7, 30, 90], mtbf: [5, 10, 15], tech: ['bms_trend'], repair_h: 1 })
    ],
    statutory: [], trades: ['hvac_mech', 'controls'], sources: ['ashrae_life', 'en15459_1', 'la_core'] }),

  water_booster: cls({ id: 'water_booster', system: 'plumbing',
    name: L('Cold water booster set', 'Насосна станція підвищення тиску холодної води', 'Trinkwasser-Druckerhöhungsanlage', 'Drinkwater-hydrofoorinstallatie', 'Surpresseur d’eau froide', 'Grupo de presión de agua fría', 'Zestaw hydroforowy wody zimnej'),
    typical: { replacement_cost_eur: [5000, 15000, 40000], mttr_h: [2, 8, 24], economic_life_y: [10, 12, 15], lead_time_days: [7, 28, 70] },
    failure_modes: [
      fm('bearing_wear', L('Pump bearing wear', 'Знос підшипників насоса', 'Lagerverschleiß der Pumpe', 'Lagerslijtage pomp', 'Usure des roulements de pompe', 'Desgaste de rodamientos de la bomba', 'Zużycie łożysk pompy'), F_BOOST,
        { pattern: 'wearout', pf: [14, 60, 120], mtbf: [5, 8, 15], tech: ['vibration', 'ultrasound_airborne'], repair_h: 4 }),
      fm('vessel_membrane', L('Pressure vessel membrane / pre-charge loss (short cycling)', 'Втрата тиску / пошкодження мембрани бака (часті пуски)', 'Membran-/Vordruckverlust des Druckbehälters (Takten)', 'Membraan-/voordrukverlies drukvat (pendelen)', 'Perte de membrane / de prégonflage du réservoir (cycles courts)', 'Pérdida de membrana / precarga del calderín (arranques frecuentes)', 'Utrata membrany / ciśnienia wstępnego zbiornika (częste załączenia)'), F_BOOST,
        { pattern: 'wearout', pf: [14, 45, 120], mtbf: [2, 4, 8], tech: ['bms_trend', 'visual_inspection'], repair_h: 2,
          time: L('Check vessel pre-charge pressure yearly', 'Щорічно перевіряти тиск попереднього заповнення бака', 'Vordruck des Behälters jährlich prüfen', 'Voordruk van het drukvat jaarlijks controleren', 'Vérifier la pression de prégonflage chaque année', 'Comprobar la precarga del calderín cada año', 'Co roku sprawdzać ciśnienie wstępne zbiornika') }),
      fm('vfd_controller', L('Drive / controller failure', 'Відмова частотного перетворювача / контролера', 'Ausfall Frequenzumrichter / Steuerung', 'Uitval frequentieregelaar / besturing', 'Défaillance variateur / régulateur', 'Fallo del variador / controlador', 'Awaria falownika / sterownika'), F_BOOST,
        { pattern: 'random', mtbf: [6, 10, 15], tech: [], repair_h: 3 }),
      fm('standby_changeover', L('Standby pump / auto-changeover fails on demand', 'Резервний насос / автоматичне перемикання не спрацьовує', 'Reservepumpe / automatische Umschaltung versagt im Bedarfsfall', 'Reservepomp / automatische omschakeling faalt bij aanspraak', 'La pompe de secours / la permutation automatique échoue', 'La bomba de reserva / conmutación automática falla', 'Pompa rezerwowa / automatyczne przełączenie zawodzi'),
        L('Take over the duty when the duty pump fails', 'Перебирати роботу при відмові робочого насоса', 'Bei Ausfall der Betriebspumpe übernehmen', 'Het bedrijf overnemen bij uitval van de bedrijfspomp', 'Prendre le relais si la pompe en service défaille', 'Asumir el servicio si falla la bomba en servicio', 'Przejąć pracę po awarii pompy podstawowej'),
        { evident: false, pattern: 'hidden', mtbf: [5, 10, 20], tech: [], repair_h: 2,
          ff: L('Force a changeover and run the standby pump under load', 'Примусово перемикати і запускати резервний насос під навантаженням', 'Umschaltung erzwingen und Reservepumpe unter Last betreiben', 'Omschakeling forceren en reservepomp onder belasting laten draaien', 'Forcer la permutation et faire tourner la pompe de secours en charge', 'Forzar la conmutación y hacer funcionar la bomba de reserva en carga', 'Wymusić przełączenie i uruchomić pompę rezerwową pod obciążeniem') })
    ],
    statutory: [], trades: ['plumber', 'electrician'], sources: ['ashrae_life', 'en15459_1', 'la_core'] }),

  fire_alarm: cls({ id: 'fire_alarm', system: 'fire',
    name: L('Fire detection and alarm system', 'Система пожежної сигналізації', 'Brandmeldeanlage', 'Brandmeldinstallatie', 'Système de détection et d’alarme incendie', 'Sistema de detección y alarma de incendios', 'System sygnalizacji pożaru'),
    typical: { replacement_cost_eur: [20000, 60000, 200000], mttr_h: [1, 4, 24], economic_life_y: [10, 15, 20], lead_time_days: [7, 28, 70] },
    failure_modes: [
      fm('detector_sensitivity', L('Detector contamination / sensitivity drift', 'Забруднення / дрейф чутливості сповіщувачів', 'Melderverschmutzung / Empfindlichkeitsdrift', 'Vervuiling / gevoeligheidsdrift melders', 'Encrassement / dérive de sensibilité des détecteurs', 'Suciedad / deriva de sensibilidad de detectores', 'Zabrudzenie / dryft czułości czujek'), F_FA,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [5, 10, 15], tech: [], repair_h: 0.3, sources: ['bs5839_1', 'la_core'],
          ff: L('Functional test of every detector over each 12-month service cycle', 'Функціональна перевірка кожного сповіщувача протягом кожного 12-місячного циклу обслуговування', 'Funktionsprüfung jedes Melders innerhalb jedes 12-Monats-Wartungszyklus', 'Functietest van elke melder binnen elke onderhoudscyclus van 12 maanden', 'Essai fonctionnel de chaque détecteur sur chaque cycle de maintenance de 12 mois', 'Prueba funcional de cada detector en cada ciclo de mantenimiento de 12 meses', 'Test funkcjonalny każdej czujki w każdym 12-miesięcznym cyklu serwisowym') }),
      fm('panel_battery', L('Standby battery cannot support the alarm load', 'Резервна батарея не забезпечує навантаження тривоги', 'Notstrombatterie kann die Alarmlast nicht tragen', 'Noodaccu kan de alarmbelasting niet dragen', 'La batterie de secours ne tient pas la charge d’alarme', 'La batería de reserva no soporta la carga de alarma', 'Akumulator rezerwowy nie podtrzyma obciążenia alarmowego'), F_FA,
        { evident: false, pattern: 'hidden', safety: true, mtbf: [3, 4, 6], tech: ['battery_impedance'], repair_h: 1, sources: ['bs5839_1', 'la_core'],
          ff: L('Battery load test at each service visit; replace by age', 'Тест батареї під навантаженням на кожному обслуговуванні; заміна за віком', 'Batterie-Lasttest bei jeder Wartung; Austausch nach Alter', 'Accubelastingtest bij elk onderhoud; vervangen op leeftijd', 'Essai de batterie en charge à chaque visite ; remplacement selon l’âge', 'Prueba de batería en carga en cada visita; sustitución por edad', 'Test akumulatora pod obciążeniem przy każdym serwisie; wymiana wg wieku') }),
      fm('sounder_circuit', L('Sounder / call point circuit fault', 'Несправність шлейфу оповіщувачів / ручних сповіщувачів', 'Störung Signalgeber-/Handmelderlinie', 'Storing sirene-/handmeldercircuit', 'Défaut de ligne sirènes / déclencheurs manuels', 'Fallo del circuito de sirenas / pulsadores', 'Usterka linii sygnalizatorów / ROP'), F_FA,
        { pattern: 'random', safety: true, mtbf: [3, 6, 10], tech: [], repair_h: 2 }),
      fm('cause_effect', L('Fire interface outputs fail (doors, AHUs, lifts)', 'Не спрацьовують виходи взаємодії (двері, ППУ, ліфти)', 'Brandfallsteuerungen versagen (Türen, RLT, Aufzüge)', 'Brandsturingen falen (deuren, LBK, liften)', 'Les asservissements incendie échouent (portes, CTA, ascenseurs)', 'Fallan las maniobras de incendio (puertas, UTA, ascensores)', 'Nie działają sterowania ppoż. (drzwi, centrale, dźwigi)'),
        L('Drive fire-safety actions on alarm', 'Виконувати протипожежні дії за сигналом тривоги', 'Brandschutzfunktionen bei Alarm ansteuern', 'Brandveiligheidsacties bij alarm aansturen', 'Commander les fonctions de sécurité incendie sur alarme', 'Activar las funciones de seguridad contra incendios al alarmar', 'Uruchamiać funkcje bezpieczeństwa pożarowego po alarmie'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [5, 10, 20], tech: [], repair_h: 3,
          ff: L('Yearly cause-and-effect test of all interfaces', 'Щорічна перевірка матриці взаємодії всіх інтерфейсів', 'Jährliche Prüfung der Brandfallmatrix aller Schnittstellen', 'Jaarlijkse test van de brandsturingsmatrix van alle koppelingen', 'Essai annuel de la matrice de tous les asservissements', 'Prueba anual de la matriz causa-efecto de todas las interfaces', 'Coroczny test matrycy sterującej wszystkich interfejsów') })
    ],
    statutory: ['fire_alarm_weekly', 'fire_alarm_service'], trades: ['fire', 'electrician'], sources: ['bs5839_1', 'la_core'] }),

  transformer: cls({ id: 'transformer', system: 'electrical',
    name: L('MV/LV distribution transformer', 'Розподільний трансформатор СН/НН', 'Mittelspannungs-Verteiltransformator', 'MS/LS-distributietransformator', 'Transformateur de distribution HTA/BT', 'Transformador de distribución MT/BT', 'Transformator rozdzielczy SN/nn'),
    typical: { replacement_cost_eur: [20000, 50000, 150000], mttr_h: [8, 72, 720], economic_life_y: [25, 30, 40], lead_time_days: [56, 140, 365] },
    failure_modes: [
      fm('insulation_ageing', L('Insulation ageing (oil / paper or cast resin)', 'Старіння ізоляції (масло / папір або литий компаунд)', 'Isolationsalterung (Öl/Papier oder Gießharz)', 'Isolatieveroudering (olie/papier of gietkunsthars)', 'Vieillissement de l’isolation (huile/papier ou résine)', 'Envejecimiento del aislamiento (aceite/papel o resina)', 'Starzenie izolacji (olej/papier lub żywica)'), F_TX,
        { pattern: 'wearout', safety: true, pf: [180, 365, 1095], mtbf: [30, 50, 80], tech: ['oil_analysis', 'ultrasound_airborne', 'insulation_resistance'], repair_h: 72,
          time: L('Oil sampling with dissolved-gas analysis (oil-filled) or partial-discharge survey (cast resin)', 'Відбір проб масла з аналізом розчинених газів (масляні) або контроль часткових розрядів (сухі)', 'Ölprobe mit Gas-in-Öl-Analyse (ölgefüllt) oder Teilentladungsmessung (Gießharz)', 'Oliemonster met opgeloste-gasanalyse (oliegevuld) of deelontladingsmeting (gietkunsthars)', 'Prélèvement d’huile avec analyse des gaz dissous (immergé) ou mesure de décharges partielles (sec)', 'Muestra de aceite con análisis de gases disueltos (en aceite) o medida de descargas parciales (seco)', 'Próbka oleju z analizą gazów rozpuszczonych (olejowy) lub pomiar wyładowań niezupełnych (żywiczny)') }),
      fm('connection_overheat', L('Terminal / connection overheating', 'Перегрів вводів / з’єднань', 'Überhitzung von Anschlüssen', 'Oververhitting aansluitingen', 'Surchauffe des bornes / connexions', 'Sobrecalentamiento de bornes / conexiones', 'Przegrzewanie zacisków / połączeń'), F_TX,
        { pattern: 'wearout', safety: true, pf: [30, 90, 365], mtbf: [10, 20, 30], tech: ['ir_thermography'], repair_h: 6 }),
      fm('temperature_protection', L('Winding temperature / Buchholz protection fails to trip', 'Не спрацьовує захист за температурою обмоток / газове реле', 'Wicklungstemperatur-/Buchholzschutz löst nicht aus', 'Wikkelingtemperatuur-/buchholzbeveiliging schakelt niet af', 'La protection thermique / Buchholz ne déclenche pas', 'La protección térmica / Buchholz no dispara', 'Zabezpieczenie temperaturowe / Buchholza nie zadziała'),
        L('Disconnect the transformer on internal fault or overtemperature', 'Відключати трансформатор при внутрішньому пошкодженні або перегріві', 'Transformator bei innerem Fehler oder Übertemperatur abschalten', 'Transformator afschakelen bij inwendige fout of overtemperatuur', 'Déclencher le transformateur sur défaut interne ou surchauffe', 'Desconectar el transformador ante falta interna o sobretemperatura', 'Wyłączyć transformator przy zwarciu wewnętrznym lub przegrzaniu'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [20, 40, 80], tech: [], repair_h: 4,
          ff: L('Test protection relays and trip circuits during a planned shutdown', 'Перевіряти реле захисту і кола відключення під час планового відключення', 'Schutzrelais und Auslösekreise bei geplanter Abschaltung prüfen', 'Beveiligingsrelais en uitschakelcircuits testen tijdens geplande afschakeling', 'Tester les relais de protection et circuits de déclenchement lors d’une coupure programmée', 'Probar los relés de protección y circuitos de disparo en una parada programada', 'Sprawdzać przekaźniki i obwody wyłączające podczas planowego wyłączenia') })
    ],
    statutory: [], trades: ['electrician', 'specialist_vendor'], sources: ['nfpa70b', 'ashrae_life', 'nasa_rcm_2008', 'la_core'] }),

  bms_controller: cls({ id: 'bms_controller', system: 'controls',
    name: L('BMS controller / outstation (with field sensors)', 'Контролер BMS (з польовими датчиками)', 'GLT-Automationsstation (mit Feldgeräten)', 'GBS-regelaar / onderstation (met veldsensoren)', 'Automate GTB (avec capteurs de terrain)', 'Controlador BMS (con sensores de campo)', 'Sterownik BMS (z czujnikami obiektowymi)'),
    typical: { replacement_cost_eur: [2000, 8000, 30000], mttr_h: [1, 4, 24], economic_life_y: [10, 15, 20], lead_time_days: [7, 28, 84] },
    failure_modes: [
      fm('sensor_drift', L('Sensor drift / miscalibration', 'Дрейф / розкалібрування датчиків', 'Sensordrift / Fehlkalibrierung', 'Sensordrift / miskalibratie', 'Dérive / déréglage des capteurs', 'Deriva / descalibración de sensores', 'Dryft / rozkalibrowanie czujników'), F_BMS,
        { evident: false, pattern: 'wearout', pf: [30, 90, 180], mtbf: [2, 4, 8], tech: ['bms_trend'], repair_h: 1,
          time: L('Verify critical sensors against a calibrated reference yearly', 'Щорічно перевіряти критичні датчики за еталоном', 'Kritische Sensoren jährlich gegen kalibrierte Referenz prüfen', 'Kritieke sensoren jaarlijks tegen een gekalibreerde referentie controleren', 'Vérifier chaque année les capteurs critiques avec une référence étalonnée', 'Verificar cada año los sensores críticos frente a una referencia calibrada', 'Co roku sprawdzać krytyczne czujniki względem wzorca') }),
      fm('controller_hw', L('Controller hardware / power supply failure', 'Відмова апаратної частини / живлення контролера', 'Ausfall der Hardware / Stromversorgung der Station', 'Uitval hardware / voeding van de regelaar', 'Défaillance matérielle / alimentation de l’automate', 'Fallo de hardware / alimentación del controlador', 'Awaria sprzętu / zasilania sterownika'), F_BMS,
        { pattern: 'random', mtbf: [8, 15, 25], tech: [], repair_h: 4 }),
      fm('backup_restore', L('Program / configuration backup missing or not restorable', 'Резервна копія програми / конфігурації відсутня або не відновлюється', 'Programm-/Konfigurationssicherung fehlt oder nicht wiederherstellbar', 'Back-up van programma/configuratie ontbreekt of niet herstelbaar', 'Sauvegarde programme / configuration absente ou non restaurable', 'Copia de seguridad de programa / configuración ausente o no restaurable', 'Brak kopii programu / konfiguracji lub nie da się jej odtworzyć'),
        L('Allow fast recovery after a controller failure', 'Забезпечувати швидке відновлення після відмови контролера', 'Schnelle Wiederherstellung nach Ausfall ermöglichen', 'Snel herstel na uitval van de regelaar mogelijk maken', 'Permettre une reprise rapide après défaillance', 'Permitir una recuperación rápida tras un fallo', 'Umożliwić szybkie odtworzenie po awarii sterownika'),
        { evident: false, pattern: 'hidden', mtbf: [2, 5, 10], tech: [], repair_h: 2,
          ff: L('Yearly backup and test restore on a spare controller', 'Щорічне резервне копіювання і тестове відновлення на запасному контролері', 'Jährliche Sicherung und Test-Wiederherstellung auf Ersatzstation', 'Jaarlijkse back-up en testherstel op een reserveregelaar', 'Sauvegarde annuelle et essai de restauration sur un automate de rechange', 'Copia anual y prueba de restauración en un controlador de repuesto', 'Coroczna kopia i próbne odtworzenie na sterowniku zapasowym') }),
      fm('network_comms', L('Network / communication loss', 'Втрата мережевого зв’язку', 'Netzwerk-/Kommunikationsausfall', 'Netwerk-/communicatieverlies', 'Perte de communication réseau', 'Pérdida de comunicación de red', 'Utrata komunikacji sieciowej'), F_BMS,
        { pattern: 'random', mtbf: [2, 4, 8], tech: ['bms_trend'], repair_h: 2 })
    ],
    statutory: [], trades: ['controls'], sources: ['doe_om_r3', 'ashrae_life', 'la_core'] }),

  lift: cls({ id: 'lift', system: 'electrical',
    name: L('Passenger lift', 'Пасажирський ліфт', 'Personenaufzug', 'Personenlift', 'Ascenseur de personnes', 'Ascensor de pasajeros', 'Dźwig osobowy'),
    typical: { replacement_cost_eur: [60000, 120000, 300000], mttr_h: [2, 8, 72], economic_life_y: [20, 25, 30], lead_time_days: [14, 56, 140] },
    failure_modes: [
      fm('door_operator', L('Door operator / door contact wear', 'Знос приводу / контактів дверей', 'Verschleiß Türantrieb / Türkontakte', 'Slijtage deuraandrijving / deurcontacten', 'Usure de l’opérateur / des contacts de porte', 'Desgaste del operador / contactos de puerta', 'Zużycie napędu / styków drzwi'), F_LIFT,
        { pattern: 'wearout', pf: [14, 45, 120], mtbf: [0.5, 1, 3], tech: ['visual_inspection', 'motor_current'], repair_h: 3,
          time: L('Adjust and lubricate door gear at every routine visit', 'Регулювати і змащувати дверний механізм на кожному візиті', 'Türmechanik bei jeder Wartung einstellen und schmieren', 'Deurmechaniek bij elk onderhoud afstellen en smeren', 'Régler et lubrifier les portes à chaque visite', 'Ajustar y lubricar las puertas en cada visita', 'Regulować i smarować mechanizm drzwi przy każdej wizycie') }),
      fm('rope_wear', L('Suspension rope / belt wear', 'Знос тягових канатів / пасів', 'Verschleiß der Tragseile / -riemen', 'Slijtage draagkabels / -riemen', 'Usure des câbles / courroies de suspension', 'Desgaste de cables / cintas de suspensión', 'Zużycie lin / pasów nośnych'), F_LIFT,
        { pattern: 'wearout', safety: true, pf: [180, 365, 730], mtbf: [10, 15, 20], tech: ['visual_inspection'], repair_h: 24 }),
      fm('safety_gear', L('Brake / safety gear / overspeed governor fails on demand', 'Гальмо / уловлювачі / обмежувач швидкості не спрацьовують', 'Bremse / Fangvorrichtung / Geschwindigkeitsbegrenzer versagt', 'Rem / vanginrichting / snelheidsbegrenzer faalt', 'Frein / parachute / limiteur de vitesse défaillant', 'Freno / paracaídas / limitador de velocidad falla', 'Hamulec / chwytacze / ogranicznik prędkości zawodzi'),
        L('Stop and hold the car safely in an emergency', 'Безпечно зупиняти і утримувати кабіну в аварійній ситуації', 'Fahrkorb im Notfall sicher anhalten und halten', 'De kooi in nood veilig stoppen en vasthouden', 'Arrêter et maintenir la cabine en sécurité en cas d’urgence', 'Detener y retener la cabina con seguridad en emergencia', 'Bezpiecznie zatrzymać i utrzymać kabinę w sytuacji awaryjnej'),
        { evident: false, pattern: 'hidden', safety: true, mtbf: [20, 40, 80], tech: [], repair_h: 8,
          ff: L('Periodic thorough examination with safety gear and brake tests', 'Періодичний технічний огляд із випробуванням уловлювачів і гальма', 'Wiederkehrende Prüfung mit Fangvorrichtungs- und Bremsprobe', 'Periodieke keuring met vang- en remproef', 'Examen périodique avec essais de parachute et de frein', 'Inspección periódica con pruebas de paracaídas y freno', 'Okresowe badanie z próbami chwytaczy i hamulca') }),
      fm('levelling', L('Levelling inaccuracy (trip hazard)', 'Неточне зупинення (ризик спотикання)', 'Ungenaue Haltegenauigkeit (Stolpergefahr)', 'Onnauwkeurig stoppen (struikelgevaar)', 'Mauvaise précision d’arrêt (risque de trébuchement)', 'Nivelación imprecisa (riesgo de tropiezo)', 'Niedokładne zatrzymanie (ryzyko potknięcia)'), F_LIFT,
        { pattern: 'random', safety: true, pf: [7, 30, 90], mtbf: [2, 4, 8], tech: ['visual_inspection'], repair_h: 2 })
    ],
    statutory: ['lift_examination'], trades: ['specialist_vendor'], sources: ['en13015', 'ashrae_life', 'la_core'] })
};

/* =====================================================================================
   TOOLS of the package (for links and module labels)
   ===================================================================================== */
var TOOLS = [
  { id: 'mepcriticality', name: L('Asset Criticality', 'Критичність обладнання', 'Anlagenkritikalität', 'Kriticiteit installaties', 'Criticité des équipements', 'Criticidad de activos', 'Krytyczność urządzeń') },
  { id: 'mepstrategy', name: L('Maintenance Strategy (RCM)', 'Стратегія ТО (RCM)', 'Instandhaltungsstrategie (RCM)', 'Onderhoudsstrategie (RCM)', 'Stratégie de maintenance (RCM)', 'Estrategia de mantenimiento (RCM)', 'Strategia utrzymania (RCM)') },
  { id: 'mepmonitoring', name: L('Condition Monitoring', 'Моніторинг стану', 'Zustandsüberwachung', 'Conditiebewaking', 'Surveillance d’état', 'Monitorización de condición', 'Monitorowanie stanu') },
  { id: 'mepplanner', name: L('Maintenance Planner', 'Планувальник ТО', 'Wartungsplaner', 'Onderhoudsplanner', 'Planificateur de maintenance', 'Planificador de mantenimiento', 'Planer utrzymania') },
  { id: 'mepspares', name: L('Critical Spares', 'Критичні запчастини', 'Kritische Ersatzteile', 'Kritieke reserveonderdelen', 'Pièces critiques', 'Repuestos críticos', 'Krytyczne części zamienne') },
  { id: 'meplifecycle', name: L('Renewal Planner', 'Планувальник оновлення', 'Erneuerungsplaner', 'Vervangingsplanner', 'Planificateur de renouvellement', 'Planificador de renovación', 'Planer odnowy') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });

/* Condition grade convention of the register (asset.condition): 1 = very good ... 5 = very poor
   (similar in spirit to NEN 2767 / EN 13306 condition assessment; 5 grades kept for simplicity). */
var CONDITION_SCALE = [
  { grade: 1, name: L('very good', 'дуже добрий', 'sehr gut', 'zeer goed', 'très bon', 'muy bueno', 'bardzo dobry') },
  { grade: 2, name: L('good', 'добрий', 'gut', 'goed', 'bon', 'bueno', 'dobry') },
  { grade: 3, name: L('fair', 'задовільний', 'befriedigend', 'redelijk', 'moyen', 'aceptable', 'zadowalający') },
  { grade: 4, name: L('poor', 'поганий', 'schlecht', 'slecht', 'mauvais', 'malo', 'zły') },
  { grade: 5, name: L('very poor', 'дуже поганий', 'sehr schlecht', 'zeer slecht', 'très mauvais', 'muy malo', 'bardzo zły') }
];

/* Statutory task -> failure modes it proves / covers ('class.fm'). Used by MEPStrat to schedule the legal test once
   instead of a duplicate failure-finding task. Links are mirrored into failure_mode.statutory. */
var STAT_COVERS = {
  fgas_leak_5: ['chiller_air.refrigerant_leak', 'chiller_water.refrigerant_leak', 'heat_pump.refrigerant_leak', 'vrf.refrigerant_leak'],
  fgas_leak_50: ['chiller_air.refrigerant_leak', 'chiller_water.refrigerant_leak', 'heat_pump.refrigerant_leak', 'vrf.refrigerant_leak'],
  fgas_leak_500: ['chiller_air.refrigerant_leak', 'chiller_water.refrigerant_leak', 'heat_pump.refrigerant_leak', 'vrf.refrigerant_leak'],
  legionella_sentinel: ['dhw_calorifier.low_temperature'],
  legionella_calorifier_annual: ['dhw_calorifier.sludge_scale'],
  sprinkler_weekly: ['sprinkler_pump.fail_to_start', 'sprinkler_pump.diesel_driver'],
  sprinkler_annual: ['sprinkler_pump.impeller_wear'],
  emergency_lighting_monthly: ['emergency_lighting.lamp_driver', 'emergency_lighting.charger'],
  emergency_lighting_annual: ['emergency_lighting.battery_duration'],
  generator_monthly: ['generator.fail_to_start', 'generator.ats_transfer'],
  generator_annual_loadbank: ['generator.engine_wear'],
  ct_water_monitoring: ['cooling_tower.legionella_growth'],
  ct_legionella_sampling: ['cooling_tower.legionella_growth'],
  ct_clean_disinfect: ['cooling_tower.fill_fouling', 'cooling_tower.drift_eliminator'],
  fire_alarm_weekly: ['fire_alarm.sounder_circuit'],
  fire_alarm_service: ['fire_alarm.detector_sensitivity', 'fire_alarm.panel_battery', 'fire_alarm.cause_effect'],
  lift_examination: ['lift.safety_gear', 'lift.rope_wear'],
  epbd_heating: [], epbd_ac: []
};
function linkStatutory() {
  Object.keys(STATUTORY).forEach(function (sid) {
    var list = (STAT_COVERS[sid] || []).filter(function (ref) {
      var p = ref.split('.'), c = CLASSES[p[0]];
      return !!(c && c.failure_modes.some(function (f) { return f.id === p[1]; }));
    });
    STATUTORY[sid].covers_fm = list;
    list.forEach(function (ref) {
      var p = ref.split('.');
      CLASSES[p[0]].failure_modes.forEach(function (f) { if (f.id === p[1] && f.statutory.indexOf(sid) < 0) f.statutory.push(sid); });
    });
  });
}
linkStatutory();

/* D-MEP-9: practical minimum interval of a failure-finding task (days). A full-duration, destructive or shutdown-bound test
   is not repeated more often than this (default 30 d, learning assumption la_core); a computed FFI below it is not printed —
   the tool keeps the practical/statutory interval, reports the resulting unavailability and recommends redesign.
   null = no practical minimum. min_interval_reason: full_duration | destructive | shutdown. */
var FF_MIN_INTERVAL = {
  'emergency_lighting.battery_duration': [30, 'full_duration'], 'ups.battery_capacity_loss': [30, 'full_duration'],
  'fire_alarm.panel_battery': [30, 'full_duration']
};
Object.keys(CLASSES).forEach(function (cid) {
  CLASSES[cid].failure_modes.forEach(function (f) {
    var m = FF_MIN_INTERVAL[cid + '.' + f.id];
    f.min_interval_days = m && f.ff_task ? m[0] : null;
    f.min_interval_reason = m && f.ff_task ? m[1] : null;
  });
});

/* =====================================================================================
   Register document
   ===================================================================================== */
var ENUMS = {
  serves: ['office', 'server_room', 'lab', 'healthcare', 'production', 'residential', 'retail', 'education', 'common'],
  redundancy: ['none', 'N+1', '2N'],
  evidence: ['measured', 'documented', 'assumed', 'unknown']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, assets: 5000 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
var NUM_FIELDS = ['install_year', 'reserve_tested_months', 'downtime_cost_eur_h', 'tolerable_downtime_h', 'mttr_h', 'lead_time_days', 'replacement_cost_eur', 'failures_3y', 'refrigerant_charge_t_co2e', 'rated_kw', 'condition'];

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }

function emptyRegister(opts) {
  opts = opts || {};
  return { schema: SCHEMA, revision: 1,
    site: { name: opts.name || '', currency: 'EUR', labour_rate_eur_h: 75, year: opts.year || new Date().getFullYear() },
    assets: [], modules: {} };
}

/* structural walk: depth, node count, finite numbers, forbidden keys, plain JSON types only */
function walk(doc, errors) {
  var nodes = 0, stopped = false;
  function w(v, d, path) {
    if (stopped) return;
    if (++nodes > LIMITS.nodes) { errors.push({ code: 'too_many_nodes', path: path, msg: 'more than ' + LIMITS.nodes + ' nodes' }); stopped = true; return; }
    if (d > LIMITS.depth) { errors.push({ code: 'too_deep', path: path, msg: 'nesting deeper than ' + LIMITS.depth }); stopped = true; return; }
    if (v === null) return;
    var ty = typeof v;
    if (ty === 'number') { if (!isFinite(v)) errors.push({ code: 'non_finite', path: path, msg: 'non-finite number' }); return; }
    if (ty === 'string' || ty === 'boolean') return;
    if (ty !== 'object') { errors.push({ code: 'bad_type', path: path, msg: 'unsupported type ' + ty }); return; }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) w(v[i], d + 1, path + '[' + i + ']'); return; }
    var proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) { errors.push({ code: 'bad_type', path: path, msg: 'not a plain object' }); return; }
    var keys = Object.keys(v);
    for (var k = 0; k < keys.length; k++) {
      if (BAD_KEYS[keys[k]]) { errors.push({ code: 'forbidden_key', path: path + '.' + keys[k], msg: 'forbidden key ' + keys[k] }); continue; }
      w(v[keys[k]], d + 1, path + '.' + keys[k]);
    }
  }
  w(doc, 0, '$');
  return errors;
}

function validate(doc) {
  var errors = [], warnings = [];
  if (!isObj(doc)) return { ok: false, errors: [{ code: 'not_object', path: '$', msg: 'document is not an object' }], warnings: warnings };
  walk(doc, errors);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) errors.push({ code: 'schema', path: '$.schema', msg: 'schema must be ' + SCHEMA });
  if (doc.revision != null && (typeof doc.revision !== 'number' || doc.revision < 0 || Math.floor(doc.revision) !== doc.revision)) errors.push({ code: 'revision', path: '$.revision', msg: 'revision must be a non-negative integer' });
  if (doc.site != null && !isObj(doc.site)) errors.push({ code: 'site', path: '$.site', msg: 'site must be an object' });
  if (isObj(doc.site)) {
    var s = doc.site;
    if (s.name != null && typeof s.name !== 'string') errors.push({ code: 'type', path: '$.site.name', msg: 'string expected' });
    if (s.labour_rate_eur_h != null && !(typeof s.labour_rate_eur_h === 'number' && s.labour_rate_eur_h >= 0)) errors.push({ code: 'range', path: '$.site.labour_rate_eur_h', msg: 'non-negative number expected' });
    if (s.year != null && !(typeof s.year === 'number' && s.year >= 1900 && s.year <= 2200)) errors.push({ code: 'range', path: '$.site.year', msg: 'year 1900..2200 expected' });
    if (s.currency != null && s.currency !== 'EUR') warnings.push({ code: 'currency', path: '$.site.currency', msg: 'only EUR is supported; values are read as EUR' });
  }
  if (!Array.isArray(doc.assets)) errors.push({ code: 'assets', path: '$.assets', msg: 'assets must be an array' });
  else {
    if (doc.assets.length > LIMITS.assets) errors.push({ code: 'too_many_assets', path: '$.assets', msg: 'more than ' + LIMITS.assets + ' assets' });
    var seen = {};
    doc.assets.forEach(function (a, i) {
      var p = '$.assets[' + i + ']';
      if (!isObj(a)) { errors.push({ code: 'asset', path: p, msg: 'asset must be an object' }); return; }
      if (typeof a.id !== 'string' || !a.id.trim() || a.id.length > 160) errors.push({ code: 'asset_id', path: p + '.id', msg: 'id must be a non-empty string (≤ 160 chars)' });
      else if (seen[a.id]) errors.push({ code: 'duplicate_id', path: p + '.id', msg: 'duplicate asset id ' + a.id });
      else seen[a.id] = 1;
      if (typeof a['class'] !== 'string') errors.push({ code: 'class', path: p + '.class', msg: 'class must be a string' });
      else if (!CLASSES[a['class']]) warnings.push({ code: 'unknown_class', path: p + '.class', msg: 'class ' + a['class'] + ' is not in the library; class defaults unavailable' });
      ['serves', 'redundancy', 'evidence'].forEach(function (f) {
        if (a[f] != null && ENUMS[f].indexOf(a[f]) < 0) errors.push({ code: 'enum', path: p + '.' + f, msg: f + ' must be one of ' + ENUMS[f].join('|') });
      });
      NUM_FIELDS.forEach(function (f) {
        if (a[f] == null) return;
        if (typeof a[f] !== 'number') { errors.push({ code: 'type', path: p + '.' + f, msg: 'number or null expected' }); return; }
        if (a[f] < 0) errors.push({ code: 'range', path: p + '.' + f, msg: 'must be ≥ 0' });
      });
      if (typeof a.condition === 'number' && (a.condition < 1 || a.condition > 5)) errors.push({ code: 'range', path: p + '.condition', msg: 'condition must be 1..5' });
      if (typeof a.install_year === 'number' && (a.install_year < 1900 || a.install_year > 2200)) errors.push({ code: 'range', path: p + '.install_year', msg: 'install_year 1900..2200 expected' });
      if (a.common_cause != null && !(Array.isArray(a.common_cause) && a.common_cause.every(function (x) { return typeof x === 'string'; }))) errors.push({ code: 'type', path: p + '.common_cause', msg: 'array of strings expected' });
      ['name', 'location', 'notes'].forEach(function (f) { if (a[f] != null && typeof a[f] !== 'string') errors.push({ code: 'type', path: p + '.' + f, msg: 'string expected' }); });
    });
  }
  if (doc.modules != null && !isObj(doc.modules)) errors.push({ code: 'modules', path: '$.modules', msg: 'modules must be an object' });
  else if (isObj(doc.modules)) {
    Object.keys(doc.modules).forEach(function (k) {
      var m = doc.modules[k], p = '$.modules.' + k;
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(k)) errors.push({ code: 'module_id', path: p, msg: 'bad module id' });
      if (!isObj(m)) { errors.push({ code: 'module', path: p, msg: 'module must be an object' }); return; }
      if (m.updatedAt != null && (typeof m.updatedAt !== 'string' || !isFinite(Date.parse(m.updatedAt)))) errors.push({ code: 'updatedAt', path: p + '.updatedAt', msg: 'ISO date string expected' });
      if (TOOL_IDS.indexOf(k) < 0) warnings.push({ code: 'unknown_module', path: p, msg: 'module from another tool kept as is' });
    });
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

function importJSON(text) {
  if (typeof text !== 'string') return { ok: false, doc: null, errors: [{ code: 'not_text', path: '$', msg: 'text expected' }], warnings: [] };
  if (text.length > LIMITS.bytes) return { ok: false, doc: null, errors: [{ code: 'too_large', path: '$', msg: 'file larger than 2 MB' }], warnings: [] };
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, doc: null, errors: [{ code: 'json', path: '$', msg: 'invalid JSON: ' + e.message }], warnings: [] }; }
  var v = validate(doc);
  if (!v.ok) return { ok: false, doc: null, errors: v.errors, warnings: v.warnings };
  if (!isObj(doc.modules)) doc.modules = {};
  if (doc.revision == null) doc.revision = 1;
  if (!isObj(doc.site)) doc.site = emptyRegister().site;
  return { ok: true, doc: doc, errors: [], warnings: v.warnings };
}

function exportJSON(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('MEPCore.register.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg; }).join('; '));
  return JSON.stringify(doc, null, 2);
}

function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('MEPCore.register.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt'].indexOf(k) < 0 && !BAD_KEYS[k]) mod[k] = clone(payload[k]); });
  mod.updatedAt = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  next.modules[toolId] = mod;
  next.revision = (typeof next.revision === 'number' ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('MEPCore.register.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg);
  return next;
}

function storage() {
  try { return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null; } catch (e) { return null; }
}
function load() {
  var ls = storage(); if (!ls) return null;
  var raw; try { raw = ls.getItem(STORAGE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var r = importJSON(raw);
  return r.ok ? r.doc : null;
}
function save(doc) {
  var ls = storage(); if (!ls) return { ok: false, error: 'storage_unavailable' };
  var text;
  try { text = exportJSON(doc); } catch (e) { return { ok: false, error: 'invalid', detail: e.message }; }
  try { ls.setItem(STORAGE_KEY, text); return { ok: true }; } catch (e) { return { ok: false, error: 'storage_blocked', detail: String(e && e.message || e) }; }
}

/* resolved(asset): user value wins; null/undefined -> class typical (mid) with provenance; never silently merged.
   Returns {field: {value, source:'user'|'class_typical'|'unknown', provenance:[source ids], range:[lo,mid,hi]|null}} */
var RESOLVE_MAP = { replacement_cost_eur: 'replacement_cost_eur', mttr_h: 'mttr_h', lead_time_days: 'lead_time_days', economic_life_y: 'economic_life_y' };
function resolved(asset) {
  var out = {}, c = asset && CLASSES[asset['class']];
  Object.keys(RESOLVE_MAP).forEach(function (f) {
    var range = c && c.typical[RESOLVE_MAP[f]] ? c.typical[RESOLVE_MAP[f]].slice() : null;
    var prov = c && c.provenance[f] ? c.provenance[f].slice() : [];
    var uv = asset ? asset[f] : null;
    if (typeof uv === 'number' && isFinite(uv)) out[f] = { value: uv, source: 'user', provenance: ['user'], range: range };
    else if (range) out[f] = { value: range[1], source: 'class_typical', provenance: prov, range: range };
    else out[f] = { value: null, source: 'unknown', provenance: [], range: null };
  });
  ['downtime_cost_eur_h', 'tolerable_downtime_h', 'refrigerant_charge_t_co2e', 'reserve_tested_months', 'rated_kw'].forEach(function (f) {
    var uv = asset ? asset[f] : null;
    out[f] = (typeof uv === 'number' && isFinite(uv)) ? { value: uv, source: 'user', provenance: ['user'], range: null } : { value: null, source: 'unknown', provenance: [], range: null };
  });
  var year = asset && typeof asset.install_year === 'number' ? asset.install_year : null;
  out.install_year = year != null ? { value: year, source: 'user', provenance: ['user'], range: null } : { value: null, source: 'unknown', provenance: [], range: null };
  return out;
}

/* statutoryFor(asset, opts) -> [{id, interval_months, interval_days, conditional, reason, source}] */
function statutoryFor(asset) {
  var out = [];
  Object.keys(STATUTORY).forEach(function (id) {
    var s = STATUTORY[id];
    if (!s.applies(asset)) return;
    var cond = false, months = s.interval_months, days = s.interval_days;
    if (id.indexOf('fgas_') === 0 && charge(asset) == null) cond = true;
    if (id.indexOf('epbd_') === 0 && !(asset && typeof asset.rated_kw === 'number')) cond = true;
    if (s.interval_months_leak_detection && asset && asset.leak_detection === true) { months = s.interval_months_leak_detection; days = Math.round(months * 365 / 12); }
    if (s.interval_months_over_290kw && asset && typeof asset.rated_kw === 'number' && asset.rated_kw > 290) { months = s.interval_months_over_290kw; days = Math.round(months * 365 / 12); }
    out.push({ id: id, interval_months: months, interval_days: days, conditional: cond, trade: s.trade, hours: s.hours, source: s.source });
  });
  return out;
}

/* creditedRedundancy(asset, register) (D-MEP-10) — the one redundancy-credit rule of the package (crit peer rule, D-MEP-4):
   credited only if redundancy is N+1 / 2N, the standby (or the asset's own function) was tested within 12 months and no
   common cause is shared. common_cause holds dependency tags; inside a register a tag is a common cause only when a PEER
   (same class AND same serves, not the asset itself) carries it too. No peer (or no register) -> every declared tag counts.
   Returns {credited, reason ('credited'|'no_redundancy'|first failing reason), reasons[], shared_tags[], steps (1 N+1, 2 2N),
   peers[ids], peer_rule ('peer'|'no_peer_all_tags')}. Pure; safe for incomplete assets. */
var TEST_WINDOW_MONTHS = 12;
function ccTags(a) {
  return Array.isArray(a && a.common_cause) ? a.common_cause.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean) : [];
}
function creditedRedundancy(asset, register) {
  var a = asset && typeof asset === 'object' ? asset : {};
  var red = (a.redundancy === 'N+1' || a.redundancy === '2N') ? a.redundancy : 'none';
  var out = { credited: false, reason: 'no_redundancy', reasons: [], shared_tags: [], steps: 0, peers: [], peer_rule: 'no_peer_all_tags' };
  if (red === 'none') return out;
  var list = register && Array.isArray(register.assets) ? register.assets : [];
  var peers = list.filter(function (b) {
    return b && typeof b === 'object' && b !== asset && !(a.id != null && b.id === a.id) && b['class'] === a['class'] && b.serves === a.serves;
  });
  var tags = ccTags(a), shared = tags;
  if (peers.length) {
    var peerTags = [];
    peers.forEach(function (b) { ccTags(b).forEach(function (t) { if (peerTags.indexOf(t) < 0) peerTags.push(t); }); });
    shared = tags.filter(function (t) { return peerTags.indexOf(t) >= 0; });
    out.peer_rule = 'peer';
  }
  out.peers = peers.map(function (b) { return b.id; });
  out.shared_tags = shared.filter(function (t, i) { return shared.indexOf(t) === i; });
  var tm = (typeof a.reserve_tested_months === 'number' && isFinite(a.reserve_tested_months)) ? a.reserve_tested_months : null;
  if (tm === null) out.reasons.push('reserve_test_unknown');
  else if (tm > TEST_WINDOW_MONTHS) out.reasons.push('reserve_test_stale');
  if (out.shared_tags.length) out.reasons.push('common_cause');
  out.credited = out.reasons.length === 0;
  out.reason = out.credited ? 'credited' : out.reasons[0];
  out.steps = out.credited ? (red === '2N' ? 2 : 1) : 0;
  return out;
}

/* Optional asset fields used by some tools (all survive round trips; validate() does not require them).
   condition follows CONDITION_SCALE (1 very good .. 5 very poor). */
var ASSET_OPTIONAL_FIELDS = {
  name_i18n: 'object {en,uk,de,nl,fr,es,pl}: display names of demo assets; used only while name === name_i18n.en (MEPCore.assetName)',
  rated_kw: 'number, kW: EPBD inspection threshold (70 kW) and size-dependent statutory intervals',
  leak_detection: 'bool: F-gas leak detection installed (halves the leak-check frequency)',
  monthly_load_ok: 'bool: generator monthly runs meet NFPA 110 8.4.2 (no annual load bank test)',
  bacs_exempt: 'bool: EPBD Art. 23(7) building automation exemption from periodic inspection',
  refrigerant: 'string: refrigerant designation, e.g. "R410A" (meplifecycle: phase-out / service bans)',
  refrigerant_service_until: 'number, year: last year the refrigerant may be used for servicing (overrides meplifecycle defaults)',
  fgas_category: "'refrigeration' | absent (= air conditioning / heat pump): F-gas service-ban category for meplifecycle",
  support_end_year: 'number, year: manufacturer support / spare parts end (obsolescence)',
  target_year: 'number, year: planned renewal year set by the owner (meplifecycle)',
  economic_life_y: 'number or [lo,mid,hi], years: overrides the class typical economic life',
  bundle: 'string tag: assets renewed together in one project (meplifecycle)',
  crit_class: "'A'|'B'|'C': criticality class fallback when modules.mepcriticality results are not used",
  flow_temp_c: 'number, °C: heating flow temperature (heat pump suitability in meplifecycle)'
};

/* =====================================================================================
   CSV (RFC 4180, CRLF), formula-injection guard: string cells starting with = + - @ TAB CR get a leading '.
   cols: ['key', ...] or [{key, label}]; rows: objects or arrays. Numbers are written raw (dot decimal).
   ===================================================================================== */
function csvCell(v) {
  if (v == null) return '';
  var s;
  if (typeof v === 'number') s = isFinite(v) ? String(v) : '';
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = '\'' + s;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csv(rows, cols, opts) {
  opts = opts || {};
  rows = rows || [];
  if (!cols) cols = rows.length && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [];
  var defs = cols.map(function (c, i) { return typeof c === 'string' ? { key: c, label: c, i: i } : { key: c.key, label: c.label != null ? c.label : c.key, i: i }; });
  var lines = [];
  if (opts.header !== false && defs.length) lines.push(defs.map(function (d) { return csvCell(d.label); }).join(','));
  rows.forEach(function (r) {
    lines.push(defs.map(function (d) { return csvCell(Array.isArray(r) ? r[d.i] : (r ? r[d.key] : null)); }).join(','));
  });
  return lines.join('\r\n') + (lines.length ? '\r\n' : '');
}

/* =====================================================================================
   PRESET_SITES — shared demo registers (same buildings in all six tools). Values marked in notes;
   numbers are illustrative (learning_assumption), chosen to carry each tool's "aha".
   ===================================================================================== */
function A(o) {
  var base = { id: '', 'class': '', name: '', serves: 'common', location: '', install_year: null, redundancy: 'none', reserve_tested_months: null, common_cause: [],
    downtime_cost_eur_h: null, tolerable_downtime_h: null, mttr_h: null, lead_time_days: null, replacement_cost_eur: null,
    condition: 3, failures_3y: 0, refrigerant_charge_t_co2e: null, evidence: 'assumed', notes: '' };
  Object.keys(o).forEach(function (k) { base[k] = o[k]; });
  return base;
}
var PRESET_SITES = {
  office_12: { schema: SCHEMA, revision: 1,
    site: { name: 'Office building, 12 assets (demo)', currency: 'EUR', labour_rate_eur_h: 75, year: 2026 },
    meta: { id: 'office_12',
      title: L('Office building — 12 key assets', 'Офісна будівля — 12 ключових активів', 'Bürogebäude — 12 Hauptanlagen', 'Kantoorgebouw — 12 hoofdinstallaties', 'Immeuble de bureaux — 12 équipements clés', 'Edificio de oficinas — 12 equipos clave', 'Budynek biurowy — 12 kluczowych urządzeń'),
      note: L('Twin chillers look redundant but share one power feed; the server-room AHU’s standby was last tested 20 months ago; the 1998 main switchboard is a single point of failure; the 2004 boiler is old but in good condition — age alone does not decide.',
        'Два чилери виглядають резервованими, але живляться від одного вводу; резерв ППУ серверної востаннє перевіряли 20 місяців тому; головний щит 1998 р. — єдина точка відмови; котел 2004 р. старий, але в доброму стані — вік сам по собі не вирішує.',
        'Die beiden Kältemaschinen wirken redundant, hängen aber an einer Einspeisung; die Reserve des Serverraum-RLT wurde zuletzt vor 20 Monaten getestet; die Hauptverteilung von 1998 ist ein Single Point of Failure; der Kessel von 2004 ist alt, aber gut — das Alter allein entscheidet nicht.',
        'De twee koelmachines lijken redundant maar hangen aan één voeding; de reserve van de serverruimte-LBK is 20 maanden geleden voor het laatst getest; de hoofdverdeler uit 1998 is een single point of failure; de ketel uit 2004 is oud maar goed — leeftijd alleen beslist niet.',
        'Les deux groupes froids semblent redondants mais partagent une seule alimentation ; le secours de la CTA de la salle serveurs a été testé il y a 20 mois ; le TGBT de 1998 est un point de défaillance unique ; la chaudière de 2004 est ancienne mais en bon état — l’âge seul ne décide pas.',
        'Las dos enfriadoras parecen redundantes pero comparten una sola acometida; la reserva de la UTA de la sala de servidores se probó hace 20 meses; el cuadro general de 1998 es un punto único de fallo; la caldera de 2004 es antigua pero está en buen estado: la edad sola no decide.',
        'Dwa agregaty wyglądają na redundantne, ale mają wspólne zasilanie; rezerwę centrali serwerowni testowano 20 miesięcy temu; rozdzielnica główna z 1998 r. to pojedynczy punkt awarii; kocioł z 2004 r. jest stary, ale w dobrym stanie — sam wiek nie decyduje.') },
    assets: [
      A({ id: 'AHU-01', 'class': 'ahu', name: 'AHU-01 offices floors 1–4', serves: 'office', location: 'Roof plant room', install_year: 2009, downtime_cost_eur_h: 150, tolerable_downtime_h: 24, condition: 3, failures_3y: 2, evidence: 'documented', rated_kw: 45, notes: 'Belt drive; filter Δp sensor on BMS.' }),
      A({ id: 'AHU-02', 'class': 'ahu', name: 'AHU-02 server room (duty/standby fans)', serves: 'server_room', location: 'Level 0', install_year: 2016, redundancy: 'N+1', reserve_tested_months: 20, common_cause: ['power_feed_A'], downtime_cost_eur_h: 2500, tolerable_downtime_h: 2, mttr_h: 6, condition: 2, failures_3y: 1, evidence: 'documented', rated_kw: 30, notes: 'Standby fan last proven 20 months ago.' }),
      A({ id: 'CH-01', 'class': 'chiller_air', name: 'Chiller 1 (R410A 45 kg)', serves: 'common', location: 'Roof', install_year: 2008, redundancy: 'N+1', reserve_tested_months: 6, common_cause: ['power_feed_A', 'chw_header'], downtime_cost_eur_h: 400, tolerable_downtime_h: 8, replacement_cost_eur: 180000, lead_time_days: 120, condition: 4, failures_3y: 3, refrigerant_charge_t_co2e: 94, evidence: 'measured', rated_kw: 450, notes: '45 kg R410A × GWP 2088 = 94 t CO₂e.' }),
      A({ id: 'CH-02', 'class': 'chiller_air', name: 'Chiller 2 (R410A 45 kg)', serves: 'common', location: 'Roof', install_year: 2008, redundancy: 'N+1', reserve_tested_months: 6, common_cause: ['power_feed_A', 'chw_header'], downtime_cost_eur_h: 400, tolerable_downtime_h: 8, replacement_cost_eur: 180000, lead_time_days: 120, condition: 3, failures_3y: 1, refrigerant_charge_t_co2e: 94, evidence: 'measured', rated_kw: 450 }),
      A({ id: 'BLR-01', 'class': 'boiler_gas', name: 'Gas boiler 400 kW', serves: 'common', location: 'Basement plant room', install_year: 2004, downtime_cost_eur_h: 200, tolerable_downtime_h: 12, condition: 2, failures_3y: 0, evidence: 'documented', rated_kw: 400, notes: 'Old but well kept; last combustion test good.' }),
      A({ id: 'P-HW-01', 'class': 'pump', name: 'Heating circuit pumps (twin head)', serves: 'common', location: 'Basement plant room', install_year: 2015, redundancy: 'N+1', reserve_tested_months: 3, downtime_cost_eur_h: 150, tolerable_downtime_h: 12, condition: 3, failures_3y: 0, evidence: 'documented' }),
      A({ id: 'CAL-01', 'class': 'dhw_calorifier', name: 'DHW calorifier 1500 l', serves: 'common', location: 'Basement plant room', install_year: 2012, downtime_cost_eur_h: 50, tolerable_downtime_h: 24, condition: 3, failures_3y: 1, evidence: 'assumed', notes: 'Return temperature drifted to 52 °C last summer.' }),
      A({ id: 'SPR-P1', 'class': 'sprinkler_pump', name: 'Sprinkler pump set (electric + diesel)', serves: 'common', location: 'Pump house', install_year: 2010, redundancy: 'N+1', reserve_tested_months: 0.25, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 3, failures_3y: 0, evidence: 'documented' }),
      A({ id: 'EL-SYS', 'class': 'emergency_lighting', name: 'Emergency lighting (140 self-contained luminaires)', serves: 'common', location: 'Whole building', install_year: 2018, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 3, failures_3y: 6, evidence: 'documented', notes: 'Batteries from 2018.' }),
      A({ id: 'UPS-01', 'class': 'ups', name: 'UPS 60 kVA server room', serves: 'server_room', location: 'Level 0', install_year: 2019, common_cause: ['power_feed_A'], downtime_cost_eur_h: 5000, tolerable_downtime_h: 0.1, mttr_h: 4, condition: 3, failures_3y: 0, evidence: 'documented', notes: 'VRLA strings installed 2019 (7 years).' }),
      A({ id: 'GEN-01', 'class': 'generator', name: 'Standby generator 300 kVA', serves: 'common', location: 'Yard', install_year: 2011, downtime_cost_eur_h: 800, tolerable_downtime_h: 0.25, condition: 3, failures_3y: 1, evidence: 'documented', notes: 'Monthly runs at no load only.' }),
      A({ id: 'MSB-01', 'class': 'lv_switchboard', name: 'Main LV switchboard 1600 A', serves: 'common', location: 'Basement', install_year: 1998, downtime_cost_eur_h: 3000, tolerable_downtime_h: 1, lead_time_days: 180, condition: 3, failures_3y: 0, evidence: 'assumed', notes: 'Single incomer; no thermography record.' })
    ],
    modules: {} },
  datacentre_8: { schema: SCHEMA, revision: 1,
    site: { name: 'Data centre hall, 8 assets (demo)', currency: 'EUR', labour_rate_eur_h: 85, year: 2026 },
    meta: { id: 'datacentre_8',
      title: L('Data centre — 8 infrastructure assets', 'Дата-центр — 8 інфраструктурних активів', 'Rechenzentrum — 8 Infrastrukturanlagen', 'Datacenter — 8 infrastructuurinstallaties', 'Centre de données — 8 équipements d’infrastructure', 'Centro de datos: 8 equipos de infraestructura', 'Centrum danych — 8 urządzeń infrastruktury'),
      note: L('The UPS is 2N and tested, yet both generators draw from one fuel tank and everything hangs on a single transformer — redundancy on paper is not redundancy. The cooling tower is a legionella duty whatever the IT load.',
        'ДБЖ за схемою 2N і перевірені, але обидва генератори живляться з одного паливного бака, а все залежить від одного трансформатора — резерв на папері не є резервом. Градирня — це обов’язок щодо легіонели незалежно від ІТ-навантаження.',
        'Die USV ist 2N und geprüft, doch beide Aggregate hängen an einem Tank und alles an einem einzigen Transformator — Redundanz auf dem Papier ist keine Redundanz. Der Kühlturm ist eine Legionellenpflicht, egal wie hoch die IT-Last ist.',
        'De UPS is 2N en getest, maar beide aggregaten tanken uit één brandstoftank en alles hangt aan één transformator — redundantie op papier is geen redundantie. De koeltoren is een legionellaplicht, ongeacht de IT-last.',
        'L’ASI est en 2N et testée, mais les deux groupes puisent dans une seule cuve et tout dépend d’un seul transformateur — la redondance sur le papier n’en est pas une. La tour de refroidissement reste une obligation légionelle quelle que soit la charge IT.',
        'El SAI es 2N y está probado, pero ambos grupos beben de un único tanque y todo cuelga de un solo transformador: la redundancia en papel no es redundancia. La torre de refrigeración es una obligación frente a la legionela sea cual sea la carga TI.',
        'UPS jest 2N i przetestowany, ale oba agregaty korzystają z jednego zbiornika paliwa, a wszystko wisi na jednym transformatorze — redundancja na papierze to nie redundancja. Wieża chłodnicza to obowiązek legionellowy niezależnie od obciążenia IT.') },
    assets: [
      A({ id: 'UPS-A', 'class': 'ups', name: 'UPS A 500 kVA', serves: 'server_room', location: 'UPS room A', install_year: 2018, redundancy: '2N', reserve_tested_months: 3, common_cause: ['bus_A'], downtime_cost_eur_h: 50000, tolerable_downtime_h: 0.01, mttr_h: 6, condition: 2, failures_3y: 0, evidence: 'measured', notes: 'Battery monitoring online; strings 2022.' }),
      A({ id: 'UPS-B', 'class': 'ups', name: 'UPS B 500 kVA', serves: 'server_room', location: 'UPS room B', install_year: 2018, redundancy: '2N', reserve_tested_months: 3, common_cause: ['bus_B'], downtime_cost_eur_h: 50000, tolerable_downtime_h: 0.01, mttr_h: 6, condition: 2, failures_3y: 1, evidence: 'measured' }),
      A({ id: 'GEN-01', 'class': 'generator', name: 'Generator 1 1250 kVA', serves: 'server_room', location: 'Yard', install_year: 2015, redundancy: 'N+1', reserve_tested_months: 1, common_cause: ['fuel_tank_1'], downtime_cost_eur_h: 50000, tolerable_downtime_h: 0.05, condition: 3, failures_3y: 1, evidence: 'documented', monthly_load_ok: true, notes: 'Shares bulk fuel tank with GEN-02; monthly runs on the real load.' }),
      A({ id: 'GEN-02', 'class': 'generator', name: 'Generator 2 1250 kVA', serves: 'server_room', location: 'Yard', install_year: 2015, redundancy: 'N+1', reserve_tested_months: 1, common_cause: ['fuel_tank_1'], downtime_cost_eur_h: 50000, tolerable_downtime_h: 0.05, condition: 3, failures_3y: 0, evidence: 'documented', monthly_load_ok: true }),
      A({ id: 'CH-01', 'class': 'chiller_water', name: 'Water-cooled chiller 1200 kW (R134a 300 kg)', serves: 'server_room', location: 'Plant room', install_year: 2014, redundancy: 'N+1', reserve_tested_months: 1, downtime_cost_eur_h: 20000, tolerable_downtime_h: 0.5, lead_time_days: 150, condition: 3, failures_3y: 2, refrigerant_charge_t_co2e: 429, evidence: 'measured', rated_kw: 1200, notes: '300 kg R134a × GWP 1430 = 429 t CO₂e.' }),
      A({ id: 'CT-01', 'class': 'cooling_tower', name: 'Open cooling tower for CH-01', serves: 'server_room', location: 'Roof', install_year: 2014, downtime_cost_eur_h: 20000, tolerable_downtime_h: 0.5, condition: 3, failures_3y: 1, evidence: 'documented' }),
      A({ id: 'CRAH-G', 'class': 'ahu', name: 'CRAH units group (10 × 100 kW)', serves: 'server_room', location: 'Data hall', install_year: 2014, redundancy: 'N+1', reserve_tested_months: 0.5, downtime_cost_eur_h: 20000, tolerable_downtime_h: 0.25, condition: 3, failures_3y: 3, evidence: 'measured', rated_kw: 1000 }),
      A({ id: 'TX-01', 'class': 'transformer', name: 'MV/LV transformer 2000 kVA (single)', serves: 'server_room', location: 'Substation', install_year: 2014, downtime_cost_eur_h: 50000, tolerable_downtime_h: 0.05, lead_time_days: 280, condition: 3, failures_3y: 0, evidence: 'assumed', notes: 'Single incomer; no DGA history.' })
    ],
    modules: {} },
  hospital_wing_10: { schema: SCHEMA, revision: 1,
    site: { name: 'Hospital wing, 10 assets (demo)', currency: 'EUR', labour_rate_eur_h: 80, year: 2026 },
    meta: { id: 'hospital_wing_10',
      title: L('Hospital wing — 10 assets', 'Лікарняне крило — 10 активів', 'Krankenhausflügel — 10 Anlagen', 'Ziekenhuisvleugel — 10 installaties', 'Aile d’hôpital — 10 équipements', 'Ala de hospital: 10 equipos', 'Skrzydło szpitala — 10 urządzeń'),
      note: L('The DHW calorifier costs little when it stops but is safety-critical (legionella, 55 °C outlets in healthcare); the theatre AHU has no standby; two boilers really are N+1 — redundancy is credited only where it is tested and independent.',
        'Бойлер ГВП мало коштує при зупинці, але критичний для безпеки (легіонела, 55 °C на точках у закладах охорони здоров’я); ППУ операційної не має резерву; два котли справді N+1 — резерв зараховується лише там, де він перевірений і незалежний.',
        'Der Warmwasserspeicher kostet bei Stillstand wenig, ist aber sicherheitskritisch (Legionellen, 55 °C an Zapfstellen im Gesundheitswesen); das OP-RLT-Gerät hat keine Reserve; die zwei Kessel sind wirklich N+1 — Redundanz zählt nur geprüft und unabhängig.',
        'De warmwaterboiler kost weinig bij stilstand maar is veiligheidskritisch (legionella, 55 °C op tappunten in de zorg); de OK-LBK heeft geen reserve; de twee ketels zijn echt N+1 — redundantie telt alleen als ze getest en onafhankelijk is.',
        'Le ballon d’ECS coûte peu à l’arrêt mais il est critique pour la sécurité (légionelle, 55 °C aux points de puisage en santé) ; la CTA du bloc n’a pas de secours ; les deux chaudières sont vraiment N+1 — la redondance ne compte que testée et indépendante.',
        'El acumulador de ACS cuesta poco parado pero es crítico para la seguridad (legionela, 55 °C en puntos sanitarios); la UTA del quirófano no tiene reserva; las dos calderas sí son N+1: la redundancia cuenta solo si está probada y es independiente.',
        'Podgrzewacz c.w.u. mało kosztuje przy postoju, ale jest krytyczny dla bezpieczeństwa (legionella, 55 °C w punktach w ochronie zdrowia); centrala sali operacyjnej nie ma rezerwy; dwa kotły są naprawdę N+1 — redundancja liczy się tylko przetestowana i niezależna.') },
    assets: [
      A({ id: 'AHU-OT1', 'class': 'ahu', name: 'Operating theatre AHU', serves: 'healthcare', location: 'Level 2 plant', install_year: 2011, downtime_cost_eur_h: 6000, tolerable_downtime_h: 1, condition: 3, failures_3y: 2, evidence: 'documented', rated_kw: 60 }),
      A({ id: 'AHU-W1', 'class': 'ahu', name: 'Ward AHU', serves: 'healthcare', location: 'Roof', install_year: 2006, downtime_cost_eur_h: 400, tolerable_downtime_h: 8, condition: 4, failures_3y: 3, evidence: 'documented', rated_kw: 40 }),
      A({ id: 'CAL-H1', 'class': 'dhw_calorifier', name: 'DHW calorifier 2000 l (wards)', serves: 'healthcare', location: 'Basement', install_year: 2009, downtime_cost_eur_h: 100, tolerable_downtime_h: 4, condition: 3, failures_3y: 1, evidence: 'measured', notes: 'Healthcare: outlets ≥ 55 °C within 1 min (HSG274 Pt 2).' }),
      A({ id: 'BLR-01', 'class': 'boiler_gas', name: 'Boiler 1 600 kW', serves: 'healthcare', location: 'Energy centre', install_year: 2013, redundancy: 'N+1', reserve_tested_months: 1, common_cause: ['gas_supply'], downtime_cost_eur_h: 1500, tolerable_downtime_h: 4, condition: 2, failures_3y: 1, evidence: 'documented', rated_kw: 600 }),
      A({ id: 'BLR-02', 'class': 'boiler_gas', name: 'Boiler 2 600 kW', serves: 'healthcare', location: 'Energy centre', install_year: 2013, redundancy: 'N+1', reserve_tested_months: 1, common_cause: ['gas_supply'], downtime_cost_eur_h: 1500, tolerable_downtime_h: 4, condition: 3, failures_3y: 0, evidence: 'documented', rated_kw: 600 }),
      A({ id: 'GEN-H1', 'class': 'generator', name: 'Essential supply generator 800 kVA', serves: 'healthcare', location: 'Energy centre', install_year: 2010, downtime_cost_eur_h: 10000, tolerable_downtime_h: 0.004, condition: 3, failures_3y: 1, evidence: 'documented', notes: 'Life-safety and essential circuits; 15 s start.' }),
      A({ id: 'UPS-OT', 'class': 'ups', name: 'Theatre IPS / UPS 40 kVA', serves: 'healthcare', location: 'Level 2', install_year: 2017, downtime_cost_eur_h: 10000, tolerable_downtime_h: 0.001, condition: 3, failures_3y: 0, evidence: 'documented' }),
      A({ id: 'LIFT-B1', 'class': 'lift', name: 'Bed lift 2000 kg', serves: 'healthcare', location: 'Core A', install_year: 2005, downtime_cost_eur_h: 300, tolerable_downtime_h: 4, condition: 4, failures_3y: 9, evidence: 'documented', notes: 'Only bed lift of the wing; door faults frequent.' }),
      A({ id: 'FA-01', 'class': 'fire_alarm', name: 'Addressable fire alarm (L1)', serves: 'healthcare', location: 'Whole wing', install_year: 2012, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 3, failures_3y: 2, evidence: 'documented' }),
      A({ id: 'EL-01', 'class': 'emergency_lighting', name: 'Central-battery emergency lighting', serves: 'healthcare', location: 'Whole wing', install_year: 2012, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 3, failures_3y: 1, evidence: 'documented' })
    ],
    modules: {} },
  school_8: { schema: SCHEMA, revision: 1,
    site: { name: 'Secondary school, 8 assets (demo)', currency: 'EUR', labour_rate_eur_h: 65, year: 2026 },
    meta: { id: 'school_8',
      title: L('Secondary school — 8 assets', 'Середня школа — 8 активів', 'Weiterführende Schule — 8 Anlagen', 'Middelbare school — 8 installaties', 'Collège-lycée — 8 équipements', 'Instituto de secundaria: 8 equipos', 'Szkoła średnia — 8 urządzeń'),
      note: L('Tight budget, long summer shutdown: intrusive work goes into the holidays, while the sports-hall showers stand unused for weeks (legionella flushing). The 1995 boiler is old and poor; the 2024 heat pump is new — renewal by risk, not by age.',
        'Обмежений бюджет, довга літня зупинка: роботи з відключенням — на канікули, а душові спортзалу тижнями не використовуються (промивання від легіонели). Котел 1995 р. старий і в поганому стані; тепловий насос 2024 р. новий — оновлення за ризиком, а не за віком.',
        'Knappes Budget, lange Sommerpause: eingreifende Arbeiten in die Ferien, während die Turnhallenduschen wochenlang ungenutzt bleiben (Legionellenspülung). Der Kessel von 1995 ist alt und schlecht, die Wärmepumpe von 2024 neu — Erneuerung nach Risiko, nicht nach Alter.',
        'Krap budget, lange zomerstop: ingrijpend werk in de vakantie, terwijl de douches van de sporthal wekenlang ongebruikt staan (legionellaspoelen). De ketel uit 1995 is oud en slecht, de warmtepomp uit 2024 nieuw — vervangen op risico, niet op leeftijd.',
        'Budget serré, longue fermeture estivale : les travaux lourds vont dans les vacances, tandis que les douches du gymnase restent inutilisées des semaines (rinçage anti-légionelle). La chaudière de 1995 est vieille et en mauvais état ; la PAC de 2024 est neuve — renouveler selon le risque, pas l’âge.',
        'Presupuesto ajustado y largo cierre estival: los trabajos con parada van a vacaciones, mientras las duchas del gimnasio pasan semanas sin uso (purgado contra la legionela). La caldera de 1995 es vieja y está mal; la bomba de calor de 2024 es nueva: renovar por riesgo, no por edad.',
        'Napięty budżet, długa przerwa letnia: prace z wyłączeniem w wakacje, a prysznice hali sportowej stoją nieużywane tygodniami (płukanie przeciw legionelli). Kocioł z 1995 r. jest stary i w złym stanie; pompa ciepła z 2024 r. nowa — odnowa wg ryzyka, nie wieku.') },
    assets: [
      A({ id: 'BLR-01', 'class': 'boiler_gas', name: 'Gas boiler 350 kW (1995)', serves: 'education', location: 'Boiler house', install_year: 1995, downtime_cost_eur_h: 300, tolerable_downtime_h: 24, lead_time_days: 60, condition: 4, failures_3y: 4, evidence: 'documented', rated_kw: 350, notes: 'Heat exchanger leaks patched twice.' }),
      A({ id: 'HP-01', 'class': 'heat_pump', name: 'Air-to-water heat pump 120 kW (R32 25 kg)', serves: 'education', location: 'Yard', install_year: 2024, downtime_cost_eur_h: 150, tolerable_downtime_h: 48, condition: 1, failures_3y: 0, refrigerant_charge_t_co2e: 16.9, evidence: 'measured', rated_kw: 120, notes: '25 kg R32 × GWP 675 = 16.9 t CO₂e.' }),
      A({ id: 'AHU-GYM', 'class': 'ahu', name: 'Sports hall AHU', serves: 'education', location: 'Sports hall roof', install_year: 2008, downtime_cost_eur_h: 50, tolerable_downtime_h: 72, condition: 3, failures_3y: 1, evidence: 'assumed', rated_kw: 35 }),
      A({ id: 'CAL-01', 'class': 'dhw_calorifier', name: 'DHW calorifier 800 l (sports hall showers)', serves: 'education', location: 'Sports hall', install_year: 2008, downtime_cost_eur_h: 20, tolerable_downtime_h: 72, condition: 3, failures_3y: 0, evidence: 'assumed', notes: 'Showers unused for 7 weeks in summer.' }),
      A({ id: 'WB-01', 'class': 'water_booster', name: 'Cold water booster set', serves: 'education', location: 'Basement', install_year: 2012, redundancy: 'N+1', reserve_tested_months: 14, downtime_cost_eur_h: 200, tolerable_downtime_h: 8, condition: 3, failures_3y: 1, evidence: 'assumed' }),
      A({ id: 'FA-01', 'class': 'fire_alarm', name: 'Fire alarm (conventional, 6 zones)', serves: 'education', location: 'Whole school', install_year: 2007, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 4, failures_3y: 5, evidence: 'documented', notes: 'Panel discontinued by the manufacturer.' }),
      A({ id: 'EL-01', 'class': 'emergency_lighting', name: 'Emergency lighting (95 luminaires)', serves: 'education', location: 'Whole school', install_year: 2015, downtime_cost_eur_h: null, tolerable_downtime_h: 0, condition: 3, failures_3y: 4, evidence: 'documented' }),
      A({ id: 'BMS-01', 'class': 'bms_controller', name: 'BMS outstation (heating plant)', serves: 'education', location: 'Boiler house', install_year: 2010, downtime_cost_eur_h: 30, tolerable_downtime_h: 48, condition: 3, failures_3y: 2, evidence: 'assumed', notes: 'No configuration backup on file.' })
    ],
    modules: {} }
};
/* QA-21: 7-language display names of the demo registers. `name` stays the English string (schema: string);
   `name_i18n` is shown by MEPCore.assetName(asset, lang) only while name still equals name_i18n.en (an edited name wins). */
var SITE_NAMES_I18N = {
  office_12: L('Office building, 12 assets (demo)', 'Офісна будівля, 12 активів (демо)', 'Bürogebäude, 12 Anlagen (Demo)', 'Kantoorgebouw, 12 installaties (demo)', 'Immeuble de bureaux, 12 équipements (démo)', 'Edificio de oficinas, 12 equipos (demo)', 'Budynek biurowy, 12 urządzeń (demo)'),
  datacentre_8: L('Data centre hall, 8 assets (demo)', 'Зал центру обробки даних, 8 активів (демо)', 'Rechenzentrumshalle, 8 Anlagen (Demo)', 'Datacenterzaal, 8 installaties (demo)', 'Salle de centre de données, 8 équipements (démo)', 'Sala de centro de datos, 8 equipos (demo)', 'Hala centrum danych, 8 urządzeń (demo)'),
  hospital_wing_10: L('Hospital wing, 10 assets (demo)', 'Лікарняний корпус, 10 активів (демо)', 'Krankenhausflügel, 10 Anlagen (Demo)', 'Ziekenhuisvleugel, 10 installaties (demo)', 'Aile d’hôpital, 10 équipements (démo)', 'Ala de hospital, 10 equipos (demo)', 'Skrzydło szpitala, 10 urządzeń (demo)'),
  school_8: L('Secondary school, 8 assets (demo)', 'Середня школа, 8 активів (демо)', 'Weiterführende Schule, 8 Anlagen (Demo)', 'Middelbare school, 8 installaties (demo)', 'Collège-lycée, 8 équipements (démo)', 'Instituto de secundaria, 8 equipos (demo)', 'Szkoła średnia, 8 urządzeń (demo)')
};
var ASSET_NAMES_I18N = {
  office_12: {
    'AHU-01': L('AHU-01 offices floors 1–4', 'ПВУ-01 офіси, поверхи 1–4', 'RLT-01 Büros, Geschosse 1–4', 'LBK-01 kantoren, verdiepingen 1–4', 'CTA-01 bureaux, étages 1 à 4', 'UTA-01 oficinas, plantas 1–4', 'AHU-01 biura, piętra 1–4'),
    'AHU-02': L('AHU-02 server room (duty/standby fans)', 'ПВУ-02 серверна (робочий/резервний вентилятори)', 'RLT-02 Serverraum (Betriebs-/Reserveventilator)', 'LBK-02 serverruimte (bedrijfs-/reserveventilator)', 'CTA-02 salle serveurs (ventilateurs service/secours)', 'UTA-02 sala de servidores (ventiladores en servicio/reserva)', 'AHU-02 serwerownia (wentylator roboczy/rezerwowy)'),
    'CH-01': L('Chiller 1 (R410A 45 kg)', 'Чилер 1 (R410A 45 кг)', 'Kaltwassersatz 1 (R410A 45 kg)', 'Koelmachine 1 (R410A 45 kg)', 'Groupe froid 1 (R410A 45 kg)', 'Enfriadora 1 (R410A 45 kg)', 'Agregat wody lodowej 1 (R410A 45 kg)'),
    'CH-02': L('Chiller 2 (R410A 45 kg)', 'Чилер 2 (R410A 45 кг)', 'Kaltwassersatz 2 (R410A 45 kg)', 'Koelmachine 2 (R410A 45 kg)', 'Groupe froid 2 (R410A 45 kg)', 'Enfriadora 2 (R410A 45 kg)', 'Agregat wody lodowej 2 (R410A 45 kg)'),
    'BLR-01': L('Gas boiler 400 kW', 'Газовий котел 400 кВт', 'Gaskessel 400 kW', 'Gasketel 400 kW', 'Chaudière gaz 400 kW', 'Caldera de gas 400 kW', 'Kocioł gazowy 400 kW'),
    'P-HW-01': L('Heating circuit pumps (twin head)', 'Насоси контуру опалення (здвоєні)', 'Heizkreispumpen (Doppelpumpe)', 'Verwarmingsgroeppompen (dubbelkop)', 'Pompes du circuit de chauffage (double)', 'Bombas del circuito de calefacción (dobles)', 'Pompy obiegu grzewczego (podwójne)'),
    'CAL-01': L('DHW calorifier 1500 l', 'Бойлер ГВП 1500 л', 'Trinkwasserspeicher 1500 l', 'Warmwaterboiler 1500 l', 'Ballon d’ECS 1500 l', 'Acumulador de ACS 1500 l', 'Zasobnik c.w.u. 1500 l'),
    'SPR-P1': L('Sprinkler pump set (electric + diesel)', 'Насосна установка спринклерів (електро + дизель)', 'Sprinklerpumpenanlage (elektrisch + Diesel)', 'Sprinklerpompset (elektrisch + diesel)', 'Groupe de pompage sprinkleur (électrique + diesel)', 'Grupo de bombeo de rociadores (eléctrica + diésel)', 'Zestaw pomp tryskaczowych (elektryczna + diesel)'),
    'EL-SYS': L('Emergency lighting (140 self-contained luminaires)', 'Аварійне освітлення (140 автономних світильників)', 'Notbeleuchtung (140 Einzelbatterieleuchten)', 'Noodverlichting (140 autonome armaturen)', 'Éclairage de sécurité (140 blocs autonomes)', 'Alumbrado de emergencia (140 luminarias autónomas)', 'Oświetlenie awaryjne (140 opraw z własnym akumulatorem)'),
    'UPS-01': L('UPS 60 kVA server room', 'ДБЖ 60 кВА серверної', 'USV 60 kVA Serverraum', 'UPS 60 kVA serverruimte', 'Onduleur 60 kVA salle serveurs', 'SAI 60 kVA sala de servidores', 'UPS 60 kVA serwerowni'),
    'GEN-01': L('Standby generator 300 kVA', 'Резервний генератор 300 кВА', 'Netzersatzaggregat 300 kVA', 'Noodstroomaggregaat 300 kVA', 'Groupe électrogène de secours 300 kVA', 'Grupo electrógeno de emergencia 300 kVA', 'Agregat prądotwórczy rezerwowy 300 kVA'),
    'MSB-01': L('Main LV switchboard 1600 A', 'Головний розподільчий щит НН 1600 А', 'Niederspannungshauptverteilung 1600 A', 'Hoofdverdeelinrichting LS 1600 A', 'TGBT 1600 A', 'Cuadro general de BT 1600 A', 'Rozdzielnica główna nn 1600 A')
  },
  datacentre_8: {
    'UPS-A': L('UPS A 500 kVA', 'ДБЖ A 500 кВА', 'USV A 500 kVA', 'UPS A 500 kVA', 'Onduleur A 500 kVA', 'SAI A 500 kVA', 'UPS A 500 kVA'),
    'UPS-B': L('UPS B 500 kVA', 'ДБЖ B 500 кВА', 'USV B 500 kVA', 'UPS B 500 kVA', 'Onduleur B 500 kVA', 'SAI B 500 kVA', 'UPS B 500 kVA'),
    'GEN-01': L('Generator 1 1250 kVA', 'Генератор 1, 1250 кВА', 'Aggregat 1, 1250 kVA', 'Aggregaat 1, 1250 kVA', 'Groupe électrogène 1, 1250 kVA', 'Grupo electrógeno 1, 1250 kVA', 'Agregat 1, 1250 kVA'),
    'GEN-02': L('Generator 2 1250 kVA', 'Генератор 2, 1250 кВА', 'Aggregat 2, 1250 kVA', 'Aggregaat 2, 1250 kVA', 'Groupe électrogène 2, 1250 kVA', 'Grupo electrógeno 2, 1250 kVA', 'Agregat 2, 1250 kVA'),
    'CH-01': L('Water-cooled chiller 1200 kW (R134a 300 kg)', 'Чилер з водяним охолодженням конденсатора 1200 кВт (R134a 300 кг)', 'Wassergekühlter Kaltwassersatz 1200 kW (R134a 300 kg)', 'Watergekoelde koelmachine 1200 kW (R134a 300 kg)', 'Groupe froid à condensation par eau 1200 kW (R134a 300 kg)', 'Enfriadora condensada por agua 1200 kW (R134a 300 kg)', 'Agregat wody lodowej chłodzony wodą 1200 kW (R134a 300 kg)'),
    'CT-01': L('Open cooling tower for CH-01', 'Відкрита градирня для CH-01', 'Offener Kühlturm für CH-01', 'Open koeltoren voor CH-01', 'Tour aéroréfrigérante ouverte pour CH-01', 'Torre de refrigeración abierta para CH-01', 'Otwarta wieża chłodnicza dla CH-01'),
    'CRAH-G': L('CRAH units group (10 × 100 kW)', 'Група прецизійних кондиціонерів CRAH (10 × 100 кВт)', 'Umluftkühlgeräte-Gruppe CRAH (10 × 100 kW)', 'Groep CRAH-units (10 × 100 kW)', 'Groupe d’armoires CRAH (10 × 100 kW)', 'Grupo de unidades CRAH (10 × 100 kW)', 'Grupa szaf klimatyzacji precyzyjnej CRAH (10 × 100 kW)'),
    'TX-01': L('MV/LV transformer 2000 kVA (single)', 'Трансформатор СН/НН 2000 кВА (один)', 'MS/NS-Transformator 2000 kVA (einzeln)', 'MS/LS-transformator 2000 kVA (enkel)', 'Transformateur HTA/BT 2000 kVA (unique)', 'Transformador MT/BT 2000 kVA (único)', 'Transformator SN/nn 2000 kVA (pojedynczy)')
  },
  hospital_wing_10: {
    'AHU-OT1': L('Operating theatre AHU', 'ПВУ операційної', 'RLT-Gerät OP-Saal', 'LBK operatiekamer', 'CTA du bloc opératoire', 'UTA de quirófano', 'Centrala wentylacyjna sali operacyjnej'),
    'AHU-W1': L('Ward AHU', 'ПВУ палатного відділення', 'RLT-Gerät Pflegestation', 'LBK verpleegafdeling', 'CTA du service d’hospitalisation', 'UTA de planta de hospitalización', 'Centrala wentylacyjna oddziału'),
    'CAL-H1': L('DHW calorifier 2000 l (wards)', 'Бойлер ГВП 2000 л (палати)', 'Trinkwasserspeicher 2000 l (Stationen)', 'Warmwaterboiler 2000 l (afdelingen)', 'Ballon d’ECS 2000 l (services)', 'Acumulador de ACS 2000 l (plantas)', 'Zasobnik c.w.u. 2000 l (oddziały)'),
    'BLR-01': L('Boiler 1 600 kW', 'Котел 1, 600 кВт', 'Kessel 1, 600 kW', 'Ketel 1, 600 kW', 'Chaudière 1, 600 kW', 'Caldera 1, 600 kW', 'Kocioł 1, 600 kW'),
    'BLR-02': L('Boiler 2 600 kW', 'Котел 2, 600 кВт', 'Kessel 2, 600 kW', 'Ketel 2, 600 kW', 'Chaudière 2, 600 kW', 'Caldera 2, 600 kW', 'Kocioł 2, 600 kW'),
    'GEN-H1': L('Essential supply generator 800 kVA', 'Генератор гарантованого живлення 800 кВА', 'Ersatzstromaggregat (Sicherheitsstrom) 800 kVA', 'Noodstroomaggregaat essentiële voeding 800 kVA', 'Groupe électrogène de sécurité 800 kVA', 'Grupo electrógeno de suministro esencial 800 kVA', 'Agregat zasilania gwarantowanego 800 kVA'),
    'UPS-OT': L('Theatre IPS / UPS 40 kVA', 'ДБЖ / IPS операційних 40 кВА', 'OP-USV / IT-System 40 kVA', 'UPS / IT-net operatiekamers 40 kVA', 'Onduleur / IPS bloc opératoire 40 kVA', 'SAI / red IT de quirófanos 40 kVA', 'UPS / sieć IT sal operacyjnych 40 kVA'),
    'LIFT-B1': L('Bed lift 2000 kg', 'Ліфт для лежачих хворих 2000 кг', 'Bettenaufzug 2000 kg', 'Beddenlift 2000 kg', 'Monte-lit 2000 kg', 'Ascensor de camas 2000 kg', 'Dźwig szpitalny (łóżkowy) 2000 kg'),
    'FA-01': L('Addressable fire alarm (L1)', 'Адресна пожежна сигналізація (L1)', 'Adressierbare Brandmeldeanlage (L1)', 'Adresseerbare brandmeldinstallatie (L1)', 'SSI adressable (L1)', 'Detección de incendios analógica direccionable (L1)', 'Adresowalny system sygnalizacji pożaru (L1)'),
    'EL-01': L('Central-battery emergency lighting', 'Аварійне освітлення з центральною батареєю', 'Notbeleuchtung mit Zentralbatterie', 'Noodverlichting met centrale batterij', 'Éclairage de sécurité à source centrale', 'Alumbrado de emergencia con batería central', 'Oświetlenie awaryjne z baterią centralną')
  },
  school_8: {
    'BLR-01': L('Gas boiler 350 kW (1995)', 'Газовий котел 350 кВт (1995)', 'Gaskessel 350 kW (1995)', 'Gasketel 350 kW (1995)', 'Chaudière gaz 350 kW (1995)', 'Caldera de gas 350 kW (1995)', 'Kocioł gazowy 350 kW (1995)'),
    'HP-01': L('Air-to-water heat pump 120 kW (R32 25 kg)', 'Тепловий насос повітря–вода 120 кВт (R32 25 кг)', 'Luft-Wasser-Wärmepumpe 120 kW (R32 25 kg)', 'Lucht-waterwarmtepomp 120 kW (R32 25 kg)', 'Pompe à chaleur air/eau 120 kW (R32 25 kg)', 'Bomba de calor aire-agua 120 kW (R32 25 kg)', 'Pompa ciepła powietrze–woda 120 kW (R32 25 kg)'),
    'AHU-GYM': L('Sports hall AHU', 'ПВУ спортзалу', 'RLT-Gerät Sporthalle', 'LBK sporthal', 'CTA du gymnase', 'UTA del polideportivo', 'Centrala wentylacyjna hali sportowej'),
    'CAL-01': L('DHW calorifier 800 l (sports hall showers)', 'Бойлер ГВП 800 л (душові спортзалу)', 'Trinkwasserspeicher 800 l (Duschen Sporthalle)', 'Warmwaterboiler 800 l (douches sporthal)', 'Ballon d’ECS 800 l (douches du gymnase)', 'Acumulador de ACS 800 l (duchas del polideportivo)', 'Zasobnik c.w.u. 800 l (prysznice hali sportowej)'),
    'WB-01': L('Cold water booster set', 'Насосна станція підвищення тиску холодної води', 'Druckerhöhungsanlage Kaltwasser', 'Hydrofoorinstallatie koud water', 'Surpresseur d’eau froide', 'Grupo de presión de agua fría', 'Zestaw hydroforowy wody zimnej'),
    'FA-01': L('Fire alarm (conventional, 6 zones)', 'Пожежна сигналізація (неадресна, 6 зон)', 'Brandmeldeanlage (konventionell, 6 Meldergruppen)', 'Brandmeldinstallatie (conventioneel, 6 zones)', 'SSI conventionnel (6 zones)', 'Detección de incendios convencional (6 zonas)', 'System sygnalizacji pożaru (konwencjonalny, 6 stref)'),
    'EL-01': L('Emergency lighting (95 luminaires)', 'Аварійне освітлення (95 світильників)', 'Notbeleuchtung (95 Leuchten)', 'Noodverlichting (95 armaturen)', 'Éclairage de sécurité (95 blocs)', 'Alumbrado de emergencia (95 luminarias)', 'Oświetlenie awaryjne (95 opraw)'),
    'BMS-01': L('BMS outstation (heating plant)', 'Контролер BMS (котельня)', 'GLT-Automationsstation (Heizzentrale)', 'GBS-onderstation (stookruimte)', 'Automate GTB (chaufferie)', 'Controlador BMS (sala de calderas)', 'Sterownik BMS (kotłownia)')
  }
};
/* life request 21:50: refrigerant designation as a field (meplifecycle reads it; parsing the name stays its fallback) */
var PRESET_REFRIGERANTS = { office_12: { 'CH-01': 'R410A', 'CH-02': 'R410A' }, datacentre_8: { 'CH-01': 'R134a' }, school_8: { 'HP-01': 'R32' } };
Object.keys(PRESET_SITES).forEach(function (sid) {
  var s = PRESET_SITES[sid];
  if (SITE_NAMES_I18N[sid] && SITE_NAMES_I18N[sid].en === s.site.name) s.site.name_i18n = SITE_NAMES_I18N[sid];
  s.assets.forEach(function (a) {
    var n = (ASSET_NAMES_I18N[sid] || {})[a.id];
    if (n && n.en === a.name) a.name_i18n = n;
    var r = (PRESET_REFRIGERANTS[sid] || {})[a.id];
    if (r) a.refrigerant = r;
  });
});
/* assetName(asset, lang) / siteName(doc, lang): display names. name_i18n is used only while `name` is unchanged
   (name === name_i18n.en); otherwise the user's name, else the id. Pages fall back to asset.name without core. */
function i18nName(obj, lang) {
  var nm = typeof obj.name === 'string' ? obj.name : '', i18 = obj.name_i18n;
  if (i18 && typeof i18 === 'object' && !Array.isArray(i18) && i18.en === nm && typeof i18[lang] === 'string' && i18[lang]) return i18[lang];
  return nm;
}
function assetName(asset, lang) {
  if (!asset || typeof asset !== 'object') return '';
  return i18nName(asset, lang) || (asset.id != null ? String(asset.id) : '');
}
function siteName(doc, lang) { return doc && doc.site && typeof doc.site === 'object' ? i18nName(doc.site, lang) : ''; }
function presetSite(id) { return PRESET_SITES[id] ? clone(PRESET_SITES[id]) : null; }

/* =====================================================================================
   UI strings + registerBar widget (DOM only when called)
   ===================================================================================== */
var UI = {
  register: L('Site register', 'Реєстр об’єкта', 'Anlagenregister', 'Installatieregister', 'Registre du site', 'Registro del sitio', 'Rejestr obiektu'),
  assets: L('assets', 'активів', 'Anlagen', 'installaties', 'équipements', 'equipos', 'urządzeń'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newRegister: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  resultsFrom: L('Register has results from', 'У реєстрі є результати з', 'Register enthält Ergebnisse aus', 'Register bevat resultaten uit', 'Le registre contient des résultats de', 'El registro tiene resultados de', 'Rejestr zawiera wyniki z'),
  noModules: L('No tool results yet', 'Результатів інструментів ще немає', 'Noch keine Ergebnisse', 'Nog geen resultaten', 'Pas encore de résultats', 'Aún no hay resultados', 'Brak wyników narzędzi'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Register imported', 'Реєстр імпортовано', 'Register importiert', 'Register geïmporteerd', 'Registre importé', 'Registro importado', 'Zaimportowano rejestr'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new empty register? Unsaved data in this browser will be replaced.', 'Почати новий порожній реєстр? Незбережені дані в цьому браузері буде замінено.', 'Neues leeres Register beginnen? Nicht gesicherte Daten in diesem Browser werden ersetzt.', 'Nieuw leeg register beginnen? Niet opgeslagen gegevens in deze browser worden vervangen.', 'Commencer un registre vide ? Les données non exportées de ce navigateur seront remplacées.', '¿Empezar un registro vacío? Se reemplazarán los datos no exportados de este navegador.', 'Rozpocząć nowy pusty rejestr? Niezapisane dane w tej przeglądarce zostaną zastąpione.'),
  siblings: L('Package tools', 'Інструменти пакета', 'Werkzeuge des Pakets', 'Tools van het pakket', 'Outils du paquet', 'Herramientas del paquete', 'Narzędzia pakietu'),
  unnamed: L('(unnamed site)', '(об’єкт без назви)', '(Standort ohne Namen)', '(naamloze locatie)', '(site sans nom)', '(sitio sin nombre)', '(obiekt bez nazwy)'),
  typical: L('typical (class library)', 'типове (бібліотека класів)', 'typisch (Klassenbibliothek)', 'typisch (klassenbibliotheek)', 'typique (bibliothèque de classes)', 'típico (biblioteca de clases)', 'typowe (biblioteka klas)'),
  learningAssumption: L('learning assumption — replace with site data', 'навчальне припущення — замініть даними об’єкта', 'Lernannahme — durch Standortdaten ersetzen', 'leeraanname — vervang door locatiegegevens', 'hypothèse pédagogique — à remplacer par les données du site', 'supuesto didáctico: sustitúyalo por datos del sitio', 'założenie szkoleniowe — zastąp danymi obiektu'),
  disclaimer: L('Planning aid, not a substitute for manufacturer instructions and national regulations.', 'Допоміжний інструмент планування, не замінює інструкцій виробника і національних норм.', 'Planungshilfe, kein Ersatz für Herstellervorgaben und nationale Vorschriften.', 'Planningshulpmiddel, geen vervanging voor fabrieksvoorschriften en nationale regelgeving.', 'Aide à la planification, ne remplace ni les instructions du fabricant ni la réglementation nationale.', 'Ayuda a la planificación; no sustituye las instrucciones del fabricante ni la normativa nacional.', 'Narzędzie wspomagające planowanie, nie zastępuje instrukcji producenta ani przepisów krajowych.')
};

function registerBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyRegister());
  var storageOk = !!storage();
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'mep-register-bar', 'aria-label': 'register', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), count = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var bImport = el('button', { type: 'button', style: btnStyle }), bExport = el('button', { type: 'button', style: btnStyle }), bNew = el('button', { type: 'button', style: btnStyle });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  head.appendChild(title); head.appendChild(count); head.appendChild(bImport); head.appendChild(bExport); head.appendChild(bNew); head.appendChild(file);
  box.appendChild(head); box.appendChild(modules); box.appendChild(nav); box.appendChild(status);
  host.appendChild(box);

  function setDoc(next, silent, noSave) {
    doc = next;
    if (!noSave) { var r = save(doc); storageOk = r.ok; if (!r.ok) status.textContent = tx('storageOff'); }
    render();
    if (!silent && typeof opts.onChange === 'function') opts.onChange(clone(doc));
  }
  /* without opts.getDoc: a page may have saved a module straight to storage — export the stored register when it is
     valid, of the same site and newer (latest modules.*.updatedAt, then revision) than the one shown */
  function stamp(d) {
    var m = d && d.modules || {}, best = '';
    Object.keys(m).forEach(function (k) { var u = m[k] && m[k].updatedAt; if (typeof u === 'string' && u > best) best = u; });
    return best;
  }
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    var newer = a > b || (a === b && (st.revision || 0) > (cur.revision || 0));
    if (!newer) return cur;
    doc = st; render();
    return st;
  }
  function render() {
    var L_ = lang();
    box.setAttribute('aria-label', tx('register'));
    title.textContent = tx('register') + ': ' + ((doc.site && doc.site.name) || tx('unnamed'));
    count.textContent = (doc.assets ? doc.assets.length : 0) + ' ' + tx('assets');
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newRegister');
    modules.textContent = '';
    var ids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!ids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    ids.forEach(function (k) {
      var m = doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0];
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', null, tx('resultsFrom') + ' ' + (tool ? t(tool.name, L_) : k) + (date ? ' (' + date + ')' : '')));
      if (typeof opts.onUse === 'function') {
        var b = el('button', { type: 'button', style: btnStyle, 'data-module': k }, tx('use'));
        b.addEventListener('click', function () { opts.onUse(k, clone(doc.modules[k]), clone(doc)); });
        chip.appendChild(b);
      }
      modules.appendChild(chip);
    });
    nav.textContent = '';
    nav.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('siblings') + ':'));
    TOOLS.forEach(function (tool) {
      if (tool.id === opts.toolId) { nav.appendChild(el('strong', { 'aria-current': 'page' }, t(tool.name, L_))); return; }
      nav.appendChild(el('a', { href: tool.id + '.html' + (L_ !== 'en' ? '?lang=' + L_ : '') }, t(tool.name, L_)));
    });
  }
  bImport.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f) return;
    if (f.size > LIMITS.bytes) { status.textContent = tx('invalid') + ': > 2 MB'; file.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var r = importJSON(String(rd.result));
      if (!r.ok) status.textContent = tx('invalid') + ': ' + r.errors.slice(0, 3).map(function (e) { return e.path + ' ' + e.msg; }).join('; ');
      else { setDoc(r.doc); status.textContent = tx('imported'); }
      file.value = '';
    };
    rd.readAsText(f);
  });
  bExport.addEventListener('click', function () {
    var cur = typeof opts.getDoc === 'function' ? opts.getDoc() : newerStored(doc);
    var text = exportJSON(cur);
    var a = el('a'); var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = ((cur.site && cur.site.name) || 'mep-register').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) + '.mep.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyRegister());
  });
  function onStorage(e) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    var r = importJSON(e.newValue);
    if (r.ok) { doc = r.doc; render(); if (typeof opts.onChange === 'function') opts.onChange(clone(doc)); }
  }
  if (typeof window !== 'undefined' && opts.syncTabs !== false) window.addEventListener('storage', onStorage);
  render();
  if (!storageOk) status.textContent = tx('storageOff');
  return {
    element: box,
    /* refresh() re-renders (e.g. after a language change); refresh(doc) also shows doc without saving it */
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid register'); doc = clone(next); } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    /* setDoc(doc) saves to localStorage; setDoc(doc, {save:false}) only displays (e.g. an example register) */
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid register'); setDoc(clone(next), true, !!(o && o.save === false)); },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

return {
  version: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS.slice(), LIMITS: LIMITS, ENUMS: ENUMS,
  CLASSES: CLASSES, TECHNIQUES: TECHNIQUES, STATUTORY: STATUTORY, TRADES: TRADES, SOURCES: SOURCES, TOOLS: TOOLS, UI: UI,
  PRESET_SITES: PRESET_SITES, presetSite: presetSite, CONDITION_SCALE: CONDITION_SCALE,
  register: { empty: emptyRegister, validate: validate, load: load, save: save, exportJSON: exportJSON, importJSON: importJSON, withModule: withModule, resolved: resolved },
  statutoryFor: statutoryFor, creditedRedundancy: creditedRedundancy, TEST_WINDOW_MONTHS: TEST_WINDOW_MONTHS, ASSET_OPTIONAL_FIELDS: ASSET_OPTIONAL_FIELDS,
  assetName: assetName, siteName: siteName,
  csv: csv, t: t, fmt: fmt, L: L,
  ui: { registerBar: registerBar }
};
});
