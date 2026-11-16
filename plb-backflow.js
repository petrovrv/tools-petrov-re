/* plb-backflow.js — EN 1717 backflow protection selector engine for plbbackflow.html (tools.petrov.re, plumbing package).
 * Global PLBBackflow (browser) / module.exports (node). Pure functions, no DOM, deterministic.
 * Method: _plb/bf/METHOD.md (plbbackflow-1.0). Independent reference: bench-src/ref/gen_plbbackflow.py.
 *
 * A CONNECTION POINT is a place where drinking water meets a non-drinking fluid. Its fluid category 1–5
 * (EN 1717 §4 definitions) comes from a library application, an explicit override, or the question chain.
 * Each protection unit has a coverage cell per category: 'X' = protects against back-siphonage AND back-pressure,
 * 'o' = against back-siphonage only (not admissible where back-pressure is possible), '-' = not suitable,
 * 'dom' = "for specific domestic use only" (national rules decide; never selected automatically).
 * Cells, installation heights and application examples: EN 1717:2000 as reproduced in the Honeywell/Resideo
 * EN 1717 brochure (Table "Utilisation of the safety fittings vs liquid category", pp. 45–46; installation
 * dimensions p. 34; examples ch. 7). Families AF and AG are not in that table: their ratings (AF up to category 4, AG up to 3,
 * back-siphonage and back-pressure) are from the UK regulators' guidance (WaterRegsUK / WRAS), CR-60.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PLBBackflow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'plbbackflow-1.5';
  function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

  var SOURCES = {
    en1717: { title: 'EN 1717 Protection against pollution of potable water in water installations and general requirements of devices to prevent pollution by backflow', edition: 'EN 1717:2000 (revised as EN 1717:2025 — check the edition adopted by your national body)', url: 'https://standards.cen.eu/', kind: 'standard' },
    resideo_en1717: { title: 'Honeywell / Resideo — EN 1717 brochure: protection matrix (pp. 45–46), installation dimensions (p. 34), application examples (ch. 7)', edition: 'brochure reproducing DIN EN 1717:2000 and DIN 1988-4', url: 'https://homecomfort.resideo.com/resources/Shared%20Documents/fi-FI/Brochures/Brochure%20EN1717%20FI.pdf', kind: 'manufacturer' },
    en806_5: { title: 'EN 806-5 Specifications for installations inside buildings conveying water for human consumption — Part 5: Operation and maintenance — Annex A (normative) Table A.1: frequencies of inspection, routine maintenance and replacement per device type', edition: 'EN 806-5:2012', url: 'https://standards.cen.eu/', kind: 'standard' },
    belgaqua_tvbi: { title: 'Belgaqua — Technische voorschriften voor binneninstallaties (TVBI) / Prescriptions techniques (PTI): EN 1717 protection and inspection (keuring) of the internal installation', edition: 'current edition', url: 'https://www.belgaqua.be/', kind: 'regulation' },
    wras_ratings: { title: 'WaterRegsUK / WRAS — backflow protection ratings of air gaps: Type AF (circular overflow) fluid category ≤ 4, Type AG (overflow verified by vacuum test) ≤ 3, both against back-siphonage and back-pressure', edition: 'WRAS Backflow protection ratings v1.0, Jan 2024; WaterRegsUK FAQs Type AF / Type AG', url: 'https://www.waterregsuk.co.uk/topics/different-types-of-backflow-prevention/' },
    la_bf: { title: 'Learning assumption of plbbackflow (typical practice, not a quoted standard value)', edition: 'plbbackflow-1.0, 2026-11', url: '', kind: 'learning_assumption' }
  };

  /* fluid categories, EN 1717 §4 (paraphrased) */
  var CATEGORIES = [
    { cat: 1, name: L('Drinking water from the installation', 'Питна вода безпосередньо з мережі', 'Trinkwasser direkt aus der Installation', 'Drinkwater rechtstreeks uit de installatie', 'Eau potable prise directement dans l’installation', 'Agua potable tomada directamente de la instalación', 'Woda pitna pobierana bezpośrednio z instalacji') },
    { cat: 2, name: L('No health hazard; change of taste, odour, colour or temperature', 'Без загрози здоров’ю; зміна смаку, запаху, кольору чи температури', 'Keine Gesundheitsgefährdung; Veränderung von Geschmack, Geruch, Farbe oder Temperatur', 'Geen gezondheidsrisico; verandering van smaak, geur, kleur of temperatuur', 'Aucun danger pour la santé ; changement de goût, odeur, couleur ou température', 'Sin peligro para la salud; cambio de sabor, olor, color o temperatura', 'Brak zagrożenia dla zdrowia; zmiana smaku, zapachu, barwy lub temperatury') },
    { cat: 3, name: L('Some health hazard: one or more less toxic substances', 'Певна загроза здоров’ю: одна чи кілька малотоксичних речовин', 'Gesundheitsgefährdung durch eine oder mehrere weniger giftige Stoffe', 'Enig gezondheidsrisico: één of meer minder giftige stoffen', 'Danger pour la santé : une ou plusieurs substances peu toxiques', 'Cierto peligro: una o varias sustancias poco tóxicas', 'Pewne zagrożenie: jedna lub więcej substancji mało toksycznych') },
    { cat: 4, name: L('Hazard: toxic or very toxic, radioactive, mutagenic or carcinogenic substances', 'Загроза: токсичні чи дуже токсичні, радіоактивні, мутагенні або канцерогенні речовини', 'Gefährdung durch giftige oder sehr giftige, radioaktive, mutagene oder kanzerogene Stoffe', 'Gevaar: giftige of zeer giftige, radioactieve, mutagene of kankerverwekkende stoffen', 'Danger : substances toxiques ou très toxiques, radioactives, mutagènes ou cancérogènes', 'Peligro: sustancias tóxicas o muy tóxicas, radiactivas, mutágenas o cancerígenas', 'Zagrożenie: substancje toksyczne lub bardzo toksyczne, radioaktywne, mutagenne lub rakotwórcze') },
    { cat: 5, name: L('Hazard: microbial or viral pathogens', 'Загроза: мікробні чи вірусні збудники', 'Gefährdung durch mikrobielle oder virale Krankheitserreger', 'Gevaar: microbiële of virale ziekteverwekkers', 'Danger : agents pathogènes microbiens ou viraux', 'Peligro: agentes patógenos microbianos o víricos', 'Zagrożenie: drobnoustroje lub wirusy chorobotwórcze') }
  ];

  /* protection units. cover = [cat1..cat5]; h_min_mm = vent/outlet must be MORE than this above the highest possible
     non-drinking water level (EN 1717 values as reproduced, resideo_en1717 p. 26–34); drain = needs a drain / discharge;
     open_outlet = only before a short pipe open to atmosphere (no pressure downstream); hose = hose-connection device;
     inspect/service/replace = months per EN 806-5:2012 Annex A Table A.1 (normative; read on the licensed copy, D-BW-6):
     a single value spanning both columns of Table A.1 is one combined inspection-and-maintenance visit (inspect_m only) */
  function U(code, fam, name, cover, o) { o = o || {}; return { code: code, family: fam, name: name, cover: cover, h_min_mm: o.h == null ? null : o.h, drain: !!o.drain,
    open_outlet: !!o.open, hose: !!o.hose, air_gap: fam === 'A', listed_only: !!o.listed, inspect_m: o.i || 12, service_m: o.s || null, replace_m: o.r || null, src: o.src || 'resideo_en1717' }; }
  var X = 'X', o = 'o', N = '-', D = 'dom', Q = null;
  var UNITS = [
    U('AA', 'A', L('Unrestricted air gap', 'Вільний розрив струменя', 'Freier Auslauf', 'Vrije uitloop', 'Surverse totale (garde d’air)', 'Descarga libre (separación de aire)', 'Swobodny wypływ (przerwa powietrzna)'), [X, X, X, X, X], { i: 6 }),
    U('AB', 'A', L('Air gap with non-circular overflow (unrestricted)', 'Розрив струменя з некруглим переливом', 'Freier Auslauf mit nicht kreisförmigem Überlauf', 'Vrije uitloop met niet-ronde overloop', 'Surverse avec trop-plein non circulaire', 'Descarga libre con rebosadero no circular', 'Przerwa powietrzna z przelewem niekołowym'), [X, X, X, X, X], { i: 6 }),
    U('AC', 'A', L('Air gap with vented submerged inlet and overflow', 'Розрив струменя із затопленим вентильованим входом і переливом', 'Freier Auslauf mit belüftetem Tauchrohr und Überlauf', 'Vrije uitloop met beluchte dompelbuis en overloop', 'Surverse avec entrée immergée ventilée et trop-plein', 'Descarga libre con entrada sumergida ventilada y rebosadero', 'Przerwa powietrzna z napowietrzaną rurą zanurzoną i przelewem'), [X, X, X, N, N], { i: 12 }),
    U('AD', 'A', L('Air gap with injector', 'Розрив струменя з інжектором', 'Freier Auslauf mit Injektor', 'Vrije uitloop met injector', 'Surverse avec injecteur', 'Descarga libre con inyector', 'Przerwa powietrzna z inżektorem'), [X, X, X, X, X], { i: 6 }),
    U('AF', 'A', L('Air gap with circular overflow (restricted)', 'Розрив струменя з круглим переливом', 'Freier Auslauf mit kreisförmigem Überlauf', 'Vrije uitloop met ronde overloop', 'Surverse avec trop-plein circulaire', 'Descarga libre con rebosadero circular', 'Przerwa powietrzna z przelewem kołowym'), [X, X, X, X, N], { src: 'wras_ratings', i: 12 }),
    U('AG', 'A', L('Air gap with overflow verified by vacuum test', 'Розрив струменя з переливом, перевіреним вакуумом', 'Freier Auslauf mit vakuumgeprüftem Überlauf', 'Vrije uitloop met vacuümbeproefde overloop', 'Surverse avec trop-plein vérifié par essai de vide', 'Descarga libre con rebosadero verificado por vacío', 'Przerwa powietrzna z przelewem sprawdzonym próbą podciśnienia'), [X, X, X, N, N], { src: 'wras_ratings', i: 12 }),
    U('BA', 'B', L('Backflow preventer with controllable reduced-pressure zone', 'Запобіжник із контрольованою зоною зниженого тиску', 'Systemtrenner mit kontrollierbarer Mitteldruckzone', 'Terugstroombeveiliging met controleerbare middendrukzone', 'Disconnecteur à zone de pression réduite contrôlable', 'Desconector de zona de presión reducida controlable', 'Zawór antyskażeniowy ze strefą obniżonego ciśnienia (kontrolowany)'), [X, X, X, X, N], { drain: true, i: 6, s: 12 }),
    U('CA', 'C', L('Non-controllable backflow preventer with different pressure zones', 'Неконтрольований запобіжник з різними зонами тиску', 'Nicht kontrollierbarer Systemtrenner mit unterschiedlichen Druckzonen', 'Niet-controleerbare terugstroombeveiliging met verschillende drukzones', 'Disconnecteur à zones de pression différentes non contrôlable', 'Desconector no controlable de zonas de presión diferentes', 'Zawór antyskażeniowy niekontrolowany o różnych strefach ciśnienia'), [X, X, X, N, N], { drain: true, i: 6, s: 12 }),
    U('DA', 'D', L('Anti-vacuum valve (in-line)', 'Антивакуумний клапан (у потоці)', 'Rohrbelüfter in Durchgangsform', 'Beluchter in doorstroomvorm', 'Clapet casse-vide en ligne', 'Válvula antivacío en línea', 'Zawór napowietrzający przelotowy'), [o, o, o, N, N], { i: 12, s: 12 }),
    U('DB', 'D', L('Pipe interrupter with atmospheric vent and moving element', 'Переривник з атмосферним отвором і рухомим елементом', 'Rohrunterbrecher mit beweglichen Teilen', 'Leidingonderbreker met bewegende delen', 'Disconnecteur à évent atmosphérique avec élément mobile', 'Interruptor con ventilación atmosférica y elemento móvil', 'Przerywacz z otworem atmosferycznym i elementem ruchomym'), [o, o, o, o, N], { h: 150, open: true, i: 12 }),
    U('DC', 'D', L('Pipe interrupter with permanent atmospheric vent', 'Переривник з постійним атмосферним отвором', 'Rohrunterbrecher mit ständiger Verbindung zur Atmosphäre', 'Leidingonderbreker met permanente verbinding met de atmosfeer', 'Disconnecteur à évent atmosphérique permanent', 'Interruptor con ventilación atmosférica permanente', 'Przerywacz ze stałym połączeniem z atmosferą'), [o, o, o, o, o], { h: 150, open: true, i: 6 }),
    U('EA', 'E', L('Controllable check valve', 'Контрольований зворотний клапан', 'Kontrollierbarer Rückflussverhinderer', 'Controleerbare keerklep', 'Clapet anti-retour contrôlable', 'Válvula antirretorno controlable', 'Zawór zwrotny kontrolowany'), [X, X, N, N, N], { i: 12, s: 12 }),
    U('EB', 'E', L('Non-controllable check valve', 'Неконтрольований зворотний клапан', 'Nicht kontrollierbarer Rückflussverhinderer', 'Niet-controleerbare keerklep', 'Clapet anti-retour non contrôlable', 'Válvula antirretorno no controlable', 'Zawór zwrotny niekontrolowany'), [D, D, D, D, D], { i: 12, r: 120 }),
    U('EC', 'E', L('Controllable double check valve', 'Контрольований подвійний зворотний клапан', 'Kontrollierbarer doppelter Rückflussverhinderer', 'Controleerbare dubbele keerklep', 'Double clapet anti-retour contrôlable', 'Doble válvula antirretorno controlable', 'Podwójny zawór zwrotny kontrolowany'), [X, X, N, N, N], { i: 12, s: 12 }),
    U('ED', 'E', L('Non-controllable double check valve', 'Неконтрольований подвійний зворотний клапан', 'Nicht kontrollierbarer doppelter Rückflussverhinderer', 'Niet-controleerbare dubbele keerklep', 'Double clapet anti-retour non contrôlable', 'Doble válvula antirretorno no controlable', 'Podwójny zawór zwrotny niekontrolowany'), [D, D, D, D, D], { i: 12, r: 120 }),
    U('GA', 'G', L('Mechanical disconnector, direct actuated', 'Механічний роз’єднувач прямої дії', 'Rohrtrenner, nicht durchflussgesteuert', 'Mechanische scheider, niet debietgestuurd', 'Disjoncteur mécanique à commande directe', 'Desconector mecánico de accionamiento directo', 'Rozdzielacz mechaniczny bezpośredniego działania'), [X, X, X, N, N], { drain: true, i: 6, s: 12 }),
    U('GB', 'G', L('Mechanical disconnector, hydraulically actuated', 'Механічний роз’єднувач гідравлічної дії', 'Rohrtrenner, durchflussgesteuert', 'Mechanische scheider, debietgestuurd', 'Disjoncteur mécanique à commande hydraulique', 'Desconector mecánico de accionamiento hidráulico', 'Rozdzielacz mechaniczny sterowany hydraulicznie'), [X, X, X, X, N], { drain: true, i: 6, s: 12 }),
    U('HA', 'H', L('Hose union backflow preventer', 'Шланговий запобіжник зворотного потоку', 'Schlauchanschluss mit Rückflussverhinderer', 'Slangaansluiting met keerklep', 'Raccord de tuyau avec clapet anti-retour', 'Conexión de manguera con antirretorno', 'Przyłącze węża z zaworem zwrotnym'), [X, X, o, N, N], { h: 200, hose: true, i: 12, s: 12 }),
    U('HB', 'H', L('Hose union anti-vacuum valve', 'Шланговий антивакуумний клапан', 'Rohrbelüfter für Schlauchanschlüsse', 'Beluchter voor slangaansluitingen', 'Casse-vide pour raccord de tuyau', 'Antivacío para conexión de manguera', 'Napowietrzacz do przyłączy węża'), [o, o, N, N, N], { h: 250, hose: true, i: 12, s: 12 }),
    U('HC', 'H', L('Automatic diverter (bath/shower)', 'Автоматичний перемикач (ванна/душ)', 'Automatischer Umsteller', 'Automatische omsteller', 'Inverseur automatique', 'Inversor automático', 'Przełącznik automatyczny'), [D, D, D, D, D], { hose: true, i: 12 }),
    U('HD', 'H', L('Hose union anti-vacuum valve combined with check valve', 'Шланговий антивакуумний клапан зі зворотним клапаном', 'Rohrbelüfter für Schlauchanschlüsse mit Rückflussverhinderer', 'Beluchter voor slangaansluitingen met keerklep', 'Casse-vide pour tuyau combiné à un clapet anti-retour', 'Antivacío para manguera combinado con antirretorno', 'Napowietrzacz do węża z zaworem zwrotnym'), [X, X, o, N, N], { h: 250, hose: true, i: 12, s: 12 }),
    U('LA', 'L', L('Pressurised air inlet valve', 'Повітряний клапан під тиском', 'Belüfter unter Druck', 'Beluchter onder druk', 'Clapet d’entrée d’air sous pression', 'Válvula de entrada de aire a presión', 'Zawór napowietrzający ciśnieniowy'), [o, o, N, N, N], { i: 12, s: 12 }),
    U('LB', 'L', L('Pressurised air inlet valve with downstream check valve', 'Повітряний клапан під тиском зі зворотним клапаном', 'Belüfter unter Druck mit nachgeschaltetem Rückflussverhinderer', 'Beluchter onder druk met keerklep stroomafwaarts', 'Clapet d’entrée d’air sous pression avec clapet aval', 'Entrada de aire a presión con antirretorno aguas abajo', 'Zawór napowietrzający ciśnieniowy z zaworem zwrotnym'), [X, X, o, N, N], { i: 12, s: 12 })
  ];
  var UNIT = {}; UNITS.forEach(function (u) { UNIT[u.code] = u; });
  /* preference when no typical device is given: simple, cheap, little maintenance first; air gaps last because they break the pressure */
  var RANK = ['EA', 'EC', 'HD', 'HA', 'CA', 'GA', 'DC', 'DB', 'BA', 'GB', 'AA', 'AB', 'AD', 'AC', 'AF', 'AG', 'LB', 'DA', 'HB', 'LA'];

  /* question chain, highest category first (EN 1717 §4 definitions) */
  var QUESTIONS = [
    { id: 'path', cat: 5, text: L('Can the fluid contain pathogens — faeces, urine, blood, sewage, rain or grey water, pool or pond water, animals, rotting food residue, lab cultures, sick people’s bath water?',
      'Чи може рідина містити збудники — фекалії, сечу, кров, стоки, дощову чи сіру воду, воду басейну чи ставка, тварин, залишки їжі, що гниють, лабораторні культури, воду після купання хворих?',
      'Kann das Medium Krankheitserreger enthalten — Fäkalien, Urin, Blut, Abwasser, Regen- oder Grauwasser, Becken- oder Teichwasser, Tiere, faulende Lebensmittelreste, Laborkulturen, Badewasser kranker Menschen?',
      'Kan de vloeistof ziekteverwekkers bevatten — fecaliën, urine, bloed, afvalwater, regen- of grijswater, zwembad- of vijverwater, dieren, rottende voedselresten, labculturen, badwater van zieken?',
      'Le fluide peut-il contenir des pathogènes — matières fécales, urine, sang, eaux usées, eau de pluie ou grise, eau de piscine ou d’étang, animaux, résidus alimentaires en décomposition, cultures de laboratoire, eau de bain de malades ?',
      '¿Puede el fluido contener patógenos — heces, orina, sangre, aguas residuales, agua de lluvia o gris, agua de piscina o estanque, animales, restos de comida en descomposición, cultivos de laboratorio, agua de baño de enfermos?',
      'Czy płyn może zawierać patogeny — kał, mocz, krew, ścieki, wodę deszczową lub szarą, wodę z basenu lub stawu, zwierzęta, gnijące resztki żywności, kultury laboratoryjne, wodę z kąpieli chorych?') },
    { id: 'toxic', cat: 4, text: L('Toxic or very toxic (LD50 ≤ 200 mg/kg), radioactive, mutagenic or carcinogenic substances — e.g. galvanic or photo chemicals, pesticides, lab chemicals, toxic inhibitors?',
      'Токсичні чи дуже токсичні (LD50 ≤ 200 мг/кг), радіоактивні, мутагенні або канцерогенні речовини — напр. гальванічні чи фотохімікати, пестициди, лабораторні реактиви, токсичні інгібітори?',
      'Giftige oder sehr giftige (LD50 ≤ 200 mg/kg), radioaktive, mutagene oder kanzerogene Stoffe — z. B. Galvanik- oder Fotochemikalien, Pestizide, Laborchemikalien, giftige Inhibitoren?',
      'Giftige of zeer giftige (LD50 ≤ 200 mg/kg), radioactieve, mutagene of kankerverwekkende stoffen — bv. galvanische of fotochemicaliën, pesticiden, labochemicaliën, giftige inhibitoren?',
      'Substances toxiques ou très toxiques (DL50 ≤ 200 mg/kg), radioactives, mutagènes ou cancérogènes — p. ex. bains galvaniques, produits photo, pesticides, réactifs de laboratoire, inhibiteurs toxiques ?',
      '¿Sustancias tóxicas o muy tóxicas (DL50 ≤ 200 mg/kg), radiactivas, mutágenas o cancerígenas — p. ej. galvanoplastia, químicos fotográficos, pesticidas, reactivos de laboratorio, inhibidores tóxicos?',
      'Substancje toksyczne lub bardzo toksyczne (LD50 ≤ 200 mg/kg), radioaktywne, mutagenne lub rakotwórcze — np. chemikalia galwaniczne lub fotograficzne, pestycydy, odczynniki laboratoryjne, toksyczne inhibitory?') },
    { id: 'harm', cat: 3, text: L('Less toxic harmful substances — detergents, heating-system water, low-toxicity additives, domestic bath or basin water?',
      'Менш токсичні шкідливі речовини — миючі засоби, вода системи опалення, малотоксичні добавки, вода побутової ванни чи умивальника?',
      'Weniger giftige Schadstoffe — Reinigungsmittel, Heizungswasser, wenig giftige Zusätze, häusliches Bade- oder Waschbeckenwasser?',
      'Minder giftige schadelijke stoffen — reinigingsmiddelen, verwarmingswater, weinig giftige additieven, huishoudelijk bad- of wastafelwater?',
      'Substances nocives peu toxiques — détergents, eau de chauffage, additifs peu toxiques, eau de baignoire ou de lavabo domestique ?',
      '¿Sustancias nocivas poco tóxicas — detergentes, agua de calefacción, aditivos poco tóxicos, agua de bañera o lavabo doméstico?',
      'Mniej toksyczne substancje szkodliwe — detergenty, woda instalacji grzewczej, mało toksyczne dodatki, woda z domowej wanny lub umywalki?') },
    { id: 'change', cat: 2, text: L('Is the water only changed in temperature, taste, odour or colour (heated, cooled, coffee, softened)?',
      'Вода лише змінена за температурою, смаком, запахом чи кольором (нагріта, охолоджена, кава, пом’якшена)?',
      'Ist das Wasser nur in Temperatur, Geschmack, Geruch oder Farbe verändert (erwärmt, gekühlt, Kaffee, enthärtet)?',
      'Is het water alleen veranderd in temperatuur, smaak, geur of kleur (verwarmd, gekoeld, koffie, onthard)?',
      'L’eau est-elle seulement modifiée en température, goût, odeur ou couleur (chauffée, refroidie, café, adoucie) ?',
      '¿El agua solo cambia de temperatura, sabor, olor o color (calentada, enfriada, café, descalcificada)?',
      'Czy woda zmienia tylko temperaturę, smak, zapach lub barwę (podgrzana, schłodzona, kawa, zmiękczona)?') }
  ];

  /* the answer chain: first 'yes' wins; 'unknown' counts as yes (conservative) and is reported; all 'no' -> category 1 */
  function categoryFromAnswers(ans) {
    ans = ans || {};
    var chain = [];
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i], a = ans[q.id];
      if (a !== 'yes' && a !== 'no' && a !== 'unknown') return { cat: null, chain: chain, next: q.id, assumed: false };
      chain.push({ q: q.id, a: a });
      if (a === 'yes' || a === 'unknown') return { cat: q.cat, chain: chain, next: null, assumed: a === 'unknown' };
    }
    return { cat: 1, chain: chain, next: null, assumed: false };
  }

  /* application library (typical category and device; the user confirms per point) */
  function A(id, cat, name, o) { return { id: id, cat: cat, name: name, typical: o.t || [], hose: !!o.hose, bp: !!o.bp, needp: !!o.np, outlet_gap: !!o.gap, integ: !!o.integ, src: o.src || 'resideo_en1717', note: o.note || null }; }
  var APPS = [
    A('wc_cistern', 5, L('WC cistern (float valve)', 'Бачок унітаза (поплавковий клапан)', 'WC-Spülkasten (Füllventil)', 'WC-reservoir (vlotterkraan)', 'Réservoir de WC (robinet flotteur)', 'Cisterna de inodoro (válvula de flotador)', 'Spłuczka WC (zawór pływakowy)'), { integ: true, t: ['AA'], gap: true }),
    A('wc_flushvalve', 5, L('WC / urinal flush valve', 'Змивний кран унітаза / пісуара', 'Druckspüler WC / Urinal', 'Drukspoeler WC / urinoir', 'Robinet de chasse WC / urinoir', 'Fluxor de inodoro / urinario', 'Zawór spłukujący WC / pisuaru'), { integ: true, t: ['DC'] }),
    A('basin_fixed', 3, L('Washbasin / sink, fixed spout above the rim', 'Умивальник / мийка, нерухомий злив над бортом', 'Waschtisch / Spüle, fester Auslauf über dem Rand', 'Wastafel / spoelbak, vaste uitloop boven de rand', 'Lavabo / évier, bec fixe au-dessus du bord', 'Lavabo / fregadero, caño fijo sobre el borde', 'Umywalka / zlew, stała wylewka nad krawędzią'), { integ: true, t: ['AA'], gap: true }),
    A('tap_pullout', 3, L('Basin or kitchen tap with pull-out spray', 'Змішувач умивальника чи кухні з висувним душем', 'Waschtisch- oder Küchenarmatur mit Ausziehbrause', 'Wastafel- of keukenkraan met uittrekbare sproeier', 'Robinet de lavabo ou d’évier à douchette extractible', 'Grifo de lavabo o cocina con ducha extraíble', 'Bateria umywalkowa lub kuchenna z wyciąganą wylewką'), { integ: true, t: ['HD'], hose: true }),
    A('bath_shower_dom', 3, L('Bath / shower with hand shower (dwelling)', 'Ванна / душ з ручним душем (житло)', 'Wanne / Dusche mit Handbrause (Wohnung)', 'Bad / douche met handdouche (woning)', 'Baignoire / douche avec douchette (logement)', 'Bañera / ducha con teléfono (vivienda)', 'Wanna / prysznic z słuchawką (mieszkanie)'), { integ: true, t: ['HD'], hose: true }),
    A('shower_care', 5, L('Bath / shower in a hospital or care home', 'Ванна / душ у лікарні чи будинку догляду', 'Wanne / Dusche im Krankenhaus oder Pflegeheim', 'Bad / douche in ziekenhuis of woonzorgcentrum', 'Baignoire / douche en hôpital ou maison de soins', 'Bañera / ducha en hospital o residencia', 'Wanna / prysznic w szpitalu lub domu opieki'), { integ: true, t: ['AA'], hose: true, gap: true, note: 'care_geometry' }),
    A('washing_machine', 5, L('Washing machine / dishwasher (certified appliance)', 'Пральна / посудомийна машина (сертифікована)', 'Wasch- / Geschirrspülmaschine (zertifiziertes Gerät)', 'Was- / vaatwasmachine (gecertificeerd toestel)', 'Lave-linge / lave-vaisselle (appareil certifié)', 'Lavadora / lavavajillas (aparato certificado)', 'Pralka / zmywarka (urządzenie certyfikowane)'), { integ: true, t: ['AB'], gap: true, note: 'appliance' }),
    A('heating_fill', 3, L('Heating system filling (no additives)', 'Заповнення системи опалення (без добавок)', 'Heizungsfüllung (ohne Zusätze)', 'Vulling verwarmingsinstallatie (zonder additieven)', 'Remplissage du chauffage (sans additifs)', 'Llenado de calefacción (sin aditivos)', 'Napełnianie instalacji grzewczej (bez dodatków)'), { t: ['CA', 'GA'], bp: true, np: true }),
    A('heating_additive', 4, L('Heating / solar circuit with toxic additives', 'Контур опалення / сонячний з токсичними добавками', 'Heizungs- / Solarkreis mit giftigen Zusätzen', 'Verwarmings- / zonnecircuit met giftige additieven', 'Circuit chauffage / solaire avec additifs toxiques', 'Circuito de calefacción / solar con aditivos tóxicos', 'Obieg grzewczy / solarny z toksycznymi dodatkami'), { t: ['BA'], bp: true, np: true, src: 'la_bf', note: 'sds' }),
    A('dhw_heater', 2, L('Cold inlet of a water heater', 'Холодний вхід водонагрівача', 'Kaltwasserzulauf eines Trinkwassererwärmers', 'Koudwatertoevoer van een boiler', 'Arrivée d’eau froide d’un chauffe-eau', 'Entrada de agua fría de un calentador', 'Wlot wody zimnej podgrzewacza'), { t: ['EA'], bp: true, np: true, src: 'en1717' }),
    A('coffee_machine', 2, L('Coffee or beverage machine', 'Кавова машина чи автомат напоїв', 'Kaffee- oder Getränkeautomat', 'Koffie- of drankautomaat', 'Machine à café ou à boissons', 'Cafetera o máquina de bebidas', 'Ekspres do kawy lub automat z napojami'), { t: ['EA'], bp: true, np: true }),
    A('softener', 2, L('Water softener (salt regeneration)', 'Пом’якшувач води (регенерація сіллю)', 'Enthärtungsanlage (Salzregeneration)', 'Waterontharder (zoutregeneratie)', 'Adoucisseur (régénération au sel)', 'Descalcificador (regeneración con sal)', 'Zmiękczacz wody (regeneracja solą)'), { t: ['EA'], bp: true, np: true, src: 'la_bf' }),
    A('garden_tap', 3, L('Garden tap with a hose (pressureless use)', 'Садовий кран зі шлангом (без тиску)', 'Gartenventil mit Schlauch (drucklos)', 'Tuinkraan met slang (drukloos gebruik)', 'Robinet de jardin avec tuyau (usage sans pression)', 'Grifo de jardín con manguera (sin presión)', 'Kran ogrodowy z wężem (bez ciśnienia)'), { t: ['HD'], hose: true, note: 'hose_reach' }),
    A('garden_sprayer', 4, L('Hose with a fertiliser / pesticide sprayer', 'Шланг з розпилювачем добрив / пестицидів', 'Schlauch mit Dünger- / Pflanzenschutzspritze', 'Slang met meststoffen- / pesticidenspuit', 'Tuyau avec pulvérisateur d’engrais / pesticide', 'Manguera con pulverizador de abono / pesticida', 'Wąż z opryskiwaczem nawozów / pestycydów'), { t: ['BA'], hose: true, np: true, src: 'la_bf' }),
    A('pressure_washer', 4, L('High-pressure cleaner with detergent injection', 'Мийка високого тиску з подаванням миючого засобу', 'Hochdruckreiniger mit Reinigungsmittelzugabe', 'Hogedrukreiniger met bijmenging van reinigingsmiddel', 'Nettoyeur haute pression avec injection de détergent', 'Hidrolimpiadora con inyección de detergente', 'Myjka ciśnieniowa z dozowaniem detergentu'), { t: ['GB'], bp: true, np: true }),
    A('standpipe', 4, L('Standpipe / construction-site supply', 'Гідрант-стояк / будмайданчик', 'Standrohr / Baustellenversorgung', 'Standpijp / werfaansluiting', 'Colonne de prise / chantier', 'Hidrante / suministro de obra', 'Stojak hydrantowy / zasilanie budowy'), { t: ['BA'], bp: true, np: true }),
    A('galvanic_bath', 4, L('Galvanic bath filling (open tank)', 'Наповнення гальванічної ванни (відкритий бак)', 'Befüllung Galvanikbad (offener Behälter)', 'Vulling galvanisch bad (open bak)', 'Remplissage d’un bain galvanique (bac ouvert)', 'Llenado de baño galvánico (depósito abierto)', 'Napełnianie wanny galwanicznej (otwarty zbiornik)'), { t: ['DC'] }),
    A('printing_press', 4, L('Printing press / film processor (needs pressure)', 'Друкарська машина / проявочна (потрібен тиск)', 'Druckmaschine / Filmentwicklung (braucht Druck)', 'Drukpers / filmontwikkelaar (heeft druk nodig)', 'Presse d’imprimerie / développeuse (besoin de pression)', 'Imprenta / reveladora (necesita presión)', 'Maszyna drukarska / wywoływarka (wymaga ciśnienia)'), { t: ['BA', 'GB'], bp: true, np: true }),
    A('lab_chemical', 4, L('Chemical or pharmacy laboratory outlet', 'Точка хімічної чи аптечної лабораторії', 'Entnahmestelle Chemie- oder Apothekenlabor', 'Tappunt chemisch of apotheeklabo', 'Point de puisage de laboratoire chimique ou de pharmacie', 'Punto de laboratorio químico o de farmacia', 'Punkt poboru w laboratorium chemicznym lub aptecznym'), { t: ['GB', 'BA'], bp: true, np: true }),
    A('lab_bio', 5, L('Bacteriological laboratory outlet', 'Точка бактеріологічної лабораторії', 'Entnahmestelle bakteriologisches Labor', 'Tappunt bacteriologisch labo', 'Point de laboratoire bactériologique', 'Punto de laboratorio bacteriológico', 'Punkt w laboratorium bakteriologicznym'), { t: ['AA'], bp: true, np: true }),
    A('dental_chair', 5, L('Dental treatment chair', 'Стоматологічна установка', 'Dentaleinheit (Behandlungsstuhl)', 'Tandartsstoel', 'Fauteuil dentaire', 'Sillón dental', 'Unit stomatologiczny'), { t: ['AA', 'AB'], bp: true, np: true }),
    A('glass_washer', 5, L('Glass washer with bottom rinse below the water level', 'Склямийка з донним ополіскуванням під рівнем води', 'Gläserspüle mit Bodenspülrohr unter dem Wasserspiegel', 'Glazenspoeler met bodemspoeling onder het waterniveau', 'Lave-verres avec rinçage de fond sous le niveau d’eau', 'Lavavasos con aclarado de fondo bajo el nivel del agua', 'Myjka do szkła z płukaniem dennym pod lustrem wody'), { t: ['AA'], np: true }),
    A('meat_machine', 5, L('Meat-processing machine (pressurised supply)', 'Машина для обробки м’яса (подавання під тиском)', 'Fleischverarbeitungsmaschine (Druckversorgung)', 'Vleesverwerkingsmachine (onder druk gevoed)', 'Machine de transformation de viande (alimentée sous pression)', 'Máquina de procesado de carne (alimentación a presión)', 'Maszyna do przetwórstwa mięsa (zasilanie ciśnieniowe)'), { t: ['AA'], np: true }),
    A('pond_fill', 5, L('Fish pond / trough filling', 'Наповнення рибного ставка / напувалки', 'Fischteich- / Tränkebefüllung', 'Vulling visvijver / drinkbak', 'Remplissage d’étang / abreuvoir', 'Llenado de estanque / abrevadero', 'Napełnianie stawu / poidła'), { t: ['AA'], gap: true }),
    A('rain_topup', 5, L('Mains top-up of a rainwater (second-circuit) tank', 'Підживлення резервуара дощової води з мережі', 'Trinkwassernachspeisung einer Regenwasseranlage', 'Bijvulling regenwaterput met leidingwater', 'Appoint d’eau de ville d’une citerne d’eau de pluie', 'Aporte de red a un depósito de agua de lluvia', 'Uzupełnianie zbiornika deszczówki wodą z sieci'), { t: ['AA', 'AB'], gap: true, src: 'belgaqua_tvbi', note: 'second_circuit' }),
    A('pool_fill', 5, L('Swimming-pool or spa filling', 'Наповнення басейну чи спа', 'Schwimmbad- oder Whirlpoolbefüllung', 'Vulling zwembad of spa', 'Remplissage de piscine ou de spa', 'Llenado de piscina o spa', 'Napełnianie basenu lub spa'), { t: ['AA', 'AB'], gap: true }),
    A('irrigation', 5, L('Buried irrigation / drip lines', 'Підземний полив / крапельні лінії', 'Erdverlegte Bewässerung / Tropfleitungen', 'Ingegraven irrigatie / druppelleidingen', 'Arrosage enterré / goutte-à-goutte', 'Riego enterrado / goteo', 'Nawadnianie podziemne / linie kroplujące'), { t: ['AA', 'AB'], np: true, src: 'la_bf' }),
    A('custom', null, L('Other (answer the questions)', 'Інше (дайте відповіді на запитання)', 'Sonstiges (Fragen beantworten)', 'Andere (beantwoord de vragen)', 'Autre (répondre aux questions)', 'Otro (responda a las preguntas)', 'Inne (odpowiedz na pytania)'), { src: 'en1717' })
  ];
  var APP = {}; APPS.forEach(function (a) { APP[a.id] = a; });

  var DEFAULTS = { d_mm: 15 };
  var N_MAX = 10000;
  function airGapMin(d_mm) { var d = isFinite(+d_mm) && +d_mm > 0 ? +d_mm : DEFAULTS.d_mm; return Math.max(3 * d, 20); }

  function yn(v, dflt) { if (v === 'yes' || v === true) return true; if (v === 'no' || v === false) return false; return dflt; }

  /* one connection point -> category, admissible and excluded units, preferred unit, conditions */
  function evaluatePoint(p) {
    p = p || {};
    var errors = [], flags = [];
    var known = p.app != null && p.app !== '' && Object.prototype.hasOwnProperty.call(APP, p.app);
    if (!known && p.app != null && p.app !== '') { errors.push('app'); flags.push('app_unknown'); }
    var app = known ? APP[p.app] : APP.custom;
    /* D-PLB-17: a custom point has no library values, so an unanswered back-pressure / needs-pressure question is the worst case (yes) */
    var custom = app.id === 'custom';
    var bp = yn(p.bp, custom ? null : app.bp), needp = yn(p.needp, custom ? null : app.needp);
    if (bp == null || needp == null) { flags.push('bp_assumed'); if (bp == null) bp = true; if (needp == null) needp = true; }
    var hRaw = p.height_mm, hBad = !(hRaw === '' || hRaw == null) && !(isFinite(+hRaw) && +hRaw >= 0);
    var dRaw = p.d_mm, dBad = !(dRaw === '' || dRaw == null) && !(isFinite(+dRaw) && +dRaw > 0);
    if (hBad) { errors.push('height_mm'); flags.push('height_invalid'); }
    if (dBad) { errors.push('d_mm'); flags.push('d_invalid'); }
    var ctx = { bp: bp, needp: needp, hose: yn(p.hose, app.hose), drain: yn(p.drain, true),
      height_mm: (hRaw === '' || hRaw == null || hBad) ? null : +hRaw, d_mm: (dRaw === '' || dRaw == null || dBad) ? DEFAULTS.d_mm : +dRaw };
    var cat = null, source = null, q = null;
    var ov = p.cat === '' || p.cat == null || p.cat === 'auto' ? null : +p.cat;
    if (ov != null && !(ov >= 1 && ov <= 5 && Math.round(ov) === ov)) { errors.push('cat'); flags.push('cat_invalid'); ov = null; }
    if (ov != null) { cat = ov; source = 'override'; if (app.cat != null && ov < app.cat) flags.push('override_lower'); }
    else if (app.cat != null) { cat = app.cat; source = 'library'; }
    else { q = categoryFromAnswers(p.answers); cat = q.cat; source = 'questions'; if (q.assumed) flags.push('unknown_assumed'); }
    /* X2-6: the number of identical points is a whole number 1..N_MAX; missing/empty = 1; anything else is a point error and the point is not counted */
    var nRaw = p.n, n = 1;
    if (!(nRaw === '' || nRaw == null)) {
      var nv = (typeof nRaw === 'number' || (typeof nRaw === 'string' && nRaw.trim() !== '')) ? +nRaw : NaN;
      if (isFinite(nv) && nv >= 1 && nv <= N_MAX && Math.floor(nv) === nv) n = nv;
      else { n = null; errors.push('n'); flags.push('n_invalid'); }
    }
    var res = { id: String(p.id == null ? '' : p.id), n: n, app: app.id, cat: cat, source: source, chain: q ? q.chain : null, next: q ? q.next : null, ctx: ctx,
      admissible: [], excluded: [], preferred: null, conditions: [], booster: false, flags: flags, errors: errors, typical: app.typical.slice(), note: app.note };
    if (cat == null) { res.flags.push('incomplete'); return res; }
    if (cat === 1) { res.flags.push('none_required'); return res; }
    UNITS.forEach(function (u) {
      var cell = u.cover[cat - 1], why = null;
      if (u.listed_only || cell == null) why = 'not_in_table';
      else if (cell === '-') why = 'category';
      else if (cell === 'dom') why = 'domestic_only';
      else if (cell === 'o' && ctx.bp) why = 'backpressure';
      else if (u.open_outlet && ctx.needp) why = 'needs_open_outlet';
      else if (u.hose && !ctx.hose) why = 'hose_only';
      else if (u.drain && !ctx.drain) why = 'no_drain';
      else if (u.h_min_mm != null && ctx.height_mm != null && !(ctx.height_mm > u.h_min_mm)) why = 'height';
      /* Y4-5: a known height below the required air gap means the air gap as installed does not protect (EN 1717: gap >= 3·d; tool max(3·d, 20 mm)) */
      else if (u.air_gap && ctx.height_mm != null && ctx.height_mm < airGapMin(ctx.d_mm)) why = 'air_gap';
      if (why) res.excluded.push({ code: u.code, why: why, cell: cell });
      else res.admissible.push({ code: u.code, cell: cell, h_min_mm: u.h_min_mm, drain: u.drain, booster: u.air_gap && ctx.needp });
    });
    var adm = res.admissible.map(function (a) { return a.code; });
    var pref = null;
    for (var i = 0; i < app.typical.length && !pref; i++) if (adm.indexOf(app.typical[i]) >= 0) pref = app.typical[i];
    for (var j = 0; j < RANK.length && !pref; j++) if (adm.indexOf(RANK[j]) >= 0) pref = RANK[j];
    res.preferred = pref;
    /* Y4-5: flag when an air gap would have been the choice but the known height is below the required gap */
    var adm0 = adm.concat(res.excluded.filter(function (e) { return e.why === 'air_gap'; }).map(function (e) { return e.code; })), pref0 = null;
    for (var i0 = 0; i0 < app.typical.length && !pref0; i0++) if (adm0.indexOf(app.typical[i0]) >= 0) pref0 = app.typical[i0];
    for (var j0 = 0; j0 < RANK.length && !pref0; j0++) if (adm0.indexOf(RANK[j0]) >= 0) pref0 = RANK[j0];
    if (pref0 && pref0 !== pref && UNIT[pref0].air_gap) { res.flags.push('air_gap_insufficient'); res.air_gap_required_mm = airGapMin(ctx.d_mm); res.air_gap_unit = pref0; }
    if (!pref) { res.flags.push('no_unit'); return res; }
    var pu = UNIT[pref];
    if (pu.air_gap) {
      res.air_gap_mm = airGapMin(ctx.d_mm);
      res.conditions.push({ k: 'air_gap', v: res.air_gap_mm });
      if (ctx.needp) { res.booster = true; res.conditions.push({ k: 'booster' }); }
    }
    if (pu.h_min_mm != null) { res.conditions.push({ k: 'height', v: pu.h_min_mm }); if (ctx.height_mm == null) res.flags.push('height_unknown'); }
    if (pu.drain) res.conditions.push({ k: 'drain' });
    if (pref === 'BA' || pref === 'CA' || pref === 'GA' || pref === 'GB') res.conditions.push({ k: 'frost' });
    if (pref === 'BA') res.conditions.push({ k: 'ba_test' });
    if (pu.open_outlet) res.conditions.push({ k: 'open_outlet' });
    if (app.typical.length && app.typical.indexOf(pref) < 0) res.flags.push('typical_not_admissible');
    res.integrated = !!(app.integ && pref === app.typical[0]);
    if (res.integrated) res.conditions.push({ k: 'integrated' });
    res.inspect_m = pu.inspect_m; res.service_m = pu.service_m;
    return res;
  }

  function validate(input) {
    var e = [];
    if (!input || !Array.isArray(input.points)) e.push('points');
    else if (input.points.length > 500) e.push('too_many_points');
    return e;
  }

  /* the whole schedule */
  function evaluate(input) {
    var errors = validate(input);
    if (errors.length) return { valid: false, errors: errors };
    var pts = input.points.map(evaluatePoint);
    var counts = [0, 0, 0, 0, 0, 0], npts = 0, devices = {}, integrated = {}, tasks = [], boosters = [], incomplete = [], pointErrors = [];
    pts.forEach(function (r) {
      if (r.errors.length) pointErrors.push({ id: r.id, errors: r.errors.slice() });
      if (r.n == null) return; /* X2-6: invalid number of points -> listed with its error, not counted in any total */
      if (r.cat) { counts[r.cat] += r.n; npts += r.n; } else incomplete.push(r.id); /* Y4-4: totals count connection points (n), not rows */
      if (r.preferred) {
        if (r.integrated) { integrated[r.preferred] = (integrated[r.preferred] || 0) + r.n; return; }
        devices[r.preferred] = (devices[r.preferred] || 0) + r.n;
        if (r.booster) boosters.push(r.id);
        var u = UNIT[r.preferred];
        tasks.push({ point: r.id, n: r.n, unit: r.preferred, task: 'inspect', interval_months: u.inspect_m, combined: !u.service_m, basis: 'en806_5' }); /* combined = Table A.1 spanning value: inspection + routine maintenance (CR-5) */
        if (u.service_m) tasks.push({ point: r.id, n: r.n, unit: r.preferred, task: 'service', interval_months: u.service_m, basis: 'en806_5' });
        if (u.replace_m) tasks.push({ point: r.id, n: r.n, unit: r.preferred, task: 'replace', interval_months: u.replace_m, basis: 'en806_5' });
      }
    });
    /* visits a year: one visit at the shorter of the inspection and maintenance intervals (maintenance is done on an inspection visit);
       replacements are not visits (bw-r1 CR-23) */
    var visits = 0; tasks.forEach(function (t) { if (t.task !== 'inspect') return; var u = UNIT[t.unit]; visits += t.n * 12 / Math.min(u.inspect_m, u.service_m || Infinity); });
    var maxCat = 0; pts.forEach(function (r) { if (r.n != null && r.cat && r.cat > maxCat) maxCat = r.cat; });
    var flags = [];
    if (pts.some(function (r) { return r.flags.indexOf('no_unit') >= 0; })) flags.push('no_unit');
    if (incomplete.length) flags.push('incomplete');
    if (pointErrors.length) flags.push('point_errors');
    if (pts.some(function (r) { return r.flags.indexOf('bp_assumed') >= 0; })) flags.push('bp_assumed');
    if (boosters.length) flags.push('booster');
    if (pts.some(function (r) { return r.flags.indexOf('air_gap_insufficient') >= 0; })) flags.push('air_gap_insufficient');
    if (pts.some(function (r) { return r.note === 'second_circuit'; })) flags.push('second_circuit');
    return { valid: true, version: VERSION, points: pts, counts: counts, points_total: npts, max_cat: maxCat, devices: devices, integrated: integrated, tasks: tasks, visits_year: visits, boosters: boosters, incomplete: incomplete, point_errors: pointErrors, flags: flags, region: input.region || 'be_flanders' };
  }

  /* presets: schedules of connection points (with an "aha" each, described on the page) */
  function P(id, app, o) { o = o || {}; var r = { id: id, n: o.n || 1, app: app, cat: o.cat || 'auto', bp: o.bp || 'auto', needp: o.needp || 'auto', hose: o.hose || 'auto', drain: o.drain || 'yes', height_mm: o.h == null ? '' : o.h, d_mm: o.d || 15 };
    if (o.answers) r.answers = o.answers; return r; }
  var PRESETS = {
    apartments: { region: 'be_flanders', points: [P('WC', 'wc_cistern', { n: 24 }), P('Basin', 'basin_fixed', { n: 24 }), P('Kitchen', 'tap_pullout', { h: 300, n: 24 }), P('Shower', 'bath_shower_dom', { h: 300, n: 24 }),
      P('WM', 'washing_machine', { n: 24 }), P('Heater', 'dhw_heater'), P('Heating', 'heating_fill'), P('Garden', 'garden_tap', { h: 400, n: 2 }), P('Rain', 'rain_topup', { d: 20 })] },
    heating: { region: 'be_flanders', points: [P('Fill-1', 'heating_fill'), P('Fill-2', 'heating_fill', { drain: 'no' }), P('Solar', 'heating_additive')] },
    dental: { region: 'be_brussels', points: [P('Chair-1', 'dental_chair'), P('Chair-2', 'dental_chair'), P('Basin', 'basin_fixed'), P('Steriliser', 'custom', { needp: 'yes', bp: 'yes', answers: { path: 'unknown' } }), P('Heater', 'dhw_heater')] },
    care: { region: 'be_flanders', points: [P('Shower-home', 'bath_shower_dom', { h: 300 }), P('Shower-care', 'shower_care', { h: 300 }), P('Bedpan', 'custom', { answers: { path: 'yes' }, needp: 'no', bp: 'no', h: 400 }), P('WC', 'wc_flushvalve', { h: 400 })] },
    garden: { region: 'be_flanders', points: [P('Hose', 'garden_tap', { h: 400 }), P('Hose-low', 'garden_tap', { h: 180 }), P('Washer', 'pressure_washer'), P('Irrigation', 'irrigation'), P('Pond', 'pond_fill', { d: 20 })] },
    industry: { region: 'be_wallonia', points: [P('Galvanic', 'galvanic_bath', { h: 300 }), P('Press', 'printing_press'), P('Press-nodrain', 'printing_press', { drain: 'no' }), P('Lab', 'lab_chemical'), P('Standpipe', 'standpipe')] },
    bar: { region: 'be_flanders', points: [P('Coffee', 'coffee_machine'), P('Glasswasher', 'glass_washer', { d: 12 }), P('Softener', 'softener'), P('Dishwasher', 'washing_machine'), P('Mop', 'custom', { hose: 'yes', bp: 'no', needp: 'no', h: 300, answers: { path: 'no', toxic: 'no', harm: 'yes' } })] }
  };

  /* 7-language point names of the presets (QA-26); ids stay unique inside every preset */
  var PNAMES = {
    'WC': L('WC', 'Унітаз', 'WC', 'Wc', 'WC', 'Inodoro', 'WC'),
    'Basin': L('Basin', 'Умивальник', 'Waschtisch', 'Wastafel', 'Lavabo', 'Lavabo', 'Umywalka'),
    'Kitchen': L('Kitchen', 'Кухня', 'Küche', 'Keuken', 'Cuisine', 'Cocina', 'Kuchnia'),
    'Shower': L('Shower', 'Душ', 'Dusche', 'Douche', 'Douche', 'Ducha', 'Prysznic'),
    'WM': L('Washing machine', 'Пральна машина', 'Waschmaschine', 'Wasmachine', 'Lave-linge', 'Lavadora', 'Pralka'),
    'Heater': L('Water heater', 'Водонагрівач', 'Trinkwassererwärmer', 'Boiler', 'Chauffe-eau', 'Calentador', 'Podgrzewacz'),
    'Heating': L('Heating fill', 'Заповнення опалення', 'Heizungsfüllung', 'Vulling verwarming', 'Remplissage chauffage', 'Llenado calefacción', 'Napełnianie c.o.'),
    'Garden': L('Garden tap', 'Садовий кран', 'Gartenventil', 'Tuinkraan', 'Robinet de jardin', 'Grifo de jardín', 'Kran ogrodowy'),
    'Rain': L('Rainwater top-up', 'Підживлення дощової', 'Regenwasser-Nachspeisung', 'Bijvulling regenwater', 'Appoint eau de pluie', 'Aporte agua de lluvia', 'Uzupełnianie deszczówki'),
    'Fill-1': L('Fill-1', 'Заповнення-1', 'Füllung-1', 'Vulling-1', 'Remplissage-1', 'Llenado-1', 'Napełnianie-1'),
    'Fill-2': L('Fill-2', 'Заповнення-2', 'Füllung-2', 'Vulling-2', 'Remplissage-2', 'Llenado-2', 'Napełnianie-2'),
    'Solar': L('Solar circuit', 'Сонячний контур', 'Solarkreis', 'Zonnecircuit', 'Circuit solaire', 'Circuito solar', 'Obieg solarny'),
    'Chair-1': L('Chair-1', 'Крісло-1', 'Stuhl-1', 'Stoel-1', 'Fauteuil-1', 'Sillón-1', 'Fotel-1'),
    'Chair-2': L('Chair-2', 'Крісло-2', 'Stuhl-2', 'Stoel-2', 'Fauteuil-2', 'Sillón-2', 'Fotel-2'),
    'Steriliser': L('Steriliser', 'Стерилізатор', 'Sterilisator', 'Sterilisator', 'Stérilisateur', 'Esterilizador', 'Sterylizator'),
    'Shower-home': L('Shower (dwelling)', 'Душ (житло)', 'Dusche (Wohnung)', 'Douche (woning)', 'Douche (logement)', 'Ducha (vivienda)', 'Prysznic (mieszkanie)'),
    'Shower-care': L('Shower (care)', 'Душ (догляд)', 'Dusche (Pflege)', 'Douche (zorg)', 'Douche (soins)', 'Ducha (asistencial)', 'Prysznic (opieka)'),
    'Bedpan': L('Bedpan washer', 'Мийка суден', 'Steckbeckenspüle', 'Bedpanspoeler', 'Lave-bassin', 'Lavacuñas', 'Myjka basenów'),
    'Hose': L('Hose', 'Шланг', 'Schlauch', 'Slang', 'Tuyau', 'Manguera', 'Wąż'),
    'Hose-low': L('Hose (low)', 'Шланг (низько)', 'Schlauch (tief)', 'Slang (laag)', 'Tuyau (bas)', 'Manguera (baja)', 'Wąż (nisko)'),
    'Washer': L('Pressure washer', 'Мийка високого тиску', 'Hochdruckreiniger', 'Hogedrukreiniger', 'Nettoyeur HP', 'Hidrolimpiadora', 'Myjka ciśnieniowa'),
    'Irrigation': L('Irrigation', 'Полив', 'Bewässerung', 'Irrigatie', 'Arrosage', 'Riego', 'Nawadnianie'),
    'Pond': L('Pond', 'Ставок', 'Teich', 'Vijver', 'Étang', 'Estanque', 'Staw'),
    'Galvanic': L('Galvanic bath', 'Гальванічна ванна', 'Galvanikbad', 'Galvanisch bad', 'Bain galvanique', 'Baño galvánico', 'Wanna galwaniczna'),
    'Press': L('Printing press', 'Друкарська машина', 'Druckmaschine', 'Drukpers', 'Presse', 'Imprenta', 'Maszyna drukarska'),
    'Press-nodrain': L('Printing press (no drain)', 'Друкарська машина (без трапа)', 'Druckmaschine (ohne Ablauf)', 'Drukpers (geen afvoer)', 'Presse (sans évacuation)', 'Imprenta (sin desagüe)', 'Maszyna drukarska (bez odpływu)'),
    'Lab': L('Lab bench', 'Лабораторний стіл', 'Laborplatz', 'Labotafel', 'Paillasse', 'Mesa de laboratorio', 'Stół laboratoryjny'),
    'Standpipe': L('Standpipe', 'Гідрант-стояк', 'Standrohr', 'Standpijp', 'Colonne de prise', 'Hidrante', 'Stojak hydrantowy'),
    'Coffee': L('Coffee machine', 'Кавова машина', 'Kaffeemaschine', 'Koffiemachine', 'Machine à café', 'Cafetera', 'Ekspres do kawy'),
    'Glasswasher': L('Glass washer', 'Склямийка', 'Gläserspüle', 'Glazenspoeler', 'Lave-verres', 'Lavavasos', 'Myjka do szkła'),
    'Softener': L('Softener', 'Пом\u2019якшувач', 'Enthärter', 'Ontharder', 'Adoucisseur', 'Descalcificador', 'Zmiękczacz'),
    'Dishwasher': L('Dishwasher', 'Посудомийна машина', 'Geschirrspüler', 'Vaatwasser', 'Lave-vaisselle', 'Lavavajillas', 'Zmywarka'),
    'Mop': L('Mop sink', 'Мийка для швабр', 'Ausgussbecken', 'Uitstortgootsteen', 'Vidoir', 'Vertedero', 'Zlew porządkowy')
  };
  /* preset(id) keeps the short English ids (tests, bench); preset(id, lang) gives the point names in that language */
  function preset(id, lang) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return null;
    var c = JSON.parse(JSON.stringify(PRESETS[id]));
    if (lang && Object.prototype.hasOwnProperty.call(PNAMES.WC, lang)) c.points.forEach(function (x) { var nm = PNAMES[x.id]; if (nm && nm[lang]) x.id = nm[lang]; });
    return c;
  }

  return { VERSION: VERSION, SOURCES: SOURCES, CATEGORIES: CATEGORIES, UNITS: UNITS, UNIT: UNIT, RANK: RANK, QUESTIONS: QUESTIONS, APPS: APPS, APP: APP, DEFAULTS: DEFAULTS, N_MAX: N_MAX,
    PRESETS: PRESETS, PNAMES: PNAMES, PRESET_IDS: Object.keys(PRESETS), preset: preset, airGapMin: airGapMin, categoryFromAnswers: categoryFromAnswers, evaluatePoint: evaluatePoint, evaluate: evaluate, validate: validate };
});
