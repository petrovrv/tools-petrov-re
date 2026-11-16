/* mep-planner.js — MEP Maintenance Planner engine (MEPPlan). tools.petrov.re, mep-maintenance package.
   Tasks -> calendar of the ISO year (52 or 53 weeks, QA-1): occurrences on a fixed nominal grid (anchor + k·interval, round(H/interval) per year,
   wrapping over the year end because the yearly plan repeats), each work order may move
   within its tolerance window (±10 % of the interval by default; statutory tasks ±0 = never moved by levelling, D-MEP-5),
   season / shutdown windows, visit grouping (tasks of one asset/location and one trade in one week = one visit),
   levelling against the hours of each trade, conflicts, budget, CMMS CSV.
   Pure functions, no DOM, deterministic. UMD: global MEPPlan, module.exports for node.
   Optional dependency: MEPCore (mep-core.js) for class routines, statutory tasks, trade rates and CSV escaping. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MEPPlan = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
'use strict';

var VERSION = '1.1.0';
var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
var H = 52; /* planning horizon in weeks = ISO weeks of the plan year (52 or 53); set by calendar()/schedule() */
function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }
function core() {
  if (root && root.MEPCore) return root.MEPCore;
  if (typeof require === 'function') { try { return require('./mep-core.js'); } catch (e) { /* standalone */ } }
  return null;
}
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function r2(x) { return Math.round(x * 100) / 100; }

/* ---------------------------------------------------------------- defaults (learning assumptions, editable) */
var DEFAULTS = {
  year: 2026, start_week: 1,
  tolerance: 0.10,            /* ±10 % of the interval per work order (CMMS practice; PLAN §2) */
  statutory_tolerance: 0,     /* statutory tasks are not moved */
  group_by: 'asset',          /* 'asset' | 'location' | 'none' */
  travel_h: 0.5,              /* set-up / travel / permit time per visit and trade */
  materials_pct: 15,          /* materials as % of labour when a task has no materials_eur */
  vendor_trades: ['specialist_vendor'],
  vendor_callout_eur: 150,    /* call-out fee per vendor visit */
  labour_rate_eur_h: 75,
  seasons: { heating: { from: 40, to: 17 }, cooling: { from: 18, to: 39 } }, /* ISO weeks, central/NW Europe */
  pre_season_weeks: 6,
  shutdowns: [],              /* [{id, from, to, label}] ISO weeks, inclusive */
  blackout: [],               /* ISO weeks without planned routine work (holidays) */
  capacity_h_week: {},        /* trade -> in-house hours per week; missing = unlimited (vendor) */
  level: true, rounds: 6, rebaseline: false
};
var ASSUMPTIONS = [
  { id: 'tolerance', value: DEFAULTS.tolerance, kind: 'learning_assumption', note: 'work-order window ±10 % of the interval (CMMS practice)' },
  { id: 'travel_h', value: DEFAULTS.travel_h, kind: 'learning_assumption', note: 'set-up/travel/permit hours per visit' },
  { id: 'materials_pct', value: DEFAULTS.materials_pct, kind: 'learning_assumption', note: 'materials as share of labour' },
  { id: 'vendor_callout_eur', value: DEFAULTS.vendor_callout_eur, kind: 'learning_assumption', note: 'vendor call-out fee per visit' },
  { id: 'seasons', value: DEFAULTS.seasons, kind: 'learning_assumption', note: 'heating Oct–Apr, cooling May–Sep (central/NW Europe); set your own' },
  { id: 'routines', value: 'ROUTINES', kind: 'learning_assumption', note: 'baseline routine intervals and hours per class; typical checklist frequencies as in US DOE O&M Best Practices Guide R3 ch. 9; replace with your strategy results or manufacturer schedules' }
];
var SOURCES = {
  la_plan: { title: 'Learning assumption of the planner (engineering judgement; replace with site data)', edition: 'mep-planner ' + VERSION, url: '', kind: 'learning_assumption' },
  doe_om_r3: { title: 'US DOE FEMP, Operations & Maintenance Best Practices Guide, Release 3.0, chapter 9 (equipment checklists)', edition: '2010', url: 'https://www.energy.gov/femp/articles/operations-and-maintenance-best-practices-guide', kind: 'public_guide' },
  en13306: { title: 'EN 13306 Maintenance — Maintenance terminology (preventive, scheduled, condition-based maintenance)', edition: '2017', url: '', kind: 'standard' },
  en13460: { title: 'EN 13460 Maintenance — Documentation for maintenance (work orders, schedules)', edition: '2009', url: '', kind: 'standard' }
};

/* ---------------------------------------------------------------- calendar (ISO 8601 weeks, UTC) */
function isoWeek1Monday(year) {
  var j4 = Date.UTC(year, 0, 4), wd = new Date(j4).getUTCDay() || 7;
  return j4 - (wd - 1) * 86400000;
}
function isoWeeksInYear(year) {
  var d = new Date(Date.UTC(year, 11, 28)); return isoWeekOf(d.getTime()).week;
}
function isoWeekOf(ms) {
  var d = new Date(ms), wd = d.getUTCDay() || 7;
  var th = ms + (4 - wd) * 86400000, y = new Date(th).getUTCFullYear();
  return { year: y, week: Math.floor((th - isoWeek1Monday(y)) / 604800000) + 1 };
}
function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var p = s.split('-').map(Number), ms = Date.UTC(p[0], p[1] - 1, p[2]);
  return isFinite(ms) && new Date(ms).getUTCDate() === p[2] ? ms : null;
}
function calendar(year, startWeek) {
  /* one ISO year of slots from the start week: weeks start_week..last of year, then 1..start_week-1 of the next year */
  var n = isoWeeksInYear(year), m0 = isoWeek1Monday(year) + ((startWeek || 1) - 1) * 604800000, out = [];
  for (var s = 0; s < n; s++) {
    var ms = m0 + s * 604800000, iw = isoWeekOf(ms);
    out.push({ slot: s, iso_year: iw.year, iso_week: iw.week, monday: ymd(ms), ms: ms, month: new Date(ms + 3 * 86400000).getUTCMonth() + 1 });
  }
  return out;
}
/* inclusive ISO-week range, may wrap over the year end (from 40 to 17) */
function inRange(w, r) { if (!r) return false; var a = r.from, b = r.to; return a <= b ? (w >= a && w <= b) : (w >= a || w <= b); }

