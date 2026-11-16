/* plumbing-core.js — global PLBCore: shared core of the tools.petrov.re Plumbing & Sanitary package
   (plbfixtures, plbsupply, plbdhw, plbcirc, plblegionella, plbbackflow, plbbooster, plbdrainage, plbliftstation,
   plbrainwater, plbwatersaving).
   Sections: 1 FIXTURES (sanitary fixture library), 2 MATERIALS (pipe series), 3 water properties + Colebrook friction + ZETA,
   4 BUILDING_TYPES, 5 REGIONS (legal pointers), 6 project document (validate / import / export / CSV / presets / totals),
   7 ui.projectBar widget. Pure data + functions, no dependencies, UMD (browser global PLBCore, node module.exports).
   Every number carries provenance (PLBCore.SOURCES); values without a public source are tagged kind `learning_assumption`.
   Design aid only — not a substitute for the standards, the water utility's rules and national/regional regulations. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PLBCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '0.2.0';
var SCHEMA = 'tools.petrov.re/plumbing/v1';
var STORAGE_KEY = 'plb.project.v1';
var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];

/* 7-language string in the fixed order en uk de nl fr es pl */
function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }
/* own-property lookup: ids from imported projects never resolve prototype names (toString, constructor, …) */
function has(o, k) { return o != null && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
function own(o, k) { return has(o, k) ? o[k] : undefined; }

function t(dict, lang) {
  if (dict == null) return '';
  if (typeof dict === 'string') return dict;
  if (lang && dict[lang] != null) return dict[lang];
  return dict.en != null ? dict.en : '';
}

/* fmt: Intl.NumberFormat(lang), default grouping (same separators as DiagramUI.num / MEPCore.fmt):
   en 1,402.5; de/nl 1.402,5; es 1402,5 / 13.512 (es and pl group from 5 digits); uk/fr/pl narrow / no-break space + decimal comma.
   Fixed digits (default by magnitude), U+2212 minus, no negative zero. null / non-finite -> '—'. */
var FMT_FALLBACK = { en: [',', '.', 4], uk: [' ', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: [' ', ',', 4], es: ['.', ',', 5], pl: [' ', ',', 5] };
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
   manufacturer | learning_assumption. Standard tables are quoted as widely published design values.
   ===================================================================================== */
var SOURCES = {
  en806_3: { title: 'EN 806-3 Specifications for installations inside buildings conveying water for human consumption — Part 3: Pipe sizing, simplified method (Table 2 loading units, 1 LU = 0.1 l/s; design-flow curve)', edition: 'EN 806-3:2006', url: 'https://standards.cen.eu/', kind: 'standard' },
  en806_2: { title: 'EN 806-2 … Part 2: Design (pressures, temperatures, velocities)', edition: 'EN 806-2:2005', url: 'https://standards.cen.eu/', kind: 'standard' },
  din1988_300: { title: 'DIN 1988-300 Technische Regeln für Trinkwasser-Installationen — Ermittlung der Rohrdurchmesser (design-flow table: design flows VR and minimum flow pressures; peak-flow constants a, b, c per building type; roughness values — tables cited by content, numbering not verified against the 2012-05 text)', edition: 'DIN 1988-300:2012-05', url: 'https://www.dinmedia.de/', kind: 'standard' },
  en12056_2: { title: 'EN 12056-2 Gravity drainage systems inside buildings — Part 2: Sanitary pipework, layout and calculation (Table 2 discharge units DU for systems I–IV; Table 3 frequency factor K; Qww = K·√ΣDU)', edition: 'EN 12056-2:2000', url: 'https://standards.cen.eu/', kind: 'standard' },
  en12056_4: { title: 'EN 12056-4 … Part 4: Wastewater lifting plants — layout and calculation', edition: 'EN 12056-4:2000', url: 'https://standards.cen.eu/', kind: 'standard' },
  en1717: { title: 'EN 1717 Protection against pollution of potable water in water installations and general requirements of devices to prevent pollution by backflow (fluid categories 1–5, protection units)', edition: 'EN 1717:2000', url: 'https://standards.cen.eu/', kind: 'standard' },
  en1717_typical: { title: 'Typical fluid category of a sanitary appliance as commonly listed in EN 1717 guidance and water-utility schedules (e.g. UK Water Supply (Water Fittings) Regulations 1999, Schedule 1). Depends on use — confirm per connection point (plbbackflow)', edition: 'plumbing-core 0.1, 2026-11', url: 'https://www.legislation.gov.uk/uksi/1999/1148/schedule/1', kind: 'learning_assumption' },
  en15154: { title: 'EN 15154-2 Emergency safety showers — Part 2: Eye wash units connected to the water supply (minimum flow 6 l/min)', edition: 'EN 15154-2:2006', url: 'https://standards.cen.eu/', kind: 'standard' },
  en1057: { title: 'EN 1057 Copper and copper alloys — Seamless, round copper tubes for water and gas in sanitary and heating applications (outside diameter × wall)', edition: 'EN 1057:2006+A1:2010', url: 'https://standards.cen.eu/', kind: 'standard' },
  en10312: { title: 'EN 10312 Welded stainless steel tubes for the conveyance of water and other aqueous liquids (series 2 dimensions, as used by press-fitting systems)', edition: 'EN 10312:2002', url: 'https://standards.cen.eu/', kind: 'standard' },
  en10255: { title: 'EN 10255 Non-alloy steel tubes suitable for welding and threading — medium series (M)', edition: 'EN 10255:2004+A1:2007', url: 'https://standards.cen.eu/', kind: 'standard' },
  iso15875: { title: 'EN ISO 15875 Plastics piping systems for hot and cold water installations — Crosslinked polyethylene (PE-X) (SDR series)', edition: 'EN ISO 15875-2:2003', url: 'https://www.iso.org/', kind: 'standard' },
  iso15874: { title: 'EN ISO 15874 Plastics piping systems for hot and cold water installations — Polypropylene (PP-R), PN 20 = S 2.5 / SDR 6', edition: 'EN ISO 15874-2:2013', url: 'https://www.iso.org/', kind: 'standard' },
  iso21003: { title: 'EN ISO 21003 Multilayer piping systems for hot and cold water installations inside buildings; dimensions as commonly catalogued (16×2 … 63×4.5) — check the manufacturer', edition: 'EN ISO 21003-2:2008', url: 'https://www.iso.org/', kind: 'public_guide' },
  en12201: { title: 'EN 12201-2 Plastics piping systems for water supply — Polyethylene (PE 100 SDR 11)', edition: 'EN 12201-2:2011+A1:2013', url: 'https://standards.cen.eu/', kind: 'standard' },
  en1329: { title: 'EN 1329-1 Soil and waste discharge (low and high temperature) within the building structure — PVC-U, application area B dimensions as commonly catalogued', edition: 'EN 1329-1:2014', url: 'https://standards.cen.eu/', kind: 'public_guide' },
  en1451: { title: 'EN 1451-1 Soil and waste discharge within the building structure — Polypropylene (PP), dimensions as commonly catalogued', edition: 'EN 1451-1:2017', url: 'https://standards.cen.eu/', kind: 'public_guide' },
  en1519: { title: 'EN 1519-1 Soil and waste discharge within the building structure — Polyethylene (PE-HD), dimensions as commonly catalogued', edition: 'EN 1519-1:2019', url: 'https://standards.cen.eu/', kind: 'public_guide' },
  en877: { title: 'EN 877 Cast iron pipes and fittings for the evacuation of water from buildings (SML), dimensions as commonly catalogued', edition: 'EN 877:2021', url: 'https://standards.cen.eu/', kind: 'public_guide' },
  kell1975: { title: 'Kell G.S., Density, thermal expansivity and compressibility of liquid water from 0 °C to 150 °C, J. Chem. Eng. Data 20 (1975) 97–105 (rational correlation, 1 atm; agrees with IAPWS-95 within 0.01 % at 0–100 °C)', edition: '1975', url: 'https://doi.org/10.1021/je60064a005', kind: 'public_guide' },
  iapws2008: { title: 'IAPWS R12-08 Release on the IAPWS Formulation 2008 for the Viscosity of Ordinary Water Substance (μ0·μ1, critical enhancement neglected)', edition: 'IAPWS 2008', url: 'http://www.iapws.org/relguide/viscosity.html', kind: 'standard' },
  nist_webbook: { title: 'NIST Chemistry WebBook, SRD 69 — Thermophysical properties of water at 0.101325 MPa (IAPWS-95 / IAPWS 2011 thermal conductivity), tabulated cp and k', edition: 'webbook.nist.gov, 2023', url: 'https://webbook.nist.gov/chemistry/fluid/', kind: 'public_guide' },
  colebrook1939: { title: 'Colebrook C.F., Turbulent flow in pipes …, J. Inst. Civ. Eng. 11 (1939) 133–156; Swamee P.K., Jain A.K., J. Hydraul. Div. ASCE 102 (1976) 657–664 (explicit start value)', edition: '1939 / 1976', url: 'https://doi.org/10.1680/ijoti.1939.13150', kind: 'public_guide' },
  zeta_typical: { title: 'Typical loss coefficients ζ of fittings and valves as tabulated in design handbooks (e.g. DIN 1988-300 Annex / Recknagel); actual values vary by make and DN — use manufacturer data where available', edition: 'plumbing-core 0.1, 2026-11', url: '', kind: 'learning_assumption' },
  vdi6023: { title: 'VDI/DVGW 6023 Blatt 1 Hygiene in Trinkwasser-Installationen — Anforderungen an Planung, Ausführung, Betrieb und Instandhaltung', edition: 'VDI/DVGW 6023-1:2022', url: 'https://www.vdi.de/', kind: 'standard' },
  dvgw_w551: { title: 'DVGW W 551 Trinkwassererwärmungs- und Trinkwasserleitungsanlagen — Technische Maßnahmen zur Verminderung des Legionellenwachstums (60 °C at heater outlet, ≤ 5 K drop, 3-litre rule)', edition: 'DVGW W 551:2004', url: 'https://www.dvgw.de/', kind: 'standard' },
  vl_legionella: { title: 'Besluit van de Vlaamse Regering betreffende de beheersing van legionella in hoog-risico-inrichtingen (Legionellabesluit), with later amendments', edition: 'BVR 9 februari 2007', url: 'https://codex.vlaanderen.be/', kind: 'regulation' },
  vl_gsv_hemelwater: { title: 'Gewestelijke stedenbouwkundige verordening inzake hemelwaterputten, infiltratievoorzieningen, buffervoorzieningen en gescheiden lozing (GSV Hemelwater), revised 2023', edition: 'BVR 10 februari 2023, in force 1 October 2023', url: 'https://omgeving.vlaanderen.be/', kind: 'regulation' },
  belgaqua_tvbi: { title: 'Belgaqua — Technische voorschriften voor binneninstallaties (TVBI) / Prescriptions techniques pour installations intérieures (PTI); Flemish water suppliers: keuring (inspection) of the internal installation and private sewer before connection', edition: 'Belgaqua, current edition', url: 'https://www.belgaqua.be/', kind: 'regulation' },
  be_welfare: { title: 'Codex over het welzijn op het werk / Code du bien-être au travail, Book III Title 1 (workplace requirements incl. sanitary facilities)', edition: 'Codex 2017, consolidated', url: 'https://werk.belgie.be/', kind: 'regulation' },
  nl_drinkwater: { title: 'Drinkwaterbesluit and Drinkwaterregeling (legionella prevention for priority installations: risk analysis and management plan)', edition: 'NL, consolidated 2024', url: 'https://wetten.overheid.nl/', kind: 'regulation' },
  nl_bbl: { title: 'Besluit bouwwerken leefomgeving (Bbl), drinking water and drainage requirements via NEN 1006 and NEN 3215', edition: 'NL, in force 1 January 2024', url: 'https://wetten.overheid.nl/', kind: 'regulation' },
  de_trinkwv: { title: 'Trinkwasserverordnung (TrinkwV 2023): Legionella examination of large hot-water installations with aerosol-forming outlets in commercial or public activity', edition: 'BGBl. 2023 I Nr. 159', url: 'https://www.gesetze-im-internet.de/trinkwv_2023/', kind: 'regulation' },
  fr_ecs_2005: { title: 'Arrêté du 30 novembre 2005 (modifying arrêté du 23 juin 1978): hot water temperatures — ≤ 50 °C at outlets of rooms for personal hygiene, ≥ 50 °C in circulated networks where the volume between heater and furthest outlet exceeds 3 L', edition: 'JORF 2005', url: 'https://www.legifrance.gouv.fr/', kind: 'regulation' },
  fr_erp_2010: { title: 'Arrêté du 1er février 2010 relatif à la surveillance des légionelles dans les installations de production, de stockage et de distribution d’eau chaude sanitaire (ERP)', edition: 'JORF 2010', url: 'https://www.legifrance.gouv.fr/', kind: 'regulation' },
  uk_wsr1999: { title: 'Water Supply (Water Fittings) Regulations 1999 (England and Wales), Schedule 2 — backflow, notification', edition: 'SI 1999/1148', url: 'https://www.legislation.gov.uk/uksi/1999/1148', kind: 'regulation' },
  uk_hsg274: { title: 'HSE ACOP L8 and HSG274 Part 2 — Legionnaires’ disease: control of legionella in hot and cold water systems (stored ≥ 60 °C, distributed ≥ 50 °C (55 °C healthcare) within 1 min, cold < 20 °C within 2 min)', edition: 'L8 4th ed. 2013, HSG274-2 2014', url: 'https://www.hse.gov.uk/pubns/books/hsg274.htm', kind: 'public_guide' },
  eu_dwd: { title: 'Directive (EU) 2020/2184 on the quality of water intended for human consumption — domestic distribution risk assessment, Legionella parameter 1000 CFU/l', edition: 'OJ L 435, 23.12.2020', url: 'https://eur-lex.europa.eu/eli/dir/2020/2184/oj', kind: 'regulation' },
  la_plb: { title: 'Learning assumption of this tool package (engineering judgement; replace with project data)', edition: 'plumbing-core ' + VERSION + ', 2026-11', url: '', kind: 'learning_assumption' }
};

/* =====================================================================================
   1 FIXTURES — sanitary fixture library.
   lu: EN 806-3 loading units {cold, hot} (1 LU = 0.1 l/s); qa_lps: DIN 1988-300 design flow VR {cold, hot};
   pmin_flow_bar: DIN 1988-300 minimum flow pressure; du_lps: EN 12056-2 Table 2 {I, II, III, IV} (null = not used in that system);
   branch_dn_min: smallest single-appliance branch {I, II}; fluid_category: EN 1717 typical; prov: field -> source id.
   ===================================================================================== */
var STD = { lu: 'en806_3', qa: 'din1988_300', pmin: 'din1988_300', du: 'en12056_2', dn: 'la_plb', fc: 'en1717_typical', use: 'la_plb' };
function fx(o) {
  var prov = {}; Object.keys(STD).forEach(function (k) { prov[k] = STD[k]; });
  if (o.prov) Object.keys(o.prov).forEach(function (k) { prov[k] = o.prov[k]; });
  o.prov = prov;
  o.hot = !!(o.lu.hot || o.qa_lps.hot);
  o.aerosol = !!o.aerosol;
  o.efficient_variants = o.efficient_variants || [];
  o.sources = Object.keys(prov).map(function (k) { return prov[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  return o;
}
/* typical use (learning assumption): litres per use, hot-water share, uses per person and day by building type */
function U(litres, hotShare, uses) { return { litres_per_use: litres, hot_share: hotShare, uses_per_person_day: uses }; }

var FIXTURES = {
  wc_cistern: fx({ id: 'wc_cistern', name: L('WC with cistern (6 l)', 'Унітаз зі зливним бачком (6 л)', 'WC mit Spülkasten (6 l)', 'Toilet met spoelreservoir (6 l)', 'WC à réservoir de chasse (6 l)', 'Inodoro con cisterna (6 l)', 'WC ze spłuczką zbiornikową (6 l)'),
    lu: { cold: 1, hot: 0 }, qa_lps: { cold: 0.13, hot: 0 }, pmin_flow_bar: 0.5, du_lps: { I: 2.0, II: 1.8, III: 1.7, IV: 2.0 }, branch_dn_min: { I: 100, II: 80 }, fluid_category: 5,
    note: L('EN 12056-2 system III: 1.2–1.7 l/s depending on the WC; the upper value is used.', 'EN 12056-2, система III: 1,2–1,7 л/с залежно від унітаза; прийнято верхнє значення.', 'EN 12056-2 System III: 1,2–1,7 l/s je nach WC; der obere Wert wird verwendet.', 'EN 12056-2 systeem III: 1,2–1,7 l/s afhankelijk van de toilet; de bovenwaarde wordt gebruikt.', 'EN 12056-2 système III : 1,2–1,7 l/s selon le WC ; la valeur haute est retenue.', 'EN 12056-2 sistema III: 1,2–1,7 l/s según el inodoro; se usa el valor superior.', 'EN 12056-2 system III: 1,2–1,7 l/s zależnie od miski; przyjęto wartość górną.'),
    use: U(6, 0, { residential: 4.5, office: 2.5, school: 2, hotel: 4, hospital: 4, care_home: 4.5, sports: 1, retail: 0.3, restaurant: 0.5, industrial: 2.5 }),
    efficient_variants: [{ id: 'wc_dual_4_2', name: L('Dual flush 4/2 l', 'Подвійний злив 4/2 л', 'Zwei-Mengen-Spülung 4/2 l', 'Dubbele spoeling 4/2 l', 'Double chasse 4/2 l', 'Doble descarga 4/2 l', 'Podwójne spłukiwanie 4/2 l'), litres_per_use: 2.7, source: 'la_plb' }] }),
  wc_flushvalve: fx({ id: 'wc_flushvalve', name: L('WC with flush valve (DN 20)', 'Унітаз зі змивним краном (DN 20)', 'WC mit Druckspüler (DN 20)', 'Toilet met drukspoeler (DN 20)', 'WC à robinet de chasse (DN 20)', 'Inodoro con fluxor (DN 20)', 'WC ze spłuczką ciśnieniową (DN 20)'),
    lu: { cold: 15, hot: 0 }, qa_lps: { cold: 1.0, hot: 0 }, pmin_flow_bar: 1.2, du_lps: { I: 2.5, II: 2.0, III: 1.7, IV: 2.5 }, branch_dn_min: { I: 100, II: 80 }, fluid_category: 5,
    prov: { du: 'la_plb' }, use: U(6, 0, { office: 2.5, school: 2, hospital: 4, sports: 1, retail: 0.3, industrial: 2.5 }) }),
  urinal_flush: fx({ id: 'urinal_flush', name: L('Urinal with flush valve', 'Пісуар зі змивним краном', 'Urinal mit Druckspüler', 'Urinoir met drukspoeler', 'Urinoir à robinet de chasse', 'Urinario con fluxor', 'Pisuar ze spłuczką ciśnieniową'),
    lu: { cold: 3, hot: 0 }, qa_lps: { cold: 0.30, hot: 0 }, pmin_flow_bar: 1.0, du_lps: { I: 0.5, II: 0.3, III: null, IV: 0.3 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: 5,
    use: U(2, 0, { office: 1.5, school: 1.5, sports: 1, retail: 0.2, restaurant: 0.3, industrial: 1.5 }),
    efficient_variants: [{ id: 'urinal_waterless', name: L('Waterless urinal', 'Безводний пісуар', 'Wasserloses Urinal', 'Waterloos urinoir', 'Urinoir sans eau', 'Urinario sin agua', 'Pisuar bezwodny'), litres_per_use: 0, source: 'la_plb' }] }),
  urinal_waterless: fx({ id: 'urinal_waterless', name: L('Waterless urinal', 'Безводний пісуар', 'Wasserloses Urinal', 'Waterloos urinoir', 'Urinoir sans eau', 'Urinario sin agua', 'Pisuar bezwodny'),
    lu: { cold: 0, hot: 0 }, qa_lps: { cold: 0, hot: 0 }, pmin_flow_bar: null, du_lps: { I: 0.2, II: 0.2, III: null, IV: 0.2 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: null,
    prov: { du: 'la_plb' }, note: L('No water supply; DU taken as for a slab urinal per position (0.2 l/s).', 'Без водопостачання; DU прийнято як для лоткового пісуара на одне місце (0,2 л/с).', 'Kein Wasseranschluss; DU wie Rinnenurinal je Stand (0,2 l/s).', 'Geen wateraansluiting; DU als voor een gootsteenurinoir per plaats (0,2 l/s).', 'Pas d’alimentation ; DU pris comme pour un urinoir en stalle par place (0,2 l/s).', 'Sin suministro; DU como urinario de canal por puesto (0,2 l/s).', 'Bez zasilania wodą; DU jak dla pisuaru rynnowego na stanowisko (0,2 l/s).'),
    use: U(0, 0, { office: 1.5, school: 1.5, sports: 1, retail: 0.2, restaurant: 0.3, industrial: 1.5 }) }),
  basin: fx({ id: 'basin', name: L('Washbasin', 'Умивальник', 'Waschtisch', 'Wastafel', 'Lavabo', 'Lavabo', 'Umywalka'),
    lu: { cold: 1, hot: 1 }, qa_lps: { cold: 0.07, hot: 0.07 }, pmin_flow_bar: 1.0, du_lps: { I: 0.5, II: 0.3, III: 0.3, IV: 0.3 }, branch_dn_min: { I: 40, II: 30 }, fluid_category: 3,
    use: U(2, 0.5, { residential: 5, office: 3, school: 3, hotel: 5, hospital: 8, care_home: 6, sports: 1, retail: 0.3, restaurant: 0.6, industrial: 3 }),
    efficient_variants: [{ id: 'basin_aerator_5', name: L('Flow limiter / aerator 5 l/min', 'Обмежувач витрати / аератор 5 л/хв', 'Durchflussbegrenzer / Strahlregler 5 l/min', 'Debietbegrenzer / perlator 5 l/min', 'Limiteur de débit / mousseur 5 l/min', 'Limitador de caudal / aireador 5 l/min', 'Ogranicznik przepływu / perlator 5 l/min'), litres_per_use: 1.2, source: 'la_plb' }] }),
  handbasin_small: fx({ id: 'handbasin_small', name: L('Hand-rinse basin', 'Малий умивальник для рук', 'Handwaschbecken', 'Fonteintje', 'Lave-mains', 'Lavamanos', 'Umywalka do rąk (mała)'),
    lu: { cold: 1, hot: 1 }, qa_lps: { cold: 0.07, hot: 0.07 }, pmin_flow_bar: 1.0, du_lps: { I: 0.5, II: 0.3, III: 0.3, IV: 0.3 }, branch_dn_min: { I: 40, II: 30 }, fluid_category: 3,
    use: U(1, 0.3, { residential: 2, office: 2, school: 2, hotel: 1, hospital: 6, care_home: 4, retail: 0.3, restaurant: 0.6, industrial: 2 }) }),
  sink_kitchen: fx({ id: 'sink_kitchen', name: L('Kitchen sink (domestic)', 'Кухонна мийка (побутова)', 'Küchenspüle (Wohnung)', 'Keukenspoelbak (huishoudelijk)', 'Évier de cuisine (domestique)', 'Fregadero de cocina (doméstico)', 'Zlewozmywak kuchenny (domowy)'),
    lu: { cold: 2, hot: 2 }, qa_lps: { cold: 0.07, hot: 0.07 }, pmin_flow_bar: 1.0, du_lps: { I: 0.8, II: 0.6, III: 1.3, IV: 0.5 }, branch_dn_min: { I: 50, II: 40 }, fluid_category: 3,
    use: U(6, 0.5, { residential: 3, office: 0.5, school: 0.2, care_home: 1, industrial: 0.5 }) }),
  sink_commercial: fx({ id: 'sink_commercial', name: L('Commercial kitchen sink (DN 20)', 'Мийка професійної кухні (DN 20)', 'Großküchenspüle (DN 20)', 'Spoelbak grootkeuken (DN 20)', 'Plonge de cuisine professionnelle (DN 20)', 'Fregadero de cocina industrial (DN 20)', 'Zlew w kuchni zbiorowej (DN 20)'),
    lu: { cold: 8, hot: 8 }, qa_lps: { cold: 0.30, hot: 0.30 }, pmin_flow_bar: 1.0, du_lps: { I: 0.8, II: 0.6, III: 1.3, IV: 0.5 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: 5,
    prov: { du: 'la_plb' }, note: L('DU as for a domestic kitchen sink: EN 12056-2 Table 2 has no commercial-sink row (learning assumption); check large-volume or tipping sinks separately.', 'DU як для побутової кухонної мийки: таблиця 2 EN 12056-2 не має рядка для професійної мийки (навчальне припущення); великі або перекидні мийки перевірте окремо.', 'DU wie Küchenspüle im Haushalt: EN 12056-2 Tabelle 2 hat keine Zeile für Großküchenspülen (Lernannahme); große oder kippbare Becken gesondert prüfen.', 'DU als voor een huishoudelijke keukenspoelbak: EN 12056-2 tabel 2 heeft geen rij voor grootkeukenspoelbakken (leeraanname); grote of kantelbare bakken apart controleren.', 'DU comme pour un évier domestique : le tableau 2 de l’EN 12056-2 n’a pas de ligne pour la plonge professionnelle (hypothèse pédagogique) ; vérifier à part les grands bacs ou bacs basculants.', 'DU como fregadero doméstico: la tabla 2 de la EN 12056-2 no tiene fila para fregaderos industriales (supuesto didáctico); compruebe aparte los fregaderos grandes o basculantes.', 'DU jak dla zlewozmywaka domowego: tablica 2 EN 12056-2 nie ma wiersza dla zlewu gastronomicznego (założenie szkoleniowe); duże lub wywrotne zlewy sprawdź osobno.'),
    use: U(15, 0.6, { hotel: 0.5, hospital: 0.5, care_home: 0.5, school: 0.2, restaurant: 1.5 }) }),
  shower: fx({ id: 'shower', name: L('Shower', 'Душ', 'Dusche', 'Douche', 'Douche', 'Ducha', 'Natrysk'),
    lu: { cold: 2, hot: 2 }, qa_lps: { cold: 0.15, hot: 0.15 }, pmin_flow_bar: 1.0, du_lps: { I: 0.6, II: 0.4, III: 0.4, IV: 0.4 }, branch_dn_min: { I: 50, II: 40 }, fluid_category: 3, aerosol: true,
    note: L('DU for a shower without plug.', 'DU для душу без пробки.', 'DU für Dusche ohne Stopfen.', 'DU voor een douche zonder stop.', 'DU pour une douche sans bonde obturable.', 'DU para ducha sin tapón.', 'DU dla natrysku bez korka.'),
    use: U(50, 0.6, { residential: 0.7, office: 0.02, school: 0.05, hotel: 0.9, hospital: 0.5, care_home: 0.4, sports: 0.8, industrial: 0.2 }),
    efficient_variants: [{ id: 'shower_6lpm', name: L('Shower head 6 l/min', 'Душова лійка 6 л/хв', 'Brausekopf 6 l/min', 'Douchekop 6 l/min', 'Pomme de douche 6 l/min', 'Rociador 6 l/min', 'Słuchawka natryskowa 6 l/min'), litres_per_use: 33, source: 'la_plb' }] }),
  shower_large_head: fx({ id: 'shower_large_head', name: L('Shower, large (rain) head', 'Душ з великою (тропічною) лійкою', 'Dusche mit großer Kopfbrause', 'Douche met grote regendouchekop', 'Douche à grande pomme (pluie)', 'Ducha con rociador grande (lluvia)', 'Natrysk z dużą deszczownicą'),
    lu: { cold: 4, hot: 4 }, qa_lps: { cold: 0.25, hot: 0.25 }, pmin_flow_bar: 1.5, du_lps: { I: 0.8, II: 0.5, III: 0.4, IV: 0.5 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: 3, aerosol: true,
    prov: { lu: 'la_plb', qa: 'la_plb', pmin: 'la_plb', du: 'la_plb' }, note: L('Mapping (learning assumption): DU I/II/IV as for a shower with plug in EN 12056-2 Table 2 (0.8/0.5/0.5 l/s) for the larger flow; system III keeps the shower-without-plug value 0.4 l/s; if the tray has a plug use 1.3 l/s in system III.', 'Відповідність (навчальне припущення): DU для систем I/II/IV як для душу з пробкою за таблицею 2 EN 12056-2 (0,8/0,5/0,5 л/с) через більшу витрату; для системи III лишається значення душу без пробки 0,4 л/с; якщо піддон має пробку, у системі III беріть 1,3 л/с.', 'Zuordnung (Lernannahme): DU für System I/II/IV wie Dusche mit Stopfen nach EN 12056-2 Tabelle 2 (0,8/0,5/0,5 l/s) wegen des größeren Durchflusses; System III behält den Wert der Dusche ohne Stopfen 0,4 l/s; hat die Wanne einen Stopfen, in System III 1,3 l/s ansetzen.', 'Toewijzing (leeraanname): DU voor systeem I/II/IV als voor een douche met stop volgens EN 12056-2 tabel 2 (0,8/0,5/0,5 l/s) wegens het grotere debiet; systeem III houdt de waarde van een douche zonder stop 0,4 l/s; heeft de bak een stop, gebruik dan 1,3 l/s in systeem III.', 'Correspondance (hypothèse pédagogique) : DU des systèmes I/II/IV comme pour une douche avec bonde obturable selon le tableau 2 de l’EN 12056-2 (0,8/0,5/0,5 l/s) en raison du débit plus élevé ; le système III garde la valeur de la douche sans bonde 0,4 l/s ; si le receveur a une bonde obturable, prendre 1,3 l/s en système III.', 'Asignación (supuesto didáctico): DU de los sistemas I/II/IV como ducha con tapón según la tabla 2 de la EN 12056-2 (0,8/0,5/0,5 l/s) por el mayor caudal; el sistema III mantiene el valor de ducha sin tapón 0,4 l/s; si el plato tiene tapón, use 1,3 l/s en el sistema III.', 'Przyporządkowanie (założenie szkoleniowe): DU dla systemów I/II/IV jak dla natrysku z korkiem wg tablicy 2 EN 12056-2 (0,8/0,5/0,5 l/s) ze względu na większy przepływ; system III zachowuje wartość natrysku bez korka 0,4 l/s; jeśli brodzik ma korek, w systemie III przyjmij 1,3 l/s.'),
    use: U(80, 0.6, { residential: 0.7, hotel: 0.9, sports: 0.8 }) }),
  bath: fx({ id: 'bath', name: L('Bath', 'Ванна', 'Badewanne', 'Ligbad', 'Baignoire', 'Bañera', 'Wanna'),
    lu: { cold: 4, hot: 4 }, qa_lps: { cold: 0.15, hot: 0.15 }, pmin_flow_bar: 1.0, du_lps: { I: 0.8, II: 0.6, III: 1.3, IV: 0.5 }, branch_dn_min: { I: 50, II: 40 }, fluid_category: 3,
    use: U(120, 0.65, { residential: 0.15, hotel: 0.2, care_home: 0.15 }) }),
  bidet: fx({ id: 'bidet', name: L('Bidet', 'Біде', 'Bidet', 'Bidet', 'Bidet', 'Bidé', 'Bidet'),
    lu: { cold: 1, hot: 1 }, qa_lps: { cold: 0.07, hot: 0.07 }, pmin_flow_bar: 1.0, du_lps: { I: 0.5, II: 0.3, III: 0.3, IV: 0.3 }, branch_dn_min: { I: 40, II: 30 }, fluid_category: 5,
    use: U(3, 0.5, { residential: 0.3, hotel: 0.3 }) }),
  washing_machine: fx({ id: 'washing_machine', name: L('Washing machine (domestic, ≤ 6 kg)', 'Пральна машина (побутова, ≤ 6 кг)', 'Waschmaschine (Haushalt, ≤ 6 kg)', 'Wasmachine (huishoudelijk, ≤ 6 kg)', 'Lave-linge (domestique, ≤ 6 kg)', 'Lavadora (doméstica, ≤ 6 kg)', 'Pralka (domowa, ≤ 6 kg)'),
    lu: { cold: 2, hot: 0 }, qa_lps: { cold: 0.15, hot: 0 }, pmin_flow_bar: 0.5, du_lps: { I: 0.8, II: 0.6, III: 0.6, IV: 0.5 }, branch_dn_min: { I: 50, II: 40 }, fluid_category: 3,
    use: U(50, 0, { residential: 0.15, hotel: 0.05, care_home: 0.3 }) }),
  dishwasher_dom: fx({ id: 'dishwasher_dom', name: L('Dishwasher (domestic)', 'Посудомийна машина (побутова)', 'Geschirrspüler (Haushalt)', 'Vaatwasser (huishoudelijk)', 'Lave-vaisselle (domestique)', 'Lavavajillas (doméstico)', 'Zmywarka (domowa)'),
    lu: { cold: 2, hot: 0 }, qa_lps: { cold: 0.07, hot: 0 }, pmin_flow_bar: 0.5, du_lps: { I: 0.8, II: 0.6, III: 0.2, IV: 0.5 }, branch_dn_min: { I: 50, II: 40 }, fluid_category: 3,
    use: U(10, 0, { residential: 0.15, office: 0.02 }) }),
  dishwasher_com: fx({ id: 'dishwasher_com', name: L('Commercial dishwasher', 'Професійна посудомийна машина', 'Gewerbespülmaschine', 'Professionele vaatwasser', 'Lave-vaisselle professionnel', 'Lavavajillas industrial', 'Zmywarka gastronomiczna'),
    lu: { cold: 3, hot: 3 }, qa_lps: { cold: 0.15, hot: 0.15 }, pmin_flow_bar: 1.0, du_lps: { I: 1.5, II: 1.2, III: 1.2, IV: 1.0 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: 4,
    prov: { lu: 'la_plb', qa: 'la_plb', pmin: 'la_plb', du: 'la_plb' }, use: U(3, 0.5, { hotel: 1, hospital: 1, care_home: 1, school: 0.5, restaurant: 2 }) }),
  tap_garden: fx({ id: 'tap_garden', name: L('Garden / outside tap', 'Садовий (зовнішній) кран', 'Gartenventil (Außenzapfstelle)', 'Buitenkraan', 'Robinet de jardin (extérieur)', 'Grifo de jardín (exterior)', 'Zawór ogrodowy (zewnętrzny)'),
    lu: { cold: 5, hot: 0 }, qa_lps: { cold: 0.30, hot: 0 }, pmin_flow_bar: 0.5, du_lps: { I: null, II: null, III: null, IV: null }, branch_dn_min: { I: null, II: null }, fluid_category: 3,
    note: L('Domestic hose use: category 3; irrigation with fertiliser or chemicals: category 5.', 'Побутовий шланг: категорія 3; полив з добривами або хімікатами: категорія 5.', 'Schlauch im Haushalt: Kategorie 3; Bewässerung mit Dünger oder Chemikalien: Kategorie 5.', 'Huishoudelijke tuinslang: categorie 3; besproeiing met meststoffen of chemicaliën: categorie 5.', 'Tuyau domestique : catégorie 3 ; arrosage avec engrais ou produits chimiques : catégorie 5.', 'Manguera doméstica: categoría 3; riego con abonos o productos químicos: categoría 5.', 'Wąż w gospodarstwie domowym: kategoria 3; nawadnianie z nawozami lub chemikaliami: kategoria 5.'),
    use: U(30, 0, { residential: 0.1 }) }),
  tap_utility: fx({ id: 'tap_utility', name: L('Utility / garage tap', 'Кран у підсобному приміщенні / гаражі', 'Auslaufventil Hauswirtschaft / Garage', 'Dienstkraan (berging / garage)', 'Robinet de service (buanderie / garage)', 'Grifo de servicio (lavadero / garaje)', 'Zawór czerpalny gospodarczy / garażowy'),
    lu: { cold: 5, hot: 0 }, qa_lps: { cold: 0.30, hot: 0 }, pmin_flow_bar: 0.5, du_lps: { I: null, II: null, III: null, IV: null }, branch_dn_min: { I: null, II: null }, fluid_category: 5,
    use: U(10, 0, { residential: 0.05, office: 0.01, industrial: 0.05 }) }),
  drinking_fountain: fx({ id: 'drinking_fountain', name: L('Drinking fountain', 'Питний фонтанчик', 'Trinkbrunnen', 'Drinkfontein', 'Fontaine à boire', 'Fuente de agua potable', 'Fontanna z wodą pitną'),
    lu: { cold: 1, hot: 0 }, qa_lps: { cold: 0.05, hot: 0 }, pmin_flow_bar: 1.0, du_lps: { I: 0.5, II: 0.3, III: 0.3, IV: 0.3 }, branch_dn_min: { I: 40, II: 30 }, fluid_category: 2,
    prov: { lu: 'la_plb', qa: 'la_plb', pmin: 'la_plb', du: 'la_plb' }, use: U(0.3, 0, { office: 1, school: 2, sports: 1 }) }),
  slop_sink: fx({ id: 'slop_sink', name: L('Clinical slop hopper (sluice)', 'Клінічна зливна раковина (санітарна кімната)', 'Fäkalienausguss (unreiner Arbeitsraum)', 'Stortgootsteen (vuile spoelruimte)', 'Vidoir clinique (local sale)', 'Vertedero clínico (sala de sucio)', 'Zlew kliniczny (brudownik)'),
    lu: { cold: 15, hot: 0 }, qa_lps: { cold: 1.0, hot: 0 }, pmin_flow_bar: 1.2, du_lps: { I: 2.5, II: 2.0, III: 1.7, IV: 2.5 }, branch_dn_min: { I: 100, II: 80 }, fluid_category: 5,
    prov: { lu: 'la_plb', qa: 'la_plb', pmin: 'la_plb', du: 'la_plb' }, note: L('Treated like a WC with DN 20 flush valve.', 'Розглядається як унітаз зі змивним краном DN 20.', 'Wie WC mit Druckspüler DN 20 behandelt.', 'Behandeld als toilet met drukspoeler DN 20.', 'Traité comme un WC à robinet de chasse DN 20.', 'Tratado como inodoro con fluxor DN 20.', 'Traktowany jak WC ze spłuczką ciśnieniową DN 20.'),
    use: U(6, 0, { hospital: 0.3, care_home: 0.3 }) }),
  bedpan_washer: fx({ id: 'bedpan_washer', name: L('Bedpan washer-disinfector', 'Мийно-дезінфекційна машина для суден', 'Steckbeckenspülgerät', 'Ondersteekspoeler', 'Lave-bassin désinfecteur', 'Lavacuñas', 'Myjnia-dezynfektor basenów'),
    lu: { cold: 2, hot: 2 }, qa_lps: { cold: 0.15, hot: 0.15 }, pmin_flow_bar: 1.0, du_lps: { I: 2.0, II: 1.8, III: 1.7, IV: 2.0 }, branch_dn_min: { I: 100, II: 80 }, fluid_category: 5, aerosol: true,
    prov: { lu: 'la_plb', qa: 'la_plb', pmin: 'la_plb', du: 'la_plb' }, use: U(20, 0.3, { hospital: 0.5, care_home: 0.5 }) }),
  eyewash_emergency: fx({ id: 'eyewash_emergency', name: L('Emergency eyewash', 'Аварійний фонтанчик для промивання очей', 'Augendusche', 'Oogdouche', 'Douche oculaire de sécurité', 'Lavaojos de emergencia', 'Natrysk do przemywania oczu'),
    lu: { cold: 1, hot: 0 }, qa_lps: { cold: 0.10, hot: 0 }, pmin_flow_bar: 1.0, du_lps: { I: null, II: null, III: null, IV: null }, branch_dn_min: { I: null, II: null }, fluid_category: 2, aerosol: true,
    prov: { lu: 'la_plb', qa: 'en15154', pmin: 'la_plb' }, note: L('Rarely used outlet: weekly flushing (stagnation, aerosol). Often tempered water.', 'Рідко використовувана точка: щотижневе промивання (застій, аерозоль). Часто тепла вода.', 'Selten genutzte Entnahmestelle: wöchentlich spülen (Stagnation, Aerosol). Oft temperiertes Wasser.', 'Weinig gebruikt tappunt: wekelijks spoelen (stilstand, aerosol). Vaak getempereerd water.', 'Point peu utilisé : rinçage hebdomadaire (stagnation, aérosol). Souvent eau tempérée.', 'Punto poco usado: purga semanal (estancamiento, aerosol). A menudo agua templada.', 'Rzadko używany punkt: cotygodniowe płukanie (stagnacja, aerozol). Często woda temperowana.'),
    use: U(0, 0, {}) }),
  floor_drain: fx({ id: 'floor_drain', name: L('Floor gully (DN 50)', 'Трап (DN 50)', 'Bodenablauf (DN 50)', 'Vloerput (DN 50)', 'Siphon de sol (DN 50)', 'Sumidero de suelo (DN 50)', 'Wpust podłogowy (DN 50)'),
    lu: { cold: 0, hot: 0 }, qa_lps: { cold: 0, hot: 0 }, pmin_flow_bar: null, du_lps: { I: 0.8, II: 0.9, III: null, IV: 0.6 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: null,
    use: U(0, 0, {}) }),
  cleaner_sink: fx({ id: 'cleaner_sink', name: L('Cleaner’s sink', 'Раковина прибиральника', 'Ausgussbecken (Putzraum)', 'Uitstortgootsteen (poetsruimte)', 'Vidoir de nettoyage', 'Vertedero de limpieza', 'Zlew porządkowy'),
    lu: { cold: 2, hot: 2 }, qa_lps: { cold: 0.15, hot: 0.15 }, pmin_flow_bar: 1.0, du_lps: { I: 0.8, II: 0.6, III: 1.3, IV: 0.5 }, branch_dn_min: { I: 50, II: 50 }, fluid_category: 5,
    prov: { lu: 'la_plb', qa: 'la_plb', du: 'la_plb' }, use: U(10, 0.5, { office: 0.01, school: 0.01, hotel: 0.02, hospital: 0.02, retail: 0.01 }) })
};
var FIXTURE_IDS = Object.keys(FIXTURES);

/* =====================================================================================
   2 MATERIALS — pipe series. roughness_mm: hydraulic wall roughness for supply (DIN 1988-300 values);
   drainage calculations use the operational roughness DRAIN_KB (EN 12056-2: kb = 1.0 mm).
   ===================================================================================== */
function S(rows) { return rows.map(function (r) { return { dn: r[0], od_mm: r[1], wall_mm: r[2], id_mm: Math.round((r[1] - 2 * r[2]) * 100) / 100 }; }); }
var MATERIALS = {
  copper: { id: 'copper', name: L('Copper EN 1057 (R250 half-hard)', 'Мідь EN 1057 (R250 напівтверда)', 'Kupfer EN 1057 (R250 halbhart)', 'Koper EN 1057 (R250 halfhard)', 'Cuivre EN 1057 (R250 demi-dur)', 'Cobre EN 1057 (R250 semiduro)', 'Miedź EN 1057 (R250 półtwarda)'),
    use: 'supply', roughness_mm: 0.0015, max_temp_c: 110, sources: ['en1057', 'din1988_300'],
    series: S([[10, 12, 1], [12, 15, 1], [15, 18, 1], [20, 22, 1], [25, 28, 1.5], [32, 35, 1.5], [40, 42, 1.5], [50, 54, 2], [65, 76.1, 2], [80, 88.9, 2], [100, 108, 2.5]]) },
  stainless: { id: 'stainless', name: L('Stainless steel EN 10312 (press)', 'Нержавіюча сталь EN 10312 (прес)', 'Edelstahl EN 10312 (Press)', 'Roestvast staal EN 10312 (pers)', 'Inox EN 10312 (à sertir)', 'Acero inoxidable EN 10312 (prensar)', 'Stal nierdzewna EN 10312 (zaprasowywana)'),
    use: 'supply', roughness_mm: 0.0015, max_temp_c: 110, sources: ['en10312', 'din1988_300'],
    series: S([[12, 15, 1], [15, 18, 1], [20, 22, 1.2], [25, 28, 1.2], [32, 35, 1.5], [40, 42, 1.5], [50, 54, 1.5], [65, 76.1, 2], [80, 88.9, 2], [100, 108, 2]]) },
  steel_galv: { id: 'steel_galv', name: L('Galvanised steel EN 10255 medium', 'Оцинкована сталь EN 10255 середня серія', 'Verzinkter Stahl EN 10255 mittelschwer', 'Gegalvaniseerd staal EN 10255 middelzwaar', 'Acier galvanisé EN 10255 série moyenne', 'Acero galvanizado EN 10255 serie media', 'Stal ocynkowana EN 10255 seria średnia'),
    use: 'supply', roughness_mm: 0.15, max_temp_c: 60, sources: ['en10255', 'din1988_300'],
    note: L('Not for hot water above 60 °C (zinc corrosion); legacy installations.', 'Не для гарячої води понад 60 °C (корозія цинку); існуючі мережі.', 'Nicht für Warmwasser über 60 °C (Zinkkorrosion); Bestandsanlagen.', 'Niet voor warm water boven 60 °C (zinkcorrosie); bestaande installaties.', 'Pas pour l’eau chaude au-delà de 60 °C (corrosion du zinc) ; installations existantes.', 'No para agua caliente por encima de 60 °C (corrosión del zinc); instalaciones existentes.', 'Nie do ciepłej wody powyżej 60 °C (korozja cynku); instalacje istniejące.'),
    series: S([[15, 21.3, 2.6], [20, 26.9, 2.6], [25, 33.7, 3.2], [32, 42.4, 3.2], [40, 48.3, 3.2], [50, 60.3, 3.6], [65, 76.1, 3.6], [80, 88.9, 4.0], [100, 114.3, 4.5]]) },
  pex_sdr74: { id: 'pex_sdr74', name: L('PE-X SDR 7.4', 'PE-X SDR 7,4', 'PE-X SDR 7,4', 'PE-X SDR 7,4', 'PE-X SDR 7,4', 'PE-X SDR 7,4', 'PE-X SDR 7,4'),
    use: 'supply', roughness_mm: 0.007, max_temp_c: 70, sources: ['iso15875', 'din1988_300'],
    series: S([[12, 16, 2.2], [15, 20, 2.8], [20, 25, 3.5], [25, 32, 4.4], [32, 40, 5.5], [40, 50, 6.9], [50, 63, 8.6]]) },
  pert_sdr11: { id: 'pert_sdr11', name: L('PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11', 'PE-X / PE-RT SDR 11'),
    use: 'supply', roughness_mm: 0.007, max_temp_c: 70, sources: ['iso15875', 'din1988_300'],
    series: S([[15, 20, 1.9], [20, 25, 2.3], [25, 32, 2.9], [32, 40, 3.7], [40, 50, 4.6], [50, 63, 5.8]]) },
  multilayer: { id: 'multilayer', name: L('Multilayer PE-X/Al/PE-X', 'Металопластик PE-X/Al/PE-X', 'Mehrschichtverbundrohr PE-X/Al/PE-X', 'Meerlagenbuis PE-X/Al/PE-X', 'Multicouche PE-X/Al/PE-X', 'Multicapa PE-X/Al/PE-X', 'Wielowarstwowa PE-X/Al/PE-X'),
    use: 'supply', roughness_mm: 0.007, max_temp_c: 70, sources: ['iso21003', 'din1988_300'],
    series: S([[12, 16, 2], [15, 20, 2], [20, 26, 3], [25, 32, 3], [32, 40, 3.5], [40, 50, 4], [50, 63, 4.5]]) },
  ppr_pn20: { id: 'ppr_pn20', name: L('PP-R PN 20', 'PP-R PN 20', 'PP-R PN 20', 'PP-R PN 20', 'PP-R PN 20', 'PP-R PN 20', 'PP-R PN 20'),
    use: 'supply', roughness_mm: 0.007, max_temp_c: 70, sources: ['iso15874', 'din1988_300'],
    series: S([[15, 20, 3.4], [20, 25, 4.2], [25, 32, 5.4], [32, 40, 6.7], [40, 50, 8.3], [50, 63, 10.5], [65, 75, 12.5], [80, 90, 15.0], [100, 110, 18.3]]) },
  pe100_sdr11: { id: 'pe100_sdr11', name: L('PE 100 SDR 11 (service pipe)', 'PE 100 SDR 11 (ввідний трубопровід)', 'PE 100 SDR 11 (Hausanschluss)', 'PE 100 SDR 11 (aansluitleiding)', 'PE 100 SDR 11 (branchement)', 'PE 100 SDR 11 (acometida)', 'PE 100 SDR 11 (przyłącze)'),
    use: 'supply', roughness_mm: 0.007, max_temp_c: 40, sources: ['en12201', 'din1988_300'],
    series: S([[20, 25, 2.3], [25, 32, 2.9], [32, 40, 3.7], [40, 50, 4.6], [50, 63, 5.8], [65, 75, 6.8], [80, 90, 8.2], [100, 110, 10.0], [125, 125, 11.4]]) },
  pvc_u: { id: 'pvc_u', name: L('PVC-U drainage (EN 1329-1, area B)', 'НПВХ каналізаційні (EN 1329-1, зона B)', 'PVC-U Abwasser (EN 1329-1, Bereich B)', 'PVC-U afvoer (EN 1329-1, toepassingsgebied B)', 'PVC-U évacuation (EN 1329-1, domaine B)', 'PVC-U evacuación (EN 1329-1, área B)', 'PVC-U kanalizacja (EN 1329-1, obszar B)'),
    use: 'drainage', roughness_mm: 0.007, max_temp_c: 60, sources: ['en1329'],
    series: S([[30, 32, 1.8], [40, 40, 1.8], [50, 50, 1.8], [70, 75, 1.8], [80, 90, 1.8], [100, 110, 2.2], [125, 125, 2.5], [150, 160, 3.2], [200, 200, 3.9]]) },
  pp_drain: { id: 'pp_drain', name: L('PP drainage (EN 1451-1)', 'PP каналізаційні (EN 1451-1)', 'PP Abwasser (EN 1451-1)', 'PP afvoer (EN 1451-1)', 'PP évacuation (EN 1451-1)', 'PP evacuación (EN 1451-1)', 'PP kanalizacja (EN 1451-1)'),
    use: 'drainage', roughness_mm: 0.007, max_temp_c: 90, sources: ['en1451'],
    series: S([[30, 32, 1.8], [40, 40, 1.8], [50, 50, 1.8], [70, 75, 1.9], [80, 90, 2.2], [100, 110, 2.7], [125, 125, 3.1], [150, 160, 3.9]]) },
  pe_hd: { id: 'pe_hd', name: L('PE-HD drainage (EN 1519-1)', 'PE-HD каналізаційні (EN 1519-1)', 'PE-HD Abwasser (EN 1519-1)', 'PE-HD afvoer (EN 1519-1)', 'PE-HD évacuation (EN 1519-1)', 'PE-HD evacuación (EN 1519-1)', 'PE-HD kanalizacja (EN 1519-1)'),
    use: 'drainage', roughness_mm: 0.007, max_temp_c: 80, sources: ['en1519'],
    series: S([[30, 32, 3], [40, 40, 3], [50, 50, 3], [56, 56, 3], [60, 63, 3], [70, 75, 3], [80, 90, 3.5], [100, 110, 4.3], [125, 125, 4.9], [150, 160, 6.2], [200, 200, 6.2]]) },
  cast_iron_sml: { id: 'cast_iron_sml', name: L('Cast iron SML (EN 877)', 'Чавун SML (EN 877)', 'Gusseisen SML (EN 877)', 'Gietijzer SML (EN 877)', 'Fonte SML (EN 877)', 'Fundición SML (EN 877)', 'Żeliwo SML (EN 877)'),
    use: 'drainage', roughness_mm: 0.1, max_temp_c: 100, sources: ['en877'],
    series: S([[50, 58, 3.5], [70, 78, 3.5], [80, 83, 3.5], [100, 110, 3.5], [125, 135, 4.0], [150, 160, 4.0], [200, 210, 5.0]]) }
};
var DRAIN_KB = { value_mm: 1.0, source: 'en12056_2' };

/* =====================================================================================
   3 Water properties and pipe friction
   rho: Kell (1975), 1 atm, 0–100 °C (≤ 0.01 % vs IAPWS-95). mu: IAPWS 2008 (μ0·μ1, no critical term) with Kell density.
   cp, k: NIST WebBook table at 0.101325 MPa, 10 K steps, linear interpolation (≤ 0.1 % / ≤ 0.3 %).
   ===================================================================================== */
var CP_TAB = [4.2199, 4.1955, 4.1844, 4.1801, 4.1796, 4.1815, 4.1851, 4.1902, 4.1969, 4.2053, 4.2157];
var K_TAB = [0.5610, 0.5800, 0.5984, 0.6154, 0.6305, 0.6435, 0.6543, 0.6631, 0.6700, 0.6753, 0.6791];
var H0 = [1.67752, 2.20462, 0.6366564, -0.241605];
var H1 = [ /* H1[i][j], i: (1/T̄ − 1)^i, j: (ρ̄ − 1)^j */
  [5.20094e-1, 2.22531e-1, -2.81378e-1, 1.61913e-1, -3.25372e-2, 0, 0],
  [8.50895e-2, 9.99115e-1, -9.06851e-1, 2.57399e-1, 0, 0, 0],
  [-1.08374, 1.88797, -7.72479e-1, 0, 0, 0, 0],
  [-2.89555e-1, 1.26613, -4.89837e-1, 0, 6.98452e-2, 0, -4.35673e-3],
  [0, 0, -2.57040e-1, 0, 0, 8.72102e-3, 0],
  [0, 1.20573e-1, 0, 0, 0, 0, -5.93264e-4]
];
function rhoKell(T) {
  return (999.83952 + 16.945176 * T - 7.9870401e-3 * T * T - 46.170461e-6 * T * T * T + 105.56302e-9 * Math.pow(T, 4) - 280.54253e-12 * Math.pow(T, 5)) / (1 + 16.879850e-3 * T);
}
function muIAPWS(T, rho) {
  var Tb = (T + 273.15) / 647.096, rb = rho / 322;
  var s0 = 0; for (var i = 0; i < 4; i++) s0 += H0[i] / Math.pow(Tb, i);
  var mu0 = 100 * Math.sqrt(Tb) / s0;
  var a = 1 / Tb - 1, b = rb - 1, s1 = 0;
  for (var ii = 0; ii < 6; ii++) for (var j = 0; j < 7; j++) if (H1[ii][j]) s1 += H1[ii][j] * Math.pow(a, ii) * Math.pow(b, j);
  return mu0 * Math.exp(rb * s1) * 1e-6;
}
function interp10(tab, T) {
  var x = Math.max(0, Math.min(100, T)) / 10, i = Math.min(9, Math.floor(x)), f = x - i;
  return tab[i] + (tab[i + 1] - tab[i]) * f;
}
function water(T_c) {
  var T = Number(T_c);
  if (!isFinite(T)) throw new Error('PLBCore.water: temperature must be a finite number');
  var clamped = T < 0 || T > 100;
  T = Math.max(0, Math.min(100, T));
  var rho = rhoKell(T), mu = muIAPWS(T, rho);
  return { T_c: T, rho: rho, mu: mu, nu: mu / rho, cp: interp10(CP_TAB, T) * 1000, k: interp10(K_TAB, T), clamped: clamped,
    sources: ['kell1975', 'iapws2008', 'nist_webbook'] };
}

/* Darcy friction factor: Re ≤ 0 → 0 (no flow); NaN → error; Re = ∞ → fully rough limit (error for a smooth wall); laminar 64/Re (Re < 2300); Colebrook–White (Re ≥ 4000), iterated from the Swamee–Jain value;
   2300 ≤ Re < 4000: linear blend between both (transition — flagged). */
function colebrook(Re, rr) {
  var lam = 0.25 / Math.pow(Math.log10(rr / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
  for (var k = 0; k < 50; k++) {
    var x = -2 * Math.log10(rr / 3.7 + 2.51 / (Re * Math.sqrt(lam)));
    var next = 1 / (x * x);
    if (Math.abs(next - lam) < 1e-12) { lam = next; break; }
    lam = next;
  }
  return lam;
}
function friction(Re, eps_over_d) {
  Re = Number(Re); var rr = Math.max(0, Number(eps_over_d) || 0);
  if (Re !== Re) throw new Error('PLBCore.friction: Reynolds number is not a number');
  if (!(Re > 0)) return 0;
  /* Re = ∞: fully rough limit of Colebrook (von Kármán); a smooth wall has no finite limit */
  if (!isFinite(Re)) { if (rr > 0) { var xr = -2 * Math.log10(rr / 3.7); return 1 / (xr * xr); } throw new Error('PLBCore.friction: infinite Reynolds number with zero roughness'); }
  if (Re < 2300) return 64 / Re;
  if (Re < 4000) { var w = (Re - 2300) / 1700; return (1 - w) * 64 / 2300 + w * colebrook(4000, rr); }
  return colebrook(Re, rr);
}
function regime(Re) { return Re < 2300 ? 'laminar' : Re < 4000 ? 'transition' : 'turbulent'; }

/* pressure loss of a straight pipe: q in l/s, inner diameter mm, length m, roughness mm, temperature °C */
function dpPipe(q_lps, id_mm, L_m, eps_mm, T_c) {
  var w = water(T_c == null ? 10 : T_c);
  var d = Number(id_mm) / 1000, q = Number(q_lps) / 1000, Lm = Number(L_m) || 0;
  if (!(d > 0)) throw new Error('PLBCore.dpPipe: inner diameter must be > 0');
  var A = Math.PI * d * d / 4, v = q / A, Re = Math.abs(v) * d / w.nu;
  var lambda = friction(Re, (Number(eps_mm) || 0) / 1000 / d);
  var R = lambda / d * w.rho * v * v / 2;
  return { v: v, Re: Re, regime: regime(Re), lambda: lambda, R_pa_m: R, dp_pa: R * Lm, rho: w.rho, nu: w.nu };
}
/* local loss: Σζ · ρ v² / 2 */
function dpLocal(zeta_sum, v_ms, T_c) { var w = water(T_c == null ? 10 : T_c); return (Number(zeta_sum) || 0) * w.rho * v_ms * v_ms / 2; }

var ZETA = {
  elbow_90: { zeta: 0.7, name: L('Elbow 90°', 'Коліно 90°', 'Bogen 90°', 'Bocht 90°', 'Coude 90°', 'Codo 90°', 'Kolano 90°'), source: 'zeta_typical' },
  bend_90_long: { zeta: 0.3, name: L('Long-radius bend 90°', 'Відвід 90° великого радіуса', 'Bogen 90° großer Radius', 'Bocht 90° grote straal', 'Coude 90° grand rayon', 'Curva 90° de radio largo', 'Łuk 90° o dużym promieniu'), source: 'zeta_typical' },
  tee_through: { zeta: 0.3, name: L('Tee, straight flow', 'Трійник, прохід', 'T-Stück, Durchgang', 'T-stuk, doorgang', 'Té, passage direct', 'Te, paso recto', 'Trójnik, przelot'), source: 'zeta_typical' },
  tee_branch: { zeta: 1.3, name: L('Tee, branch flow', 'Трійник, відгалуження', 'T-Stück, Abzweig', 'T-stuk, aftakking', 'Té, dérivation', 'Te, derivación', 'Trójnik, odgałęzienie'), source: 'zeta_typical' },
  reducer: { zeta: 0.4, name: L('Reducer', 'Перехід', 'Reduzierstück', 'Verloopstuk', 'Réduction', 'Reducción', 'Redukcja'), source: 'zeta_typical' },
  ball_valve: { zeta: 0.3, name: L('Ball valve (open)', 'Кульовий кран (відкритий)', 'Kugelhahn (offen)', 'Kogelkraan (open)', 'Robinet à boisseau sphérique (ouvert)', 'Válvula de bola (abierta)', 'Zawór kulowy (otwarty)'), source: 'zeta_typical' },
  globe_valve_oblique: { zeta: 2.5, name: L('Oblique-seat valve', 'Вентиль з косим шпинделем', 'Schrägsitzventil', 'Schuine-zittingafsluiter', 'Robinet à soupape oblique', 'Válvula de asiento inclinado', 'Zawór skośny'), source: 'zeta_typical' },
  globe_valve: { zeta: 7.0, name: L('Straight-seat globe valve', 'Прямий вентиль', 'Geradsitzventil', 'Rechte-zittingafsluiter', 'Robinet à soupape droite', 'Válvula de asiento recto', 'Zawór grzybkowy prosty'), source: 'zeta_typical' },
  check_valve: { zeta: 2.5, name: L('Check valve', 'Зворотний клапан', 'Rückflussverhinderer', 'Terugslagklep', 'Clapet anti-retour', 'Válvula antirretorno', 'Zawór zwrotny'), source: 'zeta_typical' }
};

/* =====================================================================================
   4 BUILDING_TYPES — DIN 1988-300 peak flow Vs = a·(ΣVR)^b − c (null: not covered, special analysis);
   EN 12056-2 Table 3 frequency factor K; occupancy defaults (learning assumption).
   ===================================================================================== */
function BT(id, name, din, K, occ, dhw, extra) {
  var o = { id: id, name: name, din_peak: din ? { a: din[0], b: din[1], c: din[2], source: 'din1988_300' } : null, drainage_K: K, drainage_K_source: 'en12056_2',
    occupancy: occ, occupancy_source: 'la_plb', dhw_profile: dhw, sources: ['din1988_300', 'en12056_2', 'en806_3', 'la_plb'] };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return o;
}
var EN806_NOTE = L('EN 806-3 uses one loading-unit curve for all buildings (simplified method); DIN 1988-300 distinguishes building types.', 'EN 806-3 використовує одну криву одиниць навантаження для всіх будівель (спрощений метод); DIN 1988-300 розрізняє типи будівель.', 'EN 806-3 verwendet eine Belastungswert-Kurve für alle Gebäude (vereinfachtes Verfahren); DIN 1988-300 unterscheidet Gebäudearten.', 'EN 806-3 gebruikt één belastingseenhedencurve voor alle gebouwen (vereenvoudigde methode); DIN 1988-300 onderscheidt gebouwtypes.', 'L’EN 806-3 utilise une seule courbe d’unités de charge pour tous les bâtiments (méthode simplifiée) ; la DIN 1988-300 distingue les types de bâtiments.', 'La EN 806-3 usa una sola curva de unidades de carga para todos los edificios (método simplificado); la DIN 1988-300 distingue tipos de edificio.', 'EN 806-3 stosuje jedną krzywą jednostek obciążenia dla wszystkich budynków (metoda uproszczona); DIN 1988-300 rozróżnia rodzaje budynków.');
var BUILDING_TYPES = {
  residential: BT('residential', L('Residential', 'Житловий будинок', 'Wohngebäude', 'Woongebouw', 'Logements', 'Residencial', 'Budynek mieszkalny'), [1.48, 0.19, 0.94], 0.5, { persons_per_unit: 2.3, m2_per_person: 35 }, 'dwelling_din4708'),
  office: BT('office', L('Office', 'Офіс', 'Bürogebäude', 'Kantoor', 'Bureaux', 'Oficinas', 'Biurowiec'), [0.91, 0.31, 0.38], 0.5, { m2_per_person: 12 }, 'office'),
  hotel: BT('hotel', L('Hotel', 'Готель', 'Hotel', 'Hotel', 'Hôtel', 'Hotel', 'Hotel'), [0.70, 0.48, 0.13], 0.7, { persons_per_unit: 1.5 }, 'hotel'),
  hospital: BT('hospital', L('Hospital (ward building)', 'Лікарня (палатний корпус)', 'Krankenhaus (Bettenhaus)', 'Ziekenhuis (beddenhuis)', 'Hôpital (bâtiment d’hospitalisation)', 'Hospital (edificio de hospitalización)', 'Szpital (budynek łóżkowy)'), [0.75, 0.44, 0.18], 0.7, { persons_per_unit: 1 }, 'hospital'),
  care_home: BT('care_home', L('Care home', 'Будинок догляду', 'Pflegeheim', 'Woonzorgcentrum', 'Maison de repos et de soins', 'Residencia de mayores', 'Dom opieki'), [1.40, 0.14, 0.92], 0.7, { persons_per_unit: 1 }, 'care_home'),
  school: BT('school', L('School', 'Школа', 'Schule', 'School', 'École', 'Escuela', 'Szkoła'), [0.91, 0.31, 0.38], 0.7, { m2_per_person: 8 }, 'school'),
  sports: BT('sports', L('Sports hall (public showers)', 'Спортзал (громадські душі)', 'Sporthalle (öffentliche Duschen)', 'Sporthal (publieke douches)', 'Salle de sport (douches publiques)', 'Pabellón deportivo (duchas públicas)', 'Hala sportowa (natryski publiczne)'), null, 1.0, { m2_per_person: 10 }, 'sports_showers'),
  retail: BT('retail', L('Retail', 'Торгівля', 'Einzelhandel', 'Winkel', 'Commerce', 'Comercio', 'Handel'), null, 0.7, { m2_per_person: 20 }, 'office'),
  restaurant: BT('restaurant', L('Restaurant', 'Ресторан', 'Restaurant', 'Restaurant', 'Restaurant', 'Restaurante', 'Restauracja'), null, 0.7, { m2_per_person: 1.5 }, 'restaurant'),
  industrial: BT('industrial', L('Industrial / workshop', 'Промисловий / цех', 'Industrie / Werkstatt', 'Industrie / werkplaats', 'Industriel / atelier', 'Industrial / taller', 'Przemysłowy / warsztat'), null, 0.7, { m2_per_person: 30 }, 'sports_showers', { drainage_K_note: L('Use K = 1.2 for special use (e.g. laboratory).', 'Для спеціального використання (напр. лабораторія) K = 1,2.', 'Bei Sondernutzung (z. B. Labor) K = 1,2.', 'Bij bijzonder gebruik (bv. laboratorium) K = 1,2.', 'Pour un usage spécial (p. ex. laboratoire) K = 1,2.', 'Para uso especial (p. ej. laboratorio) K = 1,2.', 'Przy użytkowaniu specjalnym (np. laboratorium) K = 1,2.') })
};
var NO_DIN_NOTE = L('DIN 1988-300 has no peak-flow constants for this building type: assess simultaneity explicitly (e.g. all showers of a changing room at once).', 'DIN 1988-300 не містить констант пікової витрати для цього типу будівлі: одночасність оцініть явно (напр. усі душі роздягальні одночасно).', 'DIN 1988-300 enthält für diese Gebäudeart keine Spitzendurchfluss-Konstanten: Gleichzeitigkeit gesondert festlegen (z. B. alle Duschen einer Umkleide gleichzeitig).', 'DIN 1988-300 geeft voor dit gebouwtype geen piekdebietconstanten: gelijktijdigheid expliciet bepalen (bv. alle douches van een kleedkamer tegelijk).', 'La DIN 1988-300 ne donne pas de constantes de débit de pointe pour ce type : évaluer la simultanéité explicitement (p. ex. toutes les douches d’un vestiaire à la fois).', 'La DIN 1988-300 no da constantes de caudal punta para este tipo: evalúe la simultaneidad explícitamente (p. ej. todas las duchas de un vestuario a la vez).', 'DIN 1988-300 nie podaje stałych przepływu szczytowego dla tego rodzaju budynku: jednoczesność określ jawnie (np. wszystkie natryski szatni naraz).');

/* DIN 1988-300 peak flow (l/s) from ΣVR (l/s) and the largest single VR: Vs = a·ΣVR^b − c, never above ΣVR,
   never below the largest single draw-off. Returns null when the building type has no constants. */
function dinPeakFlow(sumVR, building_type, maxSingle) {
  var bt = own(BUILDING_TYPES, building_type); if (!bt || !bt.din_peak) return null;
  var x = Number(sumVR) || 0, m = Number(maxSingle) || 0;
  if (x <= 0) return 0;
  var p = bt.din_peak, v = p.a * Math.pow(x, p.b) - p.c;
  return Math.min(x, Math.max(v, m));
}

/* =====================================================================================
   5 REGIONS — legal pointers (EU/regional baseline; verify with the local authority / water utility).
   ===================================================================================== */
function R(id, text, source) { return { id: id, text: text, source: source }; }
var REGION_NOTE = L('EU/regional baseline; verify with the local authority / water utility.', 'Базовий рівень ЄС/регіону; перевірте у місцевих органів / водоканалу.', 'EU-/Regionalgrundlage; mit Behörde / Wasserversorger abstimmen.', 'EU-/regionale basis; controleer bij de lokale overheid / het waterbedrijf.', 'Socle UE/régional ; vérifier auprès de l’autorité locale / du distributeur d’eau.', 'Base UE/regional; verifique con la autoridad local / la compañía de aguas.', 'Podstawa UE/regionalna; sprawdź u lokalnych władz / w wodociągach.');
var RULE_TVBI = R('tvbi', L('Internal installations follow the Belgaqua technical prescriptions (TVBI/PTI), incl. EN 1717 backflow protection; the water supplier may inspect before connection.', 'Внутрішні мережі виконуються за технічними приписами Belgaqua (TVBI/PTI), включно із захистом від зворотного потоку за EN 1717; водопостачальник може перевірити їх перед підключенням.', 'Hausinstallationen folgen den technischen Vorschriften von Belgaqua (TVBI/PTI) einschließlich Rückflussschutz nach EN 1717; der Versorger kann vor dem Anschluss prüfen.', 'Binneninstallaties volgen de technische voorschriften van Belgaqua (TVBI), incl. terugstroombeveiliging volgens EN 1717; de waterleverancier kan keuren vóór aansluiting.', 'Les installations intérieures suivent les prescriptions techniques Belgaqua (PTI), y compris la protection anti-retour EN 1717 ; le distributeur peut contrôler avant raccordement.', 'Las instalaciones interiores siguen las prescripciones técnicas de Belgaqua (TVBI/PTI), incl. protección antirretorno EN 1717; la compañía puede inspeccionar antes de la conexión.', 'Instalacje wewnętrzne wykonuje się wg przepisów technicznych Belgaqua (TVBI/PTI), w tym zabezpieczenia przed przepływem zwrotnym wg EN 1717; dostawca wody może je skontrolować przed przyłączeniem.'), 'belgaqua_tvbi');
var RULE_WELFARE = R('welfare_sanitary', L('Workplaces: sanitary facilities (WCs, washbasins, showers where needed) per the Codex on well-being at work.', 'Робочі місця: санітарні приміщення (WC, умивальники, за потреби душі) за Кодексом благополуччя на роботі.', 'Arbeitsstätten: Sanitäranlagen (WC, Waschtische, ggf. Duschen) nach dem Kodex über das Wohlbefinden bei der Arbeit.', 'Werkplaatsen: sanitaire voorzieningen (toiletten, wastafels, zo nodig douches) volgens de Codex over het welzijn op het werk.', 'Lieux de travail : installations sanitaires (WC, lavabos, douches si nécessaire) selon le Code du bien-être au travail.', 'Lugares de trabajo: instalaciones sanitarias (inodoros, lavabos, duchas si procede) según el Código de bienestar en el trabajo.', 'Miejsca pracy: urządzenia sanitarne (WC, umywalki, w razie potrzeby natryski) wg Kodeksu dobrostanu w pracy.'), 'be_welfare');
var REGIONS = {
  be_flanders: { id: 'be_flanders', name: L('Belgium — Flanders', 'Бельгія — Фландрія', 'Belgien — Flandern', 'België — Vlaanderen', 'Belgique — Flandre', 'Bélgica — Flandes', 'Belgia — Flandria'), rules: [
    R('legionella_decree', L('High-risk establishments (e.g. hospitals, care homes, accommodation, sports facilities with showers — see the decree’s list) need a legionella risk analysis and a management plan with temperature checks, flushing and sampling.', 'Заклади високого ризику (напр. лікарні, будинки догляду, заклади розміщення, спортивні споруди з душами — див. перелік у постанові) повинні мати аналіз ризику легіонели та план управління з контролем температур, промиванням і відбором проб.', 'Hochrisiko-Einrichtungen (z. B. Krankenhäuser, Pflegeheime, Beherbergung, Sportstätten mit Duschen — siehe Liste im Erlass) brauchen eine Legionellen-Risikoanalyse und einen Beheersplan mit Temperaturkontrollen, Spülen und Probenahme.', 'Hoog-risico-inrichtingen (bv. ziekenhuizen, woonzorgcentra, logies, sportaccommodaties met douches — zie de lijst in het besluit) hebben een legionellarisicoanalyse en een beheersplan nodig met temperatuurcontroles, spoelen en staalnames.', 'Les établissements à haut risque (p. ex. hôpitaux, maisons de repos, hébergements, installations sportives avec douches — voir la liste du décret) doivent disposer d’une analyse de risque légionelles et d’un plan de gestion (contrôles de température, rinçages, prélèvements).', 'Los establecimientos de alto riesgo (p. ej. hospitales, residencias, alojamientos, instalaciones deportivas con duchas — ver la lista del decreto) necesitan un análisis de riesgo de legionela y un plan de gestión con control de temperaturas, purgas y muestreo.', 'Obiekty wysokiego ryzyka (np. szpitale, domy opieki, obiekty noclegowe, obiekty sportowe z natryskami — patrz wykaz w rozporządzeniu) muszą mieć analizę ryzyka legionelli i plan zarządzania z kontrolą temperatur, płukaniem i poborem próbek.'), 'vl_legionella'),
    R('gsv_hemelwater', L('New builds and extensions: rainwater is first reused (tank), then infiltrated, then buffered with throttled outflow, and only then discharged; separate sewer connection.', 'Нові будівлі та прибудови: дощову воду спершу повторно використовують (резервуар), потім інфільтрують, потім буферизують з обмеженим скидом і лише потім скидають; роздільне підключення до каналізації.', 'Neubauten und Erweiterungen: Regenwasser zuerst nutzen (Zisterne), dann versickern, dann puffern mit gedrosseltem Abfluss, erst danach ableiten; getrennter Anschluss.', 'Nieuwbouw en uitbreidingen: hemelwater eerst hergebruiken (put), dan infiltreren, dan bufferen met vertraagde afvoer en pas daarna lozen; gescheiden aansluiting.', 'Constructions neuves et extensions : l’eau de pluie est d’abord réutilisée (citerne), puis infiltrée, puis tamponnée avec débit de fuite limité, et seulement ensuite rejetée ; raccordement séparatif.', 'Obra nueva y ampliaciones: el agua de lluvia primero se reutiliza (depósito), luego se infiltra, luego se lamina con salida limitada y solo después se vierte; conexión separativa.', 'Nowe budynki i rozbudowy: wodę deszczową najpierw wykorzystuje się (zbiornik), potem rozsącza, potem retencjonuje z dławionym odpływem, a dopiero potem odprowadza; przyłącze rozdzielcze.'), 'vl_gsv_hemelwater'),
    R('keuring', L('Inspection (keuring) of the internal drinking-water installation and the private sewer is required for new connections and when a rainwater (second-circuit) installation is present.', 'Перевірка (keuring) внутрішньої мережі питної води та приватної каналізації обов’язкова для нових підключень і за наявності системи дощової води (другого контуру).', 'Prüfung (keuring) der Trinkwasser-Hausinstallation und der privaten Abwasserleitung ist bei Neuanschluss und bei vorhandener Regenwasseranlage (Zweitkreis) Pflicht.', 'Keuring van de binneninstallatie en de privéwaterafvoer is verplicht bij een nieuwe aansluiting en bij aanwezigheid van een hemelwaterinstallatie (tweede circuit).', 'Le contrôle (keuring) de l’installation intérieure et de l’égout privé est obligatoire pour un nouveau raccordement et en présence d’une installation d’eau de pluie (second circuit).', 'La inspección (keuring) de la instalación interior y del saneamiento privado es obligatoria en nuevas conexiones y si existe una instalación de agua de lluvia (segundo circuito).', 'Kontrola (keuring) wewnętrznej instalacji wody pitnej i prywatnej kanalizacji jest obowiązkowa przy nowym przyłączu oraz przy instalacji wody deszczowej (drugi obieg).'), 'belgaqua_tvbi'),
    RULE_TVBI, RULE_WELFARE] },
  be_wallonia: { id: 'be_wallonia', name: L('Belgium — Wallonia', 'Бельгія — Валлонія', 'Belgien — Wallonien', 'België — Wallonië', 'Belgique — Wallonie', 'Bélgica — Valonia', 'Belgia — Walonia'), rules: [RULE_TVBI, RULE_WELFARE,
    R('no_specific_legionella', L('No regional legionella decree comparable to the Flemish one is encoded here: apply EN 806 / Belgaqua practice and the employer’s risk analysis; verify current regional rules.', 'Регіональна постанова щодо легіонели, подібна до фламандської, тут не закладена: застосовуйте практику EN 806 / Belgaqua та аналіз ризиків роботодавця; перевірте чинні регіональні правила.', 'Ein dem flämischen vergleichbarer regionaler Legionellen-Erlass ist hier nicht hinterlegt: EN 806 / Belgaqua-Praxis und Risikoanalyse des Arbeitgebers anwenden; aktuelle Regionalregeln prüfen.', 'Een regionaal legionellabesluit zoals het Vlaamse is hier niet opgenomen: pas EN 806 / Belgaqua-praktijk en de risicoanalyse van de werkgever toe; controleer de actuele regionale regels.', 'Aucun arrêté régional légionelles comparable à celui de Flandre n’est encodé ici : appliquer la pratique EN 806 / Belgaqua et l’analyse de risques de l’employeur ; vérifier les règles régionales en vigueur.', 'No se incluye aquí un decreto regional de legionela comparable al flamenco: aplique la práctica EN 806 / Belgaqua y el análisis de riesgos del empleador; verifique las normas regionales vigentes.', 'Nie zakodowano tu regionalnego rozporządzenia o legionelli porównywalnego z flamandzkim: stosuj praktykę EN 806 / Belgaqua i ocenę ryzyka pracodawcy; sprawdź aktualne przepisy regionalne.'), 'la_plb')] },
  be_brussels: { id: 'be_brussels', name: L('Belgium — Brussels', 'Бельгія — Брюссель', 'Belgien — Brüssel', 'België — Brussel', 'Belgique — Bruxelles', 'Bélgica — Bruselas', 'Belgia — Bruksela'), rules: [RULE_TVBI, RULE_WELFARE] },
  nl: { id: 'nl', name: L('Netherlands', 'Нідерланди', 'Niederlande', 'Nederland', 'Pays-Bas', 'Países Bajos', 'Holandia'), rules: [
    R('nl_legionella', L('Priority installations (e.g. healthcare, accommodation, campsites, saunas) need a legionella risk analysis and management plan under the Drinking Water Decree.', 'Пріоритетні установки (напр. охорона здоров’я, заклади розміщення, кемпінги, сауни) потребують аналізу ризику легіонели та плану управління згідно з Постановою про питну воду.', 'Prioritäre Anlagen (z. B. Gesundheitswesen, Beherbergung, Campingplätze, Saunen) brauchen nach dem Drinkwaterbesluit eine Legionellen-Risikoanalyse und einen Beheersplan.', 'Prioritaire installaties (bv. zorg, logies, campings, sauna’s) hebben volgens het Drinkwaterbesluit een legionellarisicoanalyse en beheersplan nodig.', 'Les installations prioritaires (p. ex. soins, hébergement, campings, saunas) doivent avoir une analyse de risque légionelles et un plan de gestion selon le Drinkwaterbesluit.', 'Las instalaciones prioritarias (p. ej. sanidad, alojamiento, campings, saunas) necesitan análisis de riesgo de legionela y plan de gestión según el Drinkwaterbesluit.', 'Instalacje priorytetowe (np. opieka zdrowotna, noclegi, kempingi, sauny) wymagają analizy ryzyka legionelli i planu zarządzania wg Drinkwaterbesluit.'), 'nl_drinkwater'),
    R('nl_bbl', L('Building rules (Bbl) refer to NEN 1006 for drinking-water installations and NEN 3215 for drainage.', 'Будівельні правила (Bbl) посилаються на NEN 1006 для мереж питної води та NEN 3215 для каналізації.', 'Bauvorschriften (Bbl) verweisen auf NEN 1006 für Trinkwasser- und NEN 3215 für Entwässerungsanlagen.', 'Het Bbl verwijst naar NEN 1006 voor drinkwaterinstallaties en NEN 3215 voor binnenriolering.', 'Les règles de construction (Bbl) renvoient à la NEN 1006 pour l’eau potable et à la NEN 3215 pour l’évacuation.', 'Las normas de edificación (Bbl) remiten a NEN 1006 para agua potable y NEN 3215 para saneamiento.', 'Przepisy budowlane (Bbl) odsyłają do NEN 1006 dla instalacji wody pitnej i NEN 3215 dla kanalizacji.'), 'nl_bbl')] },
  de: { id: 'de', name: L('Germany', 'Німеччина', 'Deutschland', 'Duitsland', 'Allemagne', 'Alemania', 'Niemcy'), rules: [
    R('de_trinkwv', L('Large hot-water installations with aerosol-forming outlets used commercially or publicly must be examined for Legionella (TrinkwV 2023).', 'Великі установки гарячого водопостачання з точками утворення аерозолю в комерційній чи публічній діяльності підлягають дослідженню на легіонелу (TrinkwV 2023).', 'Großanlagen zur Trinkwassererwärmung mit aerosolbildenden Entnahmestellen in gewerblicher oder öffentlicher Tätigkeit sind auf Legionellen zu untersuchen (TrinkwV 2023).', 'Grote warmwaterinstallaties met aerosolvormende tappunten in commercieel of openbaar gebruik moeten op Legionella onderzocht worden (TrinkwV 2023).', 'Les grandes installations d’eau chaude avec points de puisage générant des aérosols, en activité commerciale ou publique, doivent faire l’objet d’analyses légionelles (TrinkwV 2023).', 'Las grandes instalaciones de ACS con puntos que generan aerosoles en actividad comercial o pública deben analizarse frente a Legionella (TrinkwV 2023).', 'Duże instalacje c.w.u. z punktami tworzącymi aerozol, używane komercyjnie lub publicznie, podlegają badaniom na legionellę (TrinkwV 2023).'), 'de_trinkwv'),
    R('de_w551', L('Heater outlet ≥ 60 °C, circulation return not more than 5 K lower; pipes > 3 L between heater and outlet need circulation (DVGW W 551).', 'Вихід нагрівача ≥ 60 °C, зворотна циркуляція не більш ніж на 5 K нижче; ділянки > 3 л між нагрівачем і точкою водорозбору потребують циркуляції (DVGW W 551).', 'Austritt Trinkwassererwärmer ≥ 60 °C, Zirkulationsrücklauf höchstens 5 K tiefer; Leitungen > 3 l zwischen Erwärmer und Entnahmestelle zirkulieren (DVGW W 551).', 'Uitgang verwarmer ≥ 60 °C, circulatieretour hoogstens 5 K lager; leidingen > 3 l tussen verwarmer en tappunt moeten circuleren (DVGW W 551).', 'Sortie du préparateur ≥ 60 °C, retour de bouclage au plus 5 K plus bas ; conduites > 3 l entre préparateur et puisage à boucler (DVGW W 551).', 'Salida del calentador ≥ 60 °C, retorno de recirculación como máximo 5 K inferior; tuberías > 3 l entre calentador y punto de consumo con recirculación (DVGW W 551).', 'Wyjście podgrzewacza ≥ 60 °C, powrót cyrkulacji najwyżej 5 K niżej; przewody > 3 l między podgrzewaczem a punktem poboru wymagają cyrkulacji (DVGW W 551).'), 'dvgw_w551')] },
  fr: { id: 'fr', name: L('France', 'Франція', 'Frankreich', 'Frankrijk', 'France', 'Francia', 'Francja'), rules: [
    R('fr_temp', L('Hot water ≤ 50 °C at outlets of rooms for personal hygiene; ≥ 50 °C in circulated networks where the volume to the furthest outlet exceeds 3 L.', 'Гаряча вода ≤ 50 °C у точках водорозбору приміщень особистої гігієни; ≥ 50 °C у циркуляційних мережах, якщо об’єм до найвіддаленішої точки перевищує 3 л.', 'Warmwasser ≤ 50 °C an Entnahmestellen in Räumen der Körperpflege; ≥ 50 °C in Zirkulationsnetzen, wenn das Volumen bis zur entferntesten Entnahme 3 l übersteigt.', 'Warm water ≤ 50 °C aan tappunten van ruimten voor persoonlijke hygiëne; ≥ 50 °C in circulatienetten waar het volume tot het verste tappunt 3 l overschrijdt.', 'Eau chaude ≤ 50 °C aux points de puisage des pièces destinées à la toilette ; ≥ 50 °C dans les réseaux bouclés lorsque le volume jusqu’au point le plus éloigné dépasse 3 l.', 'ACS ≤ 50 °C en los puntos de consumo de locales de aseo; ≥ 50 °C en redes con recirculación si el volumen hasta el punto más alejado supera 3 l.', 'Ciepła woda ≤ 50 °C w punktach poboru pomieszczeń higieny osobistej; ≥ 50 °C w sieciach cyrkulacyjnych, gdy objętość do najdalszego punktu przekracza 3 l.'), 'fr_ecs_2005'),
    R('fr_erp', L('Establishments open to the public with showers: legionella monitoring of hot water (sampling programme, logbook).', 'Заклади, відкриті для публіки, з душами: моніторинг легіонели в гарячій воді (програма відбору проб, журнал).', 'Öffentlich zugängliche Einrichtungen mit Duschen: Legionellen-Überwachung des Warmwassers (Probenprogramm, Betriebsbuch).', 'Voor het publiek toegankelijke inrichtingen met douches: legionellabewaking van het warm water (staalnameprogramma, logboek).', 'ERP avec douches : surveillance des légionelles de l’ECS (programme de prélèvements, carnet sanitaire).', 'Establecimientos abiertos al público con duchas: vigilancia de legionela en ACS (programa de muestreo, libro de registro).', 'Obiekty użyteczności publicznej z natryskami: monitoring legionelli w c.w.u. (program poboru próbek, dziennik).'), 'fr_erp_2010')] },
  uk: { id: 'uk', name: L('United Kingdom', 'Велика Британія', 'Vereinigtes Königreich', 'Verenigd Koninkrijk', 'Royaume-Uni', 'Reino Unido', 'Wielka Brytania'), rules: [
    R('uk_l8', L('Legionella control (ACOP L8 / HSG274): stored hot water ≥ 60 °C, distributed ≥ 50 °C (55 °C healthcare) within 1 minute, cold < 20 °C within 2 minutes.', 'Контроль легіонели (ACOP L8 / HSG274): збережена гаряча вода ≥ 60 °C, у мережі ≥ 50 °C (55 °C у закладах охорони здоров’я) протягом 1 хв, холодна < 20 °C протягом 2 хв.', 'Legionellenkontrolle (ACOP L8 / HSG274): gespeichertes Warmwasser ≥ 60 °C, verteilt ≥ 50 °C (55 °C Gesundheitswesen) innerhalb 1 min, Kaltwasser < 20 °C innerhalb 2 min.', 'Legionellabeheersing (ACOP L8 / HSG274): opgeslagen warm water ≥ 60 °C, verdeeld ≥ 50 °C (55 °C zorg) binnen 1 minuut, koud < 20 °C binnen 2 minuten.', 'Maîtrise des légionelles (ACOP L8 / HSG274) : ECS stockée ≥ 60 °C, distribuée ≥ 50 °C (55 °C en établissement de santé) en 1 min, eau froide < 20 °C en 2 min.', 'Control de legionela (ACOP L8 / HSG274): ACS acumulada ≥ 60 °C, distribuida ≥ 50 °C (55 °C en sanidad) en 1 minuto, fría < 20 °C en 2 minutos.', 'Kontrola legionelli (ACOP L8 / HSG274): magazynowana c.w.u. ≥ 60 °C, rozprowadzana ≥ 50 °C (55 °C w ochronie zdrowia) w ciągu 1 min, zimna < 20 °C w ciągu 2 min.'), 'uk_hsg274'),
    R('uk_wsr', L('Water Fittings Regulations: backflow protection by fluid category and notification of certain installations to the water undertaker.', 'Правила щодо водопровідної арматури: захист від зворотного потоку за категорією рідини і повідомлення водопостачальника про певні установки.', 'Water Fittings Regulations: Rückflussschutz nach Flüssigkeitskategorie und Anzeige bestimmter Anlagen beim Versorger.', 'Water Fittings Regulations: terugstroombeveiliging per vloeistofcategorie en melding van bepaalde installaties aan het waterbedrijf.', 'Water Fittings Regulations : protection anti-retour par catégorie de fluide et notification de certaines installations au distributeur.', 'Water Fittings Regulations: protección antirretorno por categoría de fluido y notificación de ciertas instalaciones a la compañía.', 'Water Fittings Regulations: zabezpieczenie przed przepływem zwrotnym wg kategorii cieczy i zgłaszanie niektórych instalacji dostawcy wody.'), 'uk_wsr1999')] },
  other: { id: 'other', name: L('Other / EU baseline', 'Інше / базовий рівень ЄС', 'Andere / EU-Grundlage', 'Andere / EU-basis', 'Autre / socle UE', 'Otro / base UE', 'Inne / podstawa UE'), rules: [
    R('eu_dwd', L('EU Drinking Water Directive: risk assessment of domestic distribution in priority premises; Legionella parameter 1000 CFU/l.', 'Директива ЄС про питну воду: оцінка ризику внутрішніх мереж у пріоритетних приміщеннях; параметр Legionella 1000 КУО/л.', 'EU-Trinkwasserrichtlinie: Risikobewertung der Hausinstallation in prioritären Gebäuden; Parameter Legionella 1000 KBE/l.', 'EU-drinkwaterrichtlijn: risicobeoordeling van binneninstallaties in prioritaire gebouwen; parameter Legionella 1000 kve/l.', 'Directive UE eau potable : évaluation des risques des installations intérieures des locaux prioritaires ; paramètre Legionella 1000 UFC/l.', 'Directiva UE de agua potable: evaluación de riesgos de la distribución interior en locales prioritarios; parámetro Legionella 1000 UFC/l.', 'Dyrektywa UE w sprawie wody pitnej: ocena ryzyka instalacji wewnętrznych w obiektach priorytetowych; parametr Legionella 1000 jtk/l.'), 'eu_dwd')] }
};
Object.keys(REGIONS).forEach(function (k) { REGIONS[k].note = REGION_NOTE; });

/* =====================================================================================
   Package tools (navigation, module labels)
   ===================================================================================== */
var TOOLS = [
  { id: 'plbfixtures', name: L('Sanitary Fixture Count', 'Кількість санітарних приладів', 'Anzahl Sanitärobjekte', 'Aantal sanitaire toestellen', 'Nombre d’appareils sanitaires', 'Número de aparatos sanitarios', 'Liczba przyborów sanitarnych') },
  { id: 'plbsupply', name: L('Drinking Water Pipe Sizing', 'Розрахунок труб питної води', 'Trinkwasser-Rohrnetzberechnung', 'Dimensionering drinkwaterleidingen', 'Dimensionnement des conduites d’eau potable', 'Dimensionado de tuberías de agua potable', 'Wymiarowanie instalacji wody pitnej') },
  { id: 'plbdhw', name: L('Hot Water Storage & Heater Sizing', 'Об’єм бака і потужність нагрівача ГВП', 'Warmwasserspeicher und Erwärmerleistung', 'Warmwaterboiler en verwarmingsvermogen', 'Stockage ECS et puissance de production', 'Acumulación de ACS y potencia del generador', 'Zasobnik c.w.u. i moc podgrzewacza') },
  { id: 'plbcirc', name: L('DHW Circulation & Balancing', 'Циркуляція ГВП і балансування', 'Zirkulation und hydraulischer Abgleich', 'Warmwatercirculatie en inregeling', 'Bouclage ECS et équilibrage', 'Recirculación de ACS y equilibrado', 'Cyrkulacja c.w.u. i równoważenie') },
  { id: 'plblegionella', name: L('Legionella Risk & Dead Legs', 'Ризик легіонели та тупикові ділянки', 'Legionellenrisiko und Totleitungen', 'Legionellarisico en dode leidingen', 'Risque légionelles et bras morts', 'Riesgo de legionela y tramos muertos', 'Ryzyko legionelli i martwe odcinki') },
  { id: 'plbbackflow', name: L('Backflow Protection Selector (EN 1717)', 'Вибір захисту від зворотного потоку (EN 1717)', 'Auswahl Sicherungseinrichtungen (EN 1717)', 'Keuze terugstroombeveiliging (EN 1717)', 'Choix de la protection anti-retour (EN 1717)', 'Selección de protección antirretorno (EN 1717)', 'Dobór zabezpieczeń przed przepływem zwrotnym (EN 1717)') },
  { id: 'plbbooster', name: L('Booster Set Sizing', 'Підбір установки підвищення тиску', 'Auslegung Druckerhöhungsanlage', 'Dimensionering hydrofoorgroep', 'Dimensionnement du surpresseur', 'Dimensionado de grupo de presión', 'Dobór zestawu hydroforowego') },
  { id: 'plbdrainage', name: L('Drainage & Venting (EN 12056-2)', 'Каналізація та вентиляція (EN 12056-2)', 'Entwässerung und Lüftung (EN 12056-2)', 'Binnenriolering en ontluchting (EN 12056-2)', 'Évacuation et ventilation (EN 12056-2)', 'Saneamiento y ventilación (EN 12056-2)', 'Kanalizacja i wentylacja (EN 12056-2)') },
  { id: 'plbliftstation', name: L('Wastewater Lifting Station (EN 12056-4)', 'Каналізаційна насосна установка (EN 12056-4)', 'Abwasserhebeanlage (EN 12056-4)', 'Afvalwaterpompinstallatie (EN 12056-4)', 'Station de relevage des eaux usées (EN 12056-4)', 'Estación de bombeo de aguas residuales (EN 12056-4)', 'Przepompownia ścieków (EN 12056-4)') },
  { id: 'plbrainwater', name: L('Rainwater Reuse & Infiltration', 'Дощова вода: використання та інфільтрація', 'Regenwassernutzung und Versickerung', 'Hemelwaterhergebruik en infiltratie', 'Récupération et infiltration des eaux pluviales', 'Aprovechamiento e infiltración de aguas pluviales', 'Wykorzystanie i rozsączanie wody deszczowej') },
  { id: 'plbwatersaving', name: L('Water Saving & Fixture Efficiency', 'Економія води та ефективність приладів', 'Wassereinsparung und effiziente Armaturen', 'Waterbesparing en zuinige toestellen', 'Économies d’eau et appareils efficaces', 'Ahorro de agua y aparatos eficientes', 'Oszczędzanie wody i efektywne przybory') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });

/* =====================================================================================
   6 Project document
   ===================================================================================== */
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, zones: 2000, fixture_count: 100000 };
var BAD_KEY_LIST = ['__proto__', 'constructor', 'prototype'];
function badKey(k) { return BAD_KEY_LIST.indexOf(k) >= 0; }
var PROJECT_NUM = { persons: [0, 1e6], floors: [0, 300], floor_height_m: [1, 20], supply_pressure_bar: [0, 25], water_price_eur_m3: [0, 100], year: [1900, 2200] };

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }

function emptyProject(opts) {
  opts = opts || {};
  return { schema: SCHEMA, revision: 1,
    project: { name: opts.name || '', region: opts.region || 'be_flanders', building_type: opts.building_type || 'office', persons: null, floors: null, floor_height_m: 3.2,
      supply_pressure_bar: null, currency: 'EUR', water_price_eur_m3: null, year: opts.year || new Date().getFullYear() },
    zones: [], modules: {} };
}

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
      if (badKey(keys[k])) { errors.push({ code: 'forbidden_key', path: path + '.' + keys[k], msg: 'forbidden key ' + keys[k] }); continue; }
      w(v[keys[k]], d + 1, path + '.' + keys[k]);
    }
  }
  w(doc, 0, '$');
  return errors;
}

/* JSON.parse creates own "__proto__" keys; walk() sees them through Object.keys — a parsed document with them is refused */
function validate(doc) {
  var errors = [], warnings = [];
  if (!isObj(doc)) return { ok: false, errors: [{ code: 'not_object', path: '$', msg: 'document is not an object' }], warnings: warnings };
  walk(doc, errors);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) errors.push({ code: 'schema', path: '$.schema', msg: 'schema must be ' + SCHEMA });
  if (doc.revision != null && (typeof doc.revision !== 'number' || doc.revision < 0 || Math.floor(doc.revision) !== doc.revision)) errors.push({ code: 'revision', path: '$.revision', msg: 'revision must be a non-negative integer' });
  if (doc.project != null && !isObj(doc.project)) errors.push({ code: 'project', path: '$.project', msg: 'project must be an object' });
  if (isObj(doc.project)) {
    var p = doc.project;
    if (p.name != null && typeof p.name !== 'string') errors.push({ code: 'type', path: '$.project.name', msg: 'string expected' });
    if (p.region != null && typeof p.region !== 'string') errors.push({ code: 'type', path: '$.project.region', msg: 'string expected' });
    else if (p.region != null && !has(REGIONS, p.region)) warnings.push({ code: 'unknown_region', path: '$.project.region', msg: 'region ' + p.region + ' not known; rules shown for "other"' });
    if (p.building_type != null && typeof p.building_type !== 'string') errors.push({ code: 'type', path: '$.project.building_type', msg: 'string expected' });
    else if (p.building_type != null && !has(BUILDING_TYPES, p.building_type)) warnings.push({ code: 'unknown_building_type', path: '$.project.building_type', msg: 'building type ' + p.building_type + ' not known' });
    Object.keys(PROJECT_NUM).forEach(function (f) {
      if (p[f] == null) return;
      var r = PROJECT_NUM[f];
      if (typeof p[f] !== 'number') errors.push({ code: 'type', path: '$.project.' + f, msg: 'number or null expected' });
      else if (p[f] < r[0] || p[f] > r[1]) errors.push({ code: 'range', path: '$.project.' + f, msg: f + ' must be within ' + r[0] + '..' + r[1] });
    });
    if (p.currency != null && p.currency !== 'EUR') warnings.push({ code: 'currency', path: '$.project.currency', msg: 'only EUR is supported; values are read as EUR' });
  }
  if (doc.zones != null && !Array.isArray(doc.zones)) errors.push({ code: 'zones', path: '$.zones', msg: 'zones must be an array' });
  else if (Array.isArray(doc.zones)) {
    if (doc.zones.length > LIMITS.zones) errors.push({ code: 'too_many_zones', path: '$.zones', msg: 'more than ' + LIMITS.zones + ' zones' });
    var seen = {};
    doc.zones.forEach(function (z, i) {
      var zp = '$.zones[' + i + ']';
      if (!isObj(z)) { errors.push({ code: 'zone', path: zp, msg: 'zone must be an object' }); return; }
      if (typeof z.id !== 'string' || !z.id.trim() || z.id.length > 80) errors.push({ code: 'zone_id', path: zp + '.id', msg: 'id must be a non-empty string (≤ 80 chars)' });
      else if (seen[z.id]) errors.push({ code: 'duplicate_id', path: zp + '.id', msg: 'duplicate zone id ' + z.id });
      else seen[z.id] = 1;
      ['name', 'notes', 'building_type'].forEach(function (f) { if (z[f] != null && typeof z[f] !== 'string') errors.push({ code: 'type', path: zp + '.' + f, msg: 'string expected' }); });
      if (z.floor != null && !(typeof z.floor === 'number' && z.floor >= -20 && z.floor <= 300)) errors.push({ code: 'range', path: zp + '.floor', msg: 'floor −20..300 expected' });
      if (z.persons != null && !(typeof z.persons === 'number' && z.persons >= 0 && z.persons <= 1e6)) errors.push({ code: 'range', path: zp + '.persons', msg: 'persons ≥ 0 expected' });
      if (z.fixtures != null && !isObj(z.fixtures)) errors.push({ code: 'fixtures', path: zp + '.fixtures', msg: 'fixtures must be an object {fixtureId: count}' });
      else if (isObj(z.fixtures)) Object.keys(z.fixtures).forEach(function (fid) {
        var n = z.fixtures[fid], fp = zp + '.fixtures.' + fid;
        if (typeof n !== 'number' || n < 0 || n > LIMITS.fixture_count || Math.floor(n) !== n) errors.push({ code: 'count', path: fp, msg: 'count must be an integer 0..' + LIMITS.fixture_count });
        if (!has(FIXTURES, fid)) warnings.push({ code: 'unknown_fixture', path: fp, msg: 'fixture ' + fid + ' is not in the library; ignored in totals' });
      });
    });
  }
  if (doc.modules != null && !isObj(doc.modules)) errors.push({ code: 'modules', path: '$.modules', msg: 'modules must be an object' });
  else if (isObj(doc.modules)) {
    Object.keys(doc.modules).forEach(function (k) {
      var m = doc.modules[k], mp = '$.modules.' + k;
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(k)) errors.push({ code: 'module_id', path: mp, msg: 'bad module id' });
      if (!isObj(m)) { errors.push({ code: 'module', path: mp, msg: 'module must be an object' }); return; }
      if (m.updatedAt != null && (typeof m.updatedAt !== 'string' || !isFinite(Date.parse(m.updatedAt)))) errors.push({ code: 'updatedAt', path: mp + '.updatedAt', msg: 'ISO date string expected' });
      if (TOOL_IDS.indexOf(k) < 0) warnings.push({ code: 'unknown_module', path: mp, msg: 'module from another tool kept as is' });
    });
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* UTF-8 size of a string in bytes (surrogate pair = 4 bytes); counting stops just above the limit */
function utf8Bytes(s) {
  if (s.length > LIMITS.bytes) return s.length;
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
    if (n > LIMITS.bytes) return n;
  }
  return n;
}

function importJSON(text) {
  if (typeof text !== 'string') return { ok: false, doc: null, errors: [{ code: 'not_text', path: '$', msg: 'text expected' }], warnings: [] };
  if (utf8Bytes(text) > LIMITS.bytes) return { ok: false, doc: null, errors: [{ code: 'too_large', path: '$', msg: 'file larger than 2 MB' }], warnings: [] };
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, doc: null, errors: [{ code: 'json', path: '$', msg: 'invalid JSON: ' + e.message }], warnings: [] }; }
  var v = validate(doc);
  if (!v.ok) return { ok: false, doc: null, errors: v.errors, warnings: v.warnings };
  if (!isObj(doc.modules)) doc.modules = {};
  if (!Array.isArray(doc.zones)) doc.zones = [];
  if (doc.revision == null) doc.revision = 1;
  if (!isObj(doc.project)) doc.project = emptyProject().project;
  return { ok: true, doc: doc, errors: [], warnings: v.warnings };
}

function exportJSON(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('PLBCore.project.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg; }).join('; '));
  return JSON.stringify(doc, null, 2);
}

/* withModule(doc, toolId, {state, results, summary, ...}) -> new document (input untouched); only modules.<toolId> changes, revision + 1 */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('PLBCore.project.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt'].indexOf(k) < 0 && !badKey(k)) mod[k] = clone(payload[k]); });
  mod.updatedAt = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  next.modules[toolId] = mod;
  next.revision = (typeof next.revision === 'number' ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('PLBCore.project.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg);
  return next;
}

/* withZones(doc, zones) -> new document with zones replaced (plbfixtures only, after the user's explicit "Apply") */
function withZones(doc, zones) {
  var next = clone(doc); next.zones = clone(zones || []);
  next.revision = (typeof next.revision === 'number' ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('PLBCore.project.withZones: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg);
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

/* fixtureTotals(doc | zones[]) — library fixtures only (unknown ids listed in .unknown).
   lu: EN 806-3 sums {cold, hot, supply} — supply counts a mixer once (max of cold/hot), as EN 806-3 applies one LU per draw-off point;
   qa: DIN 1988-300 ΣVR {cold, hot, total, max_single (largest VR of one pipe: cold or hot circuit), max_single_total (largest cold + hot VR of one fixture: lower bound of the peak flow of the total circuit upstream of the heater)}; du: EN 12056-2 ΣDU per system (fixtures without DU in a system are listed in du_missing);
   persons: Σ zone persons (null when no zone states persons) — project.persons is reported separately. */
function fixtureTotals(docOrZones) {
  var zones = Array.isArray(docOrZones) ? docOrZones : (docOrZones && Array.isArray(docOrZones.zones) ? docOrZones.zones : []);
  var by = {}, lu = { cold: 0, hot: 0, supply: 0 }, qa = { cold: 0, hot: 0, max_single: 0, max_single_total: 0 }, du = { I: 0, II: 0, III: 0, IV: 0 }, du_missing = { I: [], II: [], III: [], IV: [] };
  var persons = null, unknown = [], count = 0, aerosol = 0, hotPoints = 0, perZone = [];
  zones.forEach(function (z) {
    if (!isObj(z)) return;
    if (typeof z.persons === 'number') persons = (persons || 0) + z.persons;
    var zt = { id: z.id, fixtures: 0, lu_supply: 0, du_II: 0 };
    var f = isObj(z.fixtures) ? z.fixtures : {};
    Object.keys(f).forEach(function (id) {
      var n = f[id]; if (typeof n !== 'number' || !(n > 0)) return;
      var fx_ = own(FIXTURES, id);
      if (!fx_) { if (unknown.indexOf(id) < 0) unknown.push(id); return; }
      by[id] = (by[id] || 0) + n; count += n; zt.fixtures += n;
      lu.cold += n * fx_.lu.cold; lu.hot += n * fx_.lu.hot; lu.supply += n * Math.max(fx_.lu.cold, fx_.lu.hot); zt.lu_supply += n * Math.max(fx_.lu.cold, fx_.lu.hot);
      qa.cold += n * fx_.qa_lps.cold; qa.hot += n * fx_.qa_lps.hot;
      qa.max_single = Math.max(qa.max_single, fx_.qa_lps.cold, fx_.qa_lps.hot);
      qa.max_single_total = Math.max(qa.max_single_total, fx_.qa_lps.cold + fx_.qa_lps.hot);
      ['I', 'II', 'III', 'IV'].forEach(function (s) {
        var d = fx_.du_lps[s];
        if (d == null) { if (fx_.du_lps.I != null && du_missing[s].indexOf(id) < 0) du_missing[s].push(id); return; }
        du[s] += n * d;
      });
      zt.du_II += n * (fx_.du_lps.II || 0);
      if (fx_.aerosol) aerosol += n;
      if (fx_.hot) hotPoints += n;
    });
    perZone.push(zt);
  });
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  ['cold', 'hot', 'supply'].forEach(function (k) { lu[k] = r6(lu[k]); });
  ['cold', 'hot'].forEach(function (k) { qa[k] = r6(qa[k]); });
  qa.total = r6(qa.cold + qa.hot); qa.max_single_total = r6(qa.max_single_total);
  ['I', 'II', 'III', 'IV'].forEach(function (k) { du[k] = r6(du[k]); });
  perZone.forEach(function (z) { z.lu_supply = r6(z.lu_supply); z.du_II = r6(z.du_II); });
  return { by: by, count: count, lu: lu, qa: qa, du: du, du_missing: du_missing, persons: persons,
    project_persons: docOrZones && !Array.isArray(docOrZones) && docOrZones.project ? docOrZones.project.persons : null,
    aerosol_points: aerosol, hot_points: hotPoints, zones: perZone, unknown: unknown };
}

/* =====================================================================================
   CSV (RFC 4180, CRLF), formula-injection guard: string cells starting with = + - @ TAB CR get a leading ' unless the whole string is a plain number ("-3.2").
   cols: ['key', ...] or [{key, label}]; rows: objects or arrays. Numbers are written raw (dot decimal).
   ===================================================================================== */
var NUMERIC_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
function csvCell(v) {
  if (v == null) return '';
  var s;
  if (typeof v === 'number') s = isFinite(v) ? String(v) : '';
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !NUMERIC_RE.test(s)) s = '\'' + s;
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
   PRESET_PROJECTS — shared demo buildings (same in all package tools). Fixture counts and persons are
   illustrative (learning_assumption la_plb), chosen so that each tool can show its "aha".
   ===================================================================================== */
/* zone and project names are 7-language L() dicts ({n} = floor or room number), resolved to one language by presetProject() */
function Z(id, name, floor, persons, fixtures, notes) { return { id: id, name: name, floor: floor, persons: persons, fixtures: fixtures, notes: notes || '' }; }
function floors(n, from, mk) { var out = []; for (var i = 0; i < n; i++) out.push(mk(from + i)); return out; }
function N(dict, n) { var o = {}; LANGS.forEach(function (l) { o[l] = dict[l].replace('{n}', String(n)); }); return o; }
var ZN = {
  flats4: L('Floor {n} (4 flats)', 'Поверх {n} (4 квартири)', 'Geschoss {n} (4 Wohnungen)', 'Bouwlaag {n} (4 appartementen)', 'Niveau {n} (4 appartements)', 'Planta {n} (4 viviendas)', 'Kondygnacja {n} (4 mieszkania)'),
  bikeUtility: L('Basement: bike store / utility', 'Підвал: велосипедна / господарське приміщення', 'Untergeschoss: Fahrradraum / Hauswirtschaft', 'Kelder: fietsenberging / technische ruimte', 'Sous-sol : local vélos / buanderie', 'Sótano: cuarto de bicicletas / servicio', 'Piwnica: rowerownia / pomieszczenie gospodarcze'),
  garden: L('Garden', 'Сад', 'Garten', 'Tuin', 'Jardin', 'Jardín', 'Ogród'),
  coreWc: L('Floor {n} core toilets', 'Поверх {n}: санвузли в ядрі', 'Geschoss {n}: Sanitärkern', 'Bouwlaag {n}: sanitaire kern', 'Niveau {n} : sanitaires du noyau', 'Planta {n}: aseos del núcleo', 'Kondygnacja {n}: toalety w trzonie'),
  bikeShower: L('Ground: bike & shower room', 'Перший поверх: велосипедна та душова', 'Erdgeschoss: Fahrrad- und Duschraum', 'Gelijkvloers: fietsenstalling en douches', 'Rez-de-chaussée : local vélos et douches', 'Planta baja: bicicletas y duchas', 'Parter: rowerownia i natryski'),
  showersRare: L('Showers used 2–3 times a week: stagnation', 'Душами користуються 2–3 рази на тиждень: застій', 'Duschen 2–3-mal pro Woche genutzt: Stagnation', 'Douches 2–3 keer per week gebruikt: stilstand', 'Douches utilisées 2 à 3 fois par semaine : stagnation', 'Duchas usadas 2–3 veces por semana: estancamiento', 'Natryski używane 2–3 razy w tygodniu: stagnacja'),
  roofPlant: L('Roof plant', 'Технічне приміщення на даху', 'Dachzentrale', 'Technische ruimte op het dak', 'Local technique en toiture', 'Sala técnica en cubierta', 'Maszynownia na dachu'),
  rooms24: L('Floor {n} (24 rooms)', 'Поверх {n} (24 номери)', 'Geschoss {n} (24 Zimmer)', 'Bouwlaag {n} (24 kamers)', 'Niveau {n} (24 chambres)', 'Planta {n} (24 habitaciones)', 'Kondygnacja {n} (24 pokoje)'),
  lobby: L('Ground: lobby, restaurant, kitchen', 'Перший поверх: лобі, ресторан, кухня', 'Erdgeschoss: Lobby, Restaurant, Küche', 'Gelijkvloers: lobby, restaurant, keuken', 'Rez-de-chaussée : hall, restaurant, cuisine', 'Planta baja: vestíbulo, restaurante, cocina', 'Parter: lobby, restauracja, kuchnia'),
  spa: L('Basement: spa & fitness', 'Підвал: спа та фітнес', 'Untergeschoss: Spa und Fitness', 'Kelder: wellness en fitness', 'Sous-sol : spa et fitness', 'Sótano: spa y gimnasio', 'Piwnica: spa i fitness'),
  wcBlocks: L('Floor {n} toilet blocks', 'Поверх {n}: блоки туалетів', 'Geschoss {n}: Toilettenanlagen', 'Bouwlaag {n}: toiletblokken', 'Niveau {n} : blocs sanitaires', 'Planta {n}: bloques de aseos', 'Kondygnacja {n}: zespoły toalet'),
  labs: L('Science labs', 'Природничі лабораторії', 'Fachräume Naturwissenschaften', 'Wetenschapslabo’s', 'Laboratoires de sciences', 'Laboratorios de ciencias', 'Pracownie przyrodnicze'),
  eyewashRare: L('Eyewash stations: rarely used outlets', 'Фонтанчики для промивання очей: рідко використовувані точки', 'Augenduschen: selten genutzte Entnahmestellen', 'Oogdouches: weinig gebruikte tappunten', 'Douches oculaires : points peu utilisés', 'Lavaojos: puntos poco usados', 'Natryski do oczu: rzadko używane punkty'),
  kitchen: L('Kitchen', 'Кухня', 'Küche', 'Keuken', 'Cuisine', 'Cocina', 'Kuchnia'),
  changing: L('Changing room {n}', 'Роздягальня {n}', 'Umkleide {n}', 'Kleedkamer {n}', 'Vestiaire {n}', 'Vestuario {n}', 'Szatnia {n}'),
  allShowers: L('All showers run together after a match', 'Після матчу всі душі працюють одночасно', 'Nach einem Spiel laufen alle Duschen gleichzeitig', 'Na een wedstrijd lopen alle douches tegelijk', 'Après un match, toutes les douches coulent en même temps', 'Tras un partido todas las duchas funcionan a la vez', 'Po meczu wszystkie natryski działają jednocześnie'),
  publicWc: L('Public toilets & cafeteria', 'Громадські туалети та кафетерій', 'Öffentliche Toiletten und Cafeteria', 'Publieke toiletten en cafetaria', 'Toilettes publiques et cafétéria', 'Aseos públicos y cafetería', 'Toalety publiczne i kawiarnia'),
  ward27: L('Ward floor {n} (27 rooms)', 'Поверх відділення {n} (27 кімнат)', 'Stationsgeschoss {n} (27 Zimmer)', 'Afdelingsverdieping {n} (27 kamers)', 'Niveau de soins {n} (27 chambres)', 'Planta de unidad {n} (27 habitaciones)', 'Kondygnacja oddziału {n} (27 pokoi)'),
  laundry: L('Central kitchen & laundry', 'Центральна кухня та пральня', 'Zentralküche und Wäscherei', 'Centrale keuken en wasserij', 'Cuisine centrale et buanderie', 'Cocina central y lavandería', 'Kuchnia centralna i pralnia')
};
var PRESET_DEFS = {
  apartments_24: { label: L('24 apartments, 6 floors (Antwerp)', '24 квартири, 6 поверхів (Антверпен)', '24 Wohnungen, 6 Geschosse (Antwerpen)', '24 appartementen, 6 bouwlagen (Antwerpen)', '24 appartements, 6 niveaux (Anvers)', '24 viviendas, 6 plantas (Amberes)', '24 mieszkania, 6 kondygnacji (Antwerpia)'),
    project: { name: L('Apartments 24 — Antwerp', 'Квартири 24 — Антверпен', 'Wohnungen 24 — Antwerpen', 'Appartementen 24 — Antwerpen', 'Appartements 24 — Anvers', 'Viviendas 24 — Amberes', 'Mieszkania 24 — Antwerpia'), region: 'be_flanders', building_type: 'residential', persons: 57, floors: 6, floor_height_m: 3.0, supply_pressure_bar: 3.0, water_price_eur_m3: 5.5 },
    zones: function () { return floors(6, 0, function (f) { return Z('F' + f, N(ZN.flats4, f), f, 9 + (f % 2), { wc_cistern: 5, basin: 5, shower: 4, bath: 1, sink_kitchen: 4, washing_machine: 4, dishwasher_dom: 4 }); }).concat([Z('B', ZN.bikeUtility, -1, 0, { tap_utility: 1, floor_drain: 2, cleaner_sink: 1 }), Z('G', ZN.garden, 0, 0, { tap_garden: 1 })]); } },
  office_8f: { label: L('8-floor office, 600 staff', 'Офіс на 8 поверхів, 600 працівників', 'Bürogebäude, 8 Geschosse, 600 Mitarbeitende', 'Kantoor 8 bouwlagen, 600 medewerkers', 'Bureaux 8 niveaux, 600 personnes', 'Oficinas de 8 plantas, 600 empleados', 'Biurowiec 8-kondygnacyjny, 600 pracowników'),
    project: { name: L('Office 8 floors — Brussels', 'Офіс 8 поверхів — Брюссель', 'Büro 8 Geschosse — Brüssel', 'Kantoor 8 bouwlagen — Brussel', 'Bureaux 8 niveaux — Bruxelles', 'Oficinas 8 plantas — Bruselas', 'Biuro 8 kondygnacji — Bruksela'), region: 'be_brussels', building_type: 'office', persons: 600, floors: 8, floor_height_m: 3.6, supply_pressure_bar: 3.5, water_price_eur_m3: 5.0 },
    zones: function () { return floors(8, 0, function (f) { return Z('F' + f, N(ZN.coreWc, f), f, 75, { wc_cistern: 6, urinal_flush: 3, basin: 6, handbasin_small: 1, sink_kitchen: 1, dishwasher_dom: 1, cleaner_sink: 1 }); }).concat([Z('GYM', ZN.bikeShower, 0, 0, { shower: 6, wc_cistern: 2, basin: 2 }, ZN.showersRare), Z('R', ZN.roofPlant, 8, 0, { tap_utility: 1 })]); } },
  hotel_120: { label: L('Hotel, 120 rooms', 'Готель, 120 номерів', 'Hotel, 120 Zimmer', 'Hotel, 120 kamers', 'Hôtel, 120 chambres', 'Hotel, 120 habitaciones', 'Hotel, 120 pokoi'),
    project: { name: L('Hotel 120 rooms — Ghent', 'Готель 120 номерів — Гент', 'Hotel 120 Zimmer — Gent', 'Hotel 120 kamers — Gent', 'Hôtel 120 chambres — Gand', 'Hotel 120 habitaciones — Gante', 'Hotel 120 pokoi — Gandawa'), region: 'be_flanders', building_type: 'hotel', persons: 180, floors: 6, floor_height_m: 3.1, supply_pressure_bar: 3.2, water_price_eur_m3: 5.5 },
    zones: function () { return floors(5, 1, function (f) { return Z('F' + f, N(ZN.rooms24, f), f, 36, { wc_cistern: 24, basin: 24, shower_large_head: 18, bath: 6, cleaner_sink: 1 }); }).concat([Z('GF', ZN.lobby, 0, 0, { wc_cistern: 6, urinal_flush: 2, basin: 6, sink_commercial: 3, dishwasher_com: 1, handbasin_small: 2, floor_drain: 4 }), Z('SPA', ZN.spa, -1, 0, { shower: 8, wc_cistern: 2, basin: 2, floor_drain: 3 })]); } },
  school_600: { label: L('Secondary school, 600 pupils', 'Середня школа, 600 учнів', 'Schule, 600 Schüler', 'Secundaire school, 600 leerlingen', 'École secondaire, 600 élèves', 'Instituto, 600 alumnos', 'Szkoła średnia, 600 uczniów'),
    project: { name: L('School 600 pupils — Leuven', 'Школа 600 учнів — Левен', 'Schule 600 Schüler — Löwen', 'School 600 leerlingen — Leuven', 'École 600 élèves — Louvain', 'Instituto 600 alumnos — Lovaina', 'Szkoła 600 uczniów — Lowanium'), region: 'be_flanders', building_type: 'school', persons: 660, floors: 3, floor_height_m: 3.6, supply_pressure_bar: 3.0, water_price_eur_m3: 5.5 },
    zones: function () { return floors(3, 0, function (f) { return Z('F' + f, N(ZN.wcBlocks, f), f, 220, { wc_cistern: 10, urinal_flush: 5, basin: 8, drinking_fountain: 1, cleaner_sink: 1 }); }).concat([Z('LAB', ZN.labs, 1, 0, { sink_commercial: 8, eyewash_emergency: 4 }, ZN.eyewashRare), Z('KIT', ZN.kitchen, 0, 0, { sink_commercial: 2, dishwasher_com: 1, handbasin_small: 1, floor_drain: 2 })]); } },
  sports_hall: { label: L('Sports hall, 4 changing rooms', 'Спортзал, 4 роздягальні', 'Sporthalle, 4 Umkleiden', 'Sporthal, 4 kleedkamers', 'Salle de sport, 4 vestiaires', 'Pabellón deportivo, 4 vestuarios', 'Hala sportowa, 4 szatnie'),
    project: { name: L('Sports hall — Mechelen', 'Спортзал — Мехелен', 'Sporthalle — Mecheln', 'Sporthal — Mechelen', 'Salle de sport — Malines', 'Pabellón deportivo — Malinas', 'Hala sportowa — Mechelen'), region: 'be_flanders', building_type: 'sports', persons: 120, floors: 1, floor_height_m: 4.0, supply_pressure_bar: 2.8, water_price_eur_m3: 5.5 },
    zones: function () { return [1, 2, 3, 4].map(function (i) { return Z('CR' + i, N(ZN.changing, i), 0, 25, { shower: 8, wc_cistern: 2, basin: 3, floor_drain: 2 }, ZN.allShowers); }).concat([Z('PUB', ZN.publicWc, 0, 20, { wc_cistern: 4, urinal_flush: 3, basin: 4, sink_kitchen: 1, cleaner_sink: 1 })]); } },
  care_home_80: { label: L('Care home, 80 beds', 'Будинок догляду, 80 місць', 'Pflegeheim, 80 Betten', 'Woonzorgcentrum, 80 bedden', 'Maison de repos, 80 lits', 'Residencia de mayores, 80 camas', 'Dom opieki, 80 łóżek'),
    project: { name: L('Care home 80 beds — Bruges', 'Будинок догляду 80 місць — Брюгге', 'Pflegeheim 80 Betten — Brügge', 'Woonzorgcentrum 80 bedden — Brugge', 'Maison de repos 80 lits — Bruges', 'Residencia 80 camas — Brujas', 'Dom opieki 80 łóżek — Brugia'), region: 'be_flanders', building_type: 'care_home', persons: 80, floors: 3, floor_height_m: 3.2, supply_pressure_bar: 3.0, water_price_eur_m3: 5.5 },
    zones: function () { return floors(3, 0, function (f) { return Z('W' + f, N(ZN.ward27, f), f, f === 2 ? 26 : 27, { wc_cistern: 28, basin: 28, shower: 27, bath: 1, slop_sink: 1, bedpan_washer: 1, cleaner_sink: 1 }); }).concat([Z('KIT', ZN.laundry, 0, 0, { sink_commercial: 3, dishwasher_com: 1, washing_machine: 3, floor_drain: 3 })]); } }
};
var PRESET_PROJECTS = {};
Object.keys(PRESET_DEFS).forEach(function (k) {
  var d = PRESET_DEFS[k];
  PRESET_PROJECTS[k] = { id: k, label: d.label, source: 'la_plb' };
});
/* language of preset names: opts.lang, else the page language (<html lang>, set by DiagramUI), else en */
function pageLang(l) {
  if (LANGS.indexOf(l) >= 0) return l;
  try { var h = typeof document !== 'undefined' && document.documentElement && String(document.documentElement.lang || '').slice(0, 2).toLowerCase(); if (LANGS.indexOf(h) >= 0) return h; } catch (e) { /* no DOM */ }
  return 'en';
}
/* presetProject(id, {year, lang}) -> fresh full document (clone each call); zone names, notes and the project name in one language */
function presetProject(id, opts) {
  var d = own(PRESET_DEFS, id); if (!d) return null;
  var lang = pageLang(opts && opts.lang);
  var doc = emptyProject({ year: opts && opts.year || 2026 });
  Object.keys(d.project).forEach(function (k) { doc.project[k] = d.project[k]; });
  doc.project.name = t(d.project.name, lang);
  doc.zones = d.zones().map(function (z) { z.name = t(z.name, lang); z.notes = t(z.notes, lang); return z; });
  return doc;
}
Object.keys(PRESET_PROJECTS).forEach(function (k) {
  Object.defineProperty(PRESET_PROJECTS[k], 'doc', { enumerable: false, get: function () { return presetProject(k); } });
});

/* =====================================================================================
   7 UI strings + projectBar widget (DOM only when called) — same behaviours as MEPCore.ui.registerBar
   ===================================================================================== */
var UI = {
  project: L('Plumbing project', 'Сантехнічний проєкт', 'Sanitärprojekt', 'Sanitair project', 'Projet sanitaire', 'Proyecto de fontanería', 'Projekt sanitarny'),
  zones: L('zones', 'зон', 'Zonen', 'zones', 'zones', 'zonas', 'stref'),
  fixtures: L('fixtures', 'приладів', 'Sanitärobjekte', 'toestellen', 'appareils', 'aparatos', 'przyborów'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  newProject: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  takenFrom: L('Taken from', 'Взято з', 'Übernommen aus', 'Overgenomen uit', 'Repris de', 'Tomado de', 'Pobrano z'),
  nothingTaken: L('Nothing usable for this tool in', 'Немає даних для цього інструмента в', 'Nichts Verwendbares für dieses Werkzeug in', 'Niets bruikbaars voor deze tool in', 'Rien d’utilisable pour cet outil dans', 'Nada utilizable para esta herramienta en', 'Brak danych dla tego narzędzia w'),
  resultsFrom: L('Project has results from', 'У проєкті є результати з', 'Projekt enthält Ergebnisse aus', 'Project bevat resultaten uit', 'Le projet contient des résultats de', 'El proyecto tiene resultados de', 'Projekt zawiera wyniki z'),
  noModules: L('No tool results yet', 'Результатів інструментів ще немає', 'Noch keine Ergebnisse', 'Nog geen resultaten', 'Pas encore de résultats', 'Aún no hay resultados', 'Brak wyników narzędzi'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Project imported', 'Проєкт імпортовано', 'Projekt importiert', 'Project geïmporteerd', 'Projet importé', 'Proyecto importado', 'Zaimportowano projekt'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new empty project? Unsaved data in this browser will be replaced.', 'Почати новий порожній проєкт? Незбережені дані в цьому браузері буде замінено.', 'Neues leeres Projekt beginnen? Nicht gesicherte Daten in diesem Browser werden ersetzt.', 'Nieuw leeg project beginnen? Niet opgeslagen gegevens in deze browser worden vervangen.', 'Commencer un projet vide ? Les données non exportées de ce navigateur seront remplacées.', '¿Empezar un proyecto vacío? Se reemplazarán los datos no exportados de este navegador.', 'Rozpocząć nowy pusty projekt? Niezapisane dane w tej przeglądarce zostaną zastąpione.'),
  siblings: L('Package tools', 'Інструменти пакета', 'Werkzeuge des Pakets', 'Tools van het pakket', 'Outils du paquet', 'Herramientas del paquete', 'Narzędzia pakietu'),
  unnamed: L('(unnamed project)', '(проєкт без назви)', '(Projekt ohne Namen)', '(naamloos project)', '(projet sans nom)', '(proyecto sin nombre)', '(projekt bez nazwy)'),
  buildingType: L('Building type', 'Тип будівлі', 'Gebäudeart', 'Gebouwtype', 'Type de bâtiment', 'Tipo de edificio', 'Rodzaj budynku'),
  region: L('Region', 'Регіон', 'Region', 'Regio', 'Région', 'Región', 'Region'),
  learningAssumption: L('learning assumption — replace with project data', 'навчальне припущення — замініть даними проєкту', 'Lernannahme — durch Projektdaten ersetzen', 'leeraanname — vervang door projectgegevens', 'hypothèse pédagogique — à remplacer par les données du projet', 'supuesto didáctico: sustitúyalo por datos del proyecto', 'założenie szkoleniowe — zastąp danymi projektu'),
  disclaimer: L('Design aid, not a substitute for the standards, the water utility’s rules and national/regional regulations.', 'Допоміжний інструмент проєктування, не замінює стандартів, правил водоканалу та національних/регіональних норм.', 'Planungshilfe, kein Ersatz für die Normen, die Vorgaben des Wasserversorgers und nationale/regionale Vorschriften.', 'Ontwerphulpmiddel, geen vervanging voor de normen, de voorschriften van het waterbedrijf en nationale/regionale regelgeving.', 'Aide à la conception, ne remplace ni les normes, ni les règles du distributeur d’eau, ni la réglementation nationale/régionale.', 'Ayuda al diseño; no sustituye las normas, las reglas de la compañía de aguas ni la normativa nacional/regional.', 'Narzędzie wspomagające projektowanie, nie zastępuje norm, wymagań wodociągów ani przepisów krajowych/regionalnych.')
};

function projectBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return LANGS.indexOf(v) >= 0 ? v : 'en'; };
  var tx = function (k) { return t(UI[k], lang()); };
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyProject());
  var storageOk = !!storage();
  /* opts.consumes: [toolIds] whose results this page can take over — Use only for them (absent: Use for every other module) */
  var consumes = Array.isArray(opts.consumes) ? opts.consumes.filter(function (x) { return typeof x === 'string'; }) : null;
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }
  var box = el('section', { 'class': 'plb-project-bar', 'aria-label': 'project', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = el('strong'), meta = el('span', { style: 'color:var(--muted,#5b6675)' });
  var btnStyle = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
  var bImport = el('button', { type: 'button', style: btnStyle, 'data-act': 'import' }), bExport = el('button', { type: 'button', style: btnStyle, 'data-act': 'export' }), bNew = el('button', { type: 'button', style: btnStyle, 'data-act': 'new' });
  var file = el('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = el('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = el('div', { role: 'status', 'aria-live': 'polite', style: 'color:var(--muted,#5b6675);min-height:1em' });
  head.appendChild(title); head.appendChild(meta); head.appendChild(bImport); head.appendChild(bExport); head.appendChild(bNew); head.appendChild(file);
  box.appendChild(head); box.appendChild(modules); box.appendChild(nav); box.appendChild(status);
  host.appendChild(box);

  function setDoc(next, silent, noSave) {
    doc = next;
    if (!noSave) { var r = save(doc); storageOk = r.ok; if (!r.ok) status.textContent = tx('storageOff'); }
    render();
    if (!silent && typeof opts.onChange === 'function') opts.onChange(clone(doc));
  }
  function stamp(d) {
    var m = d && d.modules || {}, best = '';
    Object.keys(m).forEach(function (k) { var u = m[k] && m[k].updatedAt; if (typeof u === 'string' && u > best) best = u; });
    return best;
  }
  /* without opts.getDoc: export the stored project when it is newer (latest modules.*.updatedAt, then revision) than the one shown */
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    var newer = a > b || (a === b && (st.revision || 0) > (cur.revision || 0));
    if (!newer) return cur;
    doc = st; render();
    return st;
  }
  /* D-PLB-15: onUse may return the taken fields (array of labels or a string), or false when nothing applied */
  function useStatus(k, r) {
    var m = doc.modules && doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0];
    var name = tool ? t(tool.name, lang()) : k, date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
    if (r === false) { status.textContent = tx('nothingTaken') + ' ' + name; return; }
    var fields = Array.isArray(r) ? r.filter(function (x) { return typeof x === 'string' && x; }).join(', ') : (typeof r === 'string' ? r : '');
    status.textContent = tx('takenFrom') + ' ' + name + (date ? ' (' + date + ')' : '') + (fields ? ': ' + fields : '');
  }
  function render() {
    var L_ = lang();
    box.setAttribute('aria-label', tx('project'));
    title.textContent = tx('project') + ': ' + ((doc.project && doc.project.name) || tx('unnamed'));
    var bt = doc.project && own(BUILDING_TYPES, doc.project.building_type);
    var tot = fixtureTotals(doc);
    meta.textContent = (bt ? t(bt.name, L_) + ' · ' : '') + (doc.zones ? doc.zones.length : 0) + ' ' + tx('zones') + ' · ' + tot.count + ' ' + tx('fixtures');
    file.setAttribute('aria-label', tx('importJson'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bNew.textContent = tx('newProject');
    modules.textContent = '';
    var ids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!ids.length) modules.appendChild(el('span', { style: 'color:var(--muted,#5b6675)' }, tx('noModules')));
    ids.forEach(function (k) {
      var m = doc.modules[k], tool = TOOLS.filter(function (x) { return x.id === k; })[0];
      var date = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = el('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(el('span', null, tx('resultsFrom') + ' ' + (tool ? t(tool.name, L_) : k) + (date ? ' (' + date + ')' : '')));
      if (typeof opts.onUse === 'function' && (!consumes || consumes.indexOf(k) >= 0)) {
        var b = el('button', { type: 'button', style: btnStyle, 'data-module': k, 'aria-label': tx('use') + ': ' + (tool ? t(tool.name, L_) : k) }, tx('use'));
        b.addEventListener('click', function () { useStatus(k, opts.onUse(k, clone(doc.modules[k]), clone(doc))); });
        chip.appendChild(b);
      }
      modules.appendChild(chip);
    });
    nav.textContent = '';
    nav.setAttribute('aria-label', tx('siblings'));
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
    a.href = url; a.download = ((cur.project && cur.project.name) || 'plumbing-project').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) + '.plb.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyProject());
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
    refresh: function (next) { if (next && typeof next === 'object') { if (!validate(next).ok) throw new Error('invalid project'); doc = clone(next); } status.textContent = ''; render(); },
    getDoc: function () { return clone(doc); },
    /* setDoc(doc) saves to localStorage; setDoc(doc, {save:false}) only displays (e.g. a preset project) */
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid project'); setDoc(clone(next), true, !!(o && o.save === false)); },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

function fixtureName(id, lang) { var f = own(FIXTURES, id); return f ? t(f.name, lang) : id; }

return {
  version: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, LANGS: LANGS.slice(), LIMITS: LIMITS,
  SOURCES: SOURCES, FIXTURES: FIXTURES, FIXTURE_IDS: FIXTURE_IDS, MATERIALS: MATERIALS, DRAIN_KB: DRAIN_KB, ZETA: ZETA,
  BUILDING_TYPES: BUILDING_TYPES, EN806_NOTE: EN806_NOTE, NO_DIN_NOTE: NO_DIN_NOTE, REGIONS: REGIONS, TOOLS: TOOLS, TOOL_IDS: TOOL_IDS, UI: UI,
  water: water, friction: friction, regime: regime, dpPipe: dpPipe, dpLocal: dpLocal, dinPeakFlow: dinPeakFlow,
  project: { empty: emptyProject, validate: validate, load: load, save: save, exportJSON: exportJSON, importJSON: importJSON, withModule: withModule, withZones: withZones },
  fixtureTotals: fixtureTotals, fixtureName: fixtureName,
  PRESET_PROJECTS: PRESET_PROJECTS, presetProject: presetProject,
  csv: csv, t: t, fmt: fmt, L: L,
  ui: { projectBar: projectBar }
};
});
