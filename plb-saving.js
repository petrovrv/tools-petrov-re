/* plb-saving.js — water saving & fixture efficiency engine for plbwatersaving.html (tools.petrov.re, plumbing package).
 * Global PLBSave (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/save/METHOD.md (plbsaving-1.2). Independent reference: bench-src/ref/gen_plbwatersaving.py.
 *
 * The building is described by fixture CLASSES (WC, urinal, basin tap, shower, ...). For each class the user picks the
 * existing ("baseline") product and the efficient one; the class is used `uses` times per person and operating day.
 * Volumes in litres / m³, energy in kWh, money in EUR, CO2 in kg.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBSave = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbsaving-1.2';
  var KWH_M3K = 1.163; /* kWh per m³ and K for water (ρ·c_p / 3.6e6 = 1000·4186/3.6e6), stated constant */
  var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
  function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

  var SOURCES = {
    eu_ecolabel_wc: { title: 'Commission Decision 2013/641/EU — EU Ecolabel criteria for flushing toilets and urinals (criterion 1: full flush ≤ 6.0 l; reduced flush ≤ 3.0 l; average flush volume = mean of one full and three reduced flushes ≤ 3.5 l, toilets with a full flush ≤ 4.0 l exempt; urinals ≤ 1.0 l)', edition: 'OJ L 299, 9.11.2013', url: 'https://eur-lex.europa.eu/eli/dec/2013/641/oj', kind: 'regulation' },
    eu_ecolabel_taps: { title: 'Commission Decision 2013/250/EU — EU Ecolabel criteria for sanitary tapware (basin taps ≤ 6 l/min, kitchen taps ≤ 6 l/min with possible 8 l/min, showerheads ≤ 8 l/min)', edition: 'OJ L 145, 31.5.2013', url: 'https://eur-lex.europa.eu/eli/dec/2013/250/oj', kind: 'regulation' },
    uwl: { title: 'Unified Water Label (European Water Label) — product classes by flow rate / flush volume', edition: 'europeanwaterlabel.eu, 2024', url: 'https://www.europeanwaterlabel.eu/', kind: 'public_guide' },
    uk_wsr_urinal: { title: 'Water Supply (Water Fittings) Regulations 1999, Schedule 2 para. 25 — automatic flushing cisterns of urinals: ≤ 10 l/h for one bowl, ≤ 7.5 l/h per bowl or 700 mm of slab for several', edition: 'SI 1999/1148', url: 'https://www.legislation.gov.uk/uksi/1999/1148/schedule/2', kind: 'regulation' },
    ipcc2006: { title: 'IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Vol. 2 Table 2.2 — natural gas 56 100 kg CO2/TJ (net calorific value) = 0.202 kg CO2/kWh', edition: 'IPCC 2006', url: 'https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html', kind: 'public_guide' },
    core_use: { title: 'plumbing-core.js FIXTURES[].use — litres per use, hot-water share and uses per person and day by building type (learning assumptions of the package)', edition: 'plumbing-core 0.1.0', url: '', kind: 'learning_assumption' },
    learning: { title: 'Learning assumption of this tool (typical value; replace with product data, the utility tariff and the project occupancy)', edition: VERSION, url: '', kind: 'learning_assumption' }
  };

  /* ------------------------------------------------------------------ classes */
  /* kind: flush (WC: full/reduced) | per_use (urinal, bath, appliances: litres) | flow (taps, showers: fill_l + flow_lpm·dur_s/60) */
  var CLASSES = {
    wc: { kind: 'flush', hot_share: 0, name: L('WC', 'Унітаз', 'WC', 'Toilet', 'WC', 'Inodoro', 'WC'), core: 'wc_cistern' },
    urinal: { kind: 'per_use', hot_share: 0, name: L('Urinal', 'Пісуар', 'Urinal', 'Urinoir', 'Urinoir', 'Urinario', 'Pisuar'), core: 'urinal_flush' },
    basin: { kind: 'flow', hot_share: 0.5, dur_s: 15, fill_l: 0, name: L('Washbasin tap', 'Змішувач умивальника', 'Waschtischarmatur', 'Wastafelkraan', 'Robinet de lavabo', 'Grifo de lavabo', 'Bateria umywalkowa'), core: 'basin' },
    shower: { kind: 'flow', hot_share: 0.6, dur_s: 300, fill_l: 0, name: L('Shower', 'Душ', 'Dusche', 'Douche', 'Douche', 'Ducha', 'Natrysk'), core: 'shower' },
    kitchen: { kind: 'flow', hot_share: 0.5, dur_s: 15, fill_l: 3, name: L('Kitchen sink tap', 'Кухонний змішувач', 'Küchenarmatur', 'Keukenkraan', 'Robinet d’évier', 'Grifo de fregadero', 'Bateria zlewozmywakowa'), core: 'sink_kitchen' },
    bath: { kind: 'per_use', hot_share: 0.65, name: L('Bath', 'Ванна', 'Badewanne', 'Bad', 'Baignoire', 'Bañera', 'Wanna'), core: 'bath' },
    washer: { kind: 'per_use', hot_share: 0, name: L('Washing machine', 'Пральна машина', 'Waschmaschine', 'Wasmachine', 'Lave-linge', 'Lavadora', 'Pralka'), core: 'washing_machine' },
    dishwasher: { kind: 'per_use', hot_share: 0, name: L('Dishwasher', 'Посудомийна машина', 'Geschirrspüler', 'Vaatwasser', 'Lave-vaisselle', 'Lavavajillas', 'Zmywarka'), core: 'dishwasher_dom' }
  };
  var CLASS_IDS = Object.keys(CLASSES);

  /* uses per person and operating day — same values as plumbing-core.js FIXTURES[core].use (learning assumptions) */
  var USES = {
    wc: { residential: 4.5, office: 2.5, school: 2, hotel: 4, hospital: 4, care_home: 4.5, sports: 1, retail: 0.3, restaurant: 0.5, industrial: 2.5 },
    urinal: { office: 1.5, school: 1.5, sports: 1, retail: 0.2, restaurant: 0.3, industrial: 1.5 },
    basin: { residential: 5, office: 3, school: 3, hotel: 5, hospital: 8, care_home: 6, sports: 1, retail: 0.3, restaurant: 0.6, industrial: 3 },
    shower: { residential: 0.7, office: 0.02, school: 0.05, hotel: 0.9, hospital: 0.5, care_home: 0.4, sports: 0.8, industrial: 0.2 },
    kitchen: { residential: 3, office: 0.5, school: 0.2, care_home: 1, industrial: 0.5 },
    bath: { residential: 0.15, hotel: 0.2, care_home: 0.15 },
    washer: { residential: 0.15, hotel: 0.05, care_home: 0.3 },
    dishwasher: { residential: 0.15, office: 0.02 }
  };
  /* operating days per year by building type (learning assumption) */
  var DAYS = { residential: 365, office: 230, hotel: 365, hospital: 365, care_home: 365, school: 180, sports: 300, retail: 310, restaurant: 310, industrial: 230 };

  /* map plumbing-core fixture ids -> class and the product they already are */
  var CORE_MAP = {
    wc_cistern: ['wc', 'wc_6'], wc_flushvalve: ['wc', 'wc_6'], urinal_flush: ['urinal', 'urinal_4'], urinal_waterless: ['urinal', 'urinal_waterless'],
    basin: ['basin', 'tap_12'], handbasin_small: ['basin', 'tap_12'], shower: ['shower', 'shower_12'], shower_large_head: ['shower', 'shower_rain_16'],
    sink_kitchen: ['kitchen', 'ktap_12'], bath: ['bath', 'bath_160'], washing_machine: ['washer', 'washer_60'], dishwasher_dom: ['dishwasher', 'dw_15']
  };

  /* ------------------------------------------------------------------ products (variants) */
  /* capex = EUR per unit to install this product as a replacement; opex = EUR per unit and year (learning assumptions) */
  function V(cls, o) { o.cls = cls; o.source = o.source || 'learning'; o.capex = o.capex || 0; o.opex = o.opex || 0; return o; }
  var VARIANTS = {
    wc_9: V('wc', { full: 9, reduced: 9, name: L('Single flush 9 l (old)', 'Одинарний злив 9 л (старий)', 'Einmengenspülung 9 l (alt)', 'Enkele spoeling 9 l (oud)', 'Chasse simple 9 l (ancienne)', 'Descarga simple 9 l (antigua)', 'Spłukiwanie pojedyncze 9 l (stare)') }),
    wc_6: V('wc', { full: 6, reduced: 6, name: L('Single flush 6 l', 'Одинарний злив 6 л', 'Einmengenspülung 6 l', 'Enkele spoeling 6 l', 'Chasse simple 6 l', 'Descarga simple 6 l', 'Spłukiwanie pojedyncze 6 l') }),
    /* 6/3 l: average (6 + 3·3)/4 = 3.75 l > 3.5 l of 2013/641/EU criterion 1(c) -> not an Ecolabel product, a common product assumption (r4 Y6-6) */
    wc_dual_6_3: V('wc', { full: 6, reduced: 3, capex: 350, source: 'learning', name: L('Dual flush 6/3 l', 'Подвійний злив 6/3 л', 'Zwei-Mengen-Spülung 6/3 l', 'Dubbele spoeling 6/3 l', 'Double chasse 6/3 l', 'Doble descarga 6/3 l', 'Podwójne spłukiwanie 6/3 l') }),
    wc_dual_45_3: V('wc', { full: 4.5, reduced: 3, capex: 380, source: 'eu_ecolabel_wc', name: L('Dual flush 4.5/3 l', 'Подвійний злив 4,5/3 л', 'Zwei-Mengen-Spülung 4,5/3 l', 'Dubbele spoeling 4,5/3 l', 'Double chasse 4,5/3 l', 'Doble descarga 4,5/3 l', 'Podwójne spłukiwanie 4,5/3 l') }),
    wc_dual_4_2: V('wc', { full: 4, reduced: 2, capex: 420, source: 'eu_ecolabel_wc', name: L('Dual flush 4/2 l', 'Подвійний злив 4/2 л', 'Zwei-Mengen-Spülung 4/2 l', 'Dubbele spoeling 4/2 l', 'Double chasse 4/2 l', 'Doble descarga 4/2 l', 'Podwójne spłukiwanie 4/2 l') }),
    urinal_timed: V('urinal', { litres: 0, timed_l_h: 7.5, timed_single_l_h: 10, source: 'uk_wsr_urinal', name: L('Timed cistern, no control (10 l/h single bowl, 7.5 l/h per bowl)', 'Бачок з автоматичним змивом без керування (10 л/год один пісуар, 7,5 л/год на пісуар)', 'Zeitgesteuerter Spülkasten ohne Steuerung (10 l/h Einzelbecken, 7,5 l/h je Becken)', 'Automatisch spoelreservoir zonder sturing (10 l/h enkel urinoir, 7,5 l/h per urinoir)', 'Réservoir à chasse automatique sans commande (10 l/h urinoir seul, 7,5 l/h par urinoir)', 'Cisterna temporizada sin control (10 l/h urinario único, 7,5 l/h por urinario)', 'Spłuczka czasowa bez sterowania (10 l/h pojedynczy pisuar, 7,5 l/h na pisuar)') }),
    urinal_4: V('urinal', { litres: 4, name: L('Flush valve 4 l', 'Змивний кран 4 л', 'Druckspüler 4 l', 'Drukspoeler 4 l', 'Robinet de chasse 4 l', 'Fluxor 4 l', 'Spłuczka ciśnieniowa 4 l') }),
    urinal_2: V('urinal', { litres: 2, capex: 300, name: L('Sensor flush 2 l', 'Сенсорний змив 2 л', 'Sensorspülung 2 l', 'Sensorspoeling 2 l', 'Chasse à détection 2 l', 'Descarga por sensor 2 l', 'Spłukiwanie sensorowe 2 l') }),
    urinal_1: V('urinal', { litres: 1, capex: 450, source: 'eu_ecolabel_wc', name: L('Low-flush urinal 1 l', 'Пісуар з малим змивом 1 л', 'Spararmes Urinal 1 l', 'Spaarurinoir 1 l', 'Urinoir à faible chasse 1 l', 'Urinario de baja descarga 1 l', 'Pisuar niskospłukowy 1 l') }),
    urinal_waterless: V('urinal', { litres: 0, capex: 250, opex: 60, name: L('Waterless (cartridge)', 'Безводний (картридж)', 'Wasserlos (Kartusche)', 'Waterloos (cartridge)', 'Sans eau (cartouche)', 'Sin agua (cartucho)', 'Bezwodny (wkład)') }),
    tap_12: V('basin', { flow_lpm: 12, name: L('Tap 12 l/min (old)', 'Змішувач 12 л/хв (старий)', 'Armatur 12 l/min (alt)', 'Kraan 12 l/min (oud)', 'Robinet 12 l/min (ancien)', 'Grifo 12 l/min (antiguo)', 'Bateria 12 l/min (stara)') }),
    tap_9: V('basin', { flow_lpm: 9, name: L('Tap 9 l/min', 'Змішувач 9 л/хв', 'Armatur 9 l/min', 'Kraan 9 l/min', 'Robinet 9 l/min', 'Grifo 9 l/min', 'Bateria 9 l/min') }),
    tap_6: V('basin', { flow_lpm: 6, capex: 120, source: 'eu_ecolabel_taps', name: L('Tap 6 l/min', 'Змішувач 6 л/хв', 'Armatur 6 l/min', 'Kraan 6 l/min', 'Robinet 6 l/min', 'Grifo 6 l/min', 'Bateria 6 l/min') }),
    aerator_5: V('basin', { flow_lpm: 5, capex: 10, name: L('Aerator / flow limiter 5 l/min', 'Аератор / обмежувач 5 л/хв', 'Strahlregler / Begrenzer 5 l/min', 'Perlator / begrenzer 5 l/min', 'Mousseur / limiteur 5 l/min', 'Aireador / limitador 5 l/min', 'Perlator / ogranicznik 5 l/min') }),
    tap_sensor_4: V('basin', { flow_lpm: 4, dur_s: 10, capex: 280, name: L('Sensor tap 4 l/min, 10 s', 'Сенсорний змішувач 4 л/хв, 10 с', 'Sensorarmatur 4 l/min, 10 s', 'Sensorkraan 4 l/min, 10 s', 'Robinet à détection 4 l/min, 10 s', 'Grifo de sensor 4 l/min, 10 s', 'Bateria sensorowa 4 l/min, 10 s') }),
    shower_rain_16: V('shower', { flow_lpm: 16, name: L('Rain head 16 l/min', 'Тропічна лійка 16 л/хв', 'Regenbrause 16 l/min', 'Regendouche 16 l/min', 'Pomme pluie 16 l/min', 'Rociador lluvia 16 l/min', 'Deszczownica 16 l/min') }),
    shower_12: V('shower', { flow_lpm: 12, name: L('Shower head 12 l/min', 'Душова лійка 12 л/хв', 'Brause 12 l/min', 'Douchekop 12 l/min', 'Pomme 12 l/min', 'Rociador 12 l/min', 'Słuchawka 12 l/min') }),
    shower_9: V('shower', { flow_lpm: 9, capex: 35, name: L('Shower head 9 l/min', 'Душова лійка 9 л/хв', 'Brause 9 l/min', 'Douchekop 9 l/min', 'Pomme 9 l/min', 'Rociador 9 l/min', 'Słuchawka 9 l/min') }),
    shower_6: V('shower', { flow_lpm: 6, capex: 40, source: 'eu_ecolabel_taps', name: L('Low-flow head 6 l/min', 'Економна лійка 6 л/хв', 'Sparbrause 6 l/min', 'Spaardouchekop 6 l/min', 'Pomme économe 6 l/min', 'Rociador eficiente 6 l/min', 'Słuchawka oszczędna 6 l/min') }),
    shower_push_8: V('shower', { flow_lpm: 8, dur_s: 180, capex: 220, name: L('Push-button shower 8 l/min, 3 min', 'Кнопковий душ 8 л/хв, 3 хв', 'Selbstschluss-Dusche 8 l/min, 3 min', 'Drukknopdouche 8 l/min, 3 min', 'Douche temporisée 8 l/min, 3 min', 'Ducha temporizada 8 l/min, 3 min', 'Natrysk czasowy 8 l/min, 3 min') }),
    ktap_12: V('kitchen', { flow_lpm: 12, name: L('Kitchen tap 12 l/min', 'Кухонний змішувач 12 л/хв', 'Küchenarmatur 12 l/min', 'Keukenkraan 12 l/min', 'Robinet d’évier 12 l/min', 'Grifo de cocina 12 l/min', 'Bateria kuchenna 12 l/min') }),
    ktap_8: V('kitchen', { flow_lpm: 8, capex: 15, source: 'eu_ecolabel_taps', name: L('Kitchen tap 8 l/min', 'Кухонний змішувач 8 л/хв', 'Küchenarmatur 8 l/min', 'Keukenkraan 8 l/min', 'Robinet d’évier 8 l/min', 'Grifo de cocina 8 l/min', 'Bateria kuchenna 8 l/min') }),
    ktap_6: V('kitchen', { flow_lpm: 6, capex: 15, source: 'eu_ecolabel_taps', name: L('Kitchen tap 6 l/min', 'Кухонний змішувач 6 л/хв', 'Küchenarmatur 6 l/min', 'Keukenkraan 6 l/min', 'Robinet d’évier 6 l/min', 'Grifo de cocina 6 l/min', 'Bateria kuchenna 6 l/min') }),
    bath_160: V('bath', { litres: 160, name: L('Bath 160 l', 'Ванна 160 л', 'Badewanne 160 l', 'Bad 160 l', 'Baignoire 160 l', 'Bañera 160 l', 'Wanna 160 l') }),
    bath_120: V('bath', { litres: 120, capex: 700, name: L('Compact bath 120 l', 'Компактна ванна 120 л', 'Kompaktwanne 120 l', 'Compact bad 120 l', 'Baignoire compacte 120 l', 'Bañera compacta 120 l', 'Wanna kompaktowa 120 l') }),
    washer_60: V('washer', { litres: 60, name: L('Washing machine 60 l/cycle (old)', 'Пральна машина 60 л/цикл (стара)', 'Waschmaschine 60 l/Gang (alt)', 'Wasmachine 60 l/cyclus (oud)', 'Lave-linge 60 l/cycle (ancien)', 'Lavadora 60 l/ciclo (antigua)', 'Pralka 60 l/cykl (stara)') }),
    washer_45: V('washer', { litres: 45, capex: 600, name: L('Washing machine 45 l/cycle', 'Пральна машина 45 л/цикл', 'Waschmaschine 45 l/Gang', 'Wasmachine 45 l/cyclus', 'Lave-linge 45 l/cycle', 'Lavadora 45 l/ciclo', 'Pralka 45 l/cykl') }),
    dw_15: V('dishwasher', { litres: 15, name: L('Dishwasher 15 l/cycle (old)', 'Посудомийна 15 л/цикл (стара)', 'Geschirrspüler 15 l/Gang (alt)', 'Vaatwasser 15 l/cyclus (oud)', 'Lave-vaisselle 15 l/cycle (ancien)', 'Lavavajillas 15 l/ciclo (antiguo)', 'Zmywarka 15 l/cykl (stara)') }),
    dw_10: V('dishwasher', { litres: 10, capex: 500, name: L('Dishwasher 10 l/cycle', 'Посудомийна 10 л/цикл', 'Geschirrspüler 10 l/Gang', 'Vaatwasser 10 l/cyclus', 'Lave-vaisselle 10 l/cycle', 'Lavavajillas 10 l/ciclo', 'Zmywarka 10 l/cykl') })
  };
  VARIANTS.urinal_timed.capex = 0;
  function variantsOf(cls) { return Object.keys(VARIANTS).filter(function (k) { return VARIANTS[k].cls === cls; }); }

  var DEFAULTS = {
    building_type: 'residential', persons: 50, days: 365, price_water: 5.5, price_heat: 0.10, eta_dhw: 0.85, T_hot: 60, T_cold: 10,
    co2_heat: 0.202, price_el: 0.30, co2_el: 0.15, dual_full_share: 0.25,
    gw_on: false, gw_share: 1, gw_yield: 0.9, gw_capex: 15000, gw_opex: 500, gw_kwh_m3: 1.5,
    lines: []
  };

  /* ------------------------------------------------------------------ helpers */
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  /* D-PLB-14: null/'' (or absent) = missing -> default d; anything else must be a finite number, otherwise NaN (validation error), never 0 */
  function val(v, d) {
    if (v == null || v === '') return d;
    if (typeof v === 'boolean') return NaN;
    var n = +v; return isFinite(n) ? n : NaN;
  }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* litres per use of a product in its class; line may override duration (s) */
  function litresPerUse(vid, line, opts) {
    var v = VARIANTS[vid]; if (!v) return NaN;
    var c = CLASSES[v.cls];
    if (c.kind === 'flush') { var s = num(opts && opts.dual_full_share, DEFAULTS.dual_full_share); return v.full * s + v.reduced * (1 - s); }
    if (c.kind === 'flow') {
      var dur = v.dur_s != null ? v.dur_s : num(line && line.dur_s, c.dur_s);
      return num(line && line.fill_l, c.fill_l) + v.flow_lpm * dur / 60;
    }
    return v.litres;
  }

  /* default line for a class in a building type */
  function defaultLine(cls, bt, count, base) {
    var c = CLASSES[cls], vs = variantsOf(cls);
    var b = base || vs[0];
    var eff = { wc: 'wc_dual_4_2', urinal: 'urinal_2', basin: 'aerator_5', shower: 'shower_6', kitchen: 'ktap_6', bath: 'bath_120', washer: 'washer_45', dishwasher: 'dw_10' }[cls];
    var ln = { cls: cls, count: count == null ? 0 : count, base: b, eff: eff, uses: (USES[cls] && USES[cls][bt]) || 0, hot_share: c.hot_share,
      capex: VARIANTS[eff].capex, opex: VARIANTS[eff].opex };
    if (c.kind === 'flow') { ln.dur_s = c.dur_s; ln.fill_l = c.fill_l; }
    return ln;
  }

  /* lines from fixture totals {fixtureId: count} (plumbing-core fixtureTotals(doc).by): one line per class and existing product with its
     own count (r4 Y6-2: never one product for the whole class), lines of a class in order of count (desc), then product id. The efficient
     product is the class default unless the existing one already uses no more litres per use (then kept, no measure).
     Urinal uses go to the WC lines when there are no urinals. */
  function linesFromFixtures(by, bt) {
    var acc = {}, notModelled = [];
    Object.keys(by || {}).forEach(function (fid) {
      var n = by[fid]; if (!(n > 0)) return;
      var m = CORE_MAP.hasOwnProperty(fid) ? CORE_MAP[fid] : null; if (!m) { notModelled.push(fid); return; }
      if (!acc[m[0]]) acc[m[0]] = {};
      acc[m[0]][m[1]] = (acc[m[0]][m[1]] || 0) + n;
    });
    var lines = [];
    CLASS_IDS.filter(function (c) { return acc[c]; }).forEach(function (c) {
      var bases = acc[c];
      Object.keys(bases).sort(function (a, b) { return bases[b] - bases[a] || (a < b ? -1 : 1); }).forEach(function (vid) {
        var ln = defaultLine(c, bt, bases[vid], vid);
        if (litresPerUse(vid, ln) <= litresPerUse(ln.eff, ln)) { ln.eff = vid; ln.capex = VARIANTS[vid].capex; ln.opex = VARIANTS[vid].opex; }
        lines.push(ln);
      });
    });
    var hasUr = lines.some(function (l) { return l.cls === 'urinal'; });
    if (!hasUr && USES.urinal[bt]) lines.forEach(function (l) { if (l.cls === 'wc') l.uses = Math.round((l.uses + USES.urinal[bt]) * 1000) / 1000; });
    return { lines: lines, not_modelled: notModelled };
  }

  function normalise(inp) {
    var o = clone(DEFAULTS);
    inp = isObj(inp) ? inp : {};
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === 'lines') return;
      if (typeof DEFAULTS[k] === 'number') o[k] = val(inp[k], DEFAULTS[k]);
      else if (typeof DEFAULTS[k] === 'boolean') o[k] = !!inp[k];
      else if (typeof inp[k] === 'string') o[k] = inp[k];
    });
    if ((inp.days == null || inp.days === '') && DAYS.hasOwnProperty(o.building_type)) o.days = DAYS[o.building_type];
    /* non-object lines (null, numbers, arrays) are kept as invalid rows -> validation error lineN.class, never a crash (QA-4/CR-22) */
    o.lines = (Array.isArray(inp.lines) ? inp.lines : []).slice(0, 100).map(function (l) {
      if (!isObj(l)) l = {};
      var c = typeof l.cls === 'string' && CLASSES.hasOwnProperty(l.cls) ? l.cls : null;
      var d = c ? defaultLine(c, o.building_type, 0) : {};
      var okV = function (id) { return typeof id === 'string' && VARIANTS.hasOwnProperty(id) && VARIANTS[id].cls === c; };
      var r = { cls: c, count: val(l.count, NaN), base: okV(l.base) ? l.base : d.base,
        eff: okV(l.eff) ? l.eff : d.eff, uses: val(l.uses, d.uses || 0), hot_share: val(l.hot_share, c ? CLASSES[c].hot_share : 0) };
      r.capex = val(l.capex, VARIANTS[r.eff] ? VARIANTS[r.eff].capex : 0);
      r.opex = val(l.opex, VARIANTS[r.eff] ? VARIANTS[r.eff].opex : 0);
      if (c && CLASSES[c].kind === 'flow') { r.dur_s = val(l.dur_s, CLASSES[c].dur_s); r.fill_l = val(l.fill_l, CLASSES[c].fill_l); }
      return r;
    });
    return o;
  }

  function validate(o) {
    var e = [];
    if (!DAYS.hasOwnProperty(o.building_type)) e.push('building_type');
    if (!(o.persons > 0)) e.push('persons');
    if (!(o.days > 0 && o.days <= 366)) e.push('days');
    if (!(o.eta_dhw > 0 && o.eta_dhw <= 5)) e.push('eta_dhw');
    if (!(o.T_hot > o.T_cold)) e.push('T_hot');
    if (!(o.dual_full_share >= 0 && o.dual_full_share <= 1)) e.push('dual_full_share');
    if (!(o.gw_yield >= 0 && o.gw_yield <= 1) || !(o.gw_share >= 0 && o.gw_share <= 1)) e.push('greywater');
    ['price_water', 'price_heat', 'price_el', 'co2_heat', 'co2_el', 'gw_capex', 'gw_opex', 'gw_kwh_m3'].forEach(function (k) { if (!(o[k] >= 0)) e.push(k); });
    if (!o.lines.length) e.push('lines');
    o.lines.forEach(function (l, i) {
      if (!l.cls) { e.push('line' + (i + 1) + '.class'); return; }
      if (!(l.count >= 0)) e.push('line' + (i + 1) + '.count');
      if (!(l.uses >= 0) || !(l.hot_share >= 0 && l.hot_share <= 1) || !(l.capex >= 0) || !(l.opex >= 0)) e.push('line' + (i + 1));
      if (CLASSES[l.cls].kind === 'flow' && (!(l.dur_s >= 0) || !(l.fill_l >= 0))) e.push('line' + (i + 1) + '.duration');
    });
    return e;
  }

  /* annual volume (m³) of one product on one line. share = count of the line / count of all lines of its class: the uses of the
     class are shared between its rows by count, so count 0 = no use (D-PLB-16, CR-21) */
  function lineVolume(vid, l, o, share) {
    var v = VARIANTS[vid];
    var perUse = litresPerUse(vid, l, o);
    var used = o.persons * l.uses * o.days * perUse * share / 1000;
    /* uncontrolled cistern runs every hour of the year; UK WSR 1999 Sch. 2 §25: 10 l/h for a single bowl, 7.5 l/h per bowl for several (CR-67) */
    var rate = !v.timed_l_h ? 0 : (l.count === 1 && v.timed_single_l_h ? v.timed_single_l_h : l.count * v.timed_l_h);
    var timed = rate * 24 * 365 / 1000;
    return { per_use_l: perUse, m3: used + timed, timed_m3: timed };
  }
  /* payback (years) = capex / saving only when the saving is positive; otherwise null = never (D-PLB-16, CR-20) */
  function payback(capex, eur) { return eur > 0 ? capex / eur : null; }

  function solve(inp) {
    var o = normalise(inp), errors = validate(o);
    if (errors.length) return { valid: false, errors: errors, input: o, version: VERSION };
    var dT = o.T_hot - o.T_cold, kwhPerHotM3 = KWH_M3K * dT;
    var rows = [], T = { base_m3: 0, eff_m3: 0, base_hot_m3: 0, eff_hot_m3: 0, base_kwh: 0, eff_kwh: 0, capex: 0, opex_delta: 0, flush_eff_m3: 0, gw_src_m3: 0 };
    var clsCount = {};
    o.lines.forEach(function (l) { clsCount[l.cls] = (clsCount[l.cls] || 0) + l.count; });
    o.lines.forEach(function (l, i) {
      var share = clsCount[l.cls] > 0 ? l.count / clsCount[l.cls] : 0;
      var b = lineVolume(l.base, l, o, share), e = lineVolume(l.eff, l, o, share), change = l.eff !== l.base;
      var bh = b.m3 * l.hot_share, eh = e.m3 * l.hot_share;
      var bk = bh * kwhPerHotM3 / o.eta_dhw, ek = eh * kwhPerHotM3 / o.eta_dhw;
      var capex = change ? l.count * l.capex : 0;
      var opexD = change ? l.count * (l.opex - VARIANTS[l.base].opex) : 0;
      var dm3 = b.m3 - e.m3, dkwh = bk - ek;
      var eur = dm3 * o.price_water + dkwh * o.price_heat - opexD;
      var r = { i: i, cls: l.cls, count: l.count, share: share, base: l.base, eff: l.eff, change: change, uses: l.uses,
        base_l_use: b.per_use_l, eff_l_use: e.per_use_l, base_m3: b.m3, eff_m3: e.m3, base_timed_m3: b.timed_m3,
        base_lpd: b.m3 * 1000 / (o.persons * o.days), eff_lpd: e.m3 * 1000 / (o.persons * o.days),
        base_hot_m3: bh, eff_hot_m3: eh, base_kwh: bk, eff_kwh: ek, saved_m3: dm3, saved_kwh: dkwh,
        saved_co2: dkwh * o.co2_heat, saved_eur_water: dm3 * o.price_water, saved_eur_heat: dkwh * o.price_heat, opex_delta: opexD,
        saved_eur: eur, capex: capex, payback_y: change ? payback(capex, eur) : null };
      rows.push(r);
      T.base_m3 += b.m3; T.eff_m3 += e.m3; T.base_hot_m3 += bh; T.eff_hot_m3 += eh; T.base_kwh += bk; T.eff_kwh += ek; T.capex += capex; T.opex_delta += opexD;
      if (l.cls === 'wc' || l.cls === 'urinal') T.flush_eff_m3 += e.m3;
      if (l.cls === 'shower' || l.cls === 'bath' || l.cls === 'basin') T.gw_src_m3 += e.m3;
    });
    /* greywater: treated shower/bath/basin water replaces mains water for WC and urinal flushing (annual balance) */
    var gw = { on: o.gw_on, source_m3: T.gw_src_m3 * o.gw_share, yield_m3: T.gw_src_m3 * o.gw_share * o.gw_yield, demand_m3: T.flush_eff_m3, used_m3: 0,
      coverage: 0, surplus_m3: 0, kwh_el: 0, co2: 0, saved_eur: 0, capex: 0, payback_y: null };
    if (o.gw_on) {
      gw.used_m3 = Math.min(gw.yield_m3, gw.demand_m3);
      gw.coverage = gw.demand_m3 > 0 ? gw.used_m3 / gw.demand_m3 : 0;
      gw.surplus_m3 = gw.yield_m3 - gw.used_m3;
      gw.kwh_el = gw.used_m3 * o.gw_kwh_m3; gw.co2 = gw.kwh_el * o.co2_el;
      gw.saved_eur = gw.used_m3 * o.price_water - gw.kwh_el * o.price_el - o.gw_opex;
      gw.capex = o.gw_capex;
      gw.payback_y = payback(gw.capex, gw.saved_eur);
    }
    var mains = T.eff_m3 - gw.used_m3;
    var pd = o.persons * o.days;
    var savedM3 = T.base_m3 - mains, savedKwh = T.base_kwh - T.eff_kwh;
    var savedEur = rows.reduce(function (s, r) { return s + r.saved_eur; }, 0) + gw.saved_eur;
    var capex = T.capex + gw.capex;
    var savedCo2 = savedKwh * o.co2_heat - gw.co2;
    var anyChange = rows.some(function (r) { return r.change; }) || o.gw_on;
    var flags = [];
    rows.forEach(function (r) { if (r.change && r.payback_y == null && r.count > 0) flags.push('no_payback:' + r.cls); }); /* rows with 0 pieces: no_fixtures */
    if (rows.some(function (r) { return r.base_timed_m3 > 0; })) flags.push('timed_urinal');
    if (o.gw_on && gw.surplus_m3 > 0.05 * gw.yield_m3) flags.push('greywater_surplus');
    if (o.gw_on && gw.payback_y == null) flags.push('greywater_no_payback');
    if (o.gw_on && T.flush_eff_m3 <= 0) flags.push('greywater_no_demand');
    rows.forEach(function (r) { if (r.cls === 'shower' && VARIANTS[r.eff].flow_lpm < 6) flags.push('shower_below_6'); });
    if (anyChange && !(savedEur > 0)) flags.push('no_payback');
    CLASS_IDS.forEach(function (c) { if (clsCount.hasOwnProperty(c) && !(clsCount[c] > 0)) flags.push('no_fixtures:' + c); });
    var order = rows.filter(function (r) { return r.change; }).slice().sort(function (a, b) {
      var pa = a.payback_y == null ? Infinity : a.payback_y, pb = b.payback_y == null ? Infinity : b.payback_y; return pa - pb || a.i - b.i; });
    return {
      valid: true, version: VERSION, input: o,
      rows: rows, greywater: gw, order: order.map(function (r) { return r.i; }),
      totals: {
        base_m3: T.base_m3, eff_m3: T.eff_m3, mains_m3: mains, saved_m3: savedM3, saved_pct: T.base_m3 > 0 ? 100 * savedM3 / T.base_m3 : 0,
        base_lpd: T.base_m3 * 1000 / pd, eff_lpd: T.eff_m3 * 1000 / pd, mains_lpd: mains * 1000 / pd,
        base_hot_m3: T.base_hot_m3, eff_hot_m3: T.eff_hot_m3, base_kwh: T.base_kwh, eff_kwh: T.eff_kwh, saved_kwh: savedKwh,
        saved_co2: savedCo2, saved_eur: savedEur, capex: capex, opex_delta: T.opex_delta,
        payback_y: anyChange ? payback(capex, savedEur) : null, any_change: anyChange,
        hot_l_day: T.eff_hot_m3 * 1000 / o.days, flush_l_day: (T.flush_eff_m3 - gw.used_m3) * 1000 / o.days,
        kwh_per_hot_m3: kwhPerHotM3
      },
      flags: flags
    };
  }

  /* presets: built on plumbing-core PRESET_PROJECTS (fixture counts, persons, water price) with the existing products of the "aha" */
  function P(o) { return o; }
  var PRESETS = {
    apartments_old: function () {
      return P({ building_type: 'residential', persons: 57, price_water: 5.5, lines: [
        L2('wc', 30, 'wc_9', 'wc_dual_4_2'), L2('basin', 30, 'tap_12', 'aerator_5'), L2('shower', 24, 'shower_12', 'shower_6'),
        L2('kitchen', 24, 'ktap_12', 'ktap_6'), L2('bath', 6, 'bath_160', 'bath_160'), L2('washer', 24, 'washer_60', 'washer_60'), L2('dishwasher', 24, 'dw_15', 'dw_15')] });
    },
    office_urinals: function () {
      return P({ building_type: 'office', persons: 600, price_water: 5, lines: [
        L2('wc', 50, 'wc_6', 'wc_dual_4_2'), L2('urinal', 24, 'urinal_4', 'urinal_waterless'), L2('basin', 58, 'tap_9', 'aerator_5'),
        L2('kitchen', 8, 'ktap_12', 'ktap_6'), L2('shower', 6, 'shower_12', 'shower_6'), L2('dishwasher', 8, 'dw_15', 'dw_15')] });
    },
    school_timed: function () {
      return P({ building_type: 'school', persons: 660, price_water: 5.5, lines: [
        L2('wc', 30, 'wc_6', 'wc_6'), L2('urinal', 15, 'urinal_timed', 'urinal_2'), L2('basin', 25, 'tap_12', 'tap_sensor_4')] });
    },
    hotel_rain: function () {
      return P({ building_type: 'hotel', persons: 180, price_water: 5.5, lines: [
        L2('wc', 128, 'wc_6', 'wc_6'), L2('basin', 130, 'tap_12', 'aerator_5'), L2('shower', 98, 'shower_rain_16', 'shower_9'), L2('bath', 30, 'bath_160', 'bath_160')] });
    },
    sports_push: function () {
      return P({ building_type: 'sports', persons: 120, price_water: 5.5, lines: [
        L2('shower', 32, 'shower_12', 'shower_push_8'), L2('wc', 12, 'wc_6', 'wc_6'), L2('urinal', 3, 'urinal_4', 'urinal_2'), L2('basin', 16, 'tap_12', 'aerator_5')] });
    },
    care_greywater: function () {
      var p = P({ building_type: 'care_home', persons: 80, price_water: 5.5, gw_on: true, gw_capex: 25000, gw_opex: 600, lines: [
        L2('wc', 84, 'wc_6', 'wc_dual_4_2'), L2('basin', 84, 'tap_12', 'aerator_5'), L2('shower', 81, 'shower_12', 'shower_9'), L2('bath', 3, 'bath_160', 'bath_160'),
        L2('washer', 3, 'washer_60', 'washer_60')] });
      return p;
    }
  };
  function L2(cls, count, base, eff) {
    return { cls: cls, count: count, base: base, eff: eff, capex: VARIANTS[eff].capex, opex: VARIANTS[eff].opex };
  }
  /* fill missing uses/hot_share/dur from the class defaults of the building type */
  function presetInput(id) {
    var p = PRESETS[id](), bt = p.building_type;
    p.lines = p.lines.map(function (l) { var d = defaultLine(l.cls, bt, l.count, l.base); Object.keys(l).forEach(function (k) { d[k] = l[k]; }); return d; });
    if (!p.lines.some(function (l) { return l.cls === 'urinal'; })) {
      var wc = p.lines.filter(function (l) { return l.cls === 'wc'; })[0];
      if (wc && USES.urinal[bt]) wc.uses = Math.round((wc.uses + USES.urinal[bt]) * 1000) / 1000;
    }
    if (p.days == null) p.days = DAYS[bt];
    return p;
  }

  return { VERSION: VERSION, LANGS: LANGS, KWH_M3K: KWH_M3K, SOURCES: SOURCES, CLASSES: CLASSES, CLASS_IDS: CLASS_IDS, USES: USES, DAYS: DAYS,
    CORE_MAP: CORE_MAP, VARIANTS: VARIANTS, DEFAULTS: DEFAULTS, PRESETS: PRESETS, PRESET_IDS: Object.keys(PRESETS),
    variantsOf: variantsOf, litresPerUse: litresPerUse, defaultLine: defaultLine, linesFromFixtures: linesFromFixtures,
    normalise: normalise, validate: function (inp) { return validate(normalise(inp)); }, solve: solve, presetInput: presetInput };
});