/* ---------------------------------------------------------------- planner baseline routines per class (learning assumptions) */
var RN = {
  insp_m: L('Monthly inspection round', 'Щомісячний обхід-огляд', 'Monatlicher Kontrollgang', 'Maandelijkse inspectieronde', 'Ronde d’inspection mensuelle', 'Ronda de inspección mensual', 'Comiesięczny obchód kontrolny'),
  insp_q: L('Quarterly inspection (PPM)', 'Щоквартальний огляд (ППО)', 'Vierteljährliche Inspektion', 'Driemaandelijkse inspectie', 'Inspection trimestrielle', 'Inspección trimestral', 'Przegląd kwartalny'),
  service_6m: L('Six-monthly service', 'Обслуговування раз на пів року', 'Halbjährliche Wartung', 'Halfjaarlijks onderhoud', 'Entretien semestriel', 'Mantenimiento semestral', 'Konserwacja półroczna'),
  service_a: L('Annual service', 'Щорічне обслуговування', 'Jährliche Wartung', 'Jaarlijks onderhoud', 'Entretien annuel', 'Mantenimiento anual', 'Konserwacja roczna'),
  filters: L('Filter change', 'Заміна фільтрів', 'Filterwechsel', 'Filters vervangen', 'Remplacement des filtres', 'Cambio de filtros', 'Wymiana filtrów'),
  chiller_major: L('Annual chiller service (plant off-load: in the heating season)', 'Щорічне обслуговування чилера (без навантаження: в опалювальний сезон)', 'Jährliche Kältemaschinenwartung (ohne Last: in der Heizperiode)', 'Jaarlijks onderhoud koelmachine (zonder last: in het stookseizoen)', 'Entretien annuel du groupe froid (hors charge : en saison de chauffe)', 'Mantenimiento anual de la enfriadora (sin carga: en temporada de calefacción)', 'Roczny serwis agregatu (bez obciążenia: w sezonie grzewczym)'),
  boiler_major: L('Annual boiler service and combustion check (outside the heating season)', 'Щорічне обслуговування котла і перевірка горіння (поза опалювальним сезоном)', 'Jährliche Kesselwartung und Abgasmessung (außerhalb der Heizperiode)', 'Jaarlijks ketelonderhoud en verbrandingscontrole (buiten het stookseizoen)', 'Entretien annuel chaudière et contrôle de combustion (hors saison de chauffe)', 'Mantenimiento anual de caldera y análisis de combustión (fuera de la temporada de calefacción)', 'Roczny serwis kotła i kontrola spalania (poza sezonem grzewczym)'),
  pre_cooling: L('Pre-season start-up check before cooling', 'Перевірка перед запуском у сезон охолодження', 'Inbetriebnahmeprüfung vor der Kühlperiode', 'Opstartcontrole vóór het koelseizoen', 'Contrôle de remise en service avant la saison de froid', 'Revisión de puesta en marcha antes de la temporada de frío', 'Kontrola rozruchu przed sezonem chłodzenia'),
  pre_heating: L('Pre-season frost protection and heating start-up check', 'Перевірка захисту від замерзання і запуску перед опалювальним сезоном', 'Frostschutz- und Inbetriebnahmeprüfung vor der Heizperiode', 'Vorstbeveiliging en opstartcontrole vóór het stookseizoen', 'Contrôle antigel et remise en route avant la saison de chauffe', 'Revisión antihielo y de puesta en marcha antes de la calefacción', 'Kontrola ochrony przeciwzamrożeniowej i rozruchu przed sezonem grzewczym'),
  ir_load: L('Infrared thermography under load (not in a shutdown)', 'Тепловізійний контроль під навантаженням (не під час зупинки)', 'Thermografie unter Last (nicht im Stillstand)', 'Thermografie onder belasting (niet tijdens stilstand)', 'Thermographie en charge (pas pendant un arrêt)', 'Termografía en carga (no durante una parada)', 'Termowizja pod obciążeniem (nie w czasie postoju)'),
  shutdown_service: L('Shutdown service: clean, torque-check, test protection', 'Обслуговування під час зупинки: очищення, протяжка, перевірка захистів', 'Wartung im Stillstand: reinigen, Anzugsmomente prüfen, Schutz prüfen', 'Onderhoud bij stilstand: reinigen, aanhaalmomenten controleren, beveiliging testen', 'Entretien à l’arrêt : nettoyage, serrage au couple, essai des protections', 'Mantenimiento en parada: limpieza, apriete, prueba de protecciones', 'Serwis w czasie postoju: czyszczenie, dokręcenie, próba zabezpieczeń'),
  battery: L('Battery inspection and discharge test', 'Огляд акумуляторів і розрядний тест', 'Batterieinspektion und Entladetest', 'Accu-inspectie en ontlaadtest', 'Inspection batteries et essai de décharge', 'Inspección de baterías y prueba de descarga', 'Przegląd akumulatorów i próba rozładowania'),
  ff_test: L('Function test of the protective / standby function', 'Функціональна перевірка захисної / резервної функції', 'Funktionsprüfung der Schutz- / Reservefunktion', 'Functietest van de beveiligings- / reservefunctie', 'Essai de la fonction de protection / secours', 'Prueba de la función de protección / reserva', 'Próba funkcji zabezpieczającej / rezerwowej')
};
/* r(id, name key, interval days, trade, hours, constraint) */
function r(id, name, days, trade, hours, constraint) { return { id: id, name: name, interval_days: days, trade: trade, hours: hours, constraint: constraint || null }; }
var ROUTINES = {
  ahu: [r('insp_q', 'insp_q', 91, 'hvac_mech', 2), r('filters', 'filters', 182, 'hvac_mech', 1.5), r('pre_heating', 'pre_heating', 365, 'controls', 1.5, 'pre_heating'), r('service_a', 'service_a', 365, 'hvac_mech', 6)],
  fan: [r('insp_q', 'insp_q', 91, 'hvac_mech', 1), r('service_a', 'service_a', 365, 'hvac_mech', 3)],
  pump: [r('insp_q', 'insp_q', 91, 'hvac_mech', 1), r('service_a', 'service_a', 365, 'hvac_mech', 3)],
  chiller_air: [r('insp_q', 'insp_q', 91, 'hvac_mech', 2), r('pre_cooling', 'pre_cooling', 365, 'hvac_mech', 3, 'pre_cooling'), r('chiller_major', 'chiller_major', 365, 'specialist_vendor', 8, 'not_cooling')],
  chiller_water: [r('insp_q', 'insp_q', 91, 'hvac_mech', 2), r('pre_cooling', 'pre_cooling', 365, 'hvac_mech', 3, 'pre_cooling'), r('chiller_major', 'chiller_major', 365, 'specialist_vendor', 12, 'not_cooling')],
  cooling_tower: [r('insp_m', 'insp_m', 30, 'hvac_mech', 1), r('pre_cooling', 'pre_cooling', 365, 'hvac_mech', 3, 'pre_cooling')], /* clean/disinfect, sampling: statutory (MEPCore) */
  boiler_gas: [r('insp_q', 'insp_q', 91, 'hvac_mech', 1.5), r('boiler_major', 'boiler_major', 365, 'specialist_vendor', 6, 'not_heating'), r('pre_heating', 'pre_heating', 365, 'hvac_mech', 2, 'pre_heating')],
  heat_pump: [r('insp_q', 'insp_q', 91, 'hvac_mech', 1.5), r('service_a', 'service_a', 365, 'specialist_vendor', 5)],
  vrf: [r('service_6m', 'service_6m', 182, 'hvac_mech', 4), r('service_a', 'service_a', 365, 'specialist_vendor', 6)],
  fcu: [r('filters', 'filters', 182, 'hvac_mech', 4), r('service_a', 'service_a', 365, 'hvac_mech', 8)],
  dhw_calorifier: [r('insp_q', 'insp_q', 91, 'plumber', 1)],
  water_booster: [r('insp_q', 'insp_q', 91, 'plumber', 1), r('service_a', 'service_a', 365, 'plumber', 3)],
  sprinkler_pump: [], /* weekly start test and annual flow test are statutory (MEPCore) */
  fire_alarm: [],     /* weekly test and six-monthly service are statutory (MEPCore) */
  emergency_lighting: [],
  ups: [r('insp_q', 'insp_q', 91, 'electrician', 1), r('battery', 'battery', 365, 'specialist_vendor', 4)],
  generator: [r('service_a', 'service_a', 365, 'specialist_vendor', 6)],
  lv_switchboard: [r('ir_load', 'ir_load', 365, 'electrician', 3, 'not_shutdown'), r('shutdown_service', 'shutdown_service', 365, 'electrician', 8, 'shutdown')],
  transformer: [r('insp_q', 'insp_q', 91, 'electrician', 0.5), r('ir_load', 'ir_load', 365, 'electrician', 2, 'not_shutdown')],
  bms_controller: [r('service_6m', 'service_6m', 182, 'controls', 2)],
  lift: [r('insp_m', 'insp_m', 30, 'specialist_vendor', 1.5)]
};
var CONSTRAINTS = ['not_heating', 'not_cooling', 'pre_heating', 'pre_cooling', 'shutdown', 'not_shutdown'];

