/* mep-strategy.js — MEPStrat: RCM task selection per failure mode for MEP assets.
 *
 * Pure functions, no DOM, deterministic. UMD: global MEPStrat in a browser, module.exports in node.
 * Method (published, not invented here):
 *   - decision logic after SAE JA1011 (criteria for an RCM process) and SAE JA1012 / Moubray, RCM II
 *     (2nd ed., 1997): consequences first (hidden / safety-environment / operational / non-operational),
 *     then on-condition, scheduled restoration/discard, failure finding, default action;
 *   - on-condition interval = (P–F − response) / 2 (two inspection opportunities inside the usable P–F);
 *   - failure-finding interval FFI = 2·U·MTBF (Moubray; exponential failures, U small), with the exact
 *     average unavailability Ū(T) = 1 − (M/T)(1 − e^(−T/M)) reported beside it;
 *   - age replacement for wear-out: Weibull life, Barlow–Proschan cost rate
 *     C(T) = [Cp·R(T) + Cf·F(T)] / ∫0^T R(t) dt, minimised over T.
 * Every default that is not from a source is labelled learning_assumption in ASSUMPTIONS.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MEPStrat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
  function T(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }
  function tr(d, lang) { if (d == null) return ''; if (typeof d === 'string') return d; return d[lang] != null ? d[lang] : (d.en != null ? d.en : ''); }

  /* tolerable unavailability of a protective / standby function by criticality class (editable) */
  var U_TOL = { A: 0.005, B: 0.02, C: 0.05 };
  /* time from a confirmed finding to the planned repair being done, days (editable) */
  var RESPONSE_DAYS = { A: 3, B: 7, C: 21 };
  var DEFAULTS = {
    p_detect: 0.9,          /* chance that one reading of a working technique shows a defect that is there */
    beta_wearout: 3,        /* Weibull shape for a wear-out pattern when nothing better is known */
    min_interval_days: 1,   /* shortest practical manual inspection interval */
    min_ff_days: 7,         /* shortest practical failure-finding test interval */
    p_catch_safety: 0.99,   /* a safety failure mode needs at least this catch probability from CBM */
    time_saving_min: 0.05,  /* age replacement must save at least 5 % against run-to-failure */
    planned_share: 0.6,     /* planned repair cost as a share of the corrective repair cost */
    corrective_share: 0.15, /* corrective repair cost as a share of the replacement cost, when unknown */
    labour_rate: 75,        /* EUR/h, the register's site default */
    trend_reviews_y: 12,    /* continuous (BMS/ΔP) trends: one paid review per month */
    hours: { cbm: 0.5, time: 2, ff: 1, statutory: 1, rtf: 0, redesign: 0 }
  };
  var ASSUMPTIONS = [
    { id: 'u_tol', value: U_TOL, kind: 'learning_assumption', note: 'tolerable unavailability by class A/B/C; set it from your own risk criteria' },
    { id: 'response_days', value: RESPONSE_DAYS, kind: 'learning_assumption', note: 'finding-to-repair time by class' },
    { id: 'p_detect', value: DEFAULTS.p_detect, kind: 'learning_assumption', note: 'detection probability per reading' },
    { id: 'beta_wearout', value: DEFAULTS.beta_wearout, kind: 'learning_assumption', note: 'Weibull shape for wear-out when not given' },
    { id: 'planned_share', value: DEFAULTS.planned_share, kind: 'learning_assumption', note: 'planned vs corrective repair cost' },
    { id: 'corrective_share', value: DEFAULTS.corrective_share, kind: 'learning_assumption', note: 'corrective repair cost vs replacement cost when unknown' },
    { id: 'hours', value: DEFAULTS.hours, kind: 'learning_assumption', note: 'labour hours per visit by task kind' },
    { id: 'p_catch_safety', value: DEFAULTS.p_catch_safety, kind: 'learning_assumption', note: 'minimum catch probability for a safety CBM task' }
  ];
  var SOURCES = {
    sae_ja1011: { title: 'SAE JA1011 Evaluation Criteria for Reliability-Centered Maintenance (RCM) Processes', edition: '2009', kind: 'standard' },
    sae_ja1012: { title: 'SAE JA1012 A Guide to the Reliability-Centered Maintenance (RCM) Standard', edition: '2011', kind: 'standard' },
    moubray: { title: 'J. Moubray, Reliability-centred Maintenance (RCM II), 2nd ed., Butterworth-Heinemann', edition: '1997', kind: 'public_guide' },
    nasa_rcm: { title: 'NASA Reliability Centered Maintenance Guide for Facilities and Collateral Equipment', edition: '2008', url: 'https://www.nasa.gov/wp-content/uploads/2015/04/rcm_guide.pdf', kind: 'public_guide' },
    barlow_proschan: { title: 'R. E. Barlow, F. Proschan, Mathematical Theory of Reliability (age replacement)', edition: '1965', kind: 'public_guide' }
  };
  /* techniques that log continuously: detection lag one hour, paid as monthly trend reviews */
  var CONTINUOUS = { bms_trend: 1, dp_trend: 1 };
  /* which hidden failure modes a statutory test actually proves (used when the core library does not
     declare covers_fm): a weekly EN 12845 start test starts the pump and its driver; the monthly generator
     run (NFPA 110 as reference) proves the start; EN 50172 monthly function test proves lamps and charger,
     the annual full-duration test proves battery autonomy. */
  var STAT_COVERS = {
    sprinkler_weekly: ['fail_to_start', 'diesel_driver', 'sprinkler_pump_fail_to_start'],
    generator_monthly: ['fail_to_start'],
    emergency_lighting_monthly: ['lamp_driver', 'charger'],
    emergency_lighting_annual: ['battery_duration']
  };
  function statCovers(st, fmId) {
    var list = st.covers_fm || STAT_COVERS[st.id] || [];
    /* the core writes 'class.fm' references, presets and older data the bare failure-mode id */
    return list.some(function (x) { return x === fmId || String(x).split('.').pop() === fmId; });
  }
  /* D-MEP-9: shortest practical interval of a failure-finding test that is full-duration or destructive
     (a rated-duration battery discharge drains the system and needs a recharge before it protects again).
     learning_assumption; the failure-mode field min_interval_days (core data) wins when present. */
  var FF_MIN_DAYS = { 'emergency_lighting.battery_duration': 30, 'ups.battery_capacity_loss': 30, 'fire_alarm.panel_battery': 30 };
  /* what redesign means for a failure mode whose test cannot be done often enough */
  var REDESIGN_HINT = {
    'emergency_lighting.battery_duration': T('automatic self-test emergency lighting to EN 62034, which logs every luminaire’s duration test', 'аварійне освітлення з автоматичним самотестуванням за EN 62034, яке реєструє тест тривалості кожного світильника', 'Notbeleuchtung mit automatischer Selbstprüfung nach EN 62034, die den Dauertest jeder Leuchte protokolliert', 'noodverlichting met automatische zelftest volgens EN 62034, die de duurtest van elk armatuur logt', 'éclairage de sécurité à autotest automatique selon l’EN 62034, qui enregistre l’essai d’autonomie de chaque bloc', 'alumbrado de emergencia con autotest automático según EN 62034, que registra la prueba de autonomía de cada luminaria', 'oświetlenie awaryjne z automatycznym autotestem wg EN 62034, rejestrujące test czasu pracy każdej oprawy')
  };
  var REDESIGN_GENERIC = T('a self-monitoring design or a second independent device, so that the hidden failure is announced or the unavailability falls', 'конструкція з самоконтролем або другий незалежний пристрій, щоб прихована відмова сигналізувалася або неготовність зменшилася', 'eine selbstüberwachende Ausführung oder ein zweites unabhängiges Gerät, damit der verdeckte Ausfall gemeldet wird oder die Nichtverfügbarkeit sinkt', 'een zelfbewakend ontwerp of een tweede onafhankelijk toestel, zodat de verborgen storing gemeld wordt of de onbeschikbaarheid daalt', 'une conception autosurveillée ou un second dispositif indépendant, pour que la défaillance cachée soit signalée ou que l’indisponibilité baisse', 'un diseño autovigilado o un segundo dispositivo independiente, para que el fallo oculto se señalice o baje la indisponibilidad', 'konstrukcja z autodiagnostyką lub drugie niezależne urządzenie, aby ukryte uszkodzenie było sygnalizowane albo niegotowość spadła');
  /* FF task texts of the library that name a frequency; such a text is printed only with that frequency */
  var FREQ_WORDS = [[/\bweekly\b/i, 7], [/\bmonthly\b/i, 30], [/\b(annual|yearly|before winter)\b/i, 365], [/\bdaily\b/i, 1]];
  function textFitsInterval(enText, days) {
    if (!enText || days == null) return true;
    for (var i = 0; i < FREQ_WORDS.length; i++) if (FREQ_WORDS[i][0].test(enText)) return Math.abs(days - FREQ_WORDS[i][1]) <= 0.1 * FREQ_WORDS[i][1] + 1;
    return true;
  }
  var PRACTICAL = [1, 7, 14, 30, 61, 91, 122, 182, 273, 365, 548, 730, 1095, 1461, 1826, 2557, 3652];

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function mid(r, d) { if (Array.isArray(r)) return num(r[1], num(r[0], d)); return num(r, d); }
  function practical(days) {
    if (!(days > 0)) return null;
    if (days < 1) return days;
    var best = 1;
    for (var i = 0; i < PRACTICAL.length; i++) if (PRACTICAL[i] <= days + 1e-9) best = PRACTICAL[i];
    return best;
  }

  /* ---------------------------------------------------------------- maths */
  function gammaFn(z) {            /* Lanczos, g = 7 */
    var g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
    z -= 1; var x = c[0];
    for (var i = 1; i < g + 2; i++) x += c[i] / (z + i);
    var t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  function weibullEta(mean, beta) { return mean / gammaFn(1 + 1 / beta); }
  function weibullR(t, eta, beta) { return Math.exp(-Math.pow(t / eta, beta)); }
  function integralR(T, eta, beta) {   /* Simpson, 400 panels */
    var n = 400, h = T / n, s = weibullR(0, eta, beta) + weibullR(T, eta, beta);
    for (var i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * weibullR(i * h, eta, beta);
    return s * h / 3;
  }
  function ageCostRate(T, eta, beta, Cp, Cf) {
    var R = weibullR(T, eta, beta);
    return (Cp * R + Cf * (1 - R)) / integralR(T, eta, beta);
  }
  /* optimal age-replacement interval (same time unit as eta) */
  function ageReplacement(mean, beta, Cp, Cf) {
    var eta = weibullEta(mean, beta), best = null, i, T, c;
    for (i = 1; i <= 300; i++) {
      T = eta * 3 * i / 300; c = ageCostRate(T, eta, beta, Cp, Cf);
      if (!best || c < best.c) best = { T: T, c: c };
    }
    var a = Math.max(best.T - eta * 0.01, eta * 1e-4), b = best.T + eta * 0.01, gr = (Math.sqrt(5) - 1) / 2;
    var x1 = b - gr * (b - a), x2 = a + gr * (b - a), f1 = ageCostRate(x1, eta, beta, Cp, Cf), f2 = ageCostRate(x2, eta, beta, Cp, Cf);
    for (i = 0; i < 60; i++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - gr * (b - a); f1 = ageCostRate(x1, eta, beta, Cp, Cf); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + gr * (b - a); f2 = ageCostRate(x2, eta, beta, Cp, Cf); }
    }
    T = (a + b) / 2; c = ageCostRate(T, eta, beta, Cp, Cf);
    var rtf = Cf / mean;
    var interior = T < eta * 2.95;
    return { T: T, cost_rate: c, rtf_rate: rtf, saving: 1 - c / rtf, eta: eta, interior: interior };
  }
  /* age at which the cumulative failure probability reaches F */
  function safeLife(mean, beta, F) { return weibullEta(mean, beta) * Math.pow(-Math.log(1 - F), 1 / beta); }

  /* hidden functions: unavailability between proof tests */
  function ffiApprox(u, mtbf) { return 2 * u * mtbf; }
  function unavailExact(T, mtbf) { if (!(T > 0)) return 0; var x = T / mtbf; return 1 - (1 - Math.exp(-x)) / x; }
  function unavailApprox(T, mtbf) { return T / (2 * mtbf); }
  function ffiExact(u, mtbf) {
    if (!(u > 0) || u >= 1) return null;
    var lo = 0, hi = mtbf;
    while (unavailExact(hi, mtbf) < u) { hi *= 2; if (hi > mtbf * 1e6) return null; }
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (unavailExact(m, mtbf) < u) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function pFailedNow(t, mtbf) { return t > 0 ? 1 - Math.exp(-t / mtbf) : 0; }

  /* chance that a defect is found in time: usable window W = PFu − response, interval I, phase uniform,
     detection probability d per reading. n(φ) = number of readings in [0, W]. */
  function pCatch(pfUsable, interval, response, d) {
    var W = pfUsable - response;
    if (!(W >= 0) || !(interval > 0)) return 0;
    d = num(d, 1);
    var k = Math.floor(W / interval + 1e-12), r = W - k * interval;
    if (r < 0) r = 0;
    var pk1 = 1 - Math.pow(1 - d, k + 1), pk = 1 - Math.pow(1 - d, k);
    return (r / interval) * pk1 + ((interval - r) / interval) * pk;
  }
  /* the deterministic picture used by the P–F animation: readings at phase + j·I after P */
  function pfTimeline(pfUsable, interval, response, phase, pfTotal) {
    var W = pfUsable - response, onsetOffset = (pfTotal || pfUsable) - pfUsable;
    var reads = [], first = null;
    for (var t = phase; t <= (pfTotal || pfUsable) + interval; t += interval) {
      if (t > (pfTotal || pfUsable)) break;
      var visible = t >= onsetOffset;
      reads.push({ t: t, visible: visible });
      if (visible && first == null) first = t;
      if (reads.length > 2000) break;
    }
    var lead = first == null ? null : (pfTotal || pfUsable) - first;
    return { readings: reads, first_detect: first, lead_days: lead, caught: lead != null && lead >= response - 1e-9, window: W };
  }

  /* -------------------------------------------------------- text templates */
  function fmtN(n, lang) {
    if (n == null || !isFinite(n)) return '—';
    var dig = (Math.abs(n) >= 10 || Math.abs(n - Math.round(n)) < 1e-9) ? 0 : 1;
    /* D-MEP-11: the framework's number convention, Intl.NumberFormat(lang) */
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      try { return new Intl.NumberFormat(lang || 'en', { minimumFractionDigits: dig, maximumFractionDigits: dig }).format(dig ? n : Math.round(n)); } catch (e) { /* fall through */ }
    }
    var s = dig ? n.toFixed(1) : String(Math.round(n));
    return lang === 'en' ? s : s.replace('.', ',');
  }
  function fmtP(n, lang) {        /* a percentage with at most one decimal */
    if (n == null || !isFinite(n)) return '—';
    if (typeof Intl !== 'undefined' && Intl.NumberFormat) {
      try { return new Intl.NumberFormat(lang || 'en', { maximumFractionDigits: 1 }).format(n); } catch (e) { /* fall through */ }
    }
    var s = String(Math.round(n * 10) / 10);
    return lang === 'en' ? s : s.replace('.', ',');
  }
  function everyText(days, lang) {
    if (days == null) return '';
    if (days < 1) return tr(T('continuous (logged hourly)', 'безперервно (запис щогодини)', 'kontinuierlich (stündlich protokolliert)', 'continu (elk uur gelogd)', 'en continu (enregistré toutes les heures)', 'continuo (registro horario)', 'ciągle (zapis co godzinę)'), lang);
    var d = fmtN(days, lang);
    return tr(T('every ' + d + ' d', 'кожні ' + d + ' діб', 'alle ' + d + ' d', 'elke ' + d + ' d', 'tous les ' + d + ' j', 'cada ' + d + ' d', 'co ' + d + ' d'), lang);
  }
  function taskText(kind, o, lang) {
    var every = everyText(o.interval, lang), r = fmtN(o.response, lang);
    switch (kind) {
      case 'cbm': return tr(T(
        o.tech + ' ' + every + '; on a finding, repair within ' + r + ' d',
        o.tech + ' ' + every + '; після виявлення — ремонт протягом ' + r + ' діб',
        o.tech + ' ' + every + '; nach Befund Instandsetzung binnen ' + r + ' d',
        o.tech + ' ' + every + '; bij een bevinding herstel binnen ' + r + ' d',
        o.tech + ' ' + every + ' ; en cas de constat, réparer sous ' + r + ' j',
        o.tech + ' ' + every + '; ante un hallazgo, reparar en ' + r + ' d',
        o.tech + ' ' + every + '; po wykryciu naprawa w ciągu ' + r + ' d'), lang);
      case 'time': return (o.fmTask ? o.fmTask + ' — ' : tr(T('Scheduled restoration / replacement', 'Планове відновлення / заміна', 'Planmäßige Instandsetzung / Austausch', 'Gepland herstel / vervanging', 'Remise en état / remplacement programmé', 'Restauración / sustitución programada', 'Planowa regeneracja / wymiana'), lang) + ' ') + every;
      case 'ff': return (o.fmTask ? o.fmTask + ' — ' : tr(T('Failure-finding test: prove the hidden function works', 'Тест виявлення відмови: перевірити, що прихована функція працює', 'Funktionsprüfung: verdeckte Funktion nachweisen', 'Faalzoektest: aantonen dat de verborgen functie werkt', 'Test de détection : prouver que la fonction cachée marche', 'Prueba de búsqueda de fallos: demostrar que la función oculta funciona', 'Test wykrywania uszkodzeń: wykazać, że ukryta funkcja działa'), lang) + ' ') + every;
      case 'ff_statute': {
        var sn = o.statName, f = fmtN(o.ffi, lang);
        return tr(T(
          'Covered by the statutory test “' + sn + '”, ' + every + ' (the failure-finding interval alone would be ' + f + ' d)',
          'Покривається нормативним тестом «' + sn + '», ' + every + ' (за самим інтервалом виявлення відмов було б ' + f + ' діб)',
          'Abgedeckt durch die gesetzliche Prüfung „' + sn + '“, ' + every + ' (das Prüfintervall allein wäre ' + f + ' d)',
          'Gedekt door de wettelijke test ‘' + sn + '’, ' + every + ' (het faalzoekinterval alleen zou ' + f + ' d zijn)',
          'Couvert par l’essai réglementaire « ' + sn + ' », ' + every + ' (l’intervalle de détection seul serait de ' + f + ' j)',
          'Cubierto por la prueba reglamentaria «' + sn + '», ' + every + ' (el intervalo de búsqueda de fallos por sí solo sería ' + f + ' d)',
          'Objęte badaniem ustawowym „' + sn + '”, ' + every + ' (sam interwał wykrywania uszkodzeń wynosiłby ' + f + ' d)'), lang);
      }
      case 'redesign_ff': {
        var fi = fmtN(o.ffi, lang), mn = fmtN(o.min, lang), uu = fmtP(o.u * 100, lang), ut = fmtP(o.ut * 100, lang), ke = everyText(o.keepDays, lang), hint = tr(o.hint, lang);
        var head = o.compulsory
          ? T('Redesign compulsory', 'Обов’язкова зміна проєкту', 'Konstruktive Änderung zwingend', 'Herontwerp verplicht', 'Reconception obligatoire', 'Rediseño obligatorio', 'Zmiana projektu obowiązkowa')
          : T('Redesign recommended', 'Рекомендована зміна проєкту', 'Konstruktive Änderung empfohlen', 'Herontwerp aanbevolen', 'Reconception recommandée', 'Rediseño recomendado', 'Zalecana zmiana projektu');
        var keep = o.statName
          ? T('the statutory test “' + o.statName + '”, ' + ke, 'нормативний тест «' + o.statName + '», ' + ke, 'die gesetzliche Prüfung „' + o.statName + '“, ' + ke, 'de wettelijke test ‘' + o.statName + '’, ' + ke, 'l’essai réglementaire « ' + o.statName + ' », ' + ke, 'la prueba reglamentaria «' + o.statName + '», ' + ke, 'badanie ustawowe „' + o.statName + '”, ' + ke)
          : T('a failure-finding test ' + ke, 'тест виявлення відмови ' + ke, 'eine Funktionsprüfung ' + ke, 'een faalzoektest ' + ke, 'un test de détection ' + ke, 'una prueba de búsqueda de fallos ' + ke, 'test wykrywania uszkodzeń ' + ke);
        var k = tr(keep, lang);
        return tr(head, lang) + tr(T(
          ': the failure-finding interval would be ' + fi + ' d, below the practical minimum of ' + mn + ' d. Until then keep ' + k + '; the unavailability is then U ≈ ' + uu + ' % against the tolerable ' + ut + ' %. Option: ' + hint,
          ': інтервал виявлення відмов становив би ' + fi + ' діб, що менше за практичний мінімум ' + mn + ' діб. До того зберегти ' + k + '; неготовність тоді U ≈ ' + uu + ' % при допустимій ' + ut + ' %. Варіант: ' + hint,
          ': das Prüfintervall läge bei ' + fi + ' d, unter dem praktischen Minimum von ' + mn + ' d. Bis dahin ' + k + ' beibehalten; die Nichtverfügbarkeit ist dann U ≈ ' + uu + ' % bei tragbaren ' + ut + ' %. Möglichkeit: ' + hint,
          ': het faalzoekinterval zou ' + fi + ' d zijn, onder het praktische minimum van ' + mn + ' d. Tot dan ' + k + ' aanhouden; de onbeschikbaarheid is dan U ≈ ' + uu + ' % tegen aanvaardbaar ' + ut + ' %. Optie: ' + hint,
          ' : l’intervalle de détection serait de ' + fi + ' j, sous le minimum pratique de ' + mn + ' j. D’ici là, garder ' + k + ' ; l’indisponibilité est alors U ≈ ' + uu + ' % pour ' + ut + ' % tolérable. Option : ' + hint,
          ': el intervalo de búsqueda de fallos sería de ' + fi + ' d, por debajo del mínimo práctico de ' + mn + ' d. Mientras tanto, mantener ' + k + '; la indisponibilidad es entonces U ≈ ' + uu + ' % frente al ' + ut + ' % tolerable. Opción: ' + hint,
          ': interwał wykrywania uszkodzeń wynosiłby ' + fi + ' d, poniżej praktycznego minimum ' + mn + ' d. Do tego czasu utrzymać ' + k + '; niegotowość wynosi wtedy U ≈ ' + uu + ' % przy dopuszczalnej ' + ut + ' %. Opcja: ' + hint), lang);
      }
      case 'rtf': return tr(T('No scheduled task: run to failure, repair on breakdown (keep the spare or agreement ready)', 'Без планових робіт: експлуатація до відмови, ремонт після відмови (мати запчастину або договір)', 'Keine planmäßige Maßnahme: Betrieb bis zum Ausfall, Instandsetzung nach Ausfall (Ersatzteil oder Vertrag bereithalten)', 'Geen geplande taak: draaien tot falen, herstel na storing (reserveonderdeel of contract paraat)', 'Pas de tâche programmée : fonctionnement jusqu’à défaillance, réparation après panne (pièce ou contrat prêt)', 'Sin tarea programada: operar hasta el fallo, reparar tras la avería (repuesto o contrato preparado)', 'Bez zadań planowych: eksploatacja do awarii, naprawa po awarii (część zamienna lub umowa w gotowości)'), lang);
      case 'redesign': return tr(o.compulsory
        ? T('Redesign compulsory: no maintenance task makes this failure mode tolerable', 'Обов’язкова зміна проєкту: жодне ТО не робить цей вид відмови прийнятним', 'Konstruktive Änderung zwingend: keine Instandhaltungsmaßnahme macht diese Ausfallart tragbar', 'Herontwerp verplicht: geen onderhoudstaak maakt deze faalwijze aanvaardbaar', 'Reconception obligatoire : aucune tâche de maintenance ne rend ce mode de défaillance acceptable', 'Rediseño obligatorio: ninguna tarea de mantenimiento hace tolerable este modo de fallo', 'Zmiana projektu obowiązkowa: żadne zadanie obsługowe nie czyni tego rodzaju uszkodzenia akceptowalnym')
        : T('Run to failure for now; redesign is desirable (class A asset)', 'Поки що до відмови; бажана зміна проєкту (актив класу A)', 'Vorerst Betrieb bis Ausfall; Änderung wünschenswert (Klasse-A-Anlage)', 'Voorlopig tot falen; herontwerp wenselijk (klasse-A-installatie)', 'Jusqu’à défaillance pour l’instant ; reconception souhaitable (équipement classe A)', 'Hasta el fallo por ahora; rediseño deseable (activo clase A)', 'Na razie do awarii; zmiana projektu pożądana (obiekt klasy A)'), lang);
      default: return '';
    }
  }

  /* ----------------------------------------------------------- decide one */
  function decide(asset, fm, ctx) {
    asset = asset || {}; fm = fm || {}; ctx = ctx || {};
    var cls = (ctx.cls === 'A' || ctx.cls === 'B' || ctx.cls === 'C') ? ctx.cls : 'B';
    var lang = ctx.lang || 'en';
    var u = num(ctx.u_tol, U_TOL[cls]);
    var R = num(ctx.response_days, RESPONSE_DAYS[cls]);
    var pd = num(ctx.p_detect, DEFAULTS.p_detect);
    var mtbfY = num(ctx.mtbf_y, mid(fm.mtbf_y, null));
    var pf = ctx.pf_days === null ? null : num(ctx.pf_days, mid(fm.pf_days, null));
    var pattern = ctx.pattern || fm.pattern || 'random';
    var evident = ctx.evident != null ? !!ctx.evident : (fm.evident !== false && pattern !== 'hidden');
    var safety = ctx.safety != null ? !!ctx.safety : !!fm.safety;
    var env = ctx.environment != null ? !!ctx.environment : !!fm.environment;
    var techLib = ctx.techniques || {};
    var rate = num(ctx.labour_rate, DEFAULTS.labour_rate);
    var hoursK = Object.assign({}, DEFAULTS.hours, ctx.hours || {});
    /* a planned job on this failure mode takes the class library's repair hours when it gives them */
    if (fm.repair_h != null && isFinite(fm.repair_h) && !(ctx.hours && ctx.hours.time != null)) hoursK.time = fm.repair_h;
    var costs = ctx.costs || {};
    var repl = num(costs.replacement_eur, num(asset.replacement_cost_eur, null));
    var Ccorr = num(costs.corrective_eur, repl != null ? repl * DEFAULTS.corrective_share : null);
    var downH = num(costs.downtime_eur_h, num(asset.downtime_cost_eur_h, 0));
    var mttr = num(costs.mttr_h, num(asset.mttr_h, 0));
    var Cf = Ccorr != null ? Ccorr + downH * mttr : null;
    var Cp = num(costs.planned_eur, Ccorr != null ? Ccorr * DEFAULTS.planned_share : null);
    var reasons = [], warnings = [], path = [];
    var mtbfD = mtbfY != null ? mtbfY * 365 : null;
    var lambda = mtbfY ? 1 / mtbfY : null;
    var rtfCost = (lambda != null && Cf != null) ? lambda * Cf : null;
    if (mtbfY == null) warnings.push('mtbf_unknown');
    if (Cf == null) warnings.push('costs_unknown');

    var consequence;
    if (!evident) consequence = (safety || env || ctx.multiple_failure_safety) ? 'hidden_safety' : 'hidden';
    else if (safety || env) consequence = 'safety';
    else if (cls === 'A' || cls === 'B') consequence = 'operational';
    else consequence = 'non_operational';
    path.push({ node: 'q_evident', answer: evident ? 'yes' : 'no' });
    if (evident) {
      path.push({ node: 'q_safety', answer: (safety || env) ? 'yes' : 'no' });
      if (!(safety || env)) path.push({ node: 'q_operational', answer: consequence === 'operational' ? 'yes' : 'no' });
    }
    var mustReduce = consequence === 'safety' || consequence === 'hidden_safety';

    /* --- on-condition --------------------------------------------------- */
    var cbm = { applicable: false, feasible: false, worthwhile: false, reasons: [] };
    var techIds = ctx.technique ? [ctx.technique] : (fm.techniques || []);
    var access = ctx.technique_access !== false;
    if (pf == null || !(pf > 0)) cbm.reasons.push('no_pf_interval');
    else if (!techIds.length) cbm.reasons.push('no_technique');
    else if (!access) cbm.reasons.push('technique_no_access');
    else {
      var bestT = null;
      techIds.forEach(function (id) {
        var t = techLib[id] || { id: id, pf_fraction: 0.5, cost_per_reading_eur: [null, null, null] };
        var frac = num(t.pf_fraction, 0.5);
        if (ctx.pf_fraction != null && (!ctx.technique || ctx.technique === id)) frac = ctx.pf_fraction;
        var pfu = pf * frac;
        var cont = !!CONTINUOUS[id];
        var calc = cont ? 1 / 24 : (pfu - R) / 2;
        var cand = { id: id, technique: t, pf_fraction: frac, pf_usable_days: pfu, continuous: cont, interval_calc_days: calc };
        if (!bestT || (cand.interval_calc_days > 0 && (cand.pf_usable_days > bestT.pf_usable_days || cont && !bestT.continuous))) bestT = cand;
      });
      cbm.applicable = true;
      Object.assign(cbm, { technique: bestT.id, pf_fraction: bestT.pf_fraction, pf_days: pf, pf_usable_days: bestT.pf_usable_days, continuous: bestT.continuous });
      var I = bestT.continuous ? 1 / 24 : (bestT.pf_usable_days - R) / 2;
      cbm.interval_calc_days = I;
      if (bestT.pf_usable_days - R <= 0) { cbm.reasons.push('pf_shorter_than_response'); }
      else if (!bestT.continuous && I < num(ctx.min_interval_days, DEFAULTS.min_interval_days)) { cbm.reasons.push('interval_impractical'); }
      else {
        cbm.interval_days = bestT.continuous ? I : practical(I);
        cbm.p_catch = pCatch(bestT.pf_usable_days, cbm.interval_days, R, pd);
        cbm.feasible = true;
        var cr = bestT.technique.cost_per_reading_eur;
        var cRead = num(ctx.cost_per_reading_eur, mid(cr, 0));
        var readsY = bestT.continuous ? DEFAULTS.trend_reviews_y : 365 / cbm.interval_days;
        cbm.readings_y = readsY;
        cbm.cost_y = readsY * (cRead + (bestT.continuous ? 0 : hoursK.cbm * rate));
        if (lambda != null && Cf != null && Cp != null) {
          cbm.total_y = cbm.cost_y + lambda * (cbm.p_catch * (Cp + hoursK.time * rate) + (1 - cbm.p_catch) * Cf);
        }
        if (mustReduce) {
          cbm.worthwhile = cbm.p_catch >= DEFAULTS.p_catch_safety - 1e-9;
          if (!cbm.worthwhile) cbm.reasons.push('catch_below_safety_target');
        } else if (cbm.total_y != null && rtfCost != null) {
          cbm.worthwhile = cbm.total_y < rtfCost;
          if (!cbm.worthwhile) cbm.reasons.push('costs_more_than_failure');
        } else { cbm.worthwhile = true; cbm.reasons.push('worth_not_assessed'); }
      }
    }
    path.push({ node: 'q_cbm', answer: (cbm.feasible && cbm.worthwhile) ? 'yes' : 'no' });

    /* --- scheduled restoration / discard ----------------------------------- */
    var time = { applicable: false, feasible: false, worthwhile: false, reasons: [] };
    var beta = num(ctx.beta, DEFAULTS.beta_wearout);
    {
      if (pattern !== 'wearout') time.reasons.push('not_wearout');
      else if (mtbfY == null) time.reasons.push('life_unknown');
      else {
        time.applicable = true; time.beta = beta;
        if (mustReduce) {
          var sl = safeLife(mtbfY, beta, u) * 365;
          time.safe_life_days = sl; time.interval_days = practical(sl); time.interval_calc_days = sl;
          time.feasible = sl >= num(ctx.min_interval_days, DEFAULTS.min_interval_days);
          time.worthwhile = time.feasible;
          if (!time.feasible) time.reasons.push('safe_life_too_short');
          if (Cp != null) time.cost_y = (Cp + hoursK.time * rate) * 365 / time.interval_days;
        } else if (Cf == null || Cp == null) {
          time.reasons.push('costs_unknown');
        } else {
          var ar = ageReplacement(mtbfY, beta, Cp + hoursK.time * rate, Cf);
          time.T_opt_days = ar.T * 365; time.interval_calc_days = ar.T * 365; time.interval_days = practical(ar.T * 365);
          /* QA-23: the cost shown belongs to the interval that is scheduled (T* rounded down); T* stays as information */
          var atI = ageCostRate(time.interval_days / 365, ar.eta, beta, Cp + hoursK.time * rate, Cf);
          time.cost_opt_y = ar.cost_rate; time.saving_opt = ar.saving;
          time.cost_y = atI; time.total_y = atI; time.saving = 1 - atI / ar.rtf_rate; time.eta_y = ar.eta;
          time.feasible = ar.interior;
          time.worthwhile = ar.interior && time.saving >= DEFAULTS.time_saving_min;
          if (!ar.interior) time.reasons.push('no_optimum');
          else if (!time.worthwhile) time.reasons.push('saving_too_small');
        }
      }
      if (!(cbm.feasible && cbm.worthwhile)) path.push({ node: 'q_time', answer: (time.feasible && time.worthwhile) ? 'yes' : 'no' });
    }

    /* statutory requirements, retained whatever the strategy (D-MEP-5) */
    var statutory = (ctx.statutory || []).map(function (s) {
      var days = s.interval_months != null ? Math.round(s.interval_months * 30.4375) : null;
      return { id: s.id, name: s.name, interval_months: s.interval_months, interval_days: days, basis: s.basis, source: s.source };
    });
    var statMin = null, statMinId = null;
    statutory.forEach(function (s) { if (s.interval_days != null && (statMin == null || s.interval_days < statMin)) { statMin = s.interval_days; statMinId = s.id; } });

    /* --- failure finding (hidden only) -------------------------------------- */
    var ff = { applicable: !evident, feasible: false, reasons: [] };
    if (!evident && mtbfY != null) {
      ff.u_tol = u;
      ff.ffi_days = ffiApprox(u, mtbfY) * 365;
      var ex = ffiExact(u, mtbfY); ff.ffi_exact_days = ex != null ? ex * 365 : null;
      ff.interval_days = practical(ff.ffi_days);
      ff.u_at_interval = unavailExact(ff.interval_days / 365, mtbfY);
      var cur = ctx.current_test_days;
      if (cur != null && cur > 0) { ff.current_test_days = cur; ff.u_current = unavailExact(cur / 365, mtbfY); ff.u_current_approx = unavailApprox(cur / 365, mtbfY); }
      var since = ctx.since_test_y != null ? ctx.since_test_y : (asset.reserve_tested_months != null ? asset.reserve_tested_months / 12 : null);
      if (since != null) { ff.since_test_y = since; ff.p_failed_now = pFailedNow(since, mtbfY); }
      var ffMin = num(ctx.ff_min_days, num(fm.min_interval_days, num(FF_MIN_DAYS[ctx.fm_ref], num(ctx.min_ff_days, DEFAULTS.min_ff_days))));
      ff.min_interval_days = ffMin;
      ff.feasible = ff.ffi_days >= ffMin;
      ff.cost_y = ff.interval_days ? (365 / ff.interval_days) * hoursK.ff * rate : null;
      if (!ff.feasible) {
        /* D-MEP-9: never print an interval below the practical minimum. Keep the statutory test that proves
           this failure mode (or the test at the practical minimum), report the resulting U, recommend redesign. */
        ff.reasons.push('ffi_below_min'); ff.below_min = true;
        ff.interim_days = statMin != null ? statMin : ffMin; ff.interim_by = statMin != null ? statMinId : 'min_interval';
        ff.u_interim = unavailExact(ff.interim_days / 365, mtbfY);
        ff.redesign_hint = REDESIGN_HINT[ctx.fm_ref] || fm.redesign_hint || REDESIGN_GENERIC;
      }
      if (u > 0.05) ff.reasons.push('u_large_approx');
    } else if (!evident) ff.reasons.push('mtbf_unknown');
    if (!evident && !(cbm.feasible && cbm.worthwhile) && !(time.feasible && time.worthwhile)) path.push({ node: 'q_ff', answer: ff.feasible ? 'yes' : 'no' });

    /* --- choose ----------------------------------------------------------- */
    var kind, interval = null, intervalCalc = null, techName = '', trade = null, compulsory = false;
    if (cbm.feasible && cbm.worthwhile) { kind = 'cbm'; interval = cbm.interval_days; intervalCalc = cbm.interval_calc_days; reasons.push('cbm_feasible'); }
    else if (time.feasible && time.worthwhile) { kind = 'time'; interval = time.interval_days; intervalCalc = time.interval_calc_days; reasons.push(mustReduce ? 'safe_life' : 'age_replacement_pays'); }
    else if (!evident && ff.feasible) { kind = 'ff'; interval = ff.interval_days; intervalCalc = ff.ffi_days; reasons.push('ffi'); }
    else if (!evident && ff.below_min) { kind = 'redesign'; compulsory = mustReduce; reasons.push('ffi_below_min'); }
    else if (mustReduce) { kind = 'redesign'; compulsory = true; reasons.push('safety_no_task'); }
    else if (!evident) { kind = 'rtf'; reasons.push('hidden_no_task'); }
    else if (cls === 'A') { kind = 'redesign'; compulsory = false; reasons.push('class_a_no_task'); }
    else { kind = 'rtf'; reasons.push(cls === 'C' ? 'rtf_class_c' : 'rtf_no_task_pays'); }
    var outcome = { cbm: 'o_cbm', time: 'o_time', ff: 'o_ff', rtf: 'o_rtf', redesign: compulsory ? 'o_redesign' : 'o_redesign_desirable' }[kind];

    if (statMin != null && interval != null && (kind === 'ff' || kind === 'cbm' || kind === 'time') && statMin < interval) {
      reasons.push('statutory_shorter');
    }
    if (kind === 'ff' && statMin != null && ff.ffi_days != null && statMin < ff.ffi_days) {
      /* QA-20: the statute sets the interval; the decision reports the statutory interval, the FFI stays as information */
      ff.governed_by_statute = true; ff.governed_by = statMinId; interval = statMin;
    }
    var statName = function (id, l) { var n = null; statutory.forEach(function (s) { if (s.id === id) n = tr(s.name, l) || s.id; }); return n; };

    var tech = cbm.technique ? (techLib[cbm.technique] || { id: cbm.technique }) : null;
    function textIn(l) {
      if (kind === 'ff' && ff.governed_by_statute) return taskText('ff_statute', { interval: interval, ffi: ff.ffi_days, statName: statName(ff.governed_by, l) }, l);
      if (kind === 'redesign' && ff.below_min) return taskText('redesign_ff', { compulsory: compulsory, ffi: ff.ffi_days, min: ff.min_interval_days,
        keepDays: ff.interim_days, statName: ff.interim_by !== 'min_interval' ? statName(ff.interim_by, l) : null, u: ff.u_interim, ut: u, hint: ff.redesign_hint }, l);
      /* a library task text that names a frequency ("Annual ...") is printed only with that frequency */
      var fmT = kind === 'time' ? fm.time_task : (kind === 'ff' ? fm.ff_task : null);
      if (fmT && !textFitsInterval(tr(fmT, 'en'), interval)) fmT = null;
      return taskText(kind, {
        interval: interval, response: R, compulsory: compulsory,
        tech: tech ? (tr(tech.name, l) || tech.id) : '',
        fmTask: fmT ? tr(fmT, l) : ''
      }, l);
    }
    var task = {}; LANGS.forEach(function (l) { task[l] = textIn(l); });
    if (kind === 'cbm') trade = tech && tech.skill || (asset.trades && asset.trades[0]) || null;
    else trade = (ctx.trades && ctx.trades[0]) || null;
    var hours = hoursK[kind] || 0;
    var visitsY = interval ? (interval < 1 ? DEFAULTS.trend_reviews_y : 365 / interval) : 0;
    var srcs = ['sae_ja1011', 'sae_ja1012', 'moubray'];
    if (kind === 'time' && !mustReduce) srcs.push('barlow_proschan');
    (fm.sources || []).forEach(function (s) { if (srcs.indexOf(s) < 0) srcs.push(s); });
    if (tech && tech.sources) tech.sources.forEach(function (s) { if (srcs.indexOf(s) < 0) srcs.push(s); });

    /* current practice, for comparison */
    var current = null, curK = ctx.current && ctx.current.kind;
    if (curK && curK !== 'none') {
      current = { kind: curK, interval_days: ctx.current.interval_days };
      var ci = ctx.current.interval_days;
      if (curK === 'time' && ci > 0 && mtbfY && Cf != null && Cp != null) {
        var eta0 = weibullEta(mtbfY, beta);
        current.total_y = ageCostRate(ci / 365, eta0, beta, Cp + hoursK.time * rate, Cf);
        current.visits_y = 365 / ci;
      } else if (curK === 'ff' && ci > 0 && mtbfY) {
        current.u = unavailExact(ci / 365, mtbfY);
      }
    }

    var chosenTotal = kind === 'cbm' ? cbm.total_y : kind === 'time' ? time.total_y : kind === 'rtf' ? rtfCost : (kind === 'ff' ? hours * rate * visitsY : null);
    return {
      ok: true, version: VERSION, asset_id: asset.id || null, fm_id: fm.id || null, cls: cls,
      consequence: consequence, u_tol: u, response_days: R, p_detect: pd, pattern: pattern, evident: evident,
      pf_days: pf, mtbf_y: mtbfY, cf_eur: Cf, cp_eur: Cp,
      path: path, outcome: outcome, kind: kind, compulsory: compulsory,
      interval_days: interval, interval_calc_days: intervalCalc,
      task: task, trade: trade, hours: hours, visits_y: visitsY, hours_y: hours * visitsY,
      cost_y: chosenTotal, rtf_cost_y: rtfCost,
      cbm: cbm, time: time, ff: ff, statutory: statutory, current: current,
      reasons: reasons, warnings: warnings, sources: srcs
    };
  }

  /* --------------------------------------------------------- plan a register */
  function classOf(asset, critResults, quick) {
    var r = critResults && critResults[asset.id];
    if (r && /^[ABC]$/.test(r.class || '')) return { cls: r.class, from: 'mepcriticality' };
    if (quick && /^[ABC]$/.test(quick[asset.id] || '')) return { cls: quick[asset.id], from: 'quick' };
    return { cls: 'B', from: 'default' };
  }
  function plan(register, critResults, ctx) {
    ctx = ctx || {};
    var lib = ctx.lib || (typeof globalThis !== 'undefined' && globalThis.MEPCore) || {};
    var classes = lib.CLASSES || {}, techs = lib.TECHNIQUES || {}, stat = lib.STATUTORY || {};
    var tasks = [], results = {}, kinds = { cbm: 0, time: 0, ff: 0, rtf: 0, redesign: 0, statutory: 0 }, hoursByTrade = {};
    var assets = (register && register.assets) || [];
    var rate = num(register && register.site && register.site.labour_rate_eur_h, DEFAULTS.labour_rate);
    assets.forEach(function (a) {
      var co = classOf(a, critResults, ctx.quick);
      var lc = classes[a.class] || null;
      var res = { cls: co.cls, class_from: co.from, decisions: [] };
      results[a.id] = res;
      if (!lc) { res.warning = 'unknown_class'; return; }
      var statList = [];
      if (typeof lib.statutoryFor === 'function') {
        /* the core's resolver knows the conditional rules (F-gas charge bands, leak detection) */
        try { statList = (lib.statutoryFor(a) || []).map(function (x) { return Object.assign({}, stat[x.id] || {}, x); }); } catch (e) { statList = []; }
      } else Object.keys(stat).forEach(function (k) {
        var s = stat[k]; var ok = false;
        try { ok = typeof s.applies === 'function' ? !!s.applies(a) : false; } catch (e) { ok = false; }
        if (ok) statList.push(s);
      });
      var typ = lc.typical || {}, covered = [];
      (lc.failure_modes || []).forEach(function (fm) {
        var d = decide(a, fm, {
          cls: co.cls, techniques: techs, labour_rate: rate, trades: lc.trades, fm_ref: a.class + '.' + fm.id,
          u_tol: ctx.u_tol && ctx.u_tol[co.cls], response_days: ctx.response_days && ctx.response_days[co.cls],
          costs: {
            replacement_eur: num(a.replacement_cost_eur, mid(typ.replacement_cost_eur, null)),
            downtime_eur_h: num(a.downtime_cost_eur_h, 0),
            mttr_h: num(a.mttr_h, mid(typ.mttr_h, 0))
          },
          /* only a statutory test declared to prove THIS failure mode can stand in for its FF task */
          statutory: statList.filter(function (st) {
            return statCovers(st, fm.id) || (fm.statutory || []).indexOf(st.id) >= 0;
          })
        });
        res.decisions.push({ fm_id: fm.id, kind: d.kind, interval_days: d.interval_days, consequence: d.consequence, path: d.path.map(function (p) { return p.node + ':' + p.answer; }) });
        kinds[d.kind]++;
        if (d.kind === 'rtf') return;
        /* a statutory proof test more frequent than the FFI already finds this hidden failure:
           schedule it once, under the statute, and record what it covers */
        if (d.kind === 'ff' && d.ff.governed_by_statute) { covered.push({ fm: fm.id, by: d.ff.governed_by }); return; }
        var trade = d.trade || (lc.trades && lc.trades[0]) || null;
        /* D-MEP-9: the test cannot be done as often as the FFI asks. A statute that proves the failure mode
           keeps its own interval (and is recorded as covering it); otherwise the test runs at the practical minimum. */
        if (d.kind === 'redesign' && d.ff.below_min) {
          if (d.ff.interim_by !== 'min_interval') covered.push({ fm: fm.id, by: d.ff.interim_by });
          else {
            var it = {}; LANGS.forEach(function (l) { it[l] = taskText('ff', { interval: d.ff.interim_days }, l); });
            tasks.push({ asset_id: a.id, fm_id: fm.id, kind: 'ff', task: it, interval_days: d.ff.interim_days, trade: trade, hours: DEFAULTS.hours.ff,
              basis: 'ffi_below_min interim', sources: d.sources, u_interim: d.ff.u_interim });
            hoursByTrade[trade || 'unassigned'] = (hoursByTrade[trade || 'unassigned'] || 0) + DEFAULTS.hours.ff * 365 / d.ff.interim_days;
          }
        }
        tasks.push({ asset_id: a.id, fm_id: fm.id, kind: d.kind, task: d.task, interval_days: d.interval_days, trade: trade,
          hours: d.hours, basis: d.reasons.join(' '), sources: d.sources, compulsory: d.compulsory || undefined,
          u_interim: d.kind === 'redesign' && d.ff.below_min ? d.ff.u_interim : undefined });
        if (d.hours_y) hoursByTrade[trade || 'unassigned'] = (hoursByTrade[trade || 'unassigned'] || 0) + d.hours_y;
      });
      statList.forEach(function (s) {
        var days = s.interval_days != null ? s.interval_days : (s.interval_months != null ? Math.round(s.interval_months * 30.4375) : null);
        var name = {}; LANGS.forEach(function (l) { name[l] = tr(s.name, l) || s.id; });
        var trade = s.trade || (lc.trades && lc.trades[0]) || null;
        var sh = num(s.hours, DEFAULTS.hours.statutory);
        var cov = covered.filter(function (c) { return c.by === s.id; }).map(function (c) { return c.fm; });
        tasks.push({ asset_id: a.id, fm_id: null, kind: 'statutory', task: name, interval_days: days, trade: trade,
          hours: sh, conditional: s.conditional || undefined, basis: 'statutory ' + s.id + (cov.length ? '; also failure-finding for ' + cov.join(',') : ''),
          sources: [s.source].filter(Boolean), statutory_id: s.id, covers: cov.length ? cov : undefined });
        kinds.statutory++;
        if (days) hoursByTrade[trade || 'unassigned'] = (hoursByTrade[trade || 'unassigned'] || 0) + sh * 365 / days;
      });
    });
    return { tasks: tasks, results: results, summary: { assets: assets.length, tasks: tasks.length, kinds: kinds, hours_y_by_trade: hoursByTrade, version: VERSION } };
  }

  /* ---------------------------------------------------------------- presets
     Self-contained teaching cases. Every reliability and cost number below is a
     learning_assumption chosen to be plausible for a European office or data-centre
     building; none is manufacturer or field-statistics data. Statutory intervals
     cite their regulation. */
  var VIB = { id: 'vibration', pf_fraction: 0.7, cost_per_reading_eur: [15, 25, 40], skill: 'hvac_mech',
    name: T('Vibration (portable)', 'Вібрація (переносний прилад)', 'Schwingung (tragbar)', 'Trilling (draagbaar)', 'Vibration (portable)', 'Vibración (portátil)', 'Drgania (przenośny)') };
  var PRESETS = [
    { id: 'filter_dp', site: 'office_12', asset: { id: 'AHU-01', class: 'ahu', serves: 'office' }, cls: 'B',
      label: T('AHU filter: calendar vs ΔP', 'Фільтр ППУ: за календарем чи за ΔP', 'RLT-Filter: Kalender oder Δp', 'LBK-filter: kalender of ΔP', 'Filtre CTA : calendrier ou ΔP', 'Filtro UTA: calendario o ΔP', 'Filtr centrali: kalendarz czy ΔP'),
      aha: T('Quarterly changes throw away about half of the filter life. Changing on the measured pressure drop (BMS trend) costs roughly 40 % less per year and never lets the fan starve.',
        'Заміна щокварталу викидає приблизно половину ресурсу фільтра. Заміна за виміряним перепадом тиску (тренд BMS) дешевша приблизно на 40 % на рік і не допускає «голодування» вентилятора.',
        'Quartalsweiser Wechsel wirft etwa die halbe Filterstandzeit weg. Wechsel nach gemessenem Druckverlust (GLT-Trend) kostet rund 40 % weniger pro Jahr und lässt den Ventilator nie verhungern.',
        'Elk kwartaal vervangen gooit ongeveer de helft van de filterlevensduur weg. Vervangen op het gemeten drukverschil (GBS-trend) kost circa 40 % minder per jaar en laat de ventilator nooit tekortkomen.',
        'Le changement trimestriel jette environ la moitié de la vie du filtre. Changer sur la perte de charge mesurée (tendance GTB) coûte environ 40 % de moins par an et n’affame jamais le ventilateur.',
        'Cambiar cada trimestre desperdicia cerca de la mitad de la vida del filtro. Cambiar por la pérdida de carga medida (tendencia BMS) cuesta un 40 % menos al año y nunca deja al ventilador sin aire.',
        'Wymiana co kwartał marnuje około połowy żywotności filtra. Wymiana według zmierzonego spadku ciśnienia (trend BMS) kosztuje rocznie około 40 % mniej i nie dusi wentylatora.'),
      fm: { id: 'ahu_filter_loading', name: T('Filter loaded: airflow falls below design', 'Фільтр забитий: витрата повітря нижче проєктної', 'Filter beladen: Luftmenge unter Auslegung', 'Filter belast: luchthoeveelheid onder ontwerp', 'Filtre colmaté : débit sous la valeur de calcul', 'Filtro colmatado: caudal por debajo del de diseño', 'Filtr zapchany: przepływ poniżej projektowego'),
        evident: true, pattern: 'wearout', safety: false, pf_days: 45, mtbf_y: 0.5, techniques: ['dp_trend'],
        time_task: T('Replace filter set', 'Замінити комплект фільтрів', 'Filtersatz tauschen', 'Filterset vervangen', 'Remplacer le jeu de filtres', 'Sustituir el juego de filtros', 'Wymienić komplet filtrów') },
      techniques: { dp_trend: { id: 'dp_trend', pf_fraction: 0.9, cost_per_reading_eur: [10, 20, 40], skill: 'controls',
        name: T('ΔP trend (BMS)', 'Тренд ΔP (BMS)', 'Δp-Trend (GLT)', 'ΔP-trend (GBS)', 'Tendance ΔP (GTB)', 'Tendencia ΔP (BMS)', 'Trend ΔP (BMS)') } },
      ctx: { costs: { corrective_eur: 900, planned_eur: 350, downtime_eur_h: 0, mttr_h: 0 }, current: { kind: 'time', interval_days: 91 } },
      expect: { kind: 'cbm' } },
    { id: 'standby_never', site: 'office_12', asset: { id: 'P-CHW-02', class: 'pump', serves: 'office', redundancy: 'N+1', reserve_tested_months: 72 }, cls: 'B',
      label: T('Standby pump never started', 'Резервний насос жодного разу не запускали', 'Reservepumpe nie gestartet', 'Reservepomp nooit gestart', 'Pompe de secours jamais démarrée', 'Bomba de reserva nunca arrancada', 'Pompa rezerwowa nigdy nie uruchamiana'),
      aha: T('Six years without a start: with an 8-year fail-to-start MTBF there is about a 53 % chance the standby would not start today. N+1 on the drawing is not N+1 in the plant. A changeover every 3 months keeps the unavailability under 2 %.',
        'Шість років без запуску: за MTBF відмови запуску 8 років імовірність, що резерв сьогодні не запуститься, близько 53 %. N+1 на кресленні — ще не N+1 на об’єкті. Перемикання кожні 3 місяці тримає неготовність нижче 2 %.',
        'Sechs Jahre ohne Start: bei 8 Jahren MTBF für Startversagen liegt die Chance, dass die Reserve heute nicht anläuft, bei etwa 53 %. N+1 im Schema ist nicht N+1 in der Anlage. Eine Umschaltung alle 3 Monate hält die Nichtverfügbarkeit unter 2 %.',
        'Zes jaar zonder start: bij een MTBF voor startfalen van 8 jaar is er circa 53 % kans dat de reserve vandaag niet start. N+1 op tekening is geen N+1 in de installatie. Elke 3 maanden omschakelen houdt de onbeschikbaarheid onder 2 %.',
        'Six ans sans démarrage : avec un MTBF de non-démarrage de 8 ans, la probabilité que le secours ne démarre pas aujourd’hui est d’environ 53 %. N+1 sur le schéma n’est pas N+1 dans la chaufferie. Une permutation tous les 3 mois maintient l’indisponibilité sous 2 %.',
        'Seis años sin arrancar: con un MTBF de fallo al arranque de 8 años hay un 53 % de probabilidad de que la reserva no arranque hoy. N+1 en el plano no es N+1 en la sala. Una conmutación cada 3 meses mantiene la indisponibilidad por debajo del 2 %.',
        'Sześć lat bez rozruchu: przy MTBF niezadziałania 8 lat szansa, że rezerwa dziś nie ruszy, wynosi około 53 %. N+1 na schemacie to nie N+1 w maszynowni. Przełączenie co 3 miesiące utrzymuje niegotowość poniżej 2 %.'),
      fm: { id: 'pump_standby_fail_to_start', name: T('Standby pump fails to start on demand', 'Резервний насос не запускається на вимогу', 'Reservepumpe startet bei Anforderung nicht', 'Reservepomp start niet bij vraag', 'La pompe de secours ne démarre pas à la demande', 'La bomba de reserva no arranca a demanda', 'Pompa rezerwowa nie rusza na żądanie'),
        evident: false, pattern: 'hidden', safety: false, pf_days: null, mtbf_y: 8, techniques: [],
        ff_task: T('Change over duty/standby and run under load', 'Перемкнути робочий/резервний і запустити під навантаженням', 'Betriebs-/Reservepumpe umschalten und unter Last fahren', 'Bedrijfs-/reservepomp omschakelen en onder last draaien', 'Permuter service/secours et faire tourner en charge', 'Conmutar servicio/reserva y hacer funcionar en carga', 'Przełączyć pompę roboczą/rezerwową i uruchomić pod obciążeniem') },
      ctx: { costs: { corrective_eur: 1800, downtime_eur_h: 0, mttr_h: 8 }, current: { kind: 'none' } },
      expect: { kind: 'ff' } },
    { id: 'fcu_rtf', site: 'office_12', asset: { id: 'FCU-3F-12', class: 'fcu', serves: 'office' }, cls: 'C',
      label: T('Class C fan coil: run to failure', 'Фанкойл класу C: до відмови', 'Klasse-C-Gebläsekonvektor: bis zum Ausfall', 'Klasse-C-ventilatorconvector: tot falen', 'Ventilo-convecteur classe C : jusqu’à défaillance', 'Fancoil clase C: hasta el fallo', 'Klimakonwektor klasy C: do awarii'),
      aha: T('A vibration route on every fan coil costs far more than the motors it would save. Run-to-failure is a valid RCM decision here, not neglect: keep two spare motors and fix on call.',
        'Віброобхід кожного фанкойла коштує набагато більше, ніж двигуни, які він збереже. Експлуатація до відмови тут — коректне рішення RCM, а не недбалість: тримайте два запасні двигуни і ремонтуйте за викликом.',
        'Eine Schwingungsroute an jedem Gebläsekonvektor kostet weit mehr als die Motoren, die sie retten würde. Betrieb bis zum Ausfall ist hier eine gültige RCM-Entscheidung, keine Vernachlässigung: zwei Ersatzmotoren lagern, auf Abruf tauschen.',
        'Een trillingsronde langs elke ventilatorconvector kost veel meer dan de motoren die hij zou redden. Draaien tot falen is hier een geldige RCM-beslissing, geen verwaarlozing: houd twee reservemotoren en herstel op afroep.',
        'Une tournée vibratoire sur chaque ventilo-convecteur coûte bien plus que les moteurs qu’elle sauverait. Le fonctionnement jusqu’à défaillance est ici une décision RCM valable, pas de la négligence : gardez deux moteurs de rechange et réparez sur appel.',
        'Una ruta de vibraciones en cada fancoil cuesta mucho más que los motores que salvaría. Operar hasta el fallo es aquí una decisión RCM válida, no un descuido: tenga dos motores de repuesto y repare a demanda.',
        'Trasa pomiarów drgań na każdym klimakonwektorze kosztuje znacznie więcej niż silniki, które by uratowała. Eksploatacja do awarii jest tu poprawną decyzją RCM, a nie zaniedbaniem: trzymaj dwa silniki zapasowe i naprawiaj na zgłoszenie.'),
      fm: { id: 'fcu_fan_motor', name: T('Fan motor bearing wear: noise, then stop', 'Знос підшипника двигуна вентилятора: шум, потім зупинка', 'Lagerverschleiß Ventilatormotor: Geräusch, dann Stillstand', 'Lagerslijtage ventilatormotor: geluid, dan stilstand', 'Usure du roulement du moteur : bruit, puis arrêt', 'Desgaste del rodamiento del motor: ruido, luego parada', 'Zużycie łożyska silnika wentylatora: hałas, potem zatrzymanie'),
        evident: true, pattern: 'wearout', safety: false, pf_days: 60, mtbf_y: 12, techniques: ['vibration'],
        time_task: T('Replace fan motor', 'Замінити двигун вентилятора', 'Ventilatormotor tauschen', 'Ventilatormotor vervangen', 'Remplacer le moteur du ventilateur', 'Sustituir el motor del ventilador', 'Wymienić silnik wentylatora') },
      techniques: { vibration: VIB },
      ctx: { costs: { corrective_eur: 450, planned_eur: 300, downtime_eur_h: 0, mttr_h: 3 } },
      expect: { kind: 'rtf' } },
    { id: 'switchboard_redesign', site: 'datacentre_8', asset: { id: 'LV-MSB-1', class: 'lv_switchboard', serves: 'server_room' }, cls: 'A',
      label: T('Switchboard joints, no IR access', 'Контакти щита без доступу для ІЧ', 'Schienenverbindungen ohne IR-Zugang', 'Railverbindingen zonder IR-toegang', 'Jeux de barres sans accès IR', 'Uniones de embarrado sin acceso IR', 'Złącza szyn bez dostępu IR'),
      aha: T('Overheating joints give months of warning, but only if you can see them. With covers that cannot be opened live, no maintenance task reaches the failure mode, and it is a safety one: redesign is compulsory. Tick "Technique has access" (IR windows fitted) and the same failure mode becomes a monthly thermography task.',
        'Перегрів контактів попереджає за місяці, але лише якщо його видно. Якщо кришки не можна знімати під напругою, жодне ТО не досягає цього виду відмови, а він стосується безпеки: зміна проєкту обов’язкова. Позначте «Метод має доступ» (встановлено ІЧ-вікна) — і цей вид відмови стає щомісячною термографією.',
        'Überhitzte Verbindungen warnen Monate vorher, aber nur, wenn man sie sieht. Sind die Abdeckungen unter Spannung nicht zu öffnen, erreicht keine Maßnahme diese Ausfallart, und sie ist sicherheitsrelevant: Änderung zwingend. Mit „Verfahren hat Zugang“ (IR-Fenster eingebaut) wird daraus monatliche Thermografie.',
        'Oververhitte verbindingen waarschuwen maanden vooraf, maar alleen als je ze ziet. Kunnen de kappen niet onder spanning open, dan bereikt geen taak deze faalwijze, en ze raakt de veiligheid: herontwerp verplicht. Vink „Techniek heeft toegang“ aan (IR-vensters aanwezig) en het wordt maandelijkse thermografie.',
        'Les connexions qui chauffent préviennent des mois à l’avance, mais seulement si on les voit. Si les capots ne s’ouvrent pas sous tension, aucune tâche n’atteint ce mode, et il touche la sécurité : reconception obligatoire. Cochez « La technique a accès » (hublots IR installés) et le même mode devient une thermographie mensuelle.',
        'Las uniones que se calientan avisan con meses de antelación, pero solo si se ven. Si las tapas no se pueden abrir en tensión, ninguna tarea llega a este modo de fallo, y es de seguridad: rediseño obligatorio. Marque «La técnica tiene acceso» (ventanas IR instaladas) y pasa a ser una termografía mensual.',
        'Przegrzewające się złącza ostrzegają miesiącami, ale tylko gdy je widać. Gdy osłon nie można zdjąć pod napięciem, żadne zadanie nie sięga tego uszkodzenia, a dotyczy ono bezpieczeństwa: zmiana projektu obowiązkowa. Zaznacz „Metoda ma dostęp” (okna IR zamontowane), a stanie się comiesięczną termowizją.'),
      fm: { id: 'lv_joint_overheat', name: T('Busbar or cable joint overheats: arc fault, fire', 'Перегрів шини або кабельного контакту: дуга, пожежа', 'Schienen- oder Kabelverbindung überhitzt: Lichtbogen, Brand', 'Rail- of kabelverbinding oververhit: vlamboog, brand', 'Échauffement d’une connexion : arc, incendie', 'Sobrecalentamiento de unión: arco, incendio', 'Przegrzanie złącza szyn lub kabla: łuk, pożar'),
        evident: true, pattern: 'random', safety: true, pf_days: 90, mtbf_y: 25, techniques: ['ir_thermography'] },
      techniques: { ir_thermography: { id: 'ir_thermography', pf_fraction: 0.8, cost_per_reading_eur: [150, 250, 400], skill: 'electrician',
        name: T('Infrared thermography', 'Інфрачервона термографія', 'Infrarot-Thermografie', 'Infraroodthermografie', 'Thermographie infrarouge', 'Termografía infrarroja', 'Termowizja w podczerwieni') } },
      ctx: { technique_access: false, costs: { corrective_eur: 40000, downtime_eur_h: 20000, mttr_h: 24 } },
      expect: { kind: 'redesign', compulsory: true } },
    { id: 'sprinkler_statutory', site: 'office_12', asset: { id: 'SPR-PUMP-1', class: 'sprinkler_pump', serves: 'common' }, cls: 'A',
      label: T('Sprinkler pump: law beats the maths', 'Спринклерний насос: закон сильніший за розрахунок', 'Sprinklerpumpe: Recht schlägt Rechnung', 'Sprinklerpomp: de wet wint van de rekensom', 'Pompe sprinkler : la loi l’emporte sur le calcul', 'Bomba de rociadores: la norma gana al cálculo', 'Pompa tryskaczowa: przepis ważniejszy niż rachunek'),
      aha: T('The failure-finding interval for 0.5 % tolerable unavailability comes out near monthly, but EN 12845 asks for a weekly start test. The statutory task stays, and it is the one that sets the interval.',
        'Інтервал виявлення відмов для допустимої неготовності 0,5 % виходить близько місяця, але EN 12845 вимагає щотижневого пробного пуску. Нормативне завдання залишається, і саме воно задає інтервал.',
        'Das Prüfintervall für 0,5 % tragbare Nichtverfügbarkeit liegt bei etwa einem Monat, EN 12845 verlangt aber einen wöchentlichen Probelauf. Die gesetzliche Prüfung bleibt und bestimmt das Intervall.',
        'Het faalzoekinterval voor 0,5 % aanvaardbare onbeschikbaarheid komt rond maandelijks uit, maar EN 12845 vraagt een wekelijkse starttest. De wettelijke taak blijft en bepaalt het interval.',
        'L’intervalle de détection pour 0,5 % d’indisponibilité tolérable sort vers le mois, mais l’EN 12845 exige un essai de démarrage hebdomadaire. La tâche réglementaire reste, et c’est elle qui fixe l’intervalle.',
        'El intervalo de búsqueda de fallos para un 0,5 % de indisponibilidad tolerable sale cercano al mes, pero la EN 12845 pide una prueba de arranque semanal. La tarea normativa se mantiene y es la que fija el intervalo.',
        'Interwał wykrywania uszkodzeń dla dopuszczalnej niegotowości 0,5 % wychodzi około miesiąca, ale EN 12845 wymaga cotygodniowej próby rozruchu. Zadanie ustawowe zostaje i to ono wyznacza interwał.'),
      fm: { id: 'sprinkler_pump_fail_to_start', name: T('Sprinkler pump fails to start on demand', 'Спринклерний насос не запускається на вимогу', 'Sprinklerpumpe startet bei Anforderung nicht', 'Sprinklerpomp start niet bij vraag', 'La pompe sprinkler ne démarre pas à la demande', 'La bomba de rociadores no arranca a demanda', 'Pompa tryskaczowa nie rusza na żądanie'),
        evident: false, pattern: 'hidden', safety: true, pf_days: null, mtbf_y: 10, techniques: [],
        ff_task: T('Automatic start test on pressure drop, run to stable pressure', 'Тест автоматичного пуску від падіння тиску, робота до стабільного тиску', 'Automatischer Starttest durch Druckabfall, Lauf bis stabiler Druck', 'Automatische starttest via drukval, draaien tot stabiele druk', 'Essai de démarrage automatique sur chute de pression, jusqu’à pression stable', 'Prueba de arranque automático por caída de presión, hasta presión estable', 'Próba automatycznego rozruchu spadkiem ciśnienia, praca do ustalenia ciśnienia') },
      ctx: { costs: { corrective_eur: 6000, downtime_eur_h: 0, mttr_h: 24 },
        statutory: [{ id: 'sprinkler_weekly', interval_months: 12 / 52, source: 'en12845',
          name: T('Weekly sprinkler pump start test (EN 12845)', 'Щотижневий пробний пуск спринклерного насоса (EN 12845)', 'Wöchentlicher Probelauf der Sprinklerpumpe (EN 12845)', 'Wekelijkse starttest sprinklerpomp (EN 12845)', 'Essai hebdomadaire de démarrage de la pompe sprinkler (EN 12845)', 'Prueba semanal de arranque de la bomba de rociadores (EN 12845)', 'Cotygodniowa próba rozruchu pompy tryskaczowej (EN 12845)') }] },
      expect: { kind: 'ff', statute_governs: true } },
    { id: 'ups_battery', site: 'datacentre_8', asset: { id: 'UPS-A', class: 'ups', serves: 'server_room' }, cls: 'A',
      label: T('UPS battery: hidden, yet monitorable', 'Батарея ДБЖ: прихована, але контрольована', 'USV-Batterie: verdeckt und doch überwachbar', 'UPS-batterij: verborgen en toch te bewaken', 'Batterie d’onduleur : cachée mais surveillable', 'Batería del SAI: oculta pero vigilable', 'Bateria UPS: ukryta, a jednak monitorowalna'),
      aha: T('A fading battery string is invisible until the mains fails, so the function is hidden. But internal-resistance readings show the fade months ahead, so RCM picks a condition task before any failure-finding test.',
        'Деградація батарейного ланцюга невидима до зникнення мережі, тож функція прихована. Але вимірювання внутрішнього опору показують деградацію за місяці, тож RCM обирає контроль стану раніше за тест виявлення відмови.',
        'Ein nachlassender Batteriestrang bleibt unsichtbar, bis das Netz ausfällt: die Funktion ist verdeckt. Innenwiderstandsmessungen zeigen das Nachlassen aber Monate vorher, also wählt RCM eine zustandsorientierte Maßnahme vor jeder Funktionsprüfung.',
        'Een verzwakkende batterijstreng blijft onzichtbaar tot het net uitvalt: de functie is verborgen. Inwendige-weerstandsmetingen tonen de achteruitgang maanden vooraf, dus kiest RCM een toestandstaak vóór een faalzoektest.',
        'Une chaîne de batteries qui faiblit reste invisible jusqu’à la coupure secteur : la fonction est cachée. Mais la mesure de résistance interne montre la dérive des mois à l’avance, donc la RCM choisit une tâche conditionnelle avant tout test de détection.',
        'Una cadena de baterías que se degrada es invisible hasta que falla la red: la función es oculta. Pero la medida de resistencia interna muestra la degradación meses antes, así que RCM elige una tarea según condición antes que una prueba de búsqueda de fallos.',
        'Słabnący łańcuch baterii jest niewidoczny do zaniku sieci, więc funkcja jest ukryta. Pomiar rezystancji wewnętrznej pokazuje jednak spadek z wyprzedzeniem miesięcy, więc RCM wybiera zadanie według stanu przed testem wykrywania uszkodzeń.'),
      fm: { id: 'ups_battery_capacity', name: T('Battery string loses capacity: no autonomy on mains failure', 'Батарейний ланцюг втрачає ємність: немає автономії при зникненні мережі', 'Batteriestrang verliert Kapazität: keine Überbrückung bei Netzausfall', 'Batterijstreng verliest capaciteit: geen autonomie bij netuitval', 'La chaîne perd sa capacité : pas d’autonomie à la coupure', 'La cadena pierde capacidad: sin autonomía al fallar la red', 'Łańcuch baterii traci pojemność: brak podtrzymania przy zaniku sieci'),
        evident: false, pattern: 'wearout', safety: false, pf_days: 180, mtbf_y: 5, techniques: ['battery_impedance'],
        ff_task: T('Discharge test of the battery string', 'Розрядний тест батарейного ланцюга', 'Entladetest des Batteriestrangs', 'Ontlaadtest van de batterijstreng', 'Essai de décharge de la chaîne', 'Prueba de descarga de la cadena', 'Próba rozładowania łańcucha baterii') },
      techniques: { battery_impedance: { id: 'battery_impedance', pf_fraction: 0.8, cost_per_reading_eur: [100, 150, 250], skill: 'electrician',
        name: T('Battery internal resistance', 'Внутрішній опір батареї', 'Batterie-Innenwiderstand', 'Inwendige weerstand batterij', 'Résistance interne de batterie', 'Resistencia interna de batería', 'Rezystancja wewnętrzna baterii') } },
      ctx: { costs: { corrective_eur: 8000, planned_eur: 4800, downtime_eur_h: 20000, mttr_h: 2 } },
      expect: { kind: 'cbm' } },
    { id: 'chiller_pf', site: 'datacentre_8', asset: { id: 'CH-01', class: 'chiller_water', serves: 'server_room' }, cls: 'A',
      label: T('Chiller bearing: P–F and the route interval', 'Підшипник чилера: P–F та інтервал обходу', 'Kältemaschinenlager: P–F und Rundgangintervall', 'Koelmachinelager: P–F en ronde-interval', 'Roulement de groupe froid : P–F et intervalle de tournée', 'Rodamiento de enfriadora: P–F e intervalo de ruta', 'Łożysko agregatu: P–F i interwał obchodu'),
      aha: T('With 84 usable days of P–F a monthly vibration reading catches 99 % of bearing defects in time. Stretch the route to quarterly and about one defect in five reaches failure first. Move the inspection interval and watch the P–F chart.',
        'При 84 корисних добах P–F щомісячний вібровимір вчасно виявляє 99 % дефектів підшипника. Розтягніть обхід до щоквартального — і приблизно кожен п’ятий дефект першим дійде до відмови. Змініть інтервал огляду й стежте за діаграмою P–F.',
        'Bei 84 nutzbaren Tagen P–F erkennt eine monatliche Schwingungsmessung 99 % der Lagerschäden rechtzeitig. Auf quartalsweise gestreckt, erreicht etwa jeder fünfte Schaden zuerst den Ausfall. Ändern Sie das Prüfintervall und beobachten Sie das P–F-Diagramm.',
        'Met 84 bruikbare dagen P–F vangt een maandelijkse trillingsmeting 99 % van de lagerdefecten op tijd. Rek de ronde op tot elk kwartaal en ongeveer één op vijf defecten bereikt eerst het falen. Verander het inspectie-interval en kijk naar de P–F-grafiek.',
        'Avec 84 jours utiles de P–F, une mesure vibratoire mensuelle détecte à temps 99 % des défauts de roulement. Passez la tournée au trimestre et environ un défaut sur cinq atteint la panne d’abord. Modifiez l’intervalle d’inspection et regardez le graphique P–F.',
        'Con 84 días útiles de P–F una medida de vibración mensual detecta a tiempo el 99 % de los defectos de rodamiento. Alargue la ruta a trimestral y uno de cada cinco defectos llega antes al fallo. Cambie el intervalo de inspección y observe el gráfico P–F.',
        'Przy 84 użytecznych dniach P–F comiesięczny pomiar drgań wykrywa na czas 99 % uszkodzeń łożysk. Wydłuż obchód do kwartału, a mniej więcej co piąte uszkodzenie najpierw doprowadzi do awarii. Zmień interwał inspekcji i obserwuj wykres P–F.'),
      fm: { id: 'chiller_compressor_bearing', name: T('Compressor bearing degradation', 'Деградація підшипника компресора', 'Verschleiß des Verdichterlagers', 'Degradatie compressorlager', 'Dégradation du roulement de compresseur', 'Degradación del rodamiento del compresor', 'Degradacja łożyska sprężarki'),
        evident: true, pattern: 'random', safety: false, pf_days: 120, mtbf_y: 15, techniques: ['vibration'] },
      techniques: { vibration: VIB },
      ctx: { costs: { corrective_eur: 45000, planned_eur: 18000, downtime_eur_h: 2000, mttr_h: 72 } },
      expect: { kind: 'cbm', interval_days: 30 } }
  ];
  function presetCtx(p, lang, over) {
    var c = JSON.parse(JSON.stringify(p.ctx || {}));
    if (p.ctx && p.ctx.statutory) {
      /* QA-20: a preset statute is the core's entry when the core is loaded (same id, name, interval, source) */
      var core = (typeof globalThis !== 'undefined' && globalThis.MEPCore && globalThis.MEPCore.STATUTORY) || null;
      c.statutory = p.ctx.statutory.map(function (st) { return core && core[st.id] ? Object.assign({}, core[st.id], st) : st; });
    }
    c.cls = p.cls; c.techniques = p.techniques || {}; c.lang = lang || 'en';
    return Object.assign(c, over || {});
  }
  function runPreset(id, over, lang) {
    var p = null; PRESETS.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return null;
    return decide(p.asset, p.fm, presetCtx(p, lang, over));
  }

  /* ------------------------------------------------------------- csv rows */
  function csvRows(tasks, lang) {
    return (tasks || []).map(function (t) {
      return { asset_id: t.asset_id, fm_id: t.fm_id || '', kind: t.kind, task: tr(t.task, lang || 'en'),
        interval_days: t.interval_days == null ? '' : (t.interval_days < 1 ? 'continuous' : t.interval_days),
        trade: t.trade || '', hours: t.hours, basis: t.basis || '', sources: (t.sources || []).join(' ') };
    });
  }
  var CSV_COLS = ['asset_id', 'fm_id', 'kind', 'task', 'interval_days', 'trade', 'hours', 'basis', 'sources'];

  return {
    PRESETS: PRESETS, presetCtx: presetCtx, FF_MIN_DAYS: FF_MIN_DAYS, textFitsInterval: textFitsInterval, runPreset: runPreset, STAT_COVERS: STAT_COVERS, statCovers: statCovers,
    VERSION: VERSION, U_TOL: U_TOL, RESPONSE_DAYS: RESPONSE_DAYS, DEFAULTS: DEFAULTS, ASSUMPTIONS: ASSUMPTIONS, SOURCES: SOURCES,
    decide: decide, plan: plan, classOf: classOf, csvRows: csvRows, CSV_COLS: CSV_COLS,
    pCatch: pCatch, pfTimeline: pfTimeline, ffiApprox: ffiApprox, ffiExact: ffiExact, unavailExact: unavailExact,
    unavailApprox: unavailApprox, pFailedNow: pFailedNow, ageReplacement: ageReplacement, ageCostRate: ageCostRate,
    weibullEta: weibullEta, safeLife: safeLife, gamma: gammaFn, practical: practical, taskText: taskText, everyText: everyText
  };
});