/* ---------------------------------------------------------------- task normalisation */
function tr(v, lang) { if (v == null) return ''; if (typeof v === 'string') return v; return v[lang] || v.en || ''; }
function normaliseTask(t, i) {
  var errs = [];
  if (!t || typeof t !== 'object') return { errors: ['not_object'] };
  var interval = num(t.interval_days, null), months = num(t.interval_months, null), continuous = false;
  if (interval == null && months != null) interval = months * 365.25 / 12;
  /* interval below one day = continuous logging (BMS / online sensor, MEPStrat convention): the scheduled human work is the
     trend review, monthly unless the task gives review_interval_days */
  if (interval != null && interval > 0 && interval < 1) {
    continuous = true;
    var rv = num(t.review_interval_days, null);
    if (rv != null && rv >= 1) { interval = rv; months = null; } else { interval = 365.25 / 12; months = 1; }
  }
  if (interval == null || interval <= 0) errs.push('interval');
  var hours = num(t.hours, null);
  if (hours == null || hours < 0) errs.push('hours');
  var trade = typeof t.trade === 'string' && t.trade ? t.trade : null;
  if (!trade) errs.push('trade');
  if (t.kind === 'rtf' || t.kind === 'redesign') errs.push('not_scheduled_' + t.kind);
  var statutory = t.kind === 'statutory' || !!t.statutory_id;
  var c = t.constraint || t.season || t.requires || null;
  if (c && CONSTRAINTS.indexOf(c) < 0) c = null;
  return {
    errors: errs,
    task: {
      id: t.id != null ? String(t.id) : 'T' + (i + 1), index: i, asset_id: t.asset_id != null ? String(t.asset_id) : '', fm_id: t.fm_id || null,
      kind: t.kind || (statutory ? 'statutory' : 'time'), name: t.task != null ? t.task : (t.name != null ? t.name : ''),
      interval_days: interval, interval_months: months, interval_w: interval != null ? (months != null && months >= 1 ? months * H / 12 : interval / 7) : null, /* calendar months (≥ 1) on the year grid; shorter statutes (weekly, 7 d) by days so they fall in every ISO week */
      trade: trade, hours: hours, statutory: statutory, statutory_id: t.statutory_id || null,
      constraint: c, allowed_weeks: Array.isArray(t.allowed_weeks) ? t.allowed_weeks : null,
      due_week: num(t.due_week, null), last_done: typeof t.last_done === 'string' ? t.last_done : null,
      tolerance_days: num(t.tolerance_days, null), materials_eur: num(t.materials_eur, null),
      location: typeof t.location === 'string' ? t.location : '', basis: t.basis || '', sources: Array.isArray(t.sources) ? t.sources : [],
      origin: t.origin || 'input', routine: t.routine || null, covers: t.covers || null, continuous: continuous
    }
  };
}

/* ---------------------------------------------------------------- allowed weeks per task */
function allowedSlots(task, cal, o) {
  var ok = [], seasons = o.seasons || DEFAULTS.seasons, pre = o.pre_season_weeks;
  var inShut = function (w) { return o.shutdowns.some(function (s) { return inRange(w, s); }); };
  var preRange = function (season) { if (!season) return null; var f = season.from - pre; if (f < 1) f += H; var t = season.from - 1; if (t < 1) t += H; return { from: f, to: t }; };
  for (var s = 0; s < H; s++) {
    var w = cal[s].iso_week, good = true;
    switch (task.constraint) {
      case 'not_heating': good = !inRange(w, seasons.heating); break;
      case 'not_cooling': good = !inRange(w, seasons.cooling); break;
      case 'pre_heating': good = inRange(w, preRange(seasons.heating)); break;
      case 'pre_cooling': good = inRange(w, preRange(seasons.cooling)); break;
      case 'shutdown': good = inShut(w); break;
      case 'not_shutdown': good = !inShut(w); break;
      default: break;
    }
    if (good && task.allowed_weeks) good = task.allowed_weeks.some(function (rg) { return Array.isArray(rg) ? inRange(w, { from: rg[0], to: rg[1] }) : rg === w; });
    if (good && !task.statutory && o.blackout.indexOf(w) >= 0) good = false;
    ok.push(good);
  }
  return ok;
}

/* ---------------------------------------------------------------- series (nominal grid of one task) */
function slotOfIsoWeek(cal, w) { for (var s = 0; s < H; s++) if (cal[s].iso_week === w) return s; return null; }
function buildSeries(task, cal, o, conflicts) {
  var Iw = task.interval_w, sub = task.interval_days < 7;
  var tolFrac = task.statutory ? o.statutory_tolerance : o.tolerance;
  var tolW = task.tolerance_days != null ? Math.floor(task.tolerance_days / 7 + 1e-9) : Math.floor(tolFrac * Iw + 1e-9);
  if (task.statutory && task.tolerance_days == null) tolW = Math.floor(o.statutory_tolerance * Iw + 1e-9);
  var allowed = allowedSlots(task, cal, o), anyAllowed = allowed.some(Boolean);
  if (!anyAllowed && task.constraint === 'shutdown' && !o.shutdowns.length) { conflicts.push({ code: 'no_shutdown_window', severity: 'warn', task_id: task.id, asset_id: task.asset_id, constraint: task.constraint }); allowed = allowed.map(function () { return true; }); }
  else if (!anyAllowed) { conflicts.push({ code: 'no_allowed_week', severity: 'error', task_id: task.id, asset_id: task.asset_id, constraint: task.constraint }); allowed = allowed.map(function () { return true; }); }
  var ser = { task: task, Iw: Iw, tolW: sub ? 0 : tolW, allowed: allowed, sub: sub, fixed: false, phase: null, phases: [], multi: Iw > H + 1.5, dated: false };
  /* anchor from due week or last done date */
  var anchor = null;
  if (task.due_week != null) { anchor = slotOfIsoWeek(cal, task.due_week); if (anchor == null) conflicts.push({ code: 'due_outside_horizon', severity: 'info', task_id: task.id, asset_id: task.asset_id, iso_week: task.due_week }); }
  else if (task.last_done) {
    var ld = parseDate(task.last_done);
    if (ld == null) conflicts.push({ code: 'bad_date', severity: 'warn', task_id: task.id, asset_id: task.asset_id });
    else {
      var dueMs = ld + task.interval_days * 86400000, rel = (dueMs - cal[0].ms) / 604800000;
      if (rel < -0.5) { conflicts.push({ code: 'overdue', severity: 'error', task_id: task.id, asset_id: task.asset_id, due: ymd(dueMs) }); anchor = 0; }
      else if (rel > H - 0.5) { anchor = null; ser.notDue = true; conflicts.push({ code: 'not_due_in_horizon', severity: 'info', task_id: task.id, asset_id: task.asset_id, due: ymd(dueMs) }); }
      else anchor = Math.round(rel);
    }
  }
  if (task.continuous) conflicts.push({ code: 'continuous_review', severity: 'info', task_id: task.id, asset_id: task.asset_id, interval_days: Math.round(task.interval_days * 100) / 100 });
  if (sub) { conflicts.push({ code: 'sub_weekly', severity: 'warn', task_id: task.id, asset_id: task.asset_id, interval_days: task.interval_days }); ser.fixed = true; ser.phase = 0; return ser; }
  if (ser.notDue) { ser.fixed = true; ser.phase = null; return ser; }
  if (anchor != null) {
    ser.fixed = true; ser.dated = true;
    /* back-fill earlier occurrences of the grid inside the horizon */
    var p = anchor; while (p - Iw > -0.5 - 1e-9) p -= Iw;
    ser.phase = p;
    var miss = nominals(ser, p).filter(function (n) { return !candidates(ser, n).length; });
    if (!(miss.length && o.rebaseline && !task.statutory)) return ser;
    /* re-baseline once: the anniversary cannot reach the window within tolerance -> the leveller picks a new week inside the window */
    ser.rebase = { code: 'rebaselined', severity: 'info', task_id: task.id, asset_id: task.asset_id, constraint: task.constraint, nominal_iso_week: cal[miss[0]].iso_week, old_slot: miss[0] };
    conflicts.push(ser.rebase);
    ser.fixed = false; ser.dated = false; ser.phase = null; ser.rebaselined = true;
  }
  if (task.statutory && !ser.multi && Iw > 4.5) conflicts.push({ code: 'statutory_undated', severity: 'warn', task_id: task.id, asset_id: task.asset_id, interval_days: task.interval_days });
  if (ser.multi) {
    conflicts.push({ code: 'undated_multi_year', severity: 'warn', task_id: task.id, asset_id: task.asset_id, interval_days: task.interval_days });
  }
  var nP = Math.max(1, Math.min(H, Math.ceil(Iw - 1e-9)));
  for (var k = 0; k < nP; k++) ser.phases.push(k);
  return ser;
}
function nominals(ser, phase) {
  var out = [];
  if (ser.sub) { for (var s = 0; s < H; s++) out.push(s); return out; }
  if (phase == null) return out;
  if (ser.multi) { var x = Math.round(phase); if (x >= 0 && x < H) out.push(x); return out; }
  /* cyclic year: a fixed number of work orders per year, positions wrap (the 52-week plan repeats) */
  var cnt = Math.max(1, Math.round(H / ser.Iw));
  for (var k = 0; k < cnt; k++) { var n = ((Math.round(phase + k * ser.Iw + 1e-9) % H) + H) % H; if (out.indexOf(n) < 0) out.push(n); }
  return out;
}
function candidates(ser, n) {
  var c = [];
  for (var d = 0; d <= ser.tolW; d++) {
    [n - d, n + d].forEach(function (s, j) { if (j === 1 && d === 0) return; if (s >= 0 && s < H && ser.allowed[s] && c.indexOf(s) < 0) c.push(s); });
  }
  return c; /* ordered by distance from the nominal week, earlier first */
}
function nearestAllowed(ser, n) {
  for (var d = 0; d < H; d++) { if (n - d >= 0 && ser.allowed[n - d]) return n - d; if (n + d < H && ser.allowed[n + d]) return n + d; }
  return n;
}

/* ---------------------------------------------------------------- the scheduler */
function resolveOpts(opts) {
  opts = opts || {};
  var o = {};
  Object.keys(DEFAULTS).forEach(function (k) { o[k] = opts[k] !== undefined ? clone(opts[k]) : clone(DEFAULTS[k]); });
  o.year = Math.round(num(o.year, DEFAULTS.year)); if (o.year < 1990 || o.year > 2200) o.year = DEFAULTS.year;
  o.start_week = Math.round(num(o.start_week, 1)); if (o.start_week < 1 || o.start_week > isoWeeksInYear(o.year)) o.start_week = 1;
  o.tolerance = Math.min(0.5, Math.max(0, num(o.tolerance, DEFAULTS.tolerance)));
  o.statutory_tolerance = Math.min(0.5, Math.max(0, num(o.statutory_tolerance, 0)));
  o.travel_h = Math.max(0, num(o.travel_h, DEFAULTS.travel_h));
  o.materials_pct = Math.max(0, num(o.materials_pct, DEFAULTS.materials_pct));
  o.vendor_callout_eur = Math.max(0, num(o.vendor_callout_eur, DEFAULTS.vendor_callout_eur));
  o.pre_season_weeks = Math.max(1, Math.min(20, Math.round(num(o.pre_season_weeks, 6))));
  o.rounds = Math.max(0, Math.min(20, Math.round(num(o.rounds, 6))));
  if (['asset', 'location', 'none'].indexOf(o.group_by) < 0) o.group_by = 'asset';
  if (!Array.isArray(o.shutdowns)) o.shutdowns = [];
  o.shutdowns = o.shutdowns.filter(function (s) { return s && isFinite(s.from) && isFinite(s.to); }).map(function (s) { return { id: s.id || '', from: Math.round(s.from), to: Math.round(s.to), label: s.label || '' }; });
  if (!Array.isArray(o.blackout)) o.blackout = [];
  o.blackout = o.blackout.filter(function (w) { return isFinite(w); }).map(Math.round);
  if (!o.capacity_h_week || typeof o.capacity_h_week !== 'object') o.capacity_h_week = {};
  o.rates = opts.rates && typeof opts.rates === 'object' ? clone(opts.rates) : {};
  o.labour_rate_eur_h = Math.max(0, num(o.labour_rate_eur_h, DEFAULTS.labour_rate_eur_h));
  if (!Array.isArray(o.vendor_trades)) o.vendor_trades = DEFAULTS.vendor_trades.slice();
  o.assets = opts.assets || null; /* optional {id: {location, name, class}} for grouping by location and CSV */
  return o;
}
function rateOf(trade, o) {
  if (typeof o.rates[trade] === 'number' && isFinite(o.rates[trade])) return o.rates[trade];
  var C = core();
  if (C && C.TRADES && C.TRADES[trade] && isFinite(C.TRADES[trade].rate_eur_h_default)) return C.TRADES[trade].rate_eur_h_default;
  return o.labour_rate_eur_h;
}

function schedule(tasks, opts) {
  var o = resolveOpts(opts);
  var cal = calendar(o.year, o.start_week);
  H = cal.length; /* 53 in ISO long years (2026, 2032, ...): week 53 is planned, weekly statutory tests keep every week (QA-1) */
  var conflicts = [], skipped = [], series = [];
  (Array.isArray(tasks) ? tasks : []).forEach(function (t, i) {
    var n = normaliseTask(t, i);
    if (n.errors.length) { skipped.push({ index: i, id: t && t.id != null ? String(t.id) : 'T' + (i + 1), asset_id: t && t.asset_id, reasons: n.errors }); return; }
    series.push(buildSeries(n.task, cal, o, conflicts));
  });
  /* unique task ids */
  var seen = {};
  series.forEach(function (s) { var id = s.task.id; if (seen[id]) { var k = 2; while (seen[id + '-' + k]) k++; s.task.id = id + '-' + k; } seen[s.task.id] = true; });

  var assetInfo = o.assets || {};
  function groupKey(task) {
    if (o.group_by === 'none') return null;
    if (o.group_by === 'location') { var loc = task.location || (assetInfo[task.asset_id] && assetInfo[task.asset_id].location) || ''; return 'L:' + (loc || task.asset_id); }
    return 'A:' + task.asset_id;
  }
  /* state */
  var trades = [];
  series.forEach(function (s) { if (trades.indexOf(s.task.trade) < 0) trades.push(s.task.trade); });
  var load = {}, visits = {}; /* load[trade][slot] task hours; visits['key|trade|slot'] = count */
  trades.forEach(function (t) { load[t] = new Array(H).fill(0); });
  var cap = function (t) { var c = o.capacity_h_week[t]; return typeof c === 'number' && isFinite(c) && c >= 0 ? c : Infinity; };
  var vcount = {}; /* trade|slot -> number of visits */
  function weekHours(trade, s) { return load[trade][s] + o.travel_h * (vcount[trade + '|' + s] || 0); }
  function cellCost(trade, s) {
    var h = weekHours(trade, s), c = cap(trade), over = c === Infinity ? 0 : Math.max(0, h - c);
    return h * h + 1000 * over * over + 50 * over;
  }
  function add(occ, sgn) {
    var t = occ.trade, s = occ.slot;
    load[t][s] += sgn * occ.hours;
    var key = occ.group == null ? null : occ.group + '|' + t + '|' + s;
    if (key == null) vcount[t + '|' + s] = (vcount[t + '|' + s] || 0) + sgn;
    else {
      var before = visits[key] || 0; visits[key] = before + sgn;
      if (sgn > 0 && before === 0) vcount[t + '|' + s] = (vcount[t + '|' + s] || 0) + 1;
      if (sgn < 0 && before === 1) vcount[t + '|' + s] = (vcount[t + '|' + s] || 0) - 1;
      if (visits[key] === 0) delete visits[key];
    }
  }
  function deltaAdd(occ, s) { /* cost change of adding occ at slot s */
    var t = occ.trade, before = cellCost(t, s);
    var o2 = { trade: t, slot: s, hours: occ.hours, group: occ.group };
    add(o2, 1); var after = cellCost(t, s); add(o2, -1);
    return after - before;
  }
  var occs = [];
  function placeSeries(ser, phase, commit, levelled) {
    var list = [], cost = 0, ns = nominals(ser, phase);
    var hrs = ser.sub ? ser.task.hours * 7 / ser.task.interval_days : ser.task.hours;
    ns.forEach(function (n, k) {
      var cand = candidates(ser, n), slot, unreachable = false;
      if (!cand.length) { unreachable = true; slot = n; }
      else if (!levelled || ser.task.statutory) slot = cand[0];
      else {
        var best = null, bd = Infinity;
        cand.forEach(function (s) { var d = deltaAdd({ trade: ser.task.trade, hours: hrs, group: groupKey(ser.task) }, s) + 1e-6 * Math.abs(s - n); if (d < bd - 1e-12) { bd = d; best = s; } });
        slot = best;
      }
      var occ = { task_id: ser.task.id, k: k, trade: ser.task.trade, hours: hrs, group: groupKey(ser.task), nominal: n, slot: slot, unreachable: unreachable, ser: ser };
      cost += deltaAdd(occ, slot); add(occ, 1); list.push(occ);
    });
    list.forEach(function (occ) { add(occ, -1); });
    if (commit) list.forEach(function (occ) { add(occ, 1); occs.push(occ); });
    return { cost: cost, list: list };
  }
  /* order: fixed (dated, statutory, sub-weekly) first, then most constrained, then largest */
  var order = series.slice().sort(function (a, b) {
    var fa = a.fixed || a.task.statutory ? 0 : 1, fb = b.fixed || b.task.statutory ? 0 : 1; if (fa !== fb) return fa - fb;
    var ca = a.allowed.filter(Boolean).length, cb = b.allowed.filter(Boolean).length; if (ca !== cb) return ca - cb;
    var ha = a.task.hours * H / Math.max(1, a.Iw), hb = b.task.hours * H / Math.max(1, b.Iw); if (ha !== hb) return hb - ha;
    return a.task.index - b.task.index;
  });
  order.forEach(function (ser) {
    if (ser.fixed) { placeSeries(ser, ser.phase, true, o.level); return; }
    var phases = ser.phases.length ? ser.phases : [0];
    /* feasible phases first: every occurrence has a candidate week */
    var feas = phases.filter(function (p) { return nominals(ser, p).every(function (n) { return candidates(ser, n).length > 0; }); });
    var pool = feas.length ? feas : phases;
    var chosen = pool[0];
    if (o.level && !ser.task.statutory) {
      var best = Infinity;
      pool.forEach(function (p) { var c = placeSeries(ser, p, false, true).cost; if (c < best - 1e-9) { best = c; chosen = p; } });
    }
    ser.phase = chosen;
    placeSeries(ser, chosen, true, o.level);
  });
  /* local improvement: move single work orders inside their windows */
  if (o.level) {
    for (var round = 0; round < o.rounds; round++) {
      var moved = 0;
      occs.forEach(function (occ) {
        if (occ.ser.task.statutory || occ.ser.sub || occ.unreachable) return;
        var cand = candidates(occ.ser, occ.nominal); if (cand.length < 2) return;
        add(occ, -1);
        var cur = deltaAdd(occ, occ.slot) + 1e-6 * Math.abs(occ.slot - occ.nominal), best = occ.slot, bd = cur;
        cand.forEach(function (s) { if (s === occ.slot) return; var d = deltaAdd(occ, s) + 1e-6 * Math.abs(s - occ.nominal); if (d < bd - 1e-9) { bd = d; best = s; } });
        if (best !== occ.slot) { occ.slot = best; moved++; }
        add(occ, 1);
      });
      if (!moved) break;
    }
  }

  /* ---------------- results */
  var weeks = cal.map(function (c) { return { slot: c.slot, iso_week: c.iso_week, iso_year: c.iso_year, monday: c.monday, month: c.month, hours: {}, travel: {}, visits: 0, total: 0, tasks: 0 }; });
  var visitMap = {}, visitList = [];
  occs.sort(function (a, b) { return a.slot - b.slot || (a.trade < b.trade ? -1 : a.trade > b.trade ? 1 : 0) || (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0) || a.k - b.k; });
  var occurrences = occs.map(function (occ, i) {
    var t = occ.ser.task, vkey = occ.group == null ? 'O' + i + '|' + occ.trade + '|' + occ.slot : occ.group + '|' + occ.trade + '|' + occ.slot;
    var v = visitMap[vkey];
    if (!v) { v = visitMap[vkey] = { id: 'V' + (visitList.length + 1), key: vkey, group: occ.group, asset_id: t.asset_id, trade: occ.trade, slot: occ.slot, iso_week: cal[occ.slot].iso_week, monday: cal[occ.slot].monday, occurrences: [], hours: 0, travel_h: o.travel_h }; visitList.push(v); }
    var id = t.id + '#' + (occ.k + 1);
    v.occurrences.push(id); v.hours += occ.hours;
    return { id: id, task_id: t.id, asset_id: t.asset_id, fm_id: t.fm_id, kind: t.kind, statutory: t.statutory, statutory_id: t.statutory_id, trade: occ.trade,
      hours: r2(occ.hours), slot: occ.slot, iso_week: cal[occ.slot].iso_week, date: cal[occ.slot].monday, nominal_slot: occ.nominal, nominal_iso_week: cal[occ.nominal] ? cal[occ.nominal].iso_week : null,
      nominal_date: cal[occ.nominal] ? cal[occ.nominal].monday : null, shift_w: occ.slot - occ.nominal, tolerance_w: occ.ser.tolW, visit: v.id, sub_weekly: occ.ser.sub, unreachable: occ.unreachable };
  });
  visitList.forEach(function (v) { var w = weeks[v.slot]; w.travel[v.trade] = (w.travel[v.trade] || 0) + v.travel_h; w.visits++; v.hours = r2(v.hours); });
  occurrences.forEach(function (oc) { var w = weeks[oc.slot]; w.hours[oc.trade] = (w.hours[oc.trade] || 0) + oc.hours; w.tasks++; });
  weeks.forEach(function (w) {
    var tot = 0; trades.forEach(function (t) { w.hours[t] = r2(w.hours[t] || 0); w.travel[t] = r2(w.travel[t] || 0); tot += w.hours[t] + w.travel[t]; }); w.total = r2(tot);
  });
  /* conflicts from the placement */
  occs.forEach(function (occ) {
    var t = occ.ser.task, wk = cal[occ.slot].iso_week, rb = occ.ser.rebase;
    if (rb && occ.k === 0) {
      rb.iso_week = wk; rb.shift_w = occ.slot - rb.old_slot; delete rb.old_slot;
      if (rb.shift_w > occ.ser.tolW) { rb.code = 'rebaselined_late'; rb.severity = 'warn'; } /* later than due: the interval is stretched once */
    }
    if (occ.unreachable) conflicts.push({ code: 'window_unreachable', severity: t.statutory ? 'warn' : 'error', task_id: t.id, asset_id: t.asset_id, constraint: t.constraint, iso_week: wk, nominal_iso_week: cal[occ.nominal].iso_week, nearest_iso_week: cal[nearestAllowed(occ.ser, occ.nominal)].iso_week });
    if (t.statutory && o.blackout.indexOf(wk) >= 0) conflicts.push({ code: 'statutory_in_blackout', severity: 'warn', task_id: t.id, asset_id: t.asset_id, iso_week: wk });
    if (t.statutory && o.shutdowns.some(function (s) { return inRange(wk, s); }) && t.constraint !== 'shutdown') conflicts.push({ code: 'statutory_in_shutdown', severity: 'info', task_id: t.id, asset_id: t.asset_id, iso_week: wk });
  });
  var metrics = { trades: {}, hours_task: 0, hours_travel: 0, hours_total: 0, visits: visitList.length, visits_ungrouped: occurrences.length, occurrences: occurrences.length,
    statutory_occurrences: occurrences.filter(function (x) { return x.statutory; }).length, shifted: occurrences.filter(function (x) { return x.shift_w !== 0; }).length,
    overload_weeks: 0, overload_hours: 0, peak_total: 0, peak_total_week: null };
  trades.forEach(function (t) {
    var arr = weeks.map(function (w) { return w.hours[t] + w.travel[t]; }), sum = arr.reduce(function (a, b) { return a + b; }, 0), pk = Math.max.apply(null, arr), c = cap(t);
    var over = 0, overW = 0;
    if (c !== Infinity) weeks.forEach(function (w, s) {
      var x = arr[s] - c; if (x <= 1e-9) return;
      over += x; overW++;
      var stH = occurrences.filter(function (q) { return q.slot === s && q.trade === t && q.statutory; }).reduce(function (a, q) { return a + q.hours; }, 0);
      conflicts.push({ code: 'capacity', severity: 'error', trade: t, slot: s, iso_week: w.iso_week, value: r2(arr[s]), limit: c, statutory_hours: r2(stH), statutory_driven: stH >= c - 1e-9 });
    });
    var taskH = weeks.reduce(function (a, w) { return a + w.hours[t]; }, 0), travH = weeks.reduce(function (a, w) { return a + w.travel[t]; }, 0);
    metrics.trades[t] = { hours: r2(sum), task_hours: r2(taskH), travel_hours: r2(travH), mean: r2(sum / H), peak: r2(pk), peak_iso_week: weeks[arr.indexOf(pk)].iso_week, peak_ratio: sum > 0 ? r2(pk / (sum / H)) : 0, capacity: c === Infinity ? null : c, overload_hours: r2(over), overload_weeks: overW };
    metrics.hours_task += taskH; metrics.hours_travel += travH; metrics.overload_weeks += overW; metrics.overload_hours += over;
  });
  weeks.forEach(function (w) { if (w.total > metrics.peak_total) { metrics.peak_total = w.total; metrics.peak_total_week = w.iso_week; } });
  metrics.hours_task = r2(metrics.hours_task); metrics.hours_travel = r2(metrics.hours_travel); metrics.hours_total = r2(metrics.hours_task + metrics.hours_travel);
  metrics.overload_hours = r2(metrics.overload_hours);
  metrics.travel_saved_h = r2((metrics.visits_ungrouped - metrics.visits) * o.travel_h);
  metrics.mean_total = r2(metrics.hours_total / H);

  /* budget */
  var budget = { currency: 'EUR', labour_eur: 0, travel_eur: 0, materials_eur: 0, vendor_fees_eur: 0, total_eur: 0, by_trade: {}, by_month: new Array(12).fill(0), by_kind: {}, by_asset: {}, statutory_eur: 0 };
  occurrences.forEach(function (oc) {
    var t = series.filter(function (s) { return s.task.id === oc.task_id; })[0].task;
    var rate = rateOf(oc.trade, o), lab = oc.hours * rate, mat = t.materials_eur != null ? t.materials_eur * (oc.sub_weekly ? 7 / t.interval_days : 1) : lab * o.materials_pct / 100;
    var bt = budget.by_trade[oc.trade] = budget.by_trade[oc.trade] || { rate_eur_h: rate, hours: 0, labour_eur: 0, travel_eur: 0, materials_eur: 0, vendor_fees_eur: 0, total_eur: 0 };
    bt.hours += oc.hours; bt.labour_eur += lab; bt.materials_eur += mat;
    budget.labour_eur += lab; budget.materials_eur += mat;
    var m = weeks[oc.slot].month - 1; budget.by_month[m] += lab + mat;
    budget.by_kind[oc.kind] = (budget.by_kind[oc.kind] || 0) + lab + mat;
    budget.by_asset[oc.asset_id] = (budget.by_asset[oc.asset_id] || 0) + lab + mat;
    if (oc.statutory) budget.statutory_eur += lab + mat;
  });
  visitList.forEach(function (v) {
    var rate = rateOf(v.trade, o), tc = v.travel_h * rate, fee = o.vendor_trades.indexOf(v.trade) >= 0 ? o.vendor_callout_eur : 0;
    var bt = budget.by_trade[v.trade]; bt.travel_eur += tc; bt.vendor_fees_eur += fee; bt.hours += v.travel_h;
    budget.travel_eur += tc; budget.vendor_fees_eur += fee; budget.by_month[weeks[v.slot].month - 1] += tc + fee;
    budget.by_asset[v.asset_id] = (budget.by_asset[v.asset_id] || 0) + tc + fee;
  });
  Object.keys(budget.by_trade).forEach(function (k) { var b = budget.by_trade[k]; b.total_eur = b.labour_eur + b.travel_eur + b.materials_eur + b.vendor_fees_eur;
    ['hours', 'labour_eur', 'travel_eur', 'materials_eur', 'vendor_fees_eur', 'total_eur'].forEach(function (f) { b[f] = r2(b[f]); }); });
  budget.total_eur = budget.labour_eur + budget.travel_eur + budget.materials_eur + budget.vendor_fees_eur;
  ['labour_eur', 'travel_eur', 'materials_eur', 'vendor_fees_eur', 'total_eur', 'statutory_eur'].forEach(function (f) { budget[f] = r2(budget[f]); });
  budget.by_month = budget.by_month.map(r2);
  Object.keys(budget.by_kind).forEach(function (k) { budget.by_kind[k] = r2(budget.by_kind[k]); });
  Object.keys(budget.by_asset).forEach(function (k) { budget.by_asset[k] = r2(budget.by_asset[k]); });
  budget.travel_saved_eur = r2(visitList.length ? (metrics.visits_ungrouped - metrics.visits) * o.travel_h * (budget.travel_eur / Math.max(1e-9, visitList.length * o.travel_h) || 0) : 0);

  var sevOrder = { error: 0, warn: 1, info: 2 };
  conflicts.sort(function (a, b) { return sevOrder[a.severity] - sevOrder[b.severity] || (a.iso_week || 0) - (b.iso_week || 0); });
  var taskOut = series.map(function (s) {
    var t = s.task, mine = occurrences.filter(function (x) { return x.task_id === t.id; });
    return { id: t.id, asset_id: t.asset_id, fm_id: t.fm_id, kind: t.kind, name: t.name, interval_days: r2(t.interval_days), trade: t.trade, hours: t.hours, statutory: t.statutory, statutory_id: t.statutory_id,
      constraint: t.constraint, tolerance_w: s.tolW, fixed: s.fixed, phase: s.phase, rebaselined: !!s.rebaselined, occurrences: mine.length, hours_y: r2(mine.reduce(function (a, x) { return a + x.hours; }, 0)),
      weeks: mine.map(function (x) { return x.iso_week; }), origin: t.origin, basis: t.basis, sources: t.sources, location: t.location, materials_eur: t.materials_eur };
  });
  return {
    version: VERSION, year: o.year, start_week: o.start_week, horizon_weeks: H, iso_weeks_in_year: isoWeeksInYear(o.year),
    trades: trades, weeks: weeks, tasks: taskOut, occurrences: occurrences, visits: visitList, conflicts: conflicts, skipped: skipped,
    metrics: metrics, budget: budget, opts: (function () { var x = clone(o); delete x.assets; x.capacity_h_week = o.capacity_h_week; return x; })()
  };
}

/* naive baseline vs levelled plan (the planner's main comparison) */
function compare(tasks, opts) {
  var a = schedule(tasks, Object.assign({}, opts, { level: false })), b = schedule(tasks, Object.assign({}, opts, { level: true }));
  var trades = {};
  b.trades.forEach(function (t) { var x = a.metrics.trades[t], y = b.metrics.trades[t]; trades[t] = { peak_naive: x.peak, peak_levelled: y.peak, reduction_pct: x.peak > 0 ? r2(100 * (1 - y.peak / x.peak)) : 0, overload_naive: x.overload_hours, overload_levelled: y.overload_hours }; });
  return { naive: a, levelled: b, trades: trades, peak_total_naive: a.metrics.peak_total, peak_total_levelled: b.metrics.peak_total,
    reduction_pct: a.metrics.peak_total > 0 ? r2(100 * (1 - b.metrics.peak_total / a.metrics.peak_total)) : 0 };
}

/* ---------------------------------------------------------------- task sources */
function routineName(key, lang) { return RN[key] ? (lang ? tr(RN[key], lang) : clone(RN[key])) : key; }
/* planner's own baseline task set for a register: class routines + statutory tasks (MEPCore.statutoryFor) +
   failure-finding tests of hidden functions not already covered by a statutory test (interval: 182 d, learning assumption) */
function tasksFromClasses(doc, opts) {
  opts = opts || {};
  var C = core(), out = [];
  var assets = doc && Array.isArray(doc.assets) ? doc.assets : [];
  assets.forEach(function (a) {
    if (!a || !a.id) return;
    var cls = a['class'], routines = ROUTINES[cls] || [], clsDef = C && C.CLASSES ? C.CLASSES[cls] : null;
    routines.forEach(function (rt) {
      out.push({ id: a.id + ':' + rt.id, asset_id: a.id, kind: 'time', task: routineName(rt.name), interval_days: rt.interval_days, trade: rt.trade, hours: rt.hours,
        constraint: rt.constraint, location: a.location || '', origin: 'class_routine', routine: rt.id, sources: ['la_plan', 'doe_om_r3'] });
    });
    if (clsDef && opts.ff !== false) {
      clsDef.failure_modes.forEach(function (f) {
        if (f.evident !== false || !f.ff_task) return;
        if (f.statutory && f.statutory.length) return; /* proven by the statutory test */
        out.push({ id: a.id + ':ff_' + f.id, asset_id: a.id, fm_id: f.id, kind: 'ff', task: clone(f.ff_task), interval_days: f.id === 'frost_protection' ? 365 : 182,
          trade: (clsDef.trades && clsDef.trades[0]) || 'hvac_mech', hours: 1, constraint: f.id === 'frost_protection' ? 'pre_heating' : null, location: a.location || '',
          origin: 'class_ff', sources: f.sources || ['la_plan'] });
      });
    }
    if (C && typeof C.statutoryFor === 'function') {
      var st = []; try { st = C.statutoryFor(a) || []; } catch (e) { st = []; }
      st.forEach(function (s) {
        var def = C.STATUTORY[s.id] || {};
        out.push({ id: a.id + ':' + s.id, asset_id: a.id, kind: 'statutory', statutory_id: s.id, task: clone(def.name || s.id), interval_days: s.interval_days, interval_months: s.interval_months,
          trade: s.trade || def.trade || 'specialist_vendor', hours: num(s.hours, num(def.hours, 1)), location: a.location || '', origin: 'statutory', basis: def.basis ? clone(def.basis) : '',
          sources: [s.source || def.source].filter(Boolean), conditional: !!s.conditional,
          covers: def.covers_fm && def.covers_fm.length ? def.covers_fm.slice() : undefined });
      });
    }
  });
  return out;
}
/* tasks from a mepstrategy module payload; accepts several shapes (tasks array at module, summary or state level;
   or per-asset results with tasks/decisions). Returns {tasks, source} or null. rtf/redesign are dropped (not scheduled). */
function tasksFromStrategy(doc) {
  var m = doc && doc.modules && doc.modules.mepstrategy;
  if (!m || typeof m !== 'object') return null;
  var list = null, src = '';
  if (Array.isArray(m.tasks)) { list = m.tasks; src = 'modules.mepstrategy.tasks'; }
  else if (m.summary && Array.isArray(m.summary.tasks)) { list = m.summary.tasks; src = 'modules.mepstrategy.summary.tasks'; }
  else if (m.state && Array.isArray(m.state.tasks)) { list = m.state.tasks; src = 'modules.mepstrategy.state.tasks'; }
  else if (m.results && typeof m.results === 'object') {
    list = []; src = 'modules.mepstrategy.results';
    var C = core();
    Object.keys(m.results).forEach(function (aid) {
      var res = m.results[aid] || {};
      if (Array.isArray(res.tasks)) res.tasks.forEach(function (t) { list.push(Object.assign({ asset_id: aid }, t)); });
      else if (Array.isArray(res.decisions)) {
        var asset = (doc.assets || []).filter(function (a) { return a && a.id === aid; })[0], clsDef = asset && C && C.CLASSES ? C.CLASSES[asset['class']] : null;
        res.decisions.forEach(function (d) {
          if (!d || d.kind === 'rtf' || d.kind === 'redesign' || !d.interval_days) return;
          var f = clsDef ? clsDef.failure_modes.filter(function (x) { return x.id === d.fm_id; })[0] : null;
          var name = f ? (d.kind === 'ff' ? f.ff_task : d.kind === 'time' ? f.time_task : null) || f.name : d.fm_id;
          list.push({ asset_id: aid, fm_id: d.fm_id, kind: d.kind, task: clone(name), interval_days: d.interval_days, trade: d.trade || (clsDef && clsDef.trades && clsDef.trades[0]) || 'hvac_mech', hours: num(d.hours, 1) });
        });
      }
    });
  }
  if (!list) return null;
  var assets = {}; (doc.assets || []).forEach(function (a) { if (a && a.id) assets[a.id] = a; });
  var out = list.filter(function (t) { return t && t.kind !== 'rtf' && t.kind !== 'redesign'; }).map(function (t, i) {
    var x = clone(t); x.id = x.id || (x.asset_id + ':' + (x.fm_id || x.statutory_id || x.kind) + ':' + (i + 1)); x.origin = 'mepstrategy';
    if (!x.location && assets[x.asset_id]) x.location = assets[x.asset_id].location || '';
    /* statutory trade/hours from the statute definition win over a class default trade */
    var C = core();
    if (x.statutory_id && C && C.STATUTORY && C.STATUTORY[x.statutory_id]) { var d = C.STATUTORY[x.statutory_id]; x.trade_from_strategy = x.trade; x.trade = d.trade || x.trade; }
    return x;
  });
  return { tasks: out, source: src, updatedAt: m.updatedAt || null };
}

/* ---------------------------------------------------------------- exports */
var CMMS_COLS = ['work_order', 'asset_id', 'asset_name', 'location', 'task', 'kind', 'statutory_id', 'trade', 'planned_iso_week', 'planned_date', 'due_date', 'window_from', 'window_to', 'hours', 'visit', 'interval_days', 'basis'];
function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  var s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, cols) {
  var C = core();
  if (C && typeof C.csv === 'function') { try { return C.csv(rows, cols); } catch (e) { /* local fallback */ } }
  return [cols.map(csvCell).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); })).join('\r\n') + '\r\n';
}
function addDays(iso, d) { var ms = parseDate(iso); return ms == null ? '' : ymd(ms + d * 86400000); }
function csv(plan, opts) {
  opts = opts || {};
  var lang = opts.lang || 'en', assets = opts.assets || {};
  var taskById = {}; plan.tasks.forEach(function (t) { taskById[t.id] = t; });
  var rows = plan.occurrences.map(function (oc) {
    var t = taskById[oc.task_id] || {}, a = assets[oc.asset_id] || {};
    return { work_order: oc.id, asset_id: oc.asset_id, asset_name: a.name || '', location: t.location || a.location || '', task: tr(t.name, lang), kind: oc.kind, statutory_id: oc.statutory_id || '',
      trade: oc.trade, planned_iso_week: oc.iso_week, planned_date: oc.date, due_date: oc.nominal_date || '',
      window_from: oc.nominal_date ? addDays(oc.nominal_date, -7 * oc.tolerance_w) : '', window_to: oc.nominal_date ? addDays(oc.nominal_date, 7 * oc.tolerance_w + 6) : '',
      hours: oc.hours, visit: oc.visit, interval_days: t.interval_days, basis: tr(t.basis, lang) };
  });
  return toCsv(rows, CMMS_COLS);
}
/* plain weekly calendar CSV (no iCal): one row per week, hours per trade, visits, work orders */
function calendarCsv(plan) {
  var cols = ['iso_week', 'monday'].concat(plan.trades.map(function (t) { return 'h_' + t; })).concat(['travel_h', 'total_h', 'visits', 'work_orders']);
  var rows = plan.weeks.map(function (w) {
    var r0 = { iso_week: w.iso_week, monday: w.monday, visits: w.visits, work_orders: w.tasks, total_h: w.total };
    var tv = 0; plan.trades.forEach(function (t) { r0['h_' + t] = w.hours[t]; tv += w.travel[t]; }); r0.travel_h = r2(tv);
    return r0;
  });
  return toCsv(rows, cols);
}
/* register payload for modules.mepplanner (MEPCore.register.withModule) */
function moduleResult(plan, state) {
  var results = {};
  plan.tasks.forEach(function (t) {
    var x = results[t.asset_id] = results[t.asset_id] || { tasks: 0, occurrences: 0, hours_y: 0, weeks: [], statutory: 0 };
    x.tasks++; x.occurrences += t.occurrences; x.hours_y = r2(x.hours_y + t.hours_y); if (t.statutory) x.statutory++;
    t.weeks.forEach(function (w) { if (x.weeks.indexOf(w) < 0) x.weeks.push(w); });
  });
  Object.keys(results).forEach(function (k) { results[k].weeks.sort(function (a, b) { return a - b; }); results[k].budget_eur = plan.budget.by_asset[k] || 0; });
  return { state: state || {}, results: results,
    summary: { version: VERSION, year: plan.year, start_week: plan.start_week, tasks: plan.tasks.length, occurrences: plan.metrics.occurrences, visits: plan.metrics.visits,
      hours_total: plan.metrics.hours_total, peak_total: plan.metrics.peak_total, overload_hours: plan.metrics.overload_hours,
      conflicts: { error: plan.conflicts.filter(function (c) { return c.severity === 'error'; }).length, warn: plan.conflicts.filter(function (c) { return c.severity === 'warn'; }).length },
      budget_total_eur: plan.budget.total_eur, hours_by_trade: Object.keys(plan.metrics.trades).reduce(function (m, t) { m[t] = plan.metrics.trades[t].hours; return m; }, {}) } };
}

/* ---------------------------------------------------------------- presets (each with an "aha") */
function siteAssets(id) { var C = core(); var d = C && C.presetSite ? C.presetSite(id) : null; return d; }
function asset(id, cls, name, location, extra) { var a = { id: id, 'class': cls, name: name, location: location, serves: 'common', redundancy: 'none', condition: 3, failures_3y: 0, evidence: 'assumed', common_cause: [] }; return Object.assign(a, extra || {}); }
function docOf(name, assets) { return { schema: 'tools.petrov.re/mep-maintenance/v1', revision: 1, site: { name: name, currency: 'EUR', labour_rate_eur_h: 75, year: 2026 }, assets: assets, modules: {} }; }
var PRESETS = {
  /* 1. every routine set up "from week 1" -> quarterly peaks; levelling spreads the same hours */
  quarterly_peak: function () {
    var doc = siteAssets('office_12') || docOf('Office (12 assets)', [asset('AHU-01', 'ahu', 'AHU-01', 'Roof'), asset('CH-01', 'chiller_air', 'Chiller 1', 'Roof'), asset('BLR-01', 'boiler_gas', 'Boiler', 'Basement')]);
    var tasks = tasksFromClasses(doc);
    /* the legal tests already have dates in the logbook (illustrative): they stay where the law put them */
    var due = { fgas_leak_50: 9, fgas_leak_5: 9, legionella_sentinel: 2, legionella_calorifier_annual: 20, sprinkler_weekly: 1, sprinkler_annual: 15,
      emergency_lighting_monthly: 3, emergency_lighting_annual: 44, generator_monthly: 3, generator_annual_loadbank: 24 };
    tasks.forEach(function (t) {
      if (t.statutory_id && due[t.statutory_id] != null) t.due_week = due[t.statutory_id] + (t.asset_id === 'CH-02' ? 2 : 0);
      if (t.statutory_id === 'epbd_ac' || t.statutory_id === 'epbd_heating') t.last_done = '2024-03-11';
    });
    return { doc: doc, tasks: tasks, opts: { year: 2026, capacity_h_week: { hvac_mech: 12, electrician: 10, plumber: 6, fire: 6, controls: 6 }, travel_h: 0.5, group_by: 'asset', shutdowns: [{ id: 'xmas', from: 52, to: 53, label: 'Christmas shutdown' }] }, compare: true };
  },
  /* 2. one visit per asset and trade: nested intervals (monthly ⊂ quarterly ⊂ annual) fall into the same week */
  grouping: function () {
    var A = [asset('AHU-11', 'ahu', 'AHU-11 north wing', 'Roof north'), asset('AHU-12', 'ahu', 'AHU-12 south wing', 'Roof south'), asset('AHU-13', 'ahu', 'AHU-13 lab', 'Roof south'),
      asset('FCU-G1', 'fcu', 'FCU group floors 1–3 (60 units)', 'Floors 1–3'), asset('FCU-G2', 'fcu', 'FCU group floors 4–6 (60 units)', 'Floors 4–6')];
    var doc = docOf('Campus building — remote site', A), tasks = [];
    A.forEach(function (a) {
      tasks.push({ id: a.id + ':insp_m', asset_id: a.id, task: routineName('insp_m'), interval_days: 30.4375, interval_months: 1, trade: 'hvac_mech', hours: 1, location: a.location, kind: 'time', origin: 'preset' });
      tasks.push({ id: a.id + ':insp_q', asset_id: a.id, task: routineName('insp_q'), interval_days: 91, interval_months: 3, trade: 'hvac_mech', hours: 2, location: a.location, kind: 'time', origin: 'preset' });
      tasks.push({ id: a.id + ':service_a', asset_id: a.id, task: routineName('service_a'), interval_days: 365, interval_months: 12, trade: 'hvac_mech', hours: 4, location: a.location, kind: 'time', origin: 'preset' });
    });
    return { doc: doc, tasks: tasks, opts: { year: 2026, travel_h: 1.5, group_by: 'asset', capacity_h_week: { hvac_mech: 24 } }, compareGrouping: true };
  },
  /* 3. statutory tasks are pinned; the leveller works around them */
  statutory_locked: function () {
    var A = [asset('SPR-P1', 'sprinkler_pump', 'Sprinkler pump set', 'Pump house'), asset('EL-SYS', 'emergency_lighting', 'Emergency lighting (220 luminaires)', 'Whole building'),
      asset('FA-01', 'fire_alarm', 'Fire alarm panel and detectors', 'Whole building'), asset('GEN-01', 'generator', 'Standby generator 400 kVA', 'Yard'),
      asset('UPS-01', 'ups', 'UPS 120 kVA theatres', 'UPS room'), asset('TX-01', 'transformer', 'Transformer 1000 kVA', 'MV room')];
    var doc = docOf('Hospital wing — life-safety systems', A), tasks = tasksFromClasses(doc);
    /* the legal dates are in the logbook; the annual full-duration test of 220 luminaires is a big job in week 10 */
    var due = { emergency_lighting_annual: 10, emergency_lighting_monthly: 2, sprinkler_annual: 10, sprinkler_weekly: 1, generator_monthly: 2, generator_annual_loadbank: 22,
      fire_alarm_weekly: 1, fire_alarm_service: 6 };
    tasks.forEach(function (t) {
      if (t.statutory_id && due[t.statutory_id] != null) t.due_week = due[t.statutory_id];
      if (t.statutory_id === 'emergency_lighting_annual') t.hours = 12;
      if (t.statutory_id === 'emergency_lighting_monthly') t.hours = 3;
    });
    return { doc: doc, tasks: tasks, opts: { year: 2026, capacity_h_week: { fire: 8, electrician: 8 }, travel_h: 0.25 }, compare: true };
  },
  /* 4. the chiller anniversary falls in July: the annual service belongs to the heating season (plant off-load) */
  chiller_winter: function () {
    var A = [asset('CH-01', 'chiller_water', 'Water-cooled chiller 1 (R134a)', 'Basement plant room', { refrigerant_charge_t_co2e: 200 }), asset('CH-02', 'chiller_water', 'Water-cooled chiller 2 (R134a)', 'Basement plant room', { refrigerant_charge_t_co2e: 200 }),
      asset('BLR-01', 'boiler_gas', 'Gas boiler 600 kW', 'Basement plant room', { rated_kw: 600 }), asset('CT-01', 'cooling_tower', 'Cooling tower', 'Roof')];
    var doc = docOf('Chillers and boiler — seasons', A), tasks = tasksFromClasses(doc);
    tasks.forEach(function (t) {
      if (t.routine === 'chiller_major') t.last_done = t.asset_id === 'CH-01' ? '2025-07-08' : '2025-07-15'; /* last done during commissioning in summer */
      if (t.routine === 'boiler_major') t.last_done = '2025-01-20';
      if (t.statutory_id === 'fgas_leak_50') t.due_week = t.asset_id === 'CH-01' ? 5 : 7;
      if (t.statutory_id === 'ct_legionella_sampling') t.due_week = 3;
      if (t.statutory_id === 'ct_clean_disinfect') t.due_week = 14;
      if (t.statutory_id === 'epbd_ac' || t.statutory_id === 'epbd_heating') t.last_done = '2023-10-02';
    });
    return { doc: doc, tasks: tasks, opts: { year: 2026, rebaseline: false }, rebaselineToggle: true };
  },
  /* 5. shutdown work vs on-load inspection: the switchboard service needs the summer shutdown, thermography needs load */
  shutdown: function () {
    var A = [asset('MSB-01', 'lv_switchboard', 'Main LV switchboard 2500 A', 'LV room'), asset('MSB-02', 'lv_switchboard', 'Sub-board mechanical services', 'Plant room'),
      asset('TX-01', 'transformer', 'Transformer 1600 kVA', 'MV room'), asset('UPS-01', 'ups', 'UPS 200 kVA', 'UPS room')];
    var doc = docOf('Production site — electrical shutdown', A), tasks = tasksFromClasses(doc);
    return { doc: doc, tasks: tasks, opts: { year: 2026, shutdowns: [{ id: 'summer', from: 31, to: 32, label: 'Summer shutdown' }], blackout: [52, 53, 1], capacity_h_week: { electrician: 16 } }, compare: true };
  }
};
var PRESET_IDS = Object.keys(PRESETS);
function preset(id) { return PRESETS[id] ? PRESETS[id]() : null; }

return {
  version: VERSION, LANGS: LANGS, HORIZON: 52, isoWeeksInYear: isoWeeksInYear, DEFAULTS: clone(DEFAULTS), ASSUMPTIONS: ASSUMPTIONS, SOURCES: SOURCES, ROUTINES: ROUTINES, ROUTINE_NAMES: RN, CONSTRAINTS: CONSTRAINTS,
  schedule: schedule, compare: compare, csv: csv, calendarCsv: calendarCsv, moduleResult: moduleResult, CMMS_COLS: CMMS_COLS,
  tasksFromClasses: tasksFromClasses, tasksFromStrategy: tasksFromStrategy, normaliseTask: function (t) { return normaliseTask(t, 0); },
  calendar: calendar, isoWeekOf: function (iso) { var ms = parseDate(iso); return ms == null ? null : isoWeekOf(ms); }, isoWeek1Monday: function (y) { return ymd(isoWeek1Monday(y)); }, inRange: inRange,
  PRESETS: PRESETS, PRESET_IDS: PRESET_IDS, preset: preset, routineName: routineName, rateOf: function (t, o) { return rateOf(t, resolveOpts(o)); }
};
});
