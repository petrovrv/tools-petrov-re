/* tnd-core.js — global TndCore: shared core of the tools.petrov.re Tendering & Contracts package (category `tendering`).
   Sections: 1 language helpers (L, t, fmt, money, pct, date), 2 SOURCES, 3 RULES (copy of tnd-rules.json, injected by
   _tnd/core/build_rules.py) + rule helpers (thresholds, minimum periods, standstill, AUR delay penalties, erkenning class),
   4 numerics (seeded PRNG, distributions, Iman–Conover rank correlation, statistics, tornado, NPV/IRR/annuity, S-curves),
   5 calendar (Belgian public holidays, working days), 6 scoring library, 7 tools + life cycle, 8 tender document
   (validate / import / export / storage / CSV / project-package bridge), 9 ui.projectBar + ui.lifecycle.
   Pure data + functions, no dependencies, UMD (browser global TndCore, node module.exports).
   Legal values come from the official texts (eur-lex, ejustice) with article, URL and read date in RULES; values that could not be
   verified are marked verified:false / kind learning_assumption. Engineering/commercial analysis only — not legal advice. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TndCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
'use strict';

var VERSION = '1.0.0';
var SCHEMA = 'tools.petrov.re/tender/v1';
var STORAGE_KEY = 'tnd.project.v1';
var PKG_STORAGE_KEY = 'diagram_project_package';
var PKG_SCHEMA = 'tools.petrov.re/project-package/v1';
var LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];

/* =====================================================================================
   1. Language helpers
   ===================================================================================== */
/* 7-language string in the fixed order en uk de nl fr es pl */
function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

function t(dict, lang) {
  if (dict == null) return '';
  if (typeof dict === 'string') return dict;
  if (lang && dict[lang] != null) return dict[lang];
  return dict.en != null ? dict.en : '';
}
function normLang(l) { return LANGS.indexOf(l) >= 0 ? l : 'en'; }

/* fmt: Intl.NumberFormat(lang) with fixed digits (default by magnitude), U+2212 minus, no negative zero, null/non-finite -> '—'.
   Same behaviour as OptCore.fmt / MEPCore.fmt: en 1,402.5; de/nl 1.402,5; uk/fr/pl space groups + decimal comma; es/pl group from 5 digits. */
var FMT_FALLBACK = { en: [',', '.', 4], uk: [' ', ',', 4], de: ['.', ',', 4], nl: ['.', ',', 4], fr: [' ', ',', 4], es: ['.', ',', 5], pl: [' ', ',', 5] };
var FMT_CACHE = {};
function fmt(n, lang, digits) {
  if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
  var a = Math.abs(n);
  if (digits == null) digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : a >= 0.01 ? 3 : Math.min(10, 2 - Math.floor(Math.log10(a)));
  digits = Math.max(0, Math.min(10, digits | 0));
  var l = normLang(lang);
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

/* money(v, cur, lang, digits): '1.250.000 €' (nl/de/fr…), '€1,250,000' (en); unknown currency code -> code after the number.
   digits default 0 for |v| ≥ 1000, else 2. Uses fmt (same grouping rules) — no Intl currency formatting, so output is stable across engines. */
var CUR_SYMBOL = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', PLN: 'zł', UAH: '₴', SEK: 'kr', NOK: 'kr', DKK: 'kr', CZK: 'Kč', JPY: '¥', CNY: '¥' };
function money(v, cur, lang, digits) {
  if (v == null || typeof v !== 'number' || !isFinite(v)) return '—';
  cur = (cur || 'EUR').toUpperCase();
  var l = normLang(lang);
  if (digits == null) digits = Math.abs(v) >= 1000 ? 0 : 2;
  var num = fmt(v, l, digits), sym = CUR_SYMBOL[cur] || cur;
  if (l === 'en' && (cur === 'EUR' || cur === 'USD' || cur === 'GBP')) return (num.charAt(0) === '−' ? '−' + sym + num.slice(1) : sym + num);
  return num + ' ' + sym;
}
/* pct(fraction, lang, digits): 0.153 -> '15,3 %' (non-English: NBSP before %), en '15.3%' */
function pct(v, lang, digits) {
  if (v == null || typeof v !== 'number' || !isFinite(v)) return '—';
  var l = normLang(lang);
  var s = fmt(v * 100, l, digits == null ? 1 : digits);
  return l === 'en' ? s + '%' : s + ' %';
}
/* date(iso, lang): 'YYYY-MM-DD' (or full ISO) -> local long date '14 Nov 2026' / '14 nov. 2026' …; invalid -> '—'.
   Dates are treated as calendar dates (UTC), never shifted by the time zone. */
function date(iso, lang, opts) {
  var d = parseDate(iso);
  if (!d) return '—';
  var l = normLang(lang);
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      var f = new Intl.DateTimeFormat(l, Object.assign({ year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }, opts || {}));
      if (String(f.resolvedOptions().locale).split('-')[0] === l) return f.format(d);
    }
  } catch (e) { /* fall through */ }
  var p = isoDate(d).split('-');
  return l === 'en' ? isoDate(d) : p[2] + '.' + p[1] + '.' + p[0];
}

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNum(v) { return typeof v === 'number' && isFinite(v); }

/* =====================================================================================
   2. SOURCES — every page cites from this registry (kind: law|standard|contract-form|guide|book|dataset|learning_assumption).
      Paid standards and contract forms: clause numbers, structure and method only (never text).
   ===================================================================================== */
var EJ = 'https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=';
var SOURCES = {
  dir_2014_24: { title: 'Directive 2014/24/EU on public procurement (classic sectors)', edition: 'OJ L 94, 28.3.2014, consolidated', url: 'https://eur-lex.europa.eu/eli/dir/2014/24/oj', kind: 'law' },
  dir_2014_25: { title: 'Directive 2014/25/EU on procurement by entities in the water, energy, transport and postal services sectors (utilities)', edition: 'OJ L 94, 28.3.2014, consolidated', url: 'https://eur-lex.europa.eu/eli/dir/2014/25/oj', kind: 'law' },
  dir_2014_23: { title: 'Directive 2014/23/EU on the award of concession contracts', edition: 'OJ L 94, 28.3.2014, consolidated', url: 'https://eur-lex.europa.eu/eli/dir/2014/23/oj', kind: 'law' },
  dir_89_665: { title: 'Directive 89/665/EEC (remedies, classic sectors) as amended by Directive 2007/66/EC', edition: 'consolidated', url: 'https://eur-lex.europa.eu/eli/dir/1989/665/oj', kind: 'law' },
  eu_thresholds_2026: { title: 'Commission Delegated Regulations (EU) 2025/2150, 2025/2151, 2025/2152 amending the procurement thresholds for 2026–2027', edition: 'OJ L 23.10.2025, applicable from 1 January 2026', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2152', kind: 'law', note: 'Belgian transposition: MB 05.01.2026 amending KB 18.04.2017 art. 11 (in force 01.01.2026).' },
  eu_thresholds_2024: { title: 'Commission Delegated Regulations (EU) 2023/2495, 2023/2496, 2023/2497 amending the procurement thresholds for 2024–2025', edition: 'applicable 1.1.2024–31.12.2025', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2495', kind: 'law' },
  espd: { title: 'Commission Implementing Regulation (EU) 2016/7 — standard form for the European Single Procurement Document (ESPD)', edition: 'OJ L 3, 6.1.2016', url: 'https://eur-lex.europa.eu/eli/reg_impl/2016/7/oj', kind: 'law' },
  be_wet_2016: { title: 'Wet van 17 juni 2016 inzake overheidsopdrachten / Loi du 17 juin 2016 relative aux marchés publics', edition: 'consolidated (Justel)', url: EJ + '2016061719', kind: 'law' },
  be_kb_2017_04_18: { title: 'KB van 18 april 2017 plaatsing overheidsopdrachten in de klassieke sectoren / AR du 18 avril 2017 passation des marchés publics dans les secteurs classiques', edition: 'consolidated (Justel), incl. MB 05.01.2026', url: EJ + '2017041810', kind: 'law' },
  be_kb_2017_06_18: { title: 'KB van 18 juni 2017 plaatsing overheidsopdrachten in de speciale sectoren / AR du 18 juin 2017 secteurs spéciaux', edition: 'consolidated (Justel)', url: 'https://www.ejustice.just.fgov.be/cgi_loi/welcome.pl?language=nl', kind: 'law', note: 'not yet read by the core unit; utilities periods are taken from Wet 2016 art. 118–126' },
  be_aur_2013: { title: 'KB van 14 januari 2013 tot bepaling van de algemene uitvoeringsregels van de overheidsopdrachten (AUR / RGE)', edition: 'consolidated (Justel), incl. KB 22.06.2017 and KB 04.09.2023', url: EJ + '2013011409', kind: 'law' },
  be_wet_2013: { title: 'Wet van 17 juni 2013 betreffende de motivering, de informatie en de rechtsmiddelen inzake overheidsopdrachten (rechtsbescherming)', edition: 'consolidated (Justel)', url: EJ + '2013061701', kind: 'law' },
  be_wet_1991_erkenning: { title: 'Wet van 20 maart 1991 houdende regeling van de erkenning van aannemers van werken', edition: 'consolidated (Justel)', url: 'https://www.ejustice.just.fgov.be/cgi_loi/welcome.pl?language=nl', kind: 'law' },
  be_kb_1991_erkenning: { title: 'KB van 26 september 1991 tot vaststelling van bepaalde toepassingsmaatregelen van de wet van 20 maart 1991 (erkenning: categorieën en klassen)', edition: 'consolidated (Justel), class limits KB 14.04.2024 in force 01.06.2024', url: EJ + '1991092632', kind: 'law' },
  be_holidays: { title: 'Wet van 4 januari 1974 betreffende de feestdagen + KB van 18 april 1974 (list of the ten public holidays)', edition: 'consolidated (Justel), KB art. 1', url: EJ + '1974041802', kind: 'law' },
  incoterms_2020: { title: 'ICC Incoterms® 2020', edition: 'ICC Publication 723E (structure and rule names only)', url: 'https://iccwbo.org/business-solutions/incoterms-rules/', kind: 'standard' },
  fidic_2017: { title: 'FIDIC Conditions of Contract 2017 (Red Book – Construction, Yellow Book – Plant & Design-Build, Silver Book – EPC/Turnkey), reprinted 2022', edition: '2nd ed. 2017 (clause numbers and structure only)', url: 'https://fidic.org/', kind: 'contract-form' },
  nec4: { title: 'NEC4 Engineering and Construction Contract (main options A–F)', edition: 'June 2017, amended (structure only)', url: 'https://www.neccontract.com/', kind: 'contract-form' },
  orgalime: { title: 'Orgalime S2012 General Conditions for the Supply of Mechanical, Electrical and Electronic Products; Orgalime SI14 (supply and installation)', edition: 'S2012 / SI14 (clause structure only)', url: 'https://orgalim.eu/', kind: 'contract-form' },
  urdg_758: { title: 'ICC Uniform Rules for Demand Guarantees (URDG 758)', edition: '2010 revision (structure only)', url: 'https://iccwbo.org/', kind: 'standard' },
  aace_17r97: { title: 'AACE International RP 17R-97 Cost Estimate Classification System', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  aace_18r97: { title: 'AACE International RP 18R-97 Cost Estimate Classification System — as applied in engineering, procurement and construction for the process industries', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  aace_40r08: { title: 'AACE International RP 40R-08 Contingency Estimating — General Principles', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  aace_41r08: { title: 'AACE International RP 41R-08 Understanding Estimate Accuracy / Risk Analysis Methods', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  aace_56r08: { title: 'AACE International RP 56R-08 Cost Estimate Classification System — building and general construction', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  aace_57r09: { title: 'AACE International RP 57R-09 Integrated Cost and Schedule Risk Analysis using Monte Carlo Simulation of a CPM Model', edition: 'structure only', url: 'https://web.aacei.org/', kind: 'guide' },
  iso_10845_1: { title: 'ISO 10845-1 Construction procurement — Part 1: Processes, methods and procedures', edition: '2020 (structure only)', url: 'https://www.iso.org/standard/76941.html', kind: 'standard' },
  iso_31000: { title: 'ISO 31000 Risk management — Guidelines', edition: '2018 (structure only)', url: 'https://www.iso.org/standard/65694.html', kind: 'standard' },
  iec_31010: { title: 'IEC 31010 Risk management — Risk assessment techniques', edition: '2019 (structure only)', url: 'https://webstore.iec.ch/', kind: 'standard' },
  iso_21500: { title: 'ISO 21500 / ISO 21502 Project, programme and portfolio management', edition: '2021 / 2020 (structure only)', url: 'https://www.iso.org/', kind: 'standard' },
  iec_60300_3_3: { title: 'IEC 60300-3-3 Dependability management — Life cycle costing', edition: '2017 (structure only)', url: 'https://webstore.iec.ch/', kind: 'standard' },
  iso_15686_5: { title: 'ISO 15686-5 Buildings and constructed assets — Service life planning — Part 5: Life-cycle costing', edition: '2017 (structure only)', url: 'https://www.iso.org/', kind: 'standard' },
  ped_2014_68: { title: 'Directive 2014/68/EU Pressure Equipment (PED)', edition: 'OJ L 189, 27.6.2014', url: 'https://eur-lex.europa.eu/eli/dir/2014/68/oj', kind: 'law' },
  mr_2023_1230: { title: 'Regulation (EU) 2023/1230 on machinery (applies from 20.01.2027) / Directive 2006/42/EC', edition: 'OJ L 165, 29.6.2023', url: 'https://eur-lex.europa.eu/eli/reg/2023/1230/oj', kind: 'law' },
  atex_2014_34: { title: 'Directive 2014/34/EU equipment for potentially explosive atmospheres (ATEX)', edition: 'OJ L 96, 29.3.2014', url: 'https://eur-lex.europa.eu/eli/dir/2014/34/oj', kind: 'law' },
  lvd_2014_35: { title: 'Directive 2014/35/EU Low Voltage (LVD)', edition: 'OJ L 96, 29.3.2014', url: 'https://eur-lex.europa.eu/eli/dir/2014/35/oj', kind: 'law' },
  emc_2014_30: { title: 'Directive 2014/30/EU Electromagnetic Compatibility (EMC)', edition: 'OJ L 96, 29.3.2014', url: 'https://eur-lex.europa.eu/eli/dir/2014/30/oj', kind: 'law' },
  dual_use_2021_821: { title: 'Regulation (EU) 2021/821 dual-use items', edition: 'OJ L 206, 11.6.2021, Annex I as updated', url: 'https://eur-lex.europa.eu/eli/reg/2021/821/oj', kind: 'law' },
  en_10204: { title: 'EN 10204 Metallic products — Types of inspection documents (2.1, 2.2, 3.1, 3.2)', edition: '2004 (structure only)', url: 'https://www.nbn.be/', kind: 'standard' },
  iec_62381: { title: 'IEC 62381 Automation systems in the process industry — FAT, SAT and SIT', edition: '2024 (structure only)', url: 'https://webstore.iec.ch/', kind: 'standard' },
  iso_9001: { title: 'ISO 9001 Quality management systems — Requirements (7.5 documented information)', edition: '2015 (structure only)', url: 'https://www.iso.org/standard/62085.html', kind: 'standard' },
  iso_9000: { title: 'ISO 9000 Quality management systems — Fundamentals and vocabulary', edition: '2015 (terms only)', url: 'https://www.iso.org/standard/45481.html', kind: 'standard' },
  vose_2008: { title: 'D. Vose: Risk Analysis — A Quantitative Guide', edition: '3rd ed., Wiley 2008 (PERT, correlation, tornado)', url: 'https://www.wiley.com/', kind: 'book' },
  iman_conover_1982: { title: 'R. L. Iman, W. J. Conover: A distribution-free approach to inducing rank correlation among input variables', edition: 'Communications in Statistics B 11(3), 1982, 311–334', url: 'https://doi.org/10.1080/03610918208812265', kind: 'book' },
  meeus_easter: { title: 'Anonymous Gregorian algorithm for the date of Easter (Meeus/Jones/Butcher)', edition: 'J. Meeus, Astronomical Algorithms, 2nd ed. 1998, ch. 8', url: 'https://en.wikipedia.org/wiki/Date_of_Easter#Anonymous_Gregorian_algorithm', kind: 'book' },
  rfc_4180: { title: 'RFC 4180 Common Format and MIME Type for CSV Files', edition: '2005', url: 'https://www.rfc-editor.org/rfc/rfc4180', kind: 'standard' },
  shipley: { title: 'Shipley Associates / APMP Body of Knowledge — bid/no-bid and capture practice', edition: 'industry practice (labelled as such)', url: 'https://www.apmp.org/', kind: 'guide' },
  learning_assumption: { title: 'Learning assumption — replace with project data', edition: '', url: '', kind: 'learning_assumption' }
};

/* =====================================================================================
   3. RULES — copy of tnd-rules.json (single source; injected by _tnd/core/build_rules.py, checked by _tnd/core/test.mjs).
      Each value: {v, unit, source, article, url, read_date, verified, note?}. Use the helpers below, not raw paths, in pages.
   ===================================================================================== */
/*@RULES_BEGIN*/
var RULES = {"schema":"tools.petrov.re/tender-rules/v1","version":"2026-11-14.1","read_date":"2026-11-14","jurisdiction":"EU + Belgium (federal procurement law; regional rules not covered)","thresholds":{"note":"EU publication thresholds (values excl. VAT). Belgian transposition: KB 18.04.2017 art. 11 as amended by MB 05.01.2026 (in force 01.01.2026).","periods":[{"valid_from":"2026-01-01","valid_to":"2027-12-31","values":{"classic_works":{"v":5404000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2152, art. 1(1)(a) amending Dir. 2014/24/EU art. 4(a)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2152","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2152); Belgium: KB 18.04.2017 art. 11, 1° (MB 05.01.2026)"},"classic_supplies_services_central":{"v":140000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2152, art. 1(1)(b) amending Dir. 2014/24/EU art. 4(b)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2152","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2152); Belgium: KB 18.04.2017 art. 11, 2° (federal authorities, Annex 2 part A)"},"classic_supplies_services_subcentral":{"v":216000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2152, art. 1(1)(c) amending Dir. 2014/24/EU art. 4(c)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2152","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2152); Belgium: KB 18.04.2017 art. 11, 3°"},"classic_social_services":{"v":750000,"unit":"EUR excl. VAT","source":"dir_2014_24","article":"Dir. 2014/24/EU art. 4(d); KB 18.04.2017 art. 11, 4°","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0024","read_date":"2026-11-14","verified":true,"note":"fixed, not revised"},"utilities_supplies_services":{"v":432000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2150, art. 1(1) amending Dir. 2014/25/EU art. 15(a)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2150","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2150)"},"utilities_works":{"v":5404000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2150, art. 1(2) amending Dir. 2014/25/EU art. 15(b)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2150","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2150)"},"utilities_social_services":{"v":1000000,"unit":"EUR excl. VAT","source":"dir_2014_25","article":"Dir. 2014/25/EU art. 15(c)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0025","read_date":"2026-11-14","verified":true,"note":"fixed, not revised"},"concessions":{"v":5404000,"unit":"EUR excl. VAT","source":"eu_thresholds_2026","article":"Delegated Reg. (EU) 2025/2151, art. 1 amending Dir. 2014/23/EU art. 8(1)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025R2151","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32025R2151)"}}},{"valid_from":"2024-01-01","valid_to":"2025-12-31","values":{"classic_works":{"v":5538000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2495, art. 1 amending Dir. 2014/24/EU art. 4(a)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2495","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2495)"},"classic_supplies_services_central":{"v":143000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2495, art. 1 amending Dir. 2014/24/EU art. 4(b)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2495","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2495)"},"classic_supplies_services_subcentral":{"v":221000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2495, art. 1 amending Dir. 2014/24/EU art. 4(c)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2495","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2495)"},"classic_social_services":{"v":750000,"unit":"EUR excl. VAT","source":"dir_2014_24","article":"Dir. 2014/24/EU art. 4(d)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0024","read_date":"2026-11-14","verified":true,"note":"fixed"},"utilities_supplies_services":{"v":443000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2496, art. 1 amending Dir. 2014/25/EU art. 15(a)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2496","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2496)"},"utilities_works":{"v":5538000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2496, art. 1 amending Dir. 2014/25/EU art. 15(b)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2496","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2496)"},"utilities_social_services":{"v":1000000,"unit":"EUR excl. VAT","source":"dir_2014_25","article":"Dir. 2014/25/EU art. 15(c)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0025","read_date":"2026-11-14","verified":true,"note":"fixed"},"concessions":{"v":5538000,"unit":"EUR excl. VAT","source":"eu_thresholds_2024","article":"Delegated Reg. (EU) 2023/2497, art. 1 amending Dir. 2014/23/EU art. 8(1)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R2497","read_date":"2026-11-14","verified":true,"note":"read in the Official Journal text served by the Publications Office (http://publications.europa.eu/resource/celex/32023R2497)"}}}]},"be_national":{"accepted_invoice_below":{"v":30000,"unit":"EUR excl. VAT","source":"be_wet_2016","article":"Wet 17.06.2016 art. 92 (version in force 01.01.2025)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true,"note":"contracts below this value: only title 1 rules apply and the contract may be concluded by an accepted invoice"},"negotiated_without_publication_below":{"v":140000,"unit":"EUR excl. VAT","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 90, 1° (= amount of art. 11, 2°) with Wet 17.06.2016 art. 42 §1, 1°, a)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true,"note":"follows the art. 11, 2° threshold; value for 2026–2027"},"simplified_negotiated_works_below":{"v":750000,"unit":"EUR excl. VAT","source":"be_wet_2016","article":"Wet 17.06.2016 art. 41 §1, 2°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true,"note":"supplies and services: below the EU threshold (art. 41 §1, 1°)"},"competitive_negotiation_works_below":{"v":750000,"unit":"EUR excl. VAT","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 91, 1° (Wet art. 38 §1, 1°, f))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"lot_exemption_works":{"v":1000000,"unit":"EUR excl. VAT","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 12","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true,"note":"lots below this value may be exempted from EU publication (aggregate ≤ 20 % of the total); supplies/services 80 000"},"lot_exemption_supplies_services":{"v":80000,"unit":"EUR excl. VAT","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 12","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true}},"time_limits":{"note":"Minimum periods in days from the dispatch date of the notice or of the invitation (Wet 17.06.2016; mirror Dir. 2014/24/EU art. 27–31 and Dir. 2014/25/EU art. 45–47).","classic":{"open":{"tenders":{"v":35,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 36 §1 (Dir. 2014/24 art. 27(1))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"pin_tenders":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 36 §2 (prior information notice 35 days – 12 months before)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_tenders":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 36 §3 (duly substantiated urgency)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"electronic_reduction":{"v":5,"unit":"days","source":"be_wet_2016","article":"art. 36 §4 (electronic submission)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"restricted":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 37 §1 (Dir. 2014/24 art. 28(1))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"tenders":{"v":30,"unit":"days","source":"be_wet_2016","article":"art. 37 §2","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"pin_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 37 §3","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_requests":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 37 §4, 1°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 37 §4, 2°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"electronic_reduction":{"v":5,"unit":"days","source":"be_wet_2016","article":"art. 37 §5","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"competitive-negotiation":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 38 §3 (Dir. 2014/24 art. 29(1))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"tenders":{"v":30,"unit":"days","source":"be_wet_2016","article":"art. 38 §3 (first offer; art. 37 §§3–5 apply)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"pin_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 38 §3 with art. 37 §3","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_requests":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 38 §3 with art. 37 §4, 1°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 38 §3 with art. 37 §4, 2°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"electronic_reduction":{"v":5,"unit":"days","source":"be_wet_2016","article":"art. 38 §3 with art. 37 §5","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"competitive-dialogue":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 39 §1 (Dir. 2014/24 art. 30(1)); no minimum tender period","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"innovation-partnership":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 40 §1 (Dir. 2014/24 art. 31(1)); no minimum tender period","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"simplified-negotiated":{"tenders":{"v":22,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 41 §2 (art. 37 §§3–5 apply)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true,"note":"Belgian procedure below the EU threshold (works < 750 000 €)"},"pin_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 41 §2 with art. 37 §3","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_tenders":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 41 §2 with art. 37 §4, 2°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"electronic_reduction":{"v":5,"unit":"days","source":"be_wet_2016","article":"art. 41 §2 with art. 37 §5","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}}},"utilities":{"open":{"tenders":{"v":35,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 118 §1 (Dir. 2014/25 art. 45(1))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"pin_tenders":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 118 §2 (periodic indicative notice)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_tenders":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 118 (urgency, above the EU threshold)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"electronic_reduction":{"v":5,"unit":"days","source":"dir_2014_25","article":"Dir. 2014/25/EU art. 45(4)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0025","read_date":"2026-11-14","verified":true,"note":"read in Dir. 2014/25 (OJ text); the Belgian art. 118 paragraph was not re-read by the core unit"}},"restricted":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 119 §1 (above the EU threshold: as a rule ≥ 30, never < 15)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"requests_floor":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 119 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"requests_below_eu":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 119 §1 (below the EU threshold)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"urgency_requests_below_eu":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 119 §1 (below the EU threshold, urgency)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"tenders_no_agreement":{"v":10,"unit":"days","source":"be_wet_2016","article":"art. 119 §2 (tender period agreed with all candidates; without agreement ≥ 10 days)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true}},"competitive-negotiation":{"requests":{"v":30,"unit":"days","source":"be_wet_2016","article":"Wet 17.06.2016 art. 120 §1 (above the EU threshold: as a rule ≥ 30, never < 15)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"requests_floor":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 120 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"requests_below_eu":{"v":15,"unit":"days","source":"be_wet_2016","article":"art. 120 §1 (below the EU threshold)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2016061719","read_date":"2026-11-14","verified":true},"tenders_no_agreement":{"v":10,"unit":"days","source":"dir_2014_25","article":"Dir. 2014/25/EU art. 47(2) (agreed, else ≥ 10 days)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0025","read_date":"2026-11-14","verified":true,"note":"read in Dir. 2014/25; Belgian art. 120 §2 assumed identical — check"}}}},"remedies":{"standstill_days":{"v":15,"unit":"days","source":"be_wet_2013","article":"Wet 17.06.2013 art. 11, first paragraph","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013061701","read_date":"2026-11-14","verified":true,"note":"calendar days from the communication of the motivated decision; with non-simultaneous dispatch from the last dispatch. Directive 89/665 art. 2a(2) minimum is 10 days (electronic) / 15 days."},"standstill_eu_min_electronic":{"v":10,"unit":"days","source":"dir_89_665","article":"Dir. 89/665/EEC art. 2a(2) as inserted by Dir. 2007/66/EC art. 1(2)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32007L0066","read_date":"2026-11-14","verified":true,"note":"EU minimum; Belgium applies 15 days"}},"abnormal":{"be_15pct":{"threshold":{"v":0.15,"unit":"fraction below the mean","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 36 §4","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true,"note":"mandatory price enquiry for every offer at least 15 % below the mean; documents may set a higher percentage when price weighs ≥ 50 % with quality"},"min_bids":{"v":4,"unit":"offers","source":"be_kb_2017_04_18","article":"art. 36 §4 (at least four offers taken into account)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"price_weight_min":{"v":0.5,"unit":"fraction","source":"be_kb_2017_04_18","article":"art. 36 §4 (best price-quality ratio with price ≥ 50 % of the weights)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"mean_rule":{"v":"n>=7: exclude lowest and highest ceil(n/4); n<7: exclude lowest and highest","unit":"rule","source":"be_kb_2017_04_18","article":"art. 36 §4, 1° and 2°","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"scope":{"v":"works, or services in a fraud-sensitive sector, open or restricted procedure; documents may extend it to supplies and other services (price only)","unit":"rule","source":"be_kb_2017_04_18","article":"art. 36 §4","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"negotiated_exemption_works_below":{"v":500000,"unit":"EUR excl. VAT","source":"be_kb_2017_04_18","article":"art. 36 §6 (art. 36 not applicable to negotiated procedures for supplies/services below the EU threshold and works below 500 000 €, unless the documents say otherwise)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true}},"justification_days":{"v":12,"unit":"days","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 36 §2 (unless the invitation sets a longer period)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"grounds":{"v":["efficiency of the construction / production process or service","technical solutions or exceptionally favourable conditions","originality of the works, products or services","lawful State aid received"],"unit":"list","source":"be_kb_2017_04_18","article":"art. 36 §2, 1°–4° (+ compliance with environmental, social and labour law, Wet art. 7)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true},"eu_rule":{"v":"explain price or costs where tenders appear abnormally low; reject only if the evidence does not account for the low level; must reject if it breaches art. 18(2) obligations","unit":"rule","source":"dir_2014_24","article":"Dir. 2014/24/EU art. 69(1)–(3)","url":"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0024","read_date":"2026-11-14","verified":true}},"arithmetic":{"correction":{"v":"the authority corrects arithmetic and purely material errors after a global analysis of the offer and comparison with other offers and market prices; if the real intention cannot be established it may apply the stated unit prices or reject the offer as irregular; corrections stay identifiable next to the original","unit":"rule","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 34 §2–§3","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true,"note":"Note: the text does not state a general \"unit price × quantity prevails\" rule; it gives the option to apply the unit prices when the intention is unclear."},"missing_price_formula":{"v":"P = L × Y / X (price of an item the bidder left blank, from the mean of the other offers)","unit":"rule","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 86","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":false,"note":"formula located in art. 86; variables not yet transcribed by the core unit"}},"selection":{"turnover_max_multiple":{"v":2,"unit":"× estimated contract value","source":"be_kb_2017_04_18","article":"KB 18.04.2017 art. 67 §3 (Dir. 2014/24 art. 58(3))","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2017041810","read_date":"2026-11-14","verified":true,"note":"except in duly motivated cases"}},"aur":{"bond":{"pct":{"v":0.05,"unit":"fraction of the contract value","source":"be_aur_2013","article":"KB 14.01.2013 art. 25 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true,"note":"the authority may require none or a lower percentage (state it in the documents)"},"framework_pct":{"v":0.03,"unit":"fraction of the estimated framework value","source":"be_aur_2013","article":"art. 25 §3 (framework with one contractor, global bond)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"rounding":{"v":10,"unit":"EUR (round up to the next ten)","source":"be_aur_2013","article":"art. 25 §5","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"no_bond_below":{"v":50000,"unit":"EUR award amount","source":"be_aur_2013","article":"art. 25 §6 (version KB 04.09.2023, in force 01.11.2023)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true}},"price_revision":{"mandatory_for":{"v":"works and the services of Annex 1 of the AUR","unit":"rule","source":"be_aur_2013","article":"KB 14.01.2013 art. 38/7 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true,"note":"revision on wages + social charges and one or more relevant elements (materials, raw materials, exchange rates)"},"exemption_value_below":{"v":120000,"unit":"EUR estimated value","source":"be_aur_2013","article":"art. 38/7 §1 (not mandatory below 120 000 € AND initial duration below 120 working days / 180 calendar days)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"exemption_duration_wd":{"v":120,"unit":"working days","source":"be_aur_2013","article":"art. 38/7 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"exemption_duration_cd":{"v":180,"unit":"calendar days","source":"be_aur_2013","article":"art. 38/7 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"fixed_part_min":{"v":null,"unit":"fraction","source":"be_aur_2013","article":"art. 38/7 §1–§2","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true,"note":"NO legal minimum: the formula \"may contain a fixed, non-revisable factor determined by the authority\". A 20 % fixed part is a common practice / older rule, not current law."},"fixed_part_typical":{"v":0.2,"unit":"fraction","source":"learning_assumption","article":"practice","url":"","read_date":"2026-11-14","verified":false,"note":"learning assumption: frequently used fixed part a = 0.20 in Belgian revision formulas; not prescribed by the AUR"}},"delay_works":{"coefficient":{"v":0.45,"unit":"-","source":"be_aur_2013","article":"KB 14.01.2013 art. 86 §1: R = 0.45 × (M × n²) / N²","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"small_M":{"v":75000,"unit":"EUR (M ≤)","source":"be_aur_2013","article":"art. 86 §1 second paragraph","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"small_N":{"v":150,"unit":"days (N ≤)","source":"be_aur_2013","article":"art. 86 §1 second paragraph","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"small_denominator_factor":{"v":150,"unit":"× N replaces N²","source":"be_aur_2013","article":"art. 86 §1 second paragraph","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"calendar_factor":{"v":0.7,"unit":"× days, rounded down","source":"be_aur_2013","article":"art. 86 §3 (period not expressed in working days)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"cap":{"v":0.05,"unit":"fraction of M","source":"be_aur_2013","article":"art. 86 §6","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"cap_award_max":{"v":0.1,"unit":"fraction of M","source":"be_aur_2013","article":"art. 86 §6 (when the period is an award criterion, documents may raise the cap up to 10 %)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"min_charged":{"v":75,"unit":"EUR per contract","source":"be_aur_2013","article":"art. 86 §6 (total below 75 € not charged)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true}},"delay_supplies":{"per_day":{"v":0.001,"unit":"fraction per day of the value delivered late","source":"be_aur_2013","article":"KB 14.01.2013 art. 123 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"cap":{"v":0.075,"unit":"fraction","source":"be_aur_2013","article":"art. 123 §1","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true}},"delay_services":{"per_day":{"v":0.001,"unit":"fraction per day of the value of the services late","source":"be_aur_2013","article":"KB 14.01.2013 art. 154","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true},"cap":{"v":0.075,"unit":"fraction","source":"be_aur_2013","article":"art. 154","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=2013011409","read_date":"2026-11-14","verified":true}}},"erkenning":{"class_limits":{"v":[162000,330000,600000,1080000,2172000,3870000,6396000],"unit":"EUR excl. VAT, classes 1–7 (class 8 unlimited)","source":"be_kb_1991_erkenning","article":"KB 26.09.1991 art. 3 §2 (amounts KB 14.04.2024 art. 1, in force 01.06.2024)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=1991092632","read_date":"2026-11-14","verified":true,"note":"required class = the class matching the amount of the offer to be approved (art. 3 §4)"},"simultaneous_limits":{"v":[819000,2640000,4800000,8400000,17400000,31200000,51600000,312000000],"unit":"EUR excl. VAT, classes 1–8","source":"be_kb_1991_erkenning","article":"art. 3 §3 (total of works in execution at the same time, Belgium and abroad)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=1991092632","read_date":"2026-11-14","verified":true}},"holidays_be":{"v":["01-01","Easter Monday","05-01","Ascension Day","Whit Monday","07-21","08-15","11-01","11-11","12-25"],"unit":"list","source":"be_holidays","article":"KB 18.04.1974 art. 1 (Wet 04.01.1974)","url":"https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=nl&la=N&table_name=wet&cn=1974041802","read_date":"2026-11-14","verified":true,"note":"for 2008 only Ascension Day was replaced by 2 May (KB 10.02.2008); moveable days computed from Easter (Gregorian)"}};
/*@RULES_END*/

function ruleNode(path) {
  var cur = RULES;
  String(path).split('.').forEach(function (k) { cur = cur == null ? undefined : cur[k]; });
  return cur;
}
/* rule(path) -> the value record {v, unit, source, article, url, read_date, verified} or undefined; ruleValue(path) -> .v */
function rule(path) { var n = ruleNode(path); return isObj(n) && 'v' in n ? n : undefined; }
function ruleValue(path) { var n = rule(path); return n ? n.v : undefined; }
var UI_RULE = {
  unverified: L('not verified, learning assumption', 'не перевірено, навчальне припущення', 'nicht verifiziert, Lernannahme', 'niet geverifieerd, leeraanname', 'non vérifié, hypothèse pédagogique', 'no verificado, supuesto didáctico', 'niezweryfikowane, założenie szkoleniowe')
};
/* cite(record, lang) -> 'Wet van 17 juni 2016 inzake overheidsopdrachten, art. 36 § 1' (+ unverified note) */
function cite(rec, lang) {
  if (!rec) return '';
  var s = SOURCES[rec.source];
  var title = s ? s.title.split(' / ')[0].replace(/\s*\(.*$/, '') : (rec.source || '');
  return title + (rec.article ? ', ' + rec.article : '') + (rec.verified === false ? ' — ' + t(UI_RULE.unverified, lang) : '');
}

/* threshold(key, isoDate) -> {v, valid_from, valid_to, ...record} for the period that contains the date (default today), or null.
   keys: classic_works, classic_supplies_services_central, classic_supplies_services_subcentral, classic_social_services,
         utilities_works, utilities_supplies_services, utilities_social_services, concessions */
function threshold(key, iso) {
  var d = iso || isoDate(new Date());
  var periods = (RULES.thresholds && RULES.thresholds.periods) || [];
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    if (d >= p.valid_from && d <= p.valid_to && p.values && p.values[key]) return Object.assign({ valid_from: p.valid_from, valid_to: p.valid_to }, p.values[key]);
  }
  return null;
}
/* thresholdKey({sector:'classic'|'utilities'|'concession', kind:'works'|'supplies'|'services', buyer:'central'|'subcentral', social:bool}) */
function thresholdKey(o) {
  o = o || {};
  if (o.sector === 'concession') return 'concessions';
  var pre = o.sector === 'utilities' ? 'utilities_' : 'classic_';
  if (o.social) return pre + 'social_services';
  if (o.kind === 'works') return pre + 'works';
  if (pre === 'utilities_') return 'utilities_supplies_services';
  return o.buyer === 'central' ? 'classic_supplies_services_central' : 'classic_supplies_services_subcentral';
}
/* aboveEU({value, sector, kind, buyer, social, date}) -> {above: bool|null, threshold: record|null} (value excl. VAT) */
function aboveEU(o) {
  o = o || {};
  var th = threshold(thresholdKey(o), o.date);
  if (!th || !isNum(o.value)) return { above: null, threshold: th };
  return { above: o.value >= th.v, threshold: th };
}

/* minPeriods({procedure, sector, aboveEU, pin, urgency, electronic}) -> {steps:[{id, days, from, article, rule, source}], notes:[]}
   Minimum time limits in days counted from the dispatch date of the notice ('notice') or of the invitation ('invitation'), Wet 17.06.2016.
   classic: open | restricted | competitive-negotiation | competitive-dialogue | innovation-partnership | simplified-negotiated
   ("vereenvoudigde onderhandelingsprocedure met voorafgaande bekendmaking", art. 41) | negotiated-without-publication.
   utilities: open | restricted | competitive-negotiation. Shortening options are exclusive: urgency, else PIN, else electronic reduction. */
function minPeriods(o) {
  o = o || {};
  var sec = o.sector === 'utilities' ? 'utilities' : 'classic';
  var P = (RULES.time_limits || {})[sec] || {};
  var r = P[o.procedure];
  var steps = [], notes = [];
  function rec(k) { return r && r[k] ? r[k] : null; }
  function push(id, key, from, override) {
    var x = rec(key); if (!x) return;
    steps.push({ id: id, days: override != null ? override : x.v, from: from, article: x.article, rule: key, source: x.source });
  }
  function tenders(from) {
    if (o.urgency && rec('urgency_tenders')) push('tenders', 'urgency_tenders', from);
    else if (o.pin && rec('pin_tenders')) push('tenders', 'pin_tenders', from);
    else push('tenders', 'tenders', from, o.electronic && rec('electronic_reduction') ? rec('tenders').v - rec('electronic_reduction').v : null);
    if (o.electronic && !o.urgency && !o.pin && rec('electronic_reduction')) notes.push('electronic_reduction');
  }
  if (o.procedure === 'negotiated-without-publication') return { steps: steps, notes: ['no_minimum_period'] };
  if (!r) return { steps: steps, notes: ['no_rule'] };
  if (o.procedure === 'open' || o.procedure === 'simplified-negotiated') tenders('notice');
  else if (o.procedure === 'restricted' || o.procedure === 'competitive-negotiation') {
    if (sec === 'utilities') {
      if (o.aboveEU === false) push('requests', o.urgency ? 'urgency_requests_below_eu' : 'requests_below_eu', 'notice');
      else push('requests', 'requests', 'notice');
      push('tenders', 'tenders_no_agreement', 'invitation');
      notes.push('utilities_tenders_by_agreement');
    } else {
      push('requests', o.urgency ? 'urgency_requests' : 'requests', 'notice');
      tenders('invitation');
    }
  } else if (o.procedure === 'competitive-dialogue' || o.procedure === 'innovation-partnership') {
    push('requests', 'requests', 'notice');
    notes.push('tender_period_set_by_authority');
  }
  return { steps: steps, notes: notes };
}
/* standstill() -> record (calendar days from the dispatch of the motivated award decision; Wet 17.06.2013 art. 11) */
function standstill() { return rule('remedies.standstill_days'); }

/* AUR delay penalties (KB 14.01.2013).
   works (art. 86): R = 0.45 · M · n² / N²  (N² -> 150·N when M ≤ 75 000 € and N ≤ 150 days); N in working days
   (a period not in working days: days × 0.7, rounded down); total ≤ 5 % of M (up to 10 % when the period is an award criterion);
   a total below 75 € is not charged. supplies (art. 123) / services (art. 154): 0.1 % per day of the value delivered late, max 7.5 %.
   aurDelayPenalty({kind, M, n, N_wd | N_cd, timeIsAwardCriterion, capPct, lateValue}) */
function aurDelayPenalty(o) {
  o = o || {};
  var kind = o.kind || 'works', M = o.M, n = Math.max(0, o.n || 0);
  if (!isNum(M) || M < 0) return null;
  if (kind === 'works') {
    var A = (RULES.aur && RULES.aur.delay_works) || null;
    if (!A) return null;
    var N = o.N_wd;
    if (!isNum(N) && isNum(o.N_cd)) N = Math.floor(o.N_cd * A.calendar_factor.v + 1e-9);
    if (!isNum(N) || N <= 0) return null;
    var small = M <= A.small_M.v && N <= A.small_N.v;
    var denom = small ? A.small_denominator_factor.v * N : N * N;
    var R = A.coefficient.v * M * n * n / denom;
    var capPct = o.timeIsAwardCriterion && isNum(o.capPct) ? Math.max(A.cap.v, Math.min(o.capPct, A.cap_award_max.v)) : A.cap.v;
    var cap = capPct * M;
    var applied = Math.min(R, cap);
    if (applied < A.min_charged.v) applied = 0;
    return { kind: kind, R: R, cap: cap, capPct: capPct, applied: applied, N_wd: N, small: small, nAtCap: M > 0 ? Math.sqrt(cap * denom / (A.coefficient.v * M)) : null, article: A.coefficient.article };
  }
  var S = RULES.aur && (kind === 'supplies' ? RULES.aur.delay_supplies : RULES.aur.delay_services);
  if (!S) return null;
  var base = isNum(o.lateValue) ? o.lateValue : M;
  var R2 = S.per_day.v * n * base, cap2 = S.cap.v * base;
  return { kind: kind, R: R2, cap: cap2, capPct: S.cap.v, applied: Math.min(R2, cap2), nAtCap: S.cap.v / S.per_day.v, article: S.per_day.article };
}
/* aurBond(value, {framework}) -> {amount, pct, required} — KB 14.01.2013 art. 25: 5 % (framework with one contractor 3 %), rounded up
   to the next ten euro; no bond may be required when the award amount is below 50 000 €. */
function aurBond(value, o) {
  var B = RULES.aur && RULES.aur.bond; if (!B || !isNum(value)) return null;
  var pctv = o && isNum(o.pct) ? o.pct : (o && o.framework ? B.framework_pct.v : B.pct.v);
  if (value < B.no_bond_below.v) return { amount: 0, pct: pctv, required: false, reason: 'below_minimum', article: B.no_bond_below.article };
  return { amount: Math.ceil(value * pctv / 10 - 1e-9) * 10, pct: pctv, required: true, article: B.pct.article };
}
/* erkenningClass(amount excl. VAT) -> {cls: 1..8, limit, article} (KB 26.09.1991 art. 3 §2; class 8 unlimited) */
function erkenningClass(amount) {
  var lim = (RULES.erkenning && RULES.erkenning.class_limits && RULES.erkenning.class_limits.v) || [];
  var rec = RULES.erkenning && RULES.erkenning.class_limits;
  if (!isNum(amount) || !lim.length) return null;
  for (var i = 0; i < lim.length; i++) if (amount <= lim[i]) return { cls: i + 1, limit: lim[i], article: rec.article };
  return { cls: lim.length + 1, limit: null, article: rec.article };
}
/* abnormalMean(amounts) -> mean per KB 18.04.2017 art. 36 §4: n ≥ 7 -> drop the lowest and the highest offers that together form
   a quarter of the number of offers (rounded up); n < 7 -> drop the lowest and the highest. */
function abnormalMean(amounts) {
  var a = amounts.filter(isNum).slice().sort(function (x, y) { return x - y; });
  var n = a.length; if (n < 3) return null;
  var kept = n >= 7 ? a.slice(1, n - Math.ceil(n / 4)) : a.slice(1, n - 1);
  if (!kept.length) return null;
  return kept.reduce(function (s, x) { return s + x; }, 0) / kept.length;
}
/* abnormalCheck(amounts, {kind, procedure, priceOnly, priceWeight, fraudSensitive, madeApplicable, threshold})
   -> {applies, reasons[], mean, threshold, limit, flagged:[index]}. The mandatory 15 % check of art. 36 §4 applies to works (and services in
   a fraud-sensitive sector) in open or restricted procedures with ≥ 4 offers, price only or price weight ≥ 50 %; the procurement documents
   may extend it to supplies/other services (price only) or raise the 15 % when quality also counts. Flagging is not rejection (art. 36 §2–3). */
function abnormalCheck(amounts, o) {
  o = o || {};
  var R = RULES.abnormal && RULES.abnormal.be_15pct; if (!R) return null;
  var nValid = amounts.filter(isNum).length, reasons = [];
  var proc = o.procedure || 'open';
  if (proc !== 'open' && proc !== 'restricted') reasons.push('procedure');
  if (o.kind && o.kind !== 'works' && !o.fraudSensitive && !o.madeApplicable) reasons.push('kind');
  if (!o.priceOnly && isNum(o.priceWeight) && o.priceWeight < R.price_weight_min.v) reasons.push('price_weight');
  if (nValid < R.min_bids.v) reasons.push('min_bids');
  var thr = isNum(o.threshold) && o.threshold >= R.threshold.v ? o.threshold : R.threshold.v;
  var mean = abnormalMean(amounts);
  var limit = mean == null ? null : mean * (1 - thr);
  var flagged = [];
  amounts.forEach(function (x, i) { if (isNum(x) && limit != null && x <= limit + 1e-9) flagged.push(i); });
  return { applies: !reasons.length, reasons: reasons, mean: mean, threshold: thr, limit: limit, flagged: flagged, article: R.threshold.article };
}

/* =====================================================================================
   4. Numerics
   ===================================================================================== */
/* mulberry32 seeded PRNG -> function () in [0, 1) */
function rng(seed) {
  var a = (isNum(seed) ? seed : 1) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function randNormal(r) {
  var u = 0;
  while (u <= 1e-300) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
/* gamma(shape k, scale 1) sampler, Marsaglia & Tsang (2000) */
function randGamma(r, k) {
  if (k < 1) { var g = randGamma(r, k + 1), u0 = r(); while (u0 <= 1e-300) u0 = r(); return g * Math.pow(u0, 1 / k); }
  var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    var x = randNormal(r), v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    var u = r();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function randBeta(r, a, b) { var x = randGamma(r, a), y = randGamma(r, b); return x / (x + y); }

/* inverse standard normal CDF (P. J. Acklam's rational approximation, relative error < 1.15e-9) */
function invNorm(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  var pl = 0.02425, q, rr;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; rr = q * q;
  return (((((a[0] * rr + a[1]) * rr + a[2]) * rr + a[3]) * rr + a[4]) * rr + a[5]) * q / (((((b[0] * rr + b[1]) * rr + b[2]) * rr + b[3]) * rr + b[4]) * rr + 1);
}
/* standard normal CDF (Abramowitz & Stegun 7.1.26, absolute error < 1.5e-7) */
function normCdf(x) {
  var s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, tt = 1 / (1 + 0.3275911 * z);
  var y = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}
var Z90 = 1.2815515655446004; /* Φ⁻¹(0.9) */

/* Distributions {type, ...}:
   triangular / pert: min, ml, max (pert λ = 4 unless field lambda); uniform: min, max; normal: mean, sd; lognormal: p10, p90 (> 0);
   fixed: value; event (discrete risk): p (0..1) and impact (another distribution) — the impact occurs with probability p, else 0. */
function pertAB(d) {
  var lam = isNum(d.lambda) ? d.lambda : 4, w = d.max - d.min;
  if (!(w > 0)) return null;
  return { a: 1 + lam * (d.ml - d.min) / w, b: 1 + lam * (d.max - d.ml) / w };
}
function lognParams(d) { return { mu: (Math.log(d.p10) + Math.log(d.p90)) / 2, sigma: (Math.log(d.p90) - Math.log(d.p10)) / (2 * Z90) }; }
var dist = {
  sample: function (d, r) {
    switch (d && d.type) {
      case 'fixed': return d.value;
      case 'uniform': return d.min + (d.max - d.min) * r();
      case 'triangular': {
        var a = d.min, c = d.ml, b = d.max, u = r();
        if (!(b > a)) return a;
        return u < (c - a) / (b - a) ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
      }
      case 'pert': { var ab = pertAB(d); return ab ? d.min + (d.max - d.min) * randBeta(r, ab.a, ab.b) : d.min; }
      case 'normal': return d.mean + d.sd * randNormal(r);
      case 'lognormal': { var lp = lognParams(d); return Math.exp(lp.mu + lp.sigma * randNormal(r)); }
      case 'event': { var hit = r() < d.p, v = dist.sample(d.impact, r); return hit ? v : 0; }
      default: return NaN;
    }
  },
  mean: function (d) {
    switch (d && d.type) {
      case 'fixed': return d.value;
      case 'uniform': return (d.min + d.max) / 2;
      case 'triangular': return (d.min + d.ml + d.max) / 3;
      case 'pert': { var lam = isNum(d.lambda) ? d.lambda : 4; return (d.min + lam * d.ml + d.max) / (lam + 2); }
      case 'normal': return d.mean;
      case 'lognormal': { var lp = lognParams(d); return Math.exp(lp.mu + lp.sigma * lp.sigma / 2); }
      case 'event': return d.p * dist.mean(d.impact);
      default: return NaN;
    }
  },
  variance: function (d) {
    switch (d && d.type) {
      case 'fixed': return 0;
      case 'uniform': return Math.pow(d.max - d.min, 2) / 12;
      case 'triangular': { var a = d.min, c = d.ml, b = d.max; return (a * a + b * b + c * c - a * b - a * c - b * c) / 18; }
      case 'pert': { var ab = pertAB(d); if (!ab) return 0; var s = ab.a + ab.b; return ab.a * ab.b * Math.pow(d.max - d.min, 2) / (s * s * (s + 1)); }
      case 'normal': return d.sd * d.sd;
      case 'lognormal': { var lp = lognParams(d), s2 = lp.sigma * lp.sigma; return (Math.exp(s2) - 1) * Math.exp(2 * lp.mu + s2); }
      case 'event': { var m = dist.mean(d.impact), v = dist.variance(d.impact); return d.p * (v + m * m) - Math.pow(d.p * m, 2); }
      default: return NaN;
    }
  },
  /* check(d) -> '' when usable, else an error key: object | type | number | order | probability */
  check: function (d) {
    if (!isObj(d)) return 'object';
    switch (d.type) {
      case 'fixed': return isNum(d.value) ? '' : 'number';
      case 'uniform': return isNum(d.min) && isNum(d.max) ? (d.max >= d.min ? '' : 'order') : 'number';
      case 'triangular': case 'pert': return isNum(d.min) && isNum(d.ml) && isNum(d.max) ? (d.min <= d.ml && d.ml <= d.max ? '' : 'order') : 'number';
      case 'normal': return isNum(d.mean) && isNum(d.sd) && d.sd >= 0 ? '' : 'number';
      case 'lognormal': return isNum(d.p10) && isNum(d.p90) ? (d.p10 > 0 && d.p90 > d.p10 ? '' : 'order') : 'number';
      case 'event': return isNum(d.p) && d.p >= 0 && d.p <= 1 ? dist.check(d.impact) : 'probability';
      default: return 'type';
    }
  },
  samples: function (d, n, r) { var out = new Float64Array(n); for (var i = 0; i < n; i++) out[i] = dist.sample(d, r); return out; }
};

/* ranks (1-based, ties get the average rank) */
function ranks(x) {
  var n = x.length, idx = new Array(n), out = new Float64Array(n), i;
  for (i = 0; i < n; i++) idx[i] = i;
  idx.sort(function (a, b) { return x[a] - x[b]; });
  for (i = 0; i < n;) {
    var j = i; while (j + 1 < n && x[idx[j + 1]] === x[idx[i]]) j++;
    var rk = (i + j) / 2 + 1;
    for (var k = i; k <= j; k++) out[idx[k]] = rk;
    i = j + 1;
  }
  return out;
}
function pearson(x, y) {
  var n = x.length, mx = 0, my = 0, i;
  for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  var sxy = 0, sxx = 0, syy = 0;
  for (i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
function spearman(x, y) { return pearson(ranks(x), ranks(y)); }

/* Cholesky factor (lower) of a symmetric positive-definite matrix; null when not positive definite */
function cholesky(A) {
  var n = A.length, Lm = [], i, j, k;
  for (i = 0; i < n; i++) { Lm.push([]); for (j = 0; j < n; j++) Lm[i].push(0); }
  for (i = 0; i < n; i++) for (j = 0; j <= i; j++) {
    var s = A[i][j];
    for (k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
    if (i === j) { if (!(s > 1e-12)) return null; Lm[i][i] = Math.sqrt(s); } else Lm[i][j] = s / Lm[j][j];
  }
  return Lm;
}
/* usable correlation matrix: symmetric, unit diagonal, entries clamped to ±0.999, off-diagonals shrunk towards 0 until positive definite */
function fixCorrelation(C) {
  var n = C.length, M = [], i, j;
  for (i = 0; i < n; i++) { M.push([]); for (j = 0; j < n; j++) M[i].push(i === j ? 1 : Math.max(-0.999, Math.min(0.999, (((C[i] && C[i][j]) || 0) + ((C[j] && C[j][i]) || 0)) / 2))); }
  var f = 1, shrunk = 0;
  while (!cholesky(M) && shrunk < 200) {
    f *= 0.95; shrunk++;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) if (i !== j) M[i][j] *= 0.95;
  }
  return { matrix: M, shrinkFactor: f, adjusted: shrunk > 0 };
}
/* imanConover(cols, C, r): reorder independent samples cols[j] (equal length n) so that their rank correlation approaches C (k×k),
   Iman & Conover (1982) with van der Waerden scores Φ⁻¹(i/(n+1)) and the correction for the sample correlation of the scores.
   Marginals are preserved exactly (only the order changes). Returns {cols, achieved (Spearman), target, adjusted}. */
function imanConover(cols, C, r) {
  var k = cols.length; if (!k) return { cols: [], achieved: [], target: [], adjusted: false };
  var n = cols[0].length, i, j, m;
  r = r || rng(12345);
  var fixed = fixCorrelation(C), P = cholesky(fixed.matrix);
  var base = new Float64Array(n);
  for (i = 0; i < n; i++) base[i] = invNorm((i + 1) / (n + 1));
  var S = [];
  for (j = 0; j < k; j++) {
    var col = Float64Array.from(base);
    for (i = n - 1; i > 0; i--) { var q = Math.floor(r() * (i + 1)), tmp = col[i]; col[i] = col[q]; col[q] = tmp; }
    S.push(col);
  }
  var E = [];
  for (i = 0; i < k; i++) { E.push([]); for (j = 0; j < k; j++) E[i].push(i === j ? 1 : pearson(S[i], S[j])); }
  var Q = cholesky(E);
  if (!Q) { Q = []; for (i = 0; i < k; i++) { Q.push([]); for (j = 0; j < k; j++) Q[i].push(i === j ? 1 : 0); } }
  var Qi = [];
  for (i = 0; i < k; i++) { Qi.push([]); for (j = 0; j < k; j++) Qi[i].push(0); }
  for (i = 0; i < k; i++) {
    Qi[i][i] = 1 / Q[i][i];
    for (j = 0; j < i; j++) { var s = 0; for (m = j; m < i; m++) s += Q[i][m] * Qi[m][j]; Qi[i][j] = -s / Q[i][i]; }
  }
  var Mx = [];
  for (i = 0; i < k; i++) { Mx.push([]); for (j = 0; j < k; j++) { var a2 = 0; for (m = 0; m < k; m++) a2 += P[i][m] * Qi[m][j]; Mx[i].push(a2); } }
  var T = [];
  for (j = 0; j < k; j++) T.push(new Float64Array(n));
  for (i = 0; i < n; i++) for (j = 0; j < k; j++) { var v = 0; for (m = 0; m < k; m++) v += Mx[j][m] * S[m][i]; T[j][i] = v; }
  var out = [];
  for (j = 0; j < k; j++) {
    var sorted = Float64Array.from(cols[j]).sort();
    var order = new Array(n); for (i = 0; i < n; i++) order[i] = i;
    var Tj = T[j];
    order.sort(function (a, b) { return Tj[a] - Tj[b]; });
    var res = new Float64Array(n);
    for (i = 0; i < n; i++) res[order[i]] = sorted[i];
    out.push(res);
  }
  var rk = out.map(ranks), achieved = [];
  for (i = 0; i < k; i++) { achieved.push([]); for (j = 0; j < k; j++) achieved[i].push(i === j ? 1 : j < i ? achieved[j][i] : pearson(rk[i], rk[j])); }
  return { cols: out, achieved: achieved, target: fixed.matrix, adjusted: fixed.adjusted };
}

/* percentile (linear interpolation between order statistics, Hyndman–Fan type 7 = Excel PERCENTILE.INC); p in 0..1 */
function percentile(arr, p, isSorted) {
  var a = isSorted ? arr : Float64Array.from(arr).sort();
  var n = a.length; if (!n) return NaN;
  var h = (n - 1) * Math.max(0, Math.min(1, p)), lo = Math.floor(h);
  return lo + 1 < n ? a[lo] + (h - lo) * (a[lo + 1] - a[lo]) : a[lo];
}
/* stats(arr) -> {n, mean, sd (n−1), min, max, p5, p10, p20, p50, p70, p80, p90, p95} */
function stats(arr) {
  var a = Float64Array.from(arr).sort(), n = a.length;
  if (!n) return { n: 0 };
  var s = 0, i; for (i = 0; i < n; i++) s += a[i];
  var mean = s / n, v = 0; for (i = 0; i < n; i++) v += (a[i] - mean) * (a[i] - mean);
  var out = { n: n, mean: mean, sd: n > 1 ? Math.sqrt(v / (n - 1)) : 0, min: a[0], max: a[n - 1] };
  [5, 10, 20, 50, 70, 80, 90, 95].forEach(function (q) { out['p' + q] = percentile(a, q / 100, true); });
  return out;
}
/* histogram(arr, bins | {bins, min, max}) -> {edges, counts, width} */
function histogram(arr, o) {
  o = typeof o === 'number' ? { bins: o } : (o || {});
  var bins = Math.max(1, o.bins || 30), lo = isNum(o.min) ? o.min : Infinity, hi = isNum(o.max) ? o.max : -Infinity, i;
  if (!isNum(o.min) || !isNum(o.max)) for (i = 0; i < arr.length; i++) { if (!isNum(o.min) && arr[i] < lo) lo = arr[i]; if (!isNum(o.max) && arr[i] > hi) hi = arr[i]; }
  if (!(hi > lo)) hi = lo + 1;
  var w = (hi - lo) / bins, counts = [], edges = [];
  for (i = 0; i < bins; i++) counts.push(0);
  for (i = 0; i <= bins; i++) edges.push(lo + i * w);
  for (i = 0; i < arr.length; i++) { var b = Math.floor((arr[i] - lo) / w); if (b === bins && arr[i] <= hi) b--; if (b >= 0 && b < bins) counts[b]++; }
  return { edges: edges, counts: counts, width: w };
}
/* tornado(inputs {name: samples}, output samples) -> [{name, rho, share}] by |rho| desc; share = rho² / Σ rho² ("contribution to variance" by rank correlation) */
function tornado(inputs, output) {
  var ry = ranks(output);
  var rows = Object.keys(inputs).map(function (k) {
    var x = inputs[k], varies = false;
    for (var i = 1; i < x.length; i++) if (x[i] !== x[0]) { varies = true; break; }
    return { name: k, rho: varies ? pearson(ranks(x), ry) : 0 };
  });
  var tot = rows.reduce(function (s, r) { return s + r.rho * r.rho; }, 0);
  rows.forEach(function (r) { r.share = tot > 0 ? r.rho * r.rho / tot : 0; });
  rows.sort(function (a, b) { return Math.abs(b.rho) - Math.abs(a.rho); });
  return rows;
}

/* Finance. npv(rate per period, flows, times?) — flows[i] at time times[i] (default i; flows[0] at t = 0, not discounted). */
function npv(rate, flows, times) {
  var s = 0;
  for (var i = 0; i < flows.length; i++) s += flows[i] / Math.pow(1 + rate, times ? times[i] : i);
  return s;
}
/* irr(flows, times?) -> rate per period with NPV = 0 (bracket + bisection); null when NPV does not change sign in (−99.99 %, ∞) */
function irr(flows, times) {
  var f = function (r) { return npv(r, flows, times); };
  var lo = -0.9999, hi = 1, flo = f(lo), fhi = f(hi), k = 0;
  while (flo * fhi > 0 && k < 40) { hi = hi * 2 + 1; fhi = f(hi); k++; }
  if (!(flo * fhi <= 0) || !isFinite(flo) || !isFinite(fhi)) return null;
  for (var i = 0; i < 400; i++) {
    var mid = (lo + hi) / 2, fm = f(mid);
    if (fm === 0 || (hi - lo) < 1e-13) return mid;
    if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
/* annuity(r, n): payment per period that repays 1 over n periods (r = 0 -> 1/n); pvAnnuity(r, n): present value of 1 per period */
function annuity(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
function pvAnnuity(r, n) { return r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r; }
/* periodRate(annual, perYear): effective rate per period (1 + a)^(1/m) − 1 */
function periodRate(annual, perYear) { return Math.pow(1 + annual, 1 / perYear) - 1; }

/* regularized incomplete beta I_x(a, b): continued fraction with the modified Lentz method (Numerical Recipes §6.4) */
function lnGamma(z) {
  var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  var x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
  var ser = 1.000000000190015; for (var j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap, FP = 1e-300;
  if (Math.abs(d) < FP) d = FP; d = 1 / d; var h = d;
  for (var m = 1; m <= 500; m++) {
    var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
    var del = d * c; h *= del; if (Math.abs(del - 1) < 3e-15) break;
  }
  return h;
}
function betaInc(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  var bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
/* S-curves of cumulative progress: x = elapsed fraction 0..1 -> completed fraction 0..1 (exactly 0 at 0 and 1 at 1).
   logistic(x, k steepness = 10, m midpoint = 0.5) rescaled; beta(x, a = 2, b = 2) = I_x(a, b) (a < b front-loaded); linear(x). */
var scurve = {
  logistic: function (x, k, m) {
    k = isNum(k) ? k : 10; m = isNum(m) ? m : 0.5;
    var f = function (u) { return 1 / (1 + Math.exp(-k * (u - m))); };
    var f0 = f(0), f1 = f(1);
    return (f(Math.max(0, Math.min(1, x))) - f0) / (f1 - f0);
  },
  beta: function (x, a, b) { return betaInc(Math.max(0, Math.min(1, x)), isNum(a) ? a : 2, isNum(b) ? b : 2); },
  linear: function (x) { return Math.max(0, Math.min(1, x)); },
  /* periods(n, shape, p1, p2) -> share of the total in each of n equal periods (sums to 1) */
  periods: function (n, shape, p1, p2) {
    var f = scurve[shape] || scurve.beta, out = [], prev = 0;
    for (var i = 1; i <= n; i++) { var c = f(i / n, p1, p2); out.push(c - prev); prev = c; }
    return out;
  }
};

/* =====================================================================================
   5. Calendar — the ten Belgian public holidays (KB 18.04.1974 art. 1) and working days. Dates are 'YYYY-MM-DD' (UTC calendar dates).
   ===================================================================================== */
function parseDate(iso) {
  if (iso instanceof Date) return isNaN(iso.getTime()) ? null : new Date(Date.UTC(iso.getUTCFullYear(), iso.getUTCMonth(), iso.getUTCDate()));
  if (typeof iso !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function isoDate(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
function addCalendarDays(iso, n) { var d = parseDate(iso); if (!d) return null; d.setUTCDate(d.getUTCDate() + n); return isoDate(d); }
/* Easter Sunday (Gregorian calendar), anonymous algorithm (Meeus/Jones/Butcher) */
function easter(y) {
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return y + '-' + pad2(month) + '-' + pad2(day);
}
var HOLIDAY_NAMES = {
  new_year: L('New Year’s Day', 'Новий рік', 'Neujahr', 'Nieuwjaar', 'Jour de l’an', 'Año Nuevo', 'Nowy Rok'),
  easter_monday: L('Easter Monday', 'Великодній понеділок', 'Ostermontag', 'Paasmaandag', 'Lundi de Pâques', 'Lunes de Pascua', 'Poniedziałek Wielkanocny'),
  labour_day: L('Labour Day', 'День праці', 'Tag der Arbeit', 'Feest van de Arbeid', 'Fête du Travail', 'Día del Trabajo', 'Święto Pracy'),
  ascension: L('Ascension Day', 'Вознесіння Господнє', 'Christi Himmelfahrt', 'Onze-Lieve-Heer-Hemelvaart', 'Ascension', 'Ascensión', 'Wniebowstąpienie Pańskie'),
  whit_monday: L('Whit Monday', 'Понеділок після Трійці', 'Pfingstmontag', 'Pinkstermaandag', 'Lundi de Pentecôte', 'Lunes de Pentecostés', 'Poniedziałek Zielonych Świątek'),
  national_day: L('Belgian National Day', 'Національне свято Бельгії', 'Belgischer Nationalfeiertag', 'Nationale feestdag', 'Fête nationale', 'Fiesta nacional de Bélgica', 'Święto narodowe Belgii'),
  assumption: L('Assumption Day', 'Успіння Пресвятої Богородиці', 'Mariä Himmelfahrt', 'Onze-Lieve-Vrouw-Hemelvaart', 'Assomption', 'Asunción de la Virgen', 'Wniebowzięcie NMP'),
  all_saints: L('All Saints’ Day', 'День усіх святих', 'Allerheiligen', 'Allerheiligen', 'Toussaint', 'Todos los Santos', 'Wszystkich Świętych'),
  armistice: L('Armistice Day', 'День перемир’я', 'Waffenstillstandstag', 'Wapenstilstand', 'Armistice', 'Día del Armisticio', 'Rocznica zawieszenia broni'),
  christmas: L('Christmas Day', 'Різдво Христове', 'Weihnachten', 'Kerstmis', 'Noël', 'Navidad', 'Boże Narodzenie')
};
/* belgianHolidays(year) -> [{date, id, name}] sorted by date */
function belgianHolidays(y) {
  var e = easter(y), out = [
    [y + '-01-01', 'new_year'], [addCalendarDays(e, 1), 'easter_monday'], [y + '-05-01', 'labour_day'], [addCalendarDays(e, 39), 'ascension'],
    [addCalendarDays(e, 50), 'whit_monday'], [y + '-07-21', 'national_day'], [y + '-08-15', 'assumption'], [y + '-11-01', 'all_saints'],
    [y + '-11-11', 'armistice'], [y + '-12-25', 'christmas']
  ].map(function (p) { return { date: p[0], id: p[1], name: HOLIDAY_NAMES[p[1]] }; });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out;
}
var HOL_CACHE = {};
function isHoliday(iso, o) {
  if (!(o && o.holidays === false)) {
    var y = +String(iso).slice(0, 4);
    if (!HOL_CACHE[y]) { HOL_CACHE[y] = {}; belgianHolidays(y).forEach(function (h) { HOL_CACHE[y][h.date] = h.id; }); }
    if (HOL_CACHE[y][iso]) return true;
  }
  return !!(o && Array.isArray(o.extra) && o.extra.indexOf(iso) >= 0);
}
/* isWorkingDay(iso, {weekend: [0, 6], holidays: true, extra: ['YYYY-MM-DD', …]}) — weekend days, Belgian holidays and user non-working dates are off */
function isWorkingDay(iso, o) {
  var d = parseDate(iso); if (!d) return false;
  var we = o && Array.isArray(o.weekend) ? o.weekend : [0, 6];
  if (we.indexOf(d.getUTCDay()) >= 0) return false;
  return !isHoliday(isoDate(d), o);
}
/* addWorkingDays(iso, n, opts): n > 0 forward n working days (start day not counted), n < 0 backward; n = 0 -> start or the next working day */
function addWorkingDays(iso, n, o) {
  var d = parseDate(iso); if (!d) return null;
  var cur = isoDate(d), step = n < 0 ? -1 : 1, left = Math.abs(n), guard = 0;
  if (n === 0) { while (!isWorkingDay(cur, o) && guard++ < 4000) cur = addCalendarDays(cur, 1); return cur; }
  while (left > 0 && guard++ < 400000) { cur = addCalendarDays(cur, step); if (isWorkingDay(cur, o)) left--; }
  return cur;
}
/* workingDaysBetween(a, b, opts): number of working days in (a, b] (negative when b < a) */
function workingDaysBetween(a, b, o) {
  var da = parseDate(a), db = parseDate(b); if (!da || !db) return null;
  var sign = db >= da ? 1 : -1, cur = isoDate(sign > 0 ? da : db), end = isoDate(sign > 0 ? db : da), n = 0, guard = 0;
  while (cur < end && guard++ < 400000) { cur = addCalendarDays(cur, 1); if (isWorkingDay(cur, o)) n++; }
  return sign * n;
}
function calendarDaysBetween(a, b) { var da = parseDate(a), db = parseDate(b); return da && db ? Math.round((db - da) / 86400000) : null; }
/* nextWorkingDay(iso): moving the last day of a period that falls on a non-working day to the next working day follows Regulation
   (EEC, Euratom) No 1182/71 art. 3(4); pages decide whether to apply it and say so. */
function nextWorkingDay(iso, o) { return addWorkingDays(iso, 0, o); }

/* =====================================================================================
   6. Scoring library — price formulas, quality normalisation, weighted sum, ranks, rank-reversal test, weight sensitivity.
      Scores are fractions 0..1 of the criterion weight (pages multiply by the points they show). Formulas are methods of practice,
      not rules of law: the procurement documents must state the formula (Wet 17.06.2016 art. 81; Dir. 2014/24 art. 67(5)).
   ===================================================================================== */
var FORMULAS = {
  proportional: { name: L('Proportional to the lowest (lowest / price)', 'Пропорційно до найнижчої (мін / ціна)', 'Proportional zum niedrigsten (niedrigster / Preis)', 'Evenredig met de laagste (laagste / prijs)', 'Proportionnelle au plus bas (plus bas / prix)', 'Proporcional a la más baja (mínima / precio)', 'Proporcjonalnie do najniższej (najniższa / cena)'), params: [] },
  linear_zero: { name: L('Linear from the lowest to a zero point (k × lowest)', 'Лінійна від найнижчої до нульової точки (k × мін)', 'Linear vom niedrigsten bis zum Nullpunkt (k × niedrigster)', 'Lineair van de laagste tot een nulpunt (k × laagste)', 'Linéaire du plus bas jusqu’à un point zéro (k × plus bas)', 'Lineal desde la más baja hasta un punto cero (k × mínima)', 'Liniowo od najniższej do punktu zerowego (k × najniższa)'), params: [{ id: 'zeroFactor', def: 2, min: 1.01, max: 10 }] },
  linear_pct: { name: L('Linear: points lost per % above the lowest', 'Лінійна: втрата балів за кожен % понад найнижчу', 'Linear: Punktabzug je % über dem niedrigsten', 'Lineair: puntenverlies per % boven de laagste', 'Linéaire : points perdus par % au-dessus du plus bas', 'Lineal: puntos perdidos por cada % sobre la más baja', 'Liniowo: utrata punktów za każdy % powyżej najniższej'), params: [{ id: 'slope', def: 1, min: 0.01, max: 20 }] },
  interpolation: { name: L('Interpolation lowest (full) – highest (zero)', 'Інтерполяція: найнижча (макс.) – найвища (нуль)', 'Interpolation niedrigster (voll) – höchster (null)', 'Interpolatie laagste (volle punten) – hoogste (nul)', 'Interpolation plus bas (maximum) – plus haut (zéro)', 'Interpolación más baja (máximo) – más alta (cero)', 'Interpolacja najniższa (pełne) – najwyższa (zero)'), params: [] },
  mean_relative: { name: L('Relative to the mean (mean = half points)', 'Відносно середньої (середня = половина балів)', 'Relativ zum Mittelwert (Mittelwert = halbe Punkte)', 'Ten opzichte van het gemiddelde (gemiddelde = halve punten)', 'Par rapport à la moyenne (moyenne = moitié des points)', 'Relativa a la media (media = mitad de puntos)', 'Względem średniej (średnia = połowa punktów)'), params: [{ id: 'slope', def: 1, min: 0.1, max: 10 }] },
  floor: { name: L('Proportional with a floor (prices below k × mean scored as k × mean)', 'Пропорційна з нижньою межею (ціни нижче k × середня рахуються як k × середня)', 'Proportional mit Untergrenze (Preise unter k × Mittelwert zählen als k × Mittelwert)', 'Evenredig met bodem (prijzen onder k × gemiddelde tellen als k × gemiddelde)', 'Proportionnelle avec plancher (prix sous k × moyenne comptés à k × moyenne)', 'Proporcional con suelo (precios bajo k × media cuentan como k × media)', 'Proporcjonalnie z progiem (ceny poniżej k × średnia liczone jako k × średnia)'), params: [{ id: 'floorFactor', def: 0.85, min: 0.1, max: 1 }] }
};
var FORMULA_IDS = Object.keys(FORMULAS);
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
/* priceScores(prices[], formula, params) -> scores 0..1 (null for a missing / non-positive price) */
function priceScores(prices, formula, p) {
  p = p || {};
  var v = prices.filter(function (x) { return isNum(x) && x > 0; });
  if (!v.length) return prices.map(function () { return null; });
  var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), mean = v.reduce(function (s, x) { return s + x; }, 0) / v.length;
  return prices.map(function (x) {
    if (!(isNum(x) && x > 0)) return null;
    switch (formula) {
      case 'linear_zero': { var Z = (isNum(p.zeroFactor) ? p.zeroFactor : 2) * mn; return Z > mn ? clamp01((Z - x) / (Z - mn)) : (x === mn ? 1 : 0); }
      case 'linear_pct': return clamp01(1 - (isNum(p.slope) ? p.slope : 1) * (x - mn) / mn);
      case 'interpolation': return mx > mn ? clamp01((mx - x) / (mx - mn)) : 1;
      case 'mean_relative': return clamp01(0.5 + (isNum(p.slope) ? p.slope : 1) * (mean - x) / mean);
      case 'floor': { var F = (isNum(p.floorFactor) ? p.floorFactor : 0.85) * mean, ref = Math.max(mn, F); return clamp01(ref / Math.max(x, F)); }
      default: return mn / x;
    }
  });
}
/* normaliseQuality(values, method 'max' (best = 1) | 'scale' (value / scaleMax) | 'range' (min..max -> 0..1), scaleMax) */
function normaliseQuality(values, method, scaleMax) {
  var v = values.filter(isNum);
  if (!v.length) return values.map(function () { return null; });
  var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v);
  return values.map(function (x) {
    if (!isNum(x)) return null;
    if (method === 'max') return mx > 0 ? x / mx : 0;
    if (method === 'range') return mx > mn ? (x - mn) / (mx - mn) : 1;
    return isNum(scaleMax) && scaleMax > 0 ? clamp01(x / scaleMax) : x;
  });
}
/* rankOf(values, higherIsBetter = true) -> competition ranks (1, 2, 2, 4); null values get null */
function rankOf(values, higher) {
  higher = higher !== false;
  return values.map(function (x) {
    if (!isNum(x)) return null;
    var r = 1; values.forEach(function (y) { if (isNum(y) && (higher ? y > x + 1e-12 : y < x - 1e-12)) r++; });
    return r;
  });
}
/* evaluate(bids, criteria, opts) — bids [{id, price, quality: {Qid: value}}], criteria {price_weight, price_formula, price_params, items:[{id, weight, scale_max}]}
   opts {quality: 'scale'|'max'|'range'} -> rows [{id, price, priceScore, q:{id: 0..1}, qualityPts, pricePts, total, rank}] in input order.
   Weights are used as given (pages warn when price_weight + Σ items ≠ 1). */
function evaluate(bids, criteria, opts) {
  criteria = criteria || {}; opts = opts || {};
  var pw = isNum(criteria.price_weight) ? criteria.price_weight : 1;
  var ps = priceScores(bids.map(function (b) { return b.price; }), criteria.price_formula || 'proportional', criteria.price_params);
  var items = Array.isArray(criteria.items) ? criteria.items : [];
  var qn = {};
  items.forEach(function (it) {
    qn[it.id] = normaliseQuality(bids.map(function (b) { return b.quality ? b.quality[it.id] : null; }), opts.quality || 'scale', isNum(it.scale_max) ? it.scale_max : parseScaleMax(it.scale));
  });
  var rows = bids.map(function (b, i) {
    var q = {}, qp = 0;
    items.forEach(function (it) { var s = qn[it.id][i]; q[it.id] = s; qp += (isNum(s) ? s : 0) * (isNum(it.weight) ? it.weight : 0); });
    var pp = isNum(ps[i]) ? ps[i] * pw : null;
    return { id: b.id != null ? b.id : b.party, price: b.price, priceScore: ps[i], q: q, qualityPts: qp, pricePts: pp, total: pp == null ? null : pp + qp };
  });
  var rk = rankOf(rows.map(function (r) { return r.total; }), true);
  rows.forEach(function (r, i) { r.rank = rk[i]; });
  return rows;
}
function parseScaleMax(scale) { var m = /(\d+(?:\.\d+)?)\s*$/.exec(String(scale || '')); return m ? +m[1] : null; }
function order(rows) { return rows.filter(function (r) { return r.total != null; }).slice().sort(function (a, b) { return b.total - a.total || (a.price - b.price); }).map(function (r) { return r.id; }); }
/* rankReversal(bids, criteria, opts {add: [{id, price, quality}]}) -> {base: order, cases: [{action:'remove'|'add', id, order, swaps: [[a, b]]}], any}
   A swap = two remaining bidders whose relative order differs from the base ranking (rank reversal / IIA violation). */
function rankReversal(bids, criteria, opts) {
  opts = opts || {};
  var base = order(evaluate(bids, criteria, opts));
  function swaps(ord) {
    var out = [];
    for (var i = 0; i < ord.length; i++) for (var j = i + 1; j < ord.length; j++) {
      var a = base.indexOf(ord[i]), b = base.indexOf(ord[j]);
      if (a >= 0 && b >= 0 && a > b) out.push([ord[j], ord[i]]);
    }
    return out;
  }
  var cases = [];
  bids.forEach(function (b) {
    var id = b.id != null ? b.id : b.party;
    var ord = order(evaluate(bids.filter(function (x) { return x !== b; }), criteria, opts));
    cases.push({ action: 'remove', id: id, order: ord, swaps: swaps(ord) });
  });
  (opts.add || []).forEach(function (nb) {
    var ord = order(evaluate(bids.concat([nb]), criteria, opts)).filter(function (x) { return x !== nb.id; });
    cases.push({ action: 'add', id: nb.id, order: ord, swaps: swaps(ord) });
  });
  return { base: base, cases: cases, any: cases.some(function (c) { return c.swaps.length > 0; }) };
}
/* weightSensitivity(bids, criteria, opts {steps = 100}) -> {points: [{w, winner}], switches: [{w, from, to}]}
   price weight w from 0 to 1, quality weights scaled to (1 − w) in their original proportions. */
function weightSensitivity(bids, criteria, opts) {
  opts = opts || {};
  var steps = opts.steps || 100, items = (criteria.items || []);
  var qsum = items.reduce(function (s, it) { return s + (isNum(it.weight) ? it.weight : 0); }, 0) || 1;
  var pts = [], sw = [], prev = null;
  for (var k = 0; k <= steps; k++) {
    var w = k / steps;
    var c = Object.assign({}, criteria, { price_weight: w, items: items.map(function (it) { return Object.assign({}, it, { weight: (1 - w) * (isNum(it.weight) ? it.weight : 0) / qsum }); }) });
    var ord = order(evaluate(bids, c, opts)), win = ord[0] != null ? ord[0] : null;
    pts.push({ w: w, winner: win });
    if (prev != null && win !== prev) sw.push({ w: w, from: prev, to: win });
    prev = win;
  }
  return { points: pts, switches: sw };
}

/* =====================================================================================
   7. Tools of the package + life cycle (stage numbers 0–12 are used in every learn tour and in workflow-map)
   ===================================================================================== */
var STAGES = [
  L('Need, business case, estimate', 'Потреба, обґрунтування, кошторис', 'Bedarf, Wirtschaftlichkeit, Kostenschätzung', 'Behoefte, businesscase, raming', 'Besoin, justification, estimation', 'Necesidad, justificación, estimación', 'Potrzeba, uzasadnienie, kosztorys'),
  L('Procurement strategy', 'Стратегія закупівлі', 'Beschaffungsstrategie', 'Aankoopstrategie', 'Stratégie d’achat', 'Estrategia de contratación', 'Strategia zakupowa'),
  L('Market sounding, RFI, early contractor involvement', 'Вивчення ринку, RFI, раннє залучення підрядника', 'Markterkundung, RFI, frühe Einbindung', 'Marktverkenning, RFI, vroege betrokkenheid', 'Sourcing, RFI, implication précoce', 'Consulta al mercado, RFI, participación temprana', 'Rozeznanie rynku, RFI, wczesne zaangażowanie'),
  L('Selection and qualification', 'Відбір і кваліфікація', 'Eignungsprüfung', 'Selectie en kwalitatieve selectie', 'Sélection qualitative', 'Selección y solvencia', 'Kwalifikacja wykonawców'),
  L('Tender documents, award criteria, bid/no-bid', 'Тендерна документація, критерії, bid/no-bid', 'Vergabeunterlagen, Zuschlagskriterien, Bid/No-Bid', 'Opdrachtdocumenten, gunningscriteria, bid/no-bid', 'Documents du marché, critères d’attribution, go/no-go', 'Pliegos, criterios de adjudicación, bid/no-bid', 'Dokumentacja, kryteria oceny, bid/no-bid'),
  L('Bid preparation: Q&A, RFQs, estimate, risk', 'Підготовка пропозиції: питання, RFQ, кошторис, ризики', 'Angebotsbearbeitung: Fragen, Anfragen, Kalkulation, Risiko', 'Offerte-opmaak: vragen, prijsaanvragen, calculatie, risico', 'Préparation de l’offre : questions, consultations, chiffrage, risques', 'Preparación de la oferta: consultas, RFQ, estimación, riesgos', 'Przygotowanie oferty: pytania, zapytania, kalkulacja, ryzyko'),
  L('Receipt of bids', 'Отримання пропозицій', 'Angebotseingang', 'Ontvangst van de offertes', 'Réception des offres', 'Recepción de ofertas', 'Otwarcie ofert'),
  L('Technical evaluation, clarifications', 'Технічна оцінка, уточнення', 'Technische Wertung, Aufklärung', 'Technische beoordeling, verduidelijkingen', 'Évaluation technique, éclaircissements', 'Evaluación técnica, aclaraciones', 'Ocena techniczna, wyjaśnienia'),
  L('Commercial evaluation: arithmetic, normalisation, LCC, abnormally low', 'Комерційна оцінка: арифметика, нормалізація, LCC, аномально низькі', 'Kaufmännische Wertung: Rechenfehler, Normierung, LCC, ungewöhnlich niedrig', 'Commerciële beoordeling: rekenfouten, normalisatie, LCC, abnormale prijzen', 'Évaluation commerciale : erreurs, normalisation, coût global, prix anormaux', 'Evaluación económica: errores, normalización, LCC, ofertas anormalmente bajas', 'Ocena handlowa: błędy, normalizacja, LCC, rażąco niska cena'),
  L('Negotiation, BAFO', 'Переговори, BAFO', 'Verhandlung, BAFO', 'Onderhandeling, BAFO', 'Négociation, BAFO', 'Negociación, BAFO', 'Negocjacje, BAFO'),
  L('Award, standstill, remedies', 'Присудження, standstill, оскарження', 'Zuschlag, Stillhaltefrist, Rechtsschutz', 'Gunning, wachttermijn, rechtsbescherming', 'Attribution, délai d’attente, recours', 'Adjudicación, plazo suspensivo, recursos', 'Wybór oferty, standstill, odwołania'),
  L('Contract, bonds, advance, purchase orders', 'Договір, гарантії, аванс, замовлення', 'Vertrag, Sicherheiten, Anzahlung, Bestellungen', 'Contract, borgtocht, voorschot, bestellingen', 'Contrat, cautionnement, avance, commandes', 'Contrato, garantías, anticipo, pedidos', 'Umowa, zabezpieczenia, zaliczka, zamówienia'),
  L('Execution: variations, claims, indexation, acceptance', 'Виконання: зміни, претензії, індексація, приймання', 'Ausführung: Nachträge, Claims, Preisgleitung, Abnahme', 'Uitvoering: wijzigingen, claims, prijsherziening, oplevering', 'Exécution : avenants, réclamations, révision des prix, réception', 'Ejecución: modificaciones, reclamaciones, revisión de precios, recepción', 'Realizacja: zmiany, roszczenia, waloryzacja, odbiór')
];
var ROLES = ['client', 'contractor', 'supplier'];
var ROLE_NAMES = {
  client: L('Client (contracting authority / owner)', 'Замовник (орган / власник)', 'Auftraggeber (öffentlicher AG / Bauherr)', 'Opdrachtgever (aanbestedende overheid / bouwheer)', 'Maître d’ouvrage (pouvoir adjudicateur)', 'Cliente (poder adjudicador / propietario)', 'Zamawiający (inwestor)'),
  contractor: L('Contractor (EPC / general contractor)', 'Підрядник (EPC / генпідрядник)', 'Auftragnehmer (GU / EPC)', 'Aannemer (hoofdaannemer / EPC)', 'Entrepreneur (général / EPC)', 'Contratista (EPC / principal)', 'Wykonawca (GW / EPC)'),
  supplier: L('Equipment supplier', 'Постачальник обладнання', 'Ausrüstungslieferant', 'Leverancier van uitrusting', 'Fournisseur d’équipements', 'Proveedor de equipos', 'Dostawca urządzeń')
};
/* live: deployed on tools.petrov.re (deploy units flip it); related: existing tools of other packages that this package links to */
var TOOLS = [
  { id: 'awardcriteria', order: 10, wave: 1, stage: 4, roles: ['client'], live: true, name: L('Award Criteria & Price Scoring Designer', 'Конструктор критеріїв оцінки та формул ціни', 'Zuschlagskriterien & Preisbewertung', 'Gunningscriteria & prijsbeoordeling', 'Critères d’attribution & notation du prix', 'Criterios de adjudicación y puntuación del precio', 'Kryteria oceny ofert i punktacja ceny') },
  { id: 'bidnormalize', order: 20, wave: 1, stage: 8, roles: ['client'], live: true, name: L('Commercial Bid Normalisation', 'Комерційна нормалізація пропозицій', 'Kaufmännische Angebotsnormierung', 'Commerciële normalisatie van offertes', 'Normalisation commerciale des offres', 'Normalización económica de ofertas', 'Normalizacja handlowa ofert') },
  { id: 'lowbidcheck', order: 30, wave: 1, stage: 8, roles: ['client'], live: true, name: L('Abnormally Low Tender Check', 'Перевірка аномально низьких цін', 'Prüfung ungewöhnlich niedriger Angebote', 'Onderzoek abnormale prijzen', 'Contrôle des offres anormalement basses', 'Control de ofertas anormalmente bajas', 'Badanie rażąco niskiej ceny') },
  { id: 'bidnobid', order: 40, wave: 1, stage: 3, roles: ['contractor', 'supplier'], live: true, name: L('Bid / No-Bid Decision', 'Рішення bid / no-bid', 'Bid/No-Bid-Entscheidung', 'Bid/no-bid-beslissing', 'Décision go / no-go', 'Decisión de presentar oferta (bid/no-bid)', 'Decyzja o złożeniu oferty (bid/no-bid)') },
  { id: 'quotelevel', order: 50, wave: 1, stage: 5, roles: ['contractor'], live: true, name: L('Subcontractor & Supplier Quote Levelling', 'Вирівнювання пропозицій субпідрядників і постачальників', 'Preisspiegel für Nachunternehmer & Lieferanten', 'Prijsvergelijking onderaannemers & leveranciers', 'Comparatif des offres sous-traitants & fournisseurs', 'Comparativo de ofertas de subcontratistas y proveedores', 'Porównanie ofert podwykonawców i dostawców') },
  { id: 'riskcontingency', order: 60, wave: 1, stage: 5, roles: ['client', 'contractor', 'supplier'], live: true, name: L('Cost & Schedule Risk (Monte Carlo)', 'Ризики вартості та строків (Монте-Карло)', 'Kosten- & Terminrisiko (Monte Carlo)', 'Kosten- & planningsrisico (Monte Carlo)', 'Risques coûts & délais (Monte-Carlo)', 'Riesgo de coste y plazo (Monte Carlo)', 'Ryzyko kosztów i terminów (Monte Carlo)') },
  { id: 'backtoback', order: 70, wave: 2, stage: 9, roles: ['contractor', 'supplier'], live: false, name: L('Back-to-Back Terms Checker', 'Перевірка умов back-to-back', 'Back-to-Back-Vertragsprüfung', 'Back-to-back-voorwaardencheck', 'Contrôle des conditions back-to-back', 'Verificador de condiciones back-to-back', 'Kontrola warunków back-to-back') },
  { id: 'contractrisk', order: 80, wave: 2, stage: 4, roles: ['contractor', 'supplier'], live: false, name: L('Contract Risk Review', 'Аналіз договірних ризиків', 'Vertragsrisikoprüfung', 'Contractrisicoanalyse', 'Revue des risques contractuels', 'Revisión de riesgos contractuales', 'Przegląd ryzyk umownych') },
  { id: 'priceindex', order: 90, wave: 2, stage: 12, roles: ['client', 'contractor', 'supplier'], live: false, name: L('Price Revision & Indexation', 'Перегляд і індексація цін', 'Preisgleitung & Indexierung', 'Prijsherziening & indexering', 'Révision des prix & indexation', 'Revisión de precios e indexación', 'Waloryzacja i indeksacja cen') },
  { id: 'ldcalc', order: 100, wave: 2, stage: 11, roles: ['client', 'contractor', 'supplier'], live: false, name: L('Liquidated Damages, Bonds & Retention', 'Штрафи за затримку, гарантії та утримання', 'Vertragsstrafen, Sicherheiten & Einbehalte', 'Vertragingsboetes, borgtocht & inhoudingen', 'Pénalités de retard, cautionnement & retenues', 'Penalizaciones, garantías y retenciones', 'Kary umowne, zabezpieczenia i zatrzymania') },
  { id: 'bidcashflow', order: 110, wave: 2, stage: 5, roles: ['contractor', 'supplier'], live: false, name: L('Contract Cash Flow & Financing', 'Грошовий потік і фінансування контракту', 'Vertrags-Cashflow & Finanzierung', 'Cashflow & financiering van het contract', 'Trésorerie & financement du contrat', 'Flujo de caja y financiación del contrato', 'Przepływy pieniężne i finansowanie kontraktu') },
  { id: 'procstrategy', order: 120, wave: 3, stage: 1, roles: ['client'], live: false, name: L('Procurement Strategy Selector', 'Вибір стратегії закупівлі', 'Auswahl der Beschaffungsstrategie', 'Keuze van de aankoopstrategie', 'Choix de la stratégie d’achat', 'Selector de estrategia de contratación', 'Wybór strategii zakupowej') },
  { id: 'procprocedure', order: 130, wave: 3, stage: 1, roles: ['client'], live: false, name: L('Procurement Procedure & Timeline Planner', 'Планувальник процедури та строків закупівлі', 'Vergabeverfahren & Terminplaner', 'Plaatsingsprocedure & tijdsplanning', 'Procédure de passation & calendrier', 'Procedimiento de contratación y calendario', 'Tryb udzielenia zamówienia i harmonogram') },
  { id: 'qualcriteria', order: 140, wave: 3, stage: 3, roles: ['client', 'contractor'], live: false, name: L('Selection Criteria & Qualification Check', 'Критерії відбору та перевірка кваліфікації', 'Eignungskriterien & Eignungsprüfung', 'Selectiecriteria & kwalificatiecheck', 'Critères de sélection & contrôle de qualification', 'Criterios de selección y solvencia', 'Warunki udziału i ocena kwalifikacji') },
  { id: 'awardreport', order: 150, wave: 3, stage: 10, roles: ['client'], live: false, name: L('Award Decision & Standstill Report', 'Рішення про присудження та звіт standstill', 'Zuschlagsentscheidung & Stillhaltefrist', 'Gunningsbeslissing & wachttermijn', 'Décision d’attribution & délai d’attente', 'Resolución de adjudicación y plazo suspensivo', 'Decyzja o wyborze i okres standstill') },
  { id: 'lccaward', order: 160, wave: 3, stage: 8, roles: ['client'], live: false, name: L('Life-Cycle Cost Award Evaluator', 'Оцінка за вартістю життєвого циклу', 'Zuschlag nach Lebenszykluskosten', 'Gunning op levenscycluskosten', 'Attribution au coût du cycle de vie', 'Adjudicación por coste del ciclo de vida', 'Ocena według kosztu cyklu życia') },
  { id: 'bidestimate', order: 170, wave: 4, stage: 5, roles: ['contractor'], live: false, name: L('Tender Estimate from Bill of Quantities', 'Тендерний кошторис за відомістю обсягів', 'Angebotskalkulation aus dem Leistungsverzeichnis', 'Offerteraming uit de meetstaat', 'Chiffrage de l’offre à partir du métré', 'Estimación de la oferta desde las mediciones', 'Kalkulacja oferty z przedmiaru') },
  { id: 'ownerestimate', order: 180, wave: 4, stage: 0, roles: ['client'], live: false, name: L('Owner’s Estimate & Accuracy Class', 'Кошторис замовника та клас точності', 'Kostenschätzung des Bauherrn & Genauigkeitsklasse', 'Raming van de opdrachtgever & nauwkeurigheidsklasse', 'Estimation du maître d’ouvrage & classe de précision', 'Estimación del propietario y clase de precisión', 'Kosztorys inwestorski i klasa dokładności') },
  { id: 'bidplanner', order: 190, wave: 4, stage: 4, roles: ['contractor', 'supplier'], live: false, name: L('Bid Preparation Planner', 'Планувальник підготовки пропозиції', 'Angebotsbearbeitungsplaner', 'Planner voor de offerte-opmaak', 'Planificateur de préparation d’offre', 'Planificador de preparación de ofertas', 'Planer przygotowania oferty') },
  { id: 'addendatracker', order: 200, wave: 4, stage: 5, roles: ['client', 'contractor', 'supplier'], live: false, name: L('Tender Q&A & Addenda Register', 'Реєстр питань і доповнень до тендеру', 'Bieterfragen- & Nachtragsregister', 'Register vragen & antwoorden en addenda', 'Registre questions-réponses & addenda', 'Registro de consultas y adendas', 'Rejestr pytań i zmian SWZ') },
  { id: 'compliancematrix', order: 210, wave: 5, stage: 5, roles: ['supplier'], live: false, name: L('Supplier Compliance & Deviation Matrix', 'Матриця відповідності та відхилень постачальника', 'Konformitäts- & Abweichungsmatrix des Lieferanten', 'Conformiteits- & afwijkingenmatrix leverancier', 'Matrice de conformité & dérogations fournisseur', 'Matriz de cumplimiento y desviaciones del proveedor', 'Macierz zgodności i odstępstw dostawcy') },
  { id: 'leadtime', order: 220, wave: 5, stage: 5, roles: ['supplier', 'contractor'], live: false, name: L('Equipment Lead Time & Factory Load', 'Строк поставки обладнання та завантаження заводу', 'Lieferzeit & Werksauslastung', 'Levertijd & fabrieksbezetting', 'Délai de livraison & charge usine', 'Plazo de entrega y carga de fábrica', 'Czas dostawy i obciążenie fabryki') },
  { id: 'equipprice', order: 230, wave: 5, stage: 5, roles: ['supplier'], live: false, name: L('Equipment Offer Pricing', 'Ціноутворення пропозиції на обладнання', 'Preisbildung für Ausrüstungsangebote', 'Prijsopbouw van een uitrustingsofferte', 'Prix d’une offre d’équipement', 'Precio de una oferta de equipos', 'Wycena oferty na urządzenia') },
  { id: 'conformitypack', order: 240, wave: 5, stage: 11, roles: ['supplier', 'client'], live: false, name: L('Equipment Conformity Pack', 'Пакет відповідності обладнання', 'Konformitätspaket für Ausrüstungen', 'Conformiteitspakket voor uitrusting', 'Dossier de conformité des équipements', 'Paquete de conformidad del equipo', 'Pakiet zgodności urządzeń') },
  { id: 'itpbuilder', order: 250, wave: 5, stage: 11, roles: ['supplier', 'client'], live: false, name: L('Inspection & Test Plan (FAT/SAT)', 'План інспекцій і випробувань (FAT/SAT)', 'Prüf- und Inspektionsplan (FAT/SAT)', 'Inspectie- en testplan (FAT/SAT)', 'Plan d’inspection et d’essais (FAT/SAT)', 'Plan de inspección y ensayos (FAT/SAT)', 'Plan inspekcji i badań (FAT/SAT)') }
];
var RELATED = [
  { id: 'technicalrequisition', stage: 4, roles: ['client', 'contractor'], live: true, related: true, name: L('Technical Requisition', 'Технічна заявка', 'Technische Anfragespezifikation', 'Technische aanvraagspecificatie', 'Réquisition technique', 'Requisición técnica', 'Specyfikacja zakupowa') },
  { id: 'bidevaluation', stage: 7, roles: ['client', 'contractor'], live: true, related: true, name: L('Technical Bid Evaluation', 'Технічна оцінка пропозицій', 'Technische Angebotswertung', 'Technische offertebeoordeling', 'Évaluation technique des offres', 'Evaluación técnica de ofertas', 'Ocena techniczna ofert') },
  { id: 'deviationregister', stage: 7, roles: ['client', 'contractor', 'supplier'], live: true, related: true, name: L('Technical Queries & Deviations', 'Технічні запити та відхилення', 'Technische Rückfragen & Abweichungen', 'Technische vragen & afwijkingen', 'Questions techniques & dérogations', 'Consultas técnicas y desviaciones', 'Zapytania techniczne i odstępstwa') },
  { id: 'vendordocuments', stage: 11, roles: ['client', 'contractor', 'supplier'], live: true, related: true, name: L('Vendor Documents', 'Документація постачальника', 'Herstellerdokumentation', 'Leveranciersdocumenten', 'Documents fournisseur', 'Documentación del proveedor', 'Dokumentacja dostawcy') },
  { id: 'packagereadiness', stage: 11, roles: ['client', 'contractor'], live: true, related: true, name: L('Package Readiness', 'Готовність пакетів', 'Paketreife', 'Gereedheid van pakketten', 'Maturité des lots', 'Madurez de paquetes', 'Gotowość pakietów') },
  { id: 'variationtimeimpact', stage: 12, roles: ['client', 'contractor', 'supplier'], live: true, related: true, name: L('Variation & Time Impact Analysis', 'Зміни та аналіз впливу на строки', 'Nachträge & Bauzeitanalyse', 'Wijzigingen & vertragingsanalyse', 'Avenants & analyse d’impact délai', 'Modificaciones y análisis de impacto en plazo', 'Zmiany i analiza wpływu na czas') },
  { id: 'requirementsmatrix', stage: 4, roles: ['client', 'contractor', 'supplier'], live: true, related: true, name: L('Requirements Matrix', 'Матриця вимог', 'Anforderungsmatrix', 'Eisenmatrix', 'Matrice des exigences', 'Matriz de requisitos', 'Macierz wymagań') },
  { id: 'projectworkspace', stage: 0, roles: ['client', 'contractor', 'supplier'], live: true, related: true, name: L('Project Workspace', 'Робочий простір проєкту', 'Projektarbeitsbereich', 'Projectwerkruimte', 'Espace projet', 'Espacio de proyecto', 'Przestrzeń projektu') }
];
var TOOL_IDS = TOOLS.map(function (x) { return x.id; });
function toolInfo(id) { return TOOLS.concat(RELATED).filter(function (q) { return q.id === id; })[0] || null; }
function toolName(id, lang) { var x = toolInfo(id); return x ? t(x.name, lang) : id; }
/* toolsFor(role, stage?) -> tools of the package relevant to a role (optionally at a stage), sorted by stage then order */
function toolsFor(role, stage) {
  return TOOLS.filter(function (x) { return (!role || x.roles.indexOf(role) >= 0) && (stage == null || x.stage === stage); })
    .sort(function (a, b) { return a.stage - b.stage || a.order - b.order; });
}

/* =====================================================================================
   8. Tender document tools.petrov.re/tender/v1 — validate / normalize / import / export / storage / CSV / project-package bridge
   ===================================================================================== */
/* top-level blocks and the tools that may write them (PLAN §4); '*' = shared, stamped with updatedBy/updatedAt */
var OWNERS = {
  criteria: ['awardcriteria'],
  bids: ['bidnormalize', 'lowbidcheck', 'lccaward', 'awardcriteria'],
  quotes: ['quotelevel'],
  risks: ['riskcontingency'],
  terms: ['backtoback', 'contractrisk'],
  schedule: ['procprocedure', 'bidplanner'],
  tender: '*',
  parties: '*'
};
var ENUMS = {
  role: ['client', 'contractor', 'supplier'],
  procedure: ['open', 'restricted', 'competitive-negotiation', 'competitive-dialogue', 'negotiated-without-publication', 'innovation-partnership', 'simplified-negotiated', 'private'],
  sector: ['classic', 'utilities', 'private'],
  kind: ['works', 'supplies', 'services'],
  contract_form: ['AUR', 'FIDIC-Red', 'FIDIC-Yellow', 'FIDIC-Silver', 'NEC4-A', 'NEC4-B', 'NEC4-C', 'NEC4-D', 'NEC4-E', 'NEC4-F', 'Orgalime-S2012', 'Orgalime-SI14', 'other'],
  party_role: ['bidder', 'subcontractor', 'supplier', 'client'],
  risk_kind: ['cost', 'time', 'both'],
  incoterm: ['', 'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
};
var LIMITS = { bytes: 2000000, depth: 64, nodes: 100000, lots: 200, parties: 500, criteria: 100, bids: 5000, quotes: 5000, risks: 2000, milestones: 2000 };
var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
var ID_RE = /^[A-Za-z0-9_.+\-]{1,40}$/;

function emptyProject(opts) {
  opts = opts || {};
  return {
    schema: SCHEMA, revision: 1, name: opts.name || '', role: ENUMS.role.indexOf(opts.role) >= 0 ? opts.role : 'client', currency: 'EUR', lang: normLang(opts.lang),
    tender: { title: '', reference: '', procedure: 'open', sector: 'classic', kind: 'works', value_est: null, lots: [], deadline: null, contract_form: 'AUR', duration_wd: null },
    parties: [],
    criteria: { price_weight: 1, price_formula: 'proportional', items: [] },
    bids: [], quotes: [], risks: [],
    terms: { client: {}, supplier: {} },
    schedule: { milestones: [] },
    modules: {}
  };
}

var MSG = {
  too_many_nodes: L('more than {n} nodes', 'понад {n} вузлів', 'mehr als {n} Knoten', 'meer dan {n} knooppunten', 'plus de {n} nœuds', 'más de {n} nodos', 'ponad {n} węzłów'),
  too_deep: L('nesting deeper than {n}', 'вкладеність глибша за {n}', 'Verschachtelung tiefer als {n}', 'nesting dieper dan {n}', 'imbrication plus profonde que {n}', 'anidamiento de más de {n} niveles', 'zagnieżdżenie głębsze niż {n}'),
  non_finite: L('non-finite number', 'нескінченне або нечислове значення', 'keine endliche Zahl', 'geen eindig getal', 'nombre non fini', 'número no finito', 'liczba nieskończona lub nieokreślona'),
  bad_type: L('unsupported type {t}', 'непідтримуваний тип {t}', 'nicht unterstützter Typ {t}', 'niet-ondersteund type {t}', 'type {t} non pris en charge', 'tipo {t} no admitido', 'nieobsługiwany typ {t}'),
  not_plain: L('not a plain object', 'не простий об’єкт JSON', 'kein einfaches Objekt', 'geen gewoon object', 'pas un objet simple', 'no es un objeto simple', 'to nie jest zwykły obiekt'),
  forbidden_key: L('forbidden key {k}', 'заборонений ключ {k}', 'verbotener Schlüssel {k}', 'verboden sleutel {k}', 'clé interdite {k}', 'clave prohibida {k}', 'niedozwolony klucz {k}'),
  not_object: L('document is not an object', 'документ не є об’єктом', 'das Dokument ist kein Objekt', 'het document is geen object', 'le document n’est pas un objet', 'el documento no es un objeto', 'dokument nie jest obiektem'),
  number: L('number expected', 'очікується число', 'Zahl erwartet', 'getal verwacht', 'nombre attendu', 'se espera un número', 'oczekiwano liczby'),
  range: L('must be {lo}..{hi}', 'має бути в межах {lo}..{hi}', 'muss zwischen {lo} und {hi} liegen', 'moet tussen {lo} en {hi} liggen', 'doit être compris entre {lo} et {hi}', 'debe estar entre {lo} y {hi}', 'musi mieścić się w zakresie {lo}..{hi}'),
  string: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  object: L('object expected', 'очікується об’єкт', 'Objekt erwartet', 'object verwacht', 'objet attendu', 'se espera un objeto', 'oczekiwano obiektu'),
  array: L('array expected', 'очікується масив', 'Liste (Array) erwartet', 'lijst (array) verwacht', 'tableau attendu', 'se espera una lista (array)', 'oczekiwano tablicy'),
  too_many: L('more than {n} entries', 'понад {n} записів', 'mehr als {n} Einträge', 'meer dan {n} items', 'plus de {n} entrées', 'más de {n} entradas', 'ponad {n} pozycji'),
  schema: L('schema must be {s}', 'схема має бути {s}', 'Schema muss {s} sein', 'schema moet {s} zijn', 'le schéma doit être {s}', 'el esquema debe ser {s}', 'schemat musi mieć wartość {s}'),
  revision: L('revision must be a non-negative integer', 'ревізія має бути цілим невід’ємним числом', 'Revision muss eine nichtnegative ganze Zahl sein', 'revisie moet een niet-negatief geheel getal zijn', 'la révision doit être un entier positif ou nul', 'la revisión debe ser un entero no negativo', 'rewizja musi być nieujemną liczbą całkowitą'),
  enum: L('{k} must be one of {list}', '{k}: допустимі значення {list}', '{k} muss einer der Werte {list} sein', '{k} moet een van {list} zijn', '{k} doit valoir {list}', '{k} debe ser uno de {list}', '{k} musi mieć jedną z wartości {list}'),
  positive: L('positive number expected', 'очікується додатне число', 'positive Zahl erwartet', 'positief getal verwacht', 'nombre positif attendu', 'se espera un número positivo', 'oczekiwano liczby dodatniej'),
  nonneg: L('non-negative number expected', 'очікується невід’ємне число', 'nichtnegative Zahl erwartet', 'niet-negatief getal verwacht', 'nombre positif ou nul attendu', 'se espera un número no negativo', 'oczekiwano liczby nieujemnej'),
  probability: L('probability 0..1 expected', 'очікується ймовірність 0..1', 'Wahrscheinlichkeit 0..1 erwartet', 'kans 0..1 verwacht', 'probabilité de 0 à 1 attendue', 'se espera una probabilidad 0..1', 'oczekiwano prawdopodobieństwa 0..1'),
  item_id: L('id: 1–40 characters A-Z a-z 0-9 _ . + -', 'id: 1–40 символів A-Z a-z 0-9 _ . + -', 'ID: 1–40 Zeichen A-Z a-z 0-9 _ . + -', 'id: 1–40 tekens A-Z a-z 0-9 _ . + -', 'identifiant : 1 à 40 caractères A-Z a-z 0-9 _ . + -', 'id: 1–40 caracteres A-Z a-z 0-9 _ . + -', 'id: 1–40 znaków A-Z a-z 0-9 _ . + -'),
  duplicate_id: L('duplicate id {id}', 'повторний id {id}', 'doppelte ID {id}', 'dubbele id {id}', 'identifiant en double {id}', 'id duplicado {id}', 'powtórzony id {id}'),
  unknown_party: L('party {id} is not in parties (kept)', 'учасника {id} немає в parties (збережено)', 'Partei {id} fehlt in parties (beibehalten)', 'partij {id} ontbreekt in parties (behouden)', 'partie {id} absente de parties (conservée)', 'la parte {id} no está en parties (se conserva)', 'strony {id} brak w parties (zachowano)'),
  weights: L('weights add up to {s}, not 1', 'сума ваг {s}, а не 1', 'Gewichte ergeben {s}, nicht 1', 'gewichten tellen op tot {s}, niet 1', 'les pondérations totalisent {s}, pas 1', 'los pesos suman {s}, no 1', 'wagi sumują się do {s}, a nie 1'),
  dist: L('distribution: {e}', 'розподіл: {e}', 'Verteilung: {e}', 'verdeling: {e}', 'distribution : {e}', 'distribución: {e}', 'rozkład: {e}'),
  date: L('date YYYY-MM-DD expected', 'очікується дата РРРР-ММ-ДД', 'Datum JJJJ-MM-TT erwartet', 'datum JJJJ-MM-DD verwacht', 'date AAAA-MM-JJ attendue', 'se espera una fecha AAAA-MM-DD', 'oczekiwano daty RRRR-MM-DD'),
  currency: L('3-letter currency code expected', 'очікується 3-літерний код валюти', 'dreistelliger Währungscode erwartet', 'muntcode van 3 letters verwacht', 'code de devise à 3 lettres attendu', 'se espera un código de moneda de 3 letras', 'oczekiwano 3-literowego kodu waluty'),
  modules: L('modules must be an object', 'modules має бути об’єктом', 'modules muss ein Objekt sein', 'modules moet een object zijn', 'modules doit être un objet', 'modules debe ser un objeto', 'modules musi być obiektem'),
  module_id: L('bad module id', 'неприпустимий id модуля', 'ungültige Modul-ID', 'ongeldige module-id', 'identifiant de module invalide', 'id de módulo no válido', 'nieprawidłowy id modułu'),
  module: L('module must be an object', 'модуль має бути об’єктом', 'Modul muss ein Objekt sein', 'module moet een object zijn', 'le module doit être un objet', 'el módulo debe ser un objeto', 'moduł musi być obiektem'),
  iso_date: L('ISO date string expected', 'очікується дата у форматі ISO', 'Datum im ISO-Format erwartet', 'datum in ISO-formaat verwacht', 'date au format ISO attendue', 'se espera una fecha en formato ISO', 'oczekiwano daty w formacie ISO'),
  unknown_module: L('module from another tool kept as is', 'модуль іншого інструмента збережено без змін', 'Modul eines anderen Werkzeugs unverändert übernommen', 'module van een ander hulpmiddel ongewijzigd behouden', 'module d’un autre outil conservé tel quel', 'módulo de otra herramienta conservado tal cual', 'moduł innego narzędzia zachowany bez zmian'),
  not_text: L('text expected', 'очікується текст', 'Text erwartet', 'tekst verwacht', 'texte attendu', 'se espera un texto', 'oczekiwano tekstu'),
  too_large: L('file larger than 2 MB', 'файл більший за 2 МБ', 'Datei größer als 2 MB', 'bestand groter dan 2 MB', 'fichier de plus de 2 Mo', 'archivo de más de 2 MB', 'plik większy niż 2 MB'),
  json: L('invalid JSON: {e}', 'некоректний JSON: {e}', 'ungültiges JSON: {e}', 'ongeldige JSON: {e}', 'JSON invalide : {e}', 'JSON no válido: {e}', 'nieprawidłowy JSON: {e}'),
  not_owner: L('tool {tool} may not write block {b}', 'інструмент {tool} не може записувати блок {b}', 'Werkzeug {tool} darf Block {b} nicht schreiben', 'tool {tool} mag blok {b} niet schrijven', 'l’outil {tool} ne peut pas écrire le bloc {b}', 'la herramienta {tool} no puede escribir el bloque {b}', 'narzędzie {tool} nie może zapisywać bloku {b}'),
  not_package: L('not a project package (schema {s})', 'не пакет проєкту (схема {s})', 'kein Projektpaket (Schema {s})', 'geen projectpakket (schema {s})', 'pas un paquet de projet (schéma {s})', 'no es un paquete de proyecto (esquema {s})', 'to nie jest pakiet projektu (schemat {s})')
};
var msgLang = 'en';
/* setLang(lang|fn): language of validation messages (e.msg); projectBar sets it to its own language. e.msg_en always stays English. */
function setLang(l) { msgLang = l; }
function curMsgLang(o) { var l = o && o.lang != null ? o.lang : msgLang; if (typeof l === 'function') { try { l = l(); } catch (e) { l = 'en'; } } return normLang(l); }
function fillMsg(key, args, lang) {
  var tpl = MSG[key] ? t(MSG[key], lang) : key;
  return tpl.replace(/\{(\w+)\}/g, function (m, k) { return args && args[k] != null ? String(args[k]) : m; });
}
function mkErr(code, path, key, args, lang) { return { code: code, path: path, msg: fillMsg(key, args, lang), msg_en: fillMsg(key, args, 'en'), key: key, args: args || {} }; }
function errorText(e, lang) {
  if (!e) return '';
  var m = e.key ? fillMsg(e.key, e.args, normLang(lang)) : (e.msg || String(e));
  return (e.path ? e.path + ' ' : '') + m;
}

/* structural walk: depth, node count, finite numbers, forbidden keys, plain JSON types only */
function walk(doc, errors, lang) {
  var nodes = 0, stopped = false;
  function W(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function w(v, d, path) {
    if (stopped) return;
    if (++nodes > LIMITS.nodes) { W('too_many_nodes', path, 'too_many_nodes', { n: LIMITS.nodes }); stopped = true; return; }
    if (d > LIMITS.depth) { W('too_deep', path, 'too_deep', { n: LIMITS.depth }); stopped = true; return; }
    if (v === null) return;
    var ty = typeof v;
    if (ty === 'number') { if (!isFinite(v)) W('non_finite', path, 'non_finite'); return; }
    if (ty === 'string' || ty === 'boolean') return;
    if (ty !== 'object') { W('bad_type', path, 'bad_type', { t: ty }); return; }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) w(v[i], d + 1, path + '[' + i + ']'); return; }
    var proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) { W('bad_type', path, 'not_plain'); return; }
    var keys = Object.keys(v);
    for (var k = 0; k < keys.length; k++) {
      if (BAD_KEYS[keys[k]]) { W('forbidden_key', path + '.' + keys[k], 'forbidden_key', { k: keys[k] }); continue; }
      w(v[keys[k]], d + 1, path + '.' + keys[k]);
    }
  }
  w(doc, 0, '$');
  return errors;
}
/* JSON.parse never creates a "__proto__" own property through the prototype setter, but it does create an own key named __proto__;
   Object.keys sees it, so walk() refuses it. */

/* validate(doc) -> {ok, errors, warnings}. Unknown fields are allowed (they survive round trips). */
function validate(doc, vopts) {
  var errors = [], warnings = [], lang = curMsgLang(vopts);
  function E(code, path, key, args) { errors.push(mkErr(code, path, key, args, lang)); }
  function Wn(code, path, key, args) { warnings.push(mkErr(code, path, key, args, lang)); }
  function num(v, path, kind, lo, hi) {
    if (v == null) return;
    if (!isNum(v)) { E('type', path, 'number'); return; }
    if (kind === 'pos' && !(v > 0)) E('range', path, 'positive');
    else if (kind === 'nonneg' && !(v >= 0)) E('range', path, 'nonneg');
    else if (kind === 'prob' && !(v >= 0 && v <= 1)) E('range', path, 'probability');
    else if (kind === 'range' && (v < lo || v > hi)) E('range', path, 'range', { lo: lo, hi: hi });
  }
  function str(v, path) { if (v != null && typeof v !== 'string') E('type', path, 'string'); }
  function obj(v, path) { if (v != null && !isObj(v)) { E('type', path, 'object'); return false; } return v != null; }
  function arr(v, path, max) { if (v == null) return false; if (!Array.isArray(v)) { E('type', path, 'array'); return false; } if (v.length > max) { E('too_many', path, 'too_many', { n: max }); return false; } return true; }
  function en(v, path, k, list) { if (v != null && list.indexOf(v) < 0) E('enum', path, 'enum', { k: k, list: list.filter(Boolean).join('|') }); }
  function dt(v, path) { if (v != null && (typeof v !== 'string' || !parseDate(v))) E('date', path, 'date'); }
  function ids(list, path, seen) {
    seen = seen || {};
    list.forEach(function (x, i) {
      if (!isObj(x)) return;
      if (typeof x.id !== 'string' || !ID_RE.test(x.id)) E('item_id', path + '[' + i + '].id', 'item_id');
      else if (seen[x.id]) E('duplicate_id', path + '[' + i + '].id', 'duplicate_id', { id: x.id });
      else seen[x.id] = 1;
    });
    return seen;
  }
  if (!isObj(doc)) return { ok: false, errors: [mkErr('not_object', '$', 'not_object', null, lang)], warnings: warnings };
  walk(doc, errors, lang);
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (doc.schema !== SCHEMA) E('schema', '$.schema', 'schema', { s: SCHEMA });
  if (doc.revision != null && !(isNum(doc.revision) && doc.revision >= 0 && Math.floor(doc.revision) === doc.revision)) E('revision', '$.revision', 'revision');
  str(doc.name, '$.name');
  en(doc.role, '$.role', 'role', ENUMS.role);
  if (doc.currency != null && (typeof doc.currency !== 'string' || !/^[A-Z]{3}$/.test(doc.currency))) E('currency', '$.currency', 'currency');
  if (doc.lang != null && LANGS.indexOf(doc.lang) < 0) E('enum', '$.lang', 'enum', { k: 'lang', list: LANGS.join('|') });
  var tn = doc.tender;
  if (obj(tn, '$.tender')) {
    str(tn.title, '$.tender.title'); str(tn.reference, '$.tender.reference');
    en(tn.procedure, '$.tender.procedure', 'procedure', ENUMS.procedure);
    en(tn.sector, '$.tender.sector', 'sector', ENUMS.sector);
    en(tn.kind, '$.tender.kind', 'kind', ENUMS.kind);
    en(tn.contract_form, '$.tender.contract_form', 'contract_form', ENUMS.contract_form);
    num(tn.value_est, '$.tender.value_est', 'nonneg');
    num(tn.duration_wd, '$.tender.duration_wd', 'nonneg');
    dt(tn.deadline, '$.tender.deadline');
    if (arr(tn.lots, '$.tender.lots', LIMITS.lots)) {
      ids(tn.lots, '$.tender.lots');
      tn.lots.forEach(function (l, i) { if (!isObj(l)) { E('type', '$.tender.lots[' + i + ']', 'object'); return; } str(l.title, '$.tender.lots[' + i + '].title'); num(l.value_est, '$.tender.lots[' + i + '].value_est', 'nonneg'); });
    }
  }
  var partyIds = {};
  if (arr(doc.parties, '$.parties', LIMITS.parties)) {
    doc.parties.forEach(function (p, i) {
      var pth = '$.parties[' + i + ']';
      if (!isObj(p)) { E('type', pth, 'object'); return; }
      str(p.name, pth + '.name'); en(p.role, pth + '.role', 'role', ENUMS.party_role);
      if (p.jv != null && !Array.isArray(p.jv)) E('type', pth + '.jv', 'array');
    });
    partyIds = ids(doc.parties, '$.parties');
  }
  var cr = doc.criteria;
  if (obj(cr, '$.criteria')) {
    num(cr.price_weight, '$.criteria.price_weight', 'range', 0, 1);
    if (cr.price_formula != null && cr.price_formula !== '' && FORMULA_IDS.indexOf(cr.price_formula) < 0) E('enum', '$.criteria.price_formula', 'enum', { k: 'price_formula', list: FORMULA_IDS.join('|') });
    if (arr(cr.items, '$.criteria.items', LIMITS.criteria)) {
      ids(cr.items, '$.criteria.items');
      var sw = isNum(cr.price_weight) ? cr.price_weight : 0;
      cr.items.forEach(function (it, i) { if (!isObj(it)) { E('type', '$.criteria.items[' + i + ']', 'object'); return; } str(it.name, '$.criteria.items[' + i + '].name'); num(it.weight, '$.criteria.items[' + i + '].weight', 'range', 0, 1); if (isNum(it.weight)) sw += it.weight; });
      if (cr.items.length && Math.abs(sw - 1) > 1e-6) Wn('weights', '$.criteria', 'weights', { s: Math.round(sw * 1000) / 1000 });
    }
  }
  if (arr(doc.bids, '$.bids', LIMITS.bids)) doc.bids.forEach(function (b, i) {
    var pth = '$.bids[' + i + ']';
    if (!isObj(b)) { E('type', pth, 'object'); return; }
    num(b.price, pth + '.price', 'nonneg');
    if (b.party != null && typeof b.party !== 'string') E('type', pth + '.party', 'string');
    else if (b.party && doc.parties && !partyIds[b.party]) Wn('unknown_party', pth + '.party', 'unknown_party', { id: b.party });
    en(b.incoterm, pth + '.incoterm', 'incoterm', ENUMS.incoterm);
    ['corrections', 'options'].forEach(function (k) { if (b[k] != null && !Array.isArray(b[k])) E('type', pth + '.' + k, 'array'); });
    ['payment', 'quality', 'lcc'].forEach(function (k) { obj(b[k], pth + '.' + k); });
  });
  if (arr(doc.quotes, '$.quotes', LIMITS.quotes)) doc.quotes.forEach(function (q, i) {
    var pth = '$.quotes[' + i + ']';
    if (!isObj(q)) { E('type', pth, 'object'); return; }
    num(q.price, pth + '.price', 'nonneg'); str(q.package, pth + '.package');
    if (q.exclusions != null && !Array.isArray(q.exclusions)) E('type', pth + '.exclusions', 'array');
    obj(q.scope, pth + '.scope'); obj(q.terms, pth + '.terms');
  });
  if (arr(doc.risks, '$.risks', LIMITS.risks)) {
    ids(doc.risks, '$.risks');
    doc.risks.forEach(function (r, i) {
      var pth = '$.risks[' + i + ']';
      if (!isObj(r)) { E('type', pth, 'object'); return; }
      str(r.title, pth + '.title'); en(r.kind, pth + '.kind', 'kind', ENUMS.risk_kind); num(r.p, pth + '.p', 'prob');
      if (r.impact != null) {
        if (!isObj(r.impact)) E('type', pth + '.impact', 'object');
        else { var e = dist.check(Object.assign({ type: r.impact.dist || r.impact.type }, r.impact)); if (e) E('dist', pth + '.impact', 'dist', { e: e }); }
      }
    });
  }
  if (obj(doc.terms, '$.terms')) { obj(doc.terms.client, '$.terms.client'); obj(doc.terms.supplier, '$.terms.supplier'); }
  if (obj(doc.schedule, '$.schedule')) {
    if (arr(doc.schedule.milestones, '$.schedule.milestones', LIMITS.milestones)) doc.schedule.milestones.forEach(function (m, i) {
      if (!isObj(m)) { E('type', '$.schedule.milestones[' + i + ']', 'object'); return; }
      dt(m.date, '$.schedule.milestones[' + i + '].date');
    });
  }
  if (doc.modules != null) {
    if (!isObj(doc.modules)) E('modules', '$.modules', 'modules');
    else Object.keys(doc.modules).forEach(function (k) {
      var pth = '$.modules.' + k, m = doc.modules[k];
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(k)) { E('module_id', pth, 'module_id'); return; }
      if (!isObj(m)) { E('module', pth, 'module'); return; }
      if (m.updatedAt != null && (typeof m.updatedAt !== 'string' || isNaN(Date.parse(m.updatedAt)))) E('iso_date', pth + '.updatedAt', 'iso_date');
      if (TOOL_IDS.indexOf(k) < 0) Wn('unknown_module', pth, 'unknown_module');
    });
  }
  return { ok: !errors.length, errors: errors, warnings: warnings };
}

/* normalize(doc): fills missing blocks/fields with defaults (never removes unknown fields) */
function normalize(doc) {
  var d = clone(doc), e = emptyProject();
  Object.keys(e).forEach(function (k) { if (d[k] == null) d[k] = clone(e[k]); });
  ['tender', 'criteria', 'terms', 'schedule'].forEach(function (k) {
    if (isObj(d[k])) Object.keys(e[k]).forEach(function (kk) { if (d[k][kk] === undefined) d[k][kk] = clone(e[k][kk]); });
  });
  if (!isObj(d.modules)) d.modules = {};
  return d;
}
function importJSON(text, iopts) {
  var lang = curMsgLang(iopts);
  if (typeof text !== 'string') return { ok: false, doc: null, errors: [mkErr('not_text', '$', 'not_text', null, lang)], warnings: [] };
  if (text.length > LIMITS.bytes) return { ok: false, doc: null, errors: [mkErr('too_large', '$', 'too_large', null, lang)], warnings: [] };
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, doc: null, errors: [mkErr('json', '$', 'json', { e: e.message }, lang)], warnings: [] }; }
  var v = validate(doc, { lang: lang });
  if (!v.ok) return { ok: false, doc: null, errors: v.errors, warnings: v.warnings };
  if (!isObj(doc.modules)) doc.modules = {};
  if (doc.revision == null) doc.revision = 1;
  return { ok: true, doc: doc, errors: [], warnings: v.warnings };
}
function exportJSON(doc) {
  var v = validate(doc);
  if (!v.ok) throw new Error('TndCore.project.exportJSON: invalid document: ' + v.errors.map(function (e) { return e.path + ' ' + e.msg_en; }).join('; '));
  return JSON.stringify(doc, null, 2);
}
/* withModule(doc, toolId, {state, results, summary, blocks?: {criteria|bids|quotes|risks|terms|schedule|tender|parties: value}}) -> new document.
   A tool writes modules.<toolId> and the top-level blocks it owns (OWNERS); shared blocks (tender, parties) are stamped with updatedBy/updatedAt
   (object blocks) or recorded in modules.<toolId>.wrote. revision + 1. Throws on a block the tool does not own or an invalid result. */
function withModule(doc, toolId, payload, opts) {
  if (typeof toolId !== 'string' || !/^[a-z][a-z0-9_-]{0,79}$/.test(toolId)) throw new Error('TndCore.project.withModule: bad tool id');
  var next = clone(doc);
  payload = payload || {};
  var now = payload.updatedAt || (opts && opts.now) || new Date().toISOString();
  if (!isObj(next.modules)) next.modules = {};
  var prev = isObj(next.modules[toolId]) ? next.modules[toolId] : {};
  var mod = clone(prev);
  ['state', 'results', 'summary'].forEach(function (k) { mod[k] = payload[k] !== undefined ? clone(payload[k]) : (prev[k] !== undefined ? prev[k] : {}); });
  Object.keys(payload).forEach(function (k) { if (['state', 'results', 'summary', 'updatedAt', 'blocks'].indexOf(k) < 0 && !BAD_KEYS[k]) mod[k] = clone(payload[k]); });
  mod.updatedAt = now;
  next.modules[toolId] = mod;
  if (isObj(payload.blocks)) Object.keys(payload.blocks).forEach(function (bk) {
    var owner = OWNERS[bk];
    if (!owner || (owner !== '*' && owner.indexOf(toolId) < 0)) throw new Error('TndCore.project.withModule: ' + fillMsg('not_owner', { tool: toolId, b: bk }, 'en'));
    var val = clone(payload.blocks[bk]);
    if (owner === '*' && isObj(val)) { val.updatedBy = toolId; val.updatedAt = now; }
    next[bk] = val;
    mod.wrote = (mod.wrote || []).filter(function (x) { return x !== bk; }).concat([bk]);
  });
  next.revision = (isNum(next.revision) ? next.revision : 0) + 1;
  var v = validate(next);
  if (!v.ok) throw new Error('TndCore.project.withModule: result invalid: ' + v.errors[0].path + ' ' + v.errors[0].msg_en);
  return next;
}
function storage() { try { return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null; } catch (e) { return null; } }
function load() {
  var ls = storage(); if (!ls) return null;
  var raw; try { raw = ls.getItem(STORAGE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var r = importJSON(raw);
  return r.ok ? r.doc : null;
}
/* save(doc) -> {ok, error?}; never throws (storage may be blocked or full) */
function save(doc) {
  var ls = storage(); if (!ls) return { ok: false, error: 'storage_unavailable' };
  var text;
  try { text = exportJSON(doc); } catch (e) { return { ok: false, error: 'invalid', detail: e.message }; }
  try { ls.setItem(STORAGE_KEY, text); return { ok: true }; } catch (e) { return { ok: false, error: 'storage_blocked', detail: String(e && e.message || e) }; }
}
function fileName(name, ext) {
  var b = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '');
  if (b.length > 60) b = b.slice(0, 60).replace(/[_.]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(b)) b = '_' + b;
  return (b || 'tender-project') + (ext || '');
}

/* CSV (RFC 4180, CRLF) with formula-injection guard: text cells starting with = + - @ TAB CR get a leading apostrophe.
   cols: ['key', …] or [{key, label}]; rows: objects or arrays. Numbers are written raw (dot decimal) unless opts.lang is given
   (then fmt with opts.digits and opts.sep, default ';' for languages with a decimal comma). */
function csvCell(v, o) {
  if (v == null) return '';
  var s;
  if (typeof v === 'number') {
    if (!isFinite(v)) s = '';
    else if (o && o.lang && o.lang !== 'en') { s = (isNum(o.digits) ? v.toFixed(o.digits) : String(v)).replace('.', ','); }
    else s = isNum(o && o.digits) && o.lang ? v.toFixed(o.digits) : String(v);
  }
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = '\'' + s;
  var sep = (o && o.sep) || ',';
  if (s.indexOf(sep) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csv(rows, cols, opts) {
  opts = opts || {};
  rows = rows || [];
  var sep = opts.sep || (opts.lang && opts.lang !== 'en' ? ';' : ',');
  var o = { lang: opts.lang, digits: opts.digits, sep: sep };
  if (!cols) cols = rows.length && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [];
  var defs = cols.map(function (c, i) { return typeof c === 'string' ? { key: c, label: c, i: i } : { key: c.key, label: c.label != null ? c.label : c.key, i: i }; });
  var lines = [];
  if (opts.header !== false && defs.length) lines.push(defs.map(function (d) { return csvCell(d.label, o); }).join(sep));
  rows.forEach(function (r) { lines.push(defs.map(function (d) { return csvCell(Array.isArray(r) ? r[d.i] : (r ? r[d.key] : null), o); }).join(sep)); });
  return lines.join('\r\n') + (lines.length ? '\r\n' : '');
}
/* csvParse(text, {sep: auto ',' ';' or TAB, header: true}) -> {header: [], rows: [[]]} (RFC 4180 quotes, CRLF/LF, BOM stripped).
   Values stay text; parseNumber() converts '1.234,5' / '1,234.5' / '1 234,5' / '12%' with an explicit or guessed decimal mark. */
function csvParse(text, opts) {
  opts = opts || {};
  text = String(text || '').replace(/^﻿/, '');
  var sep = opts.sep;
  if (!sep) {
    var first = text.split(/\r?\n/, 1)[0] || '', cnt = function (c) { return first.split(c).length - 1; };
    sep = cnt('\t') > 0 && cnt('\t') >= cnt(';') && cnt('\t') >= cnt(',') ? '\t' : cnt(';') > cnt(',') ? ';' : ',';
  }
  var rows = [], row = [], cell = '', q = false, i = 0, n = text.length;
  while (i < n) {
    var ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { q = true; i++; continue; }
    if (ch === sep) { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  rows = rows.filter(function (r) { return r.length > 1 || r[0] !== ''; });
  var header = opts.header === false ? [] : (rows.shift() || []);
  return { header: header, rows: rows, sep: sep };
}
function parseNumber(s, decimal) {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  if (s == null) return null;
  var x = String(s).trim().replace(/[  \s']/g, '').replace(/^−/, '-').replace(/[€$£]|EUR|USD|GBP/gi, '');
  var percent = /%$/.test(x); x = x.replace(/%$/, '');
  if (!x) return null;
  var dec = decimal;
  if (!dec) {
    var lc = x.lastIndexOf(','), ld = x.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) dec = lc > ld ? ',' : '.';
    else if (lc >= 0) dec = /^-?\d{1,3}(,\d{3})+$/.test(x) ? '.' : ',';
    else dec = ld >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(x) ? ',' : '.';
  }
  x = dec === ',' ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(x)) return null;
  var v = Number(x);
  return isFinite(v) ? (percent ? v / 100 : v) : null;
}

/* project-package/v1 bridge (read-only): readProjectPackage(text | object) -> {ok, errors, project, packages, requisitions, bid_evaluations, deviations, revision}
   Never writes the package (diagram-project.js owns it). Arrays that are missing come back empty. */
function readProjectPackage(src, iopts) {
  var lang = curMsgLang(iopts), doc = src;
  if (typeof src === 'string') {
    if (src.length > LIMITS.bytes) return { ok: false, errors: [mkErr('too_large', '$', 'too_large', null, lang)] };
    try { doc = JSON.parse(src); } catch (e) { return { ok: false, errors: [mkErr('json', '$', 'json', { e: e.message }, lang)] }; }
  }
  if (!isObj(doc)) return { ok: false, errors: [mkErr('not_object', '$', 'not_object', null, lang)] };
  var errs = walk(doc, [], lang);
  if (errs.length) return { ok: false, errors: errs };
  if (doc.schema !== PKG_SCHEMA) return { ok: false, errors: [mkErr('schema', '$.schema', 'not_package', { s: String(doc.schema) }, lang)] };
  function list(v) { return Array.isArray(v) ? clone(v) : []; }
  var st = isObj(doc.structure) ? doc.structure : {};
  return {
    ok: true, errors: [], revision: doc.package_revision != null ? doc.package_revision : null, package_id: doc.package_id || null,
    project: isObj(doc.project) ? clone(doc.project) : {},
    packages: list(st.packages), requisitions: list(doc.requisitions), bid_evaluations: list(doc.bid_evaluations), deviations: list(doc.deviations)
  };
}
/* loadStoredPackage() -> readProjectPackage(localStorage[diagram_project_package]) or null */
function loadStoredPackage() {
  var ls = storage(); if (!ls) return null;
  var raw; try { raw = ls.getItem(PKG_STORAGE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  var r = readProjectPackage(raw);
  return r.ok ? r : null;
}

/* =====================================================================================
   9. UI strings + projectBar + lifecycle strip (DOM only when called)
   ===================================================================================== */
var UI = {
  project: L('Tender project', 'Тендерний проєкт', 'Ausschreibungsprojekt', 'Aanbestedingsproject', 'Projet d’appel d’offres', 'Proyecto de licitación', 'Projekt przetargowy'),
  unnamed: L('(unnamed)', '(без назви)', '(ohne Namen)', '(naamloos)', '(sans nom)', '(sin nombre)', '(bez nazwy)'),
  role: L('My side', 'Моя сторона', 'Meine Seite', 'Mijn kant', 'Mon côté', 'Mi lado', 'Moja strona'),
  bids: L('bids', 'пропозицій', 'Angebote', 'offertes', 'offres', 'ofertas', 'ofert'),
  quotes: L('quotes', 'комерційних пропозицій', 'Preisanfragen-Angebote', 'prijsoffertes', 'devis', 'presupuestos', 'wycen'),
  risks: L('risks', 'ризиків', 'Risiken', 'risico’s', 'risques', 'riesgos', 'ryzyk'),
  parties: L('parties', 'учасників', 'Beteiligte', 'partijen', 'parties', 'partes', 'stron'),
  importJson: L('Import JSON', 'Імпорт JSON', 'JSON importieren', 'JSON importeren', 'Importer JSON', 'Importar JSON', 'Importuj JSON'),
  exportJson: L('Export JSON', 'Експорт JSON', 'JSON exportieren', 'JSON exporteren', 'Exporter JSON', 'Exportar JSON', 'Eksportuj JSON'),
  importPkg: L('Read project package', 'Прочитати пакет проєкту', 'Projektpaket lesen', 'Projectpakket lezen', 'Lire le paquet de projet', 'Leer paquete de proyecto', 'Wczytaj pakiet projektu'),
  pkgRead: L('Project package read (read-only)', 'Пакет проєкту прочитано (лише читання)', 'Projektpaket gelesen (nur lesen)', 'Projectpakket gelezen (alleen lezen)', 'Paquet de projet lu (lecture seule)', 'Paquete de proyecto leído (solo lectura)', 'Pakiet projektu wczytany (tylko odczyt)'),
  pkgStored: L('taken from this browser; click again to choose a file', 'взято з цього браузера; натисніть ще раз, щоб вибрати файл', 'aus diesem Browser übernommen; erneut klicken, um eine Datei zu wählen', 'uit deze browser overgenomen; klik opnieuw om een bestand te kiezen', 'repris de ce navigateur ; cliquez à nouveau pour choisir un fichier', 'tomado de este navegador; vuelva a hacer clic para elegir un archivo', 'pobrano z tej przeglądarki; kliknij ponownie, aby wybrać plik'),
  requisitions: L('requisitions', 'заявок', 'Anfragespezifikationen', 'aanvraagspecificaties', 'réquisitions', 'requisiciones', 'specyfikacji'),
  evaluations: L('bid evaluations', 'оцінок', 'Angebotswertungen', 'offertebeoordelingen', 'évaluations', 'evaluaciones', 'ocen'),
  deviations: L('deviations', 'відхилень', 'Abweichungen', 'afwijkingen', 'dérogations', 'desviaciones', 'odstępstw'),
  newProject: L('New', 'Новий', 'Neu', 'Nieuw', 'Nouveau', 'Nuevo', 'Nowy'),
  rename: L('Rename', 'Перейменувати', 'Umbenennen', 'Hernoemen', 'Renommer', 'Renombrar', 'Zmień nazwę'),
  renamePrompt: L('Project name', 'Назва проєкту', 'Projektname', 'Projectnaam', 'Nom du projet', 'Nombre del proyecto', 'Nazwa projektu'),
  use: L('Use', 'Використати', 'Verwenden', 'Gebruiken', 'Utiliser', 'Usar', 'Użyj'),
  hasData: L('Project has data from', 'Проєкт містить дані з', 'Das Projekt enthält Daten aus', 'Het project bevat gegevens uit', 'Le projet contient des données de', 'El proyecto tiene datos de', 'Projekt zawiera dane z'),
  otherModule: L('Data of another tool (kept, not used here):', 'Дані іншого інструмента (збережено, тут не використовуються):', 'Daten eines anderen Werkzeugs (erhalten, hier nicht genutzt):', 'Gegevens van een ander hulpmiddel (bewaard, hier niet gebruikt):', 'Données d’un autre outil (conservées, non utilisées ici) :', 'Datos de otra herramienta (conservados, no se usan aquí):', 'Dane innego narzędzia (zachowane, tu nieużywane):'),
  noModules: L('No data from the other tendering tools yet', 'Даних з інших тендерних інструментів ще немає', 'Noch keine Daten aus den anderen Ausschreibungswerkzeugen', 'Nog geen gegevens uit de andere aanbestedingstools', 'Pas encore de données des autres outils d’appel d’offres', 'Aún no hay datos de las otras herramientas de licitación', 'Brak jeszcze danych z innych narzędzi przetargowych'),
  invalid: L('File rejected', 'Файл відхилено', 'Datei abgelehnt', 'Bestand geweigerd', 'Fichier refusé', 'Archivo rechazado', 'Plik odrzucony'),
  imported: L('Project imported', 'Проєкт імпортовано', 'Projekt importiert', 'Project geïmporteerd', 'Projet importé', 'Proyecto importado', 'Zaimportowano projekt'),
  storageOff: L('Browser storage unavailable — keep the exported file', 'Сховище браузера недоступне — збережіть експортований файл', 'Browserspeicher nicht verfügbar — Exportdatei aufbewahren', 'Browseropslag niet beschikbaar — bewaar het exportbestand', 'Stockage du navigateur indisponible — conservez le fichier exporté', 'Almacenamiento no disponible: conserve el archivo exportado', 'Pamięć przeglądarki niedostępna — zachowaj wyeksportowany plik'),
  confirmNew: L('Start a new project? The project stored in this browser will be replaced.', 'Почати новий проєкт? Проєкт, збережений у цьому браузері, буде замінено.', 'Neues Projekt beginnen? Das in diesem Browser gespeicherte Projekt wird ersetzt.', 'Nieuw project beginnen? Het in deze browser opgeslagen project wordt vervangen.', 'Commencer un nouveau projet ? Le projet enregistré dans ce navigateur sera remplacé.', '¿Empezar un proyecto nuevo? Se reemplazará el proyecto guardado en este navegador.', 'Rozpocząć nowy projekt? Projekt zapisany w tej przeglądarce zostanie zastąpiony.'),
  soon: L('soon', 'незабаром', 'bald', 'binnenkort', 'bientôt', 'próximamente', 'wkrótce'),
  siblings: L('Tendering tools for my side', 'Тендерні інструменти для моєї сторони', 'Ausschreibungswerkzeuge für meine Seite', 'Aanbestedingstools voor mijn kant', 'Outils d’appel d’offres pour mon côté', 'Herramientas de licitación para mi lado', 'Narzędzia przetargowe dla mojej strony'),
  related: L('Related', 'Пов’язані', 'Verwandt', 'Verwant', 'Liés', 'Relacionadas', 'Powiązane'),
  lifecycle: L('Tender life cycle', 'Життєвий цикл тендеру', 'Lebenszyklus der Ausschreibung', 'Levenscyclus van de aanbesteding', 'Cycle de vie de l’appel d’offres', 'Ciclo de vida de la licitación', 'Cykl życia przetargu'),
  stage: L('Stage', 'Етап', 'Phase', 'Fase', 'Étape', 'Etapa', 'Etap'),
  thisTool: L('this tool', 'цей інструмент', 'dieses Werkzeug', 'deze tool', 'cet outil', 'esta herramienta', 'to narzędzie'),
  privacy: L('Everything is computed in your browser; the project never leaves this device unless you export it.', 'Усе обчислюється у вашому браузері; проєкт не залишає цей пристрій, доки ви його не експортуєте.', 'Alles wird in Ihrem Browser berechnet; das Projekt verlässt dieses Gerät nur, wenn Sie es exportieren.', 'Alles wordt in uw browser berekend; het project verlaat dit apparaat alleen als u het exporteert.', 'Tout est calculé dans votre navigateur ; le projet ne quitte cet appareil que si vous l’exportez.', 'Todo se calcula en su navegador; el proyecto solo sale de este dispositivo si usted lo exporta.', 'Wszystko jest liczone w przeglądarce; projekt opuszcza to urządzenie tylko wtedy, gdy go wyeksportujesz.'),
  learningAssumption: L('learning assumption — replace with project data', 'навчальне припущення — замініть даними проєкту', 'Lernannahme — durch Projektdaten ersetzen', 'leeraanname — vervang door projectgegevens', 'hypothèse pédagogique — à remplacer par les données du projet', 'supuesto didáctico: sustitúyalo por datos del proyecto', 'założenie szkoleniowe — zastąp danymi projektu'),
  disclaimer: L('Engineering and commercial analysis, not legal advice. Check the procurement documents, the applicable law and the contract with your legal adviser.',
    'Інженерний і комерційний аналіз, а не юридична консультація. Перевіряйте тендерну документацію, чинне право та договір з вашим юристом.',
    'Technische und kaufmännische Analyse, keine Rechtsberatung. Vergabeunterlagen, geltendes Recht und Vertrag mit Ihrer Rechtsberatung prüfen.',
    'Technische en commerciële analyse, geen juridisch advies. Toets de opdrachtdocumenten, de toepasselijke regelgeving en het contract met uw juridisch adviseur.',
    'Analyse technique et commerciale, pas un avis juridique. Vérifiez les documents du marché, le droit applicable et le contrat avec votre conseiller juridique.',
    'Análisis técnico y comercial, no asesoramiento jurídico. Compruebe los pliegos, la normativa aplicable y el contrato con su asesor jurídico.',
    'Analiza techniczna i handlowa, a nie porada prawna. Sprawdź dokumentację zamówienia, obowiązujące przepisy i umowę z doradcą prawnym.')
};

function mkEl(tag, attrs, text) {
  var x = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] == null) return; if (k === 'style') x.style.cssText = attrs[k]; else x.setAttribute(k, attrs[k]); });
  if (text != null) x.textContent = text;
  return x;
}
var BTN_STYLE = 'min-height:var(--ctl-h,32px);padding:0 10px;border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel-2,#f9fafc);color:var(--ink,#12161d);cursor:pointer;font:inherit';
var MUTED = 'color:var(--muted,#5b6675)';
function hrefFor(id, lang) { return id + '.html' + (lang !== 'en' ? '?lang=' + lang : ''); }

/* projectBar({mount, toolId, lang (string|fn), doc?, getDoc?, onChange(doc), onUse(moduleId, module, doc), onPackage(pkg), onRole(role), syncTabs?})
   Shows project name, counts, role switch (filters sibling links), Import/Export JSON, Read project package (read-only), New, Rename,
   data of other tools with an explicit "Use" button, links to the sibling tools for the chosen role. */
function projectBar(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return normLang(v); };
  var tx = function (k) { return t(UI[k], lang()); };
  setLang(lang);
  var doc = opts.doc ? clone(opts.doc) : (load() || emptyProject({ lang: lang() }));
  var storageOk = !!storage();
  var pkg = null, pkgTried = false;
  var uid = 'tndpb' + Math.floor(Math.random() * 1e9).toString(36);
  var box = mkEl('section', { 'class': 'tnd-project-bar no-print', 'aria-label': 'project', style: 'border:1px solid var(--line,#e2e7ee);border-radius:var(--radius-sm,8px);background:var(--panel,#fff);padding:var(--sp-3,12px);margin:var(--sp-3,12px) 0;font-size:var(--fs-small,13px);display:flex;flex-direction:column;gap:var(--sp-2,8px)' });
  var head = mkEl('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' });
  var title = mkEl('strong'), count = mkEl('span', { style: MUTED });
  var roleLab = mkEl('label', { 'for': uid + '-role', style: MUTED });
  var roleSel = mkEl('select', { id: uid + '-role', 'data-tnd': 'role', style: BTN_STYLE });
  ROLES.forEach(function (r) { roleSel.appendChild(mkEl('option', { value: r })); });
  var bImport = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-tnd': 'import' }), bExport = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-tnd': 'export' });
  var bPkg = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-tnd': 'package' });
  var bNew = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-tnd': 'new' }), bRename = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-tnd': 'rename' });
  var file = mkEl('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var pfile = mkEl('input', { type: 'file', accept: '.json,application/json', hidden: 'hidden', tabindex: '-1' });
  var modules = mkEl('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  var nav = mkEl('nav', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  var status = mkEl('div', { role: 'status', 'aria-live': 'polite', style: MUTED + ';min-height:1em' });
  [title, count, roleLab, roleSel, bRename, bImport, bExport, bPkg, bNew, file, pfile].forEach(function (x) { head.appendChild(x); });
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
  function newerStored(cur) {
    var st = load(); if (!st) return cur;
    var a = stamp(st), b = stamp(cur);
    if (!(a > b || (a === b && (st.revision || 0) > (cur.revision || 0)))) return cur;
    doc = st; render();
    return st;
  }
  function render() {
    var L_ = lang();
    box.setAttribute('aria-label', tx('project'));
    title.textContent = tx('project') + ': ' + (doc.name || tx('unnamed'));
    var parts = [];
    var tn = doc.tender || {};
    if (tn.title) parts.push(tn.title);
    if (isNum(tn.value_est)) parts.push(money(tn.value_est, doc.currency, L_));
    [['parties', 'parties'], ['bids', 'bids'], ['quotes', 'quotes'], ['risks', 'risks']].forEach(function (p) { var n = Array.isArray(doc[p[0]]) ? doc[p[0]].length : 0; if (n) parts.push(n + ' ' + tx(p[1])); });
    if (pkg) parts.push(tx('pkgRead') + ': ' + pkg.requisitions.length + ' ' + tx('requisitions') + ', ' + pkg.bid_evaluations.length + ' ' + tx('evaluations') + ', ' + pkg.deviations.length + ' ' + tx('deviations'));
    count.textContent = parts.join(' · ');
    roleLab.textContent = tx('role');
    Array.prototype.forEach.call(roleSel.options, function (o) { o.textContent = t(ROLE_NAMES[o.value], L_); });
    roleSel.value = ENUMS.role.indexOf(doc.role) >= 0 ? doc.role : 'client';
    file.setAttribute('aria-label', tx('importJson')); pfile.setAttribute('aria-label', tx('importPkg'));
    bImport.textContent = tx('importJson'); bExport.textContent = tx('exportJson'); bPkg.textContent = tx('importPkg'); bNew.textContent = tx('newProject'); bRename.textContent = tx('rename');
    modules.textContent = '';
    var mids = Object.keys(doc.modules || {}).filter(function (k) { return k !== opts.toolId; });
    if (!mids.length) modules.appendChild(mkEl('span', { style: MUTED }, tx('noModules')));
    mids.forEach(function (k) {
      var m = doc.modules[k], known = TOOL_IDS.indexOf(k) >= 0;
      var dte = m && m.updatedAt ? String(m.updatedAt).slice(0, 10) : '';
      var chip = mkEl('span', { style: 'display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:var(--radius-pill,999px);background:var(--weak,rgba(55,99,230,.1))' });
      chip.appendChild(mkEl('span', known ? null : { 'data-foreign': k }, (known ? tx('hasData') + ' ' + toolName(k, L_) : tx('otherModule') + ' ' + k) + (dte ? ' (' + date(dte, L_) + ')' : '')));
      if (typeof opts.onUse === 'function' && known) {
        var bu = mkEl('button', { type: 'button', style: BTN_STYLE, 'data-module': k }, tx('use'));
        bu.addEventListener('click', function () { opts.onUse(k, clone(doc.modules[k]), clone(doc)); });
        chip.appendChild(bu);
      }
      modules.appendChild(chip);
    });
    nav.textContent = '';
    nav.appendChild(mkEl('span', { style: MUTED }, tx('siblings') + ':'));
    var role = roleSel.value;
    toolsFor(role).concat(toolInfo(opts.toolId) && toolInfo(opts.toolId).roles.indexOf(role) < 0 ? [toolInfo(opts.toolId)] : []).forEach(function (tool) {
      if (tool.id === opts.toolId) { nav.appendChild(mkEl('strong', { 'aria-current': 'page' }, t(tool.name, L_))); return; }
      if (!tool.live) { nav.appendChild(mkEl('span', { style: MUTED, 'data-tnd': 'soon' }, t(tool.name, L_) + ' (' + tx('soon') + ')')); return; }
      nav.appendChild(mkEl('a', { href: hrefFor(tool.id, L_) }, t(tool.name, L_)));
    });
    var rel = RELATED.filter(function (x) { return x.roles.indexOf(role) >= 0; });
    if (rel.length) {
      nav.appendChild(mkEl('span', { style: MUTED }, '· ' + tx('related') + ':'));
      rel.forEach(function (tool) { nav.appendChild(mkEl('a', { href: hrefFor(tool.id, L_), 'data-tnd': 'related' }, t(tool.name, L_))); });
    }
  }
  roleSel.addEventListener('change', function () {
    var next = clone(doc); next.role = roleSel.value; next.revision = (next.revision || 0) + 1;
    setDoc(next, true);
    if (typeof opts.onRole === 'function') opts.onRole(next.role);
  });
  function readFile(input, cb) {
    var f = input.files && input.files[0]; if (!f) return;
    if (f.size > LIMITS.bytes) { status.textContent = tx('invalid') + ': > 2 MB'; input.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () { cb(String(rd.result)); input.value = ''; };
    rd.readAsText(f);
  }
  bImport.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    readFile(file, function (text) {
      var r = importJSON(text, { lang: lang() });
      if (!r.ok) status.textContent = tx('invalid') + ': ' + r.errors.slice(0, 3).map(function (e) { return e.path + ' ' + e.msg; }).join('; ');
      else { setDoc(r.doc); status.textContent = tx('imported') + (r.warnings.length ? ' — ' + r.warnings.slice(0, 2).map(function (e) { return e.path + ' ' + e.msg; }).join('; ') : ''); }
    });
  });
  bPkg.addEventListener('click', function () {
    /* first click: the package stored in this browser by the project-delivery tools (if any); next clicks: choose a file */
    var st = pkgTried ? null : loadStoredPackage();
    pkgTried = true;
    if (st) { pkg = st; status.textContent = tx('pkgRead') + ' — ' + tx('pkgStored'); render(); if (typeof opts.onPackage === 'function') opts.onPackage(clone(pkg)); return; }
    pfile.click();
  });
  pfile.addEventListener('change', function () {
    readFile(pfile, function (text) {
      var r = readProjectPackage(text, { lang: lang() });
      if (!r.ok) { status.textContent = tx('invalid') + ': ' + r.errors.slice(0, 2).map(function (e) { return e.path + ' ' + e.msg; }).join('; '); return; }
      pkg = r; status.textContent = tx('pkgRead'); render();
      if (typeof opts.onPackage === 'function') opts.onPackage(clone(pkg));
    });
  });
  bExport.addEventListener('click', function () {
    var cur = typeof opts.getDoc === 'function' ? opts.getDoc() : newerStored(doc);
    var text = exportJSON(cur);
    var a = mkEl('a'); var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.href = url; a.download = fileName(cur.name || (cur.tender && cur.tender.title) || 'tender-project', '.tnd.json');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  bNew.addEventListener('click', function () {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(tx('confirmNew'))) return;
    setDoc(emptyProject({ role: doc.role, lang: lang() }));
  });
  bRename.addEventListener('click', function () {
    if (typeof window === 'undefined' || !window.prompt) return;
    var v = window.prompt(tx('renamePrompt'), doc.name || '');
    if (v == null) return;
    var next = clone(doc); next.name = String(v).slice(0, 120); next.revision = (next.revision || 0) + 1;
    setDoc(next);
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
    getPackage: function () { return pkg ? clone(pkg) : null; },
    role: function () { return roleSel.value; },
    /* setDoc(doc) saves to localStorage; setDoc(doc, {save:false}) only displays (e.g. a preset) */
    setDoc: function (next, o) { var v = validate(next); if (!v.ok) throw new Error('invalid project'); setDoc(clone(next), true, !!(o && o.save === false)); },
    /* commit(payload) = withModule(doc, toolId, payload) + save + render (no onChange callback) */
    commit: function (payload) { var next = withModule(doc, opts.toolId, payload); setDoc(next, true); return clone(next); },
    status: function (text) { status.textContent = text || ''; },
    destroy: function () { if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); box.remove(); }
  };
}

/* lifecycle({mount, toolId, stage?, role?, lang}) -> {element, refresh(), destroy()}: a strip with the 13 stages (0–12); the tool's stage is
   highlighted, each stage lists the package tools of the role at that stage as links (live) or plain text (soon). */
function lifecycle(opts) {
  opts = opts || {};
  if (typeof document === 'undefined') return null;
  var host = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!host) return null;
  var lang = function () { var v = typeof opts.lang === 'function' ? opts.lang() : opts.lang; return normLang(v); };
  var info = toolInfo(opts.toolId);
  var box = mkEl('nav', { 'class': 'tnd-lifecycle no-print', style: 'margin:var(--sp-2,8px) 0;font-size:var(--fs-small,13px)' });
  host.appendChild(box);
  function render() {
    var L_ = lang(), stg = isNum(opts.stage) ? opts.stage : (info ? info.stage : null);
    var role = typeof opts.role === 'function' ? opts.role() : (opts.role || (info ? info.roles[0] : 'client'));
    box.textContent = '';
    box.setAttribute('aria-label', t(UI.lifecycle, L_));
    var ol = mkEl('ol', { style: 'display:flex;flex-wrap:wrap;gap:4px;list-style:none;margin:0;padding:0' });
    STAGES.forEach(function (name, i) {
      var tools = toolsFor(role, i);
      var cur = i === stg;
      var li = mkEl('li', { 'data-stage': String(i), 'aria-current': cur ? 'step' : null, title: t(UI.stage, L_) + ' ' + i + ': ' + t(name, L_) + (tools.length ? ' — ' + tools.map(function (x) { return t(x.name, L_); }).join(', ') : ''),
        style: 'padding:2px 8px;border-radius:var(--radius-pill,999px);border:1px solid ' + (cur ? 'var(--accent,#3763e6)' : 'var(--line,#e2e7ee)') + ';' + (cur ? 'background:var(--weak,rgba(55,99,230,.12));font-weight:600' : (tools.length ? '' : MUTED)) });
      var target = tools.filter(function (x) { return x.id !== opts.toolId && x.live; })[0];
      var label = i + ' ' + t(name, L_).split(/[,:]/)[0];
      if (target && !cur) li.appendChild(mkEl('a', { href: hrefFor(target.id, L_) }, label));
      else li.appendChild(mkEl('span', null, label + (cur ? ' · ' + t(UI.thisTool, L_) : '')));
      ol.appendChild(li);
    });
    box.appendChild(mkEl('span', { style: MUTED + ';display:block;margin-bottom:4px' }, t(UI.lifecycle, L_)));
    box.appendChild(ol);
  }
  render();
  return { element: box, refresh: render, destroy: function () { box.remove(); } };
}

return {
  version: VERSION, SCHEMA: SCHEMA, STORAGE_KEY: STORAGE_KEY, PKG_SCHEMA: PKG_SCHEMA, PKG_STORAGE_KEY: PKG_STORAGE_KEY, LANGS: LANGS.slice(), LIMITS: LIMITS, ENUMS: ENUMS,
  L: L, t: t, fmt: fmt, money: money, pct: pct, date: date,
  SOURCES: SOURCES, RULES: RULES,
  rules: { get: rule, value: ruleValue, cite: cite, threshold: threshold, thresholdKey: thresholdKey, aboveEU: aboveEU, minPeriods: minPeriods, standstill: standstill,
    aurDelayPenalty: aurDelayPenalty, aurBond: aurBond, erkenningClass: erkenningClass, abnormalMean: abnormalMean, abnormalCheck: abnormalCheck },
  rng: rng, randNormal: randNormal, randGamma: randGamma, randBeta: randBeta, invNorm: invNorm, normCdf: normCdf, dist: dist,
  ranks: ranks, pearson: pearson, spearman: spearman, cholesky: cholesky, fixCorrelation: fixCorrelation, imanConover: imanConover,
  percentile: percentile, stats: stats, histogram: histogram, tornado: tornado,
  npv: npv, irr: irr, annuity: annuity, pvAnnuity: pvAnnuity, periodRate: periodRate, betaInc: betaInc, scurve: scurve,
  cal: { parseDate: parseDate, isoDate: isoDate, easter: easter, belgianHolidays: belgianHolidays, isHoliday: isHoliday, isWorkingDay: isWorkingDay, addCalendarDays: addCalendarDays,
    addWorkingDays: addWorkingDays, workingDaysBetween: workingDaysBetween, calendarDaysBetween: calendarDaysBetween, nextWorkingDay: nextWorkingDay, HOLIDAY_NAMES: HOLIDAY_NAMES },
  score: { FORMULAS: FORMULAS, FORMULA_IDS: FORMULA_IDS, price: priceScores, normaliseQuality: normaliseQuality, rank: rankOf, evaluate: evaluate, rankReversal: rankReversal, weightSensitivity: weightSensitivity },
  STAGES: STAGES, ROLES: ROLES, ROLE_NAMES: ROLE_NAMES, TOOLS: TOOLS, RELATED: RELATED, TOOL_IDS: TOOL_IDS, OWNERS: OWNERS, toolInfo: toolInfo, toolName: toolName, toolsFor: toolsFor,
  UI: UI, MSG: MSG, setLang: setLang, errorText: errorText, fileName: fileName,
  project: { empty: emptyProject, validate: validate, normalize: normalize, load: load, save: save, exportJSON: exportJSON, importJSON: importJSON, withModule: withModule },
  pkg: { readProjectPackage: readProjectPackage, loadStored: loadStoredPackage },
  csv: csv, csvParse: csvParse, parseNumber: parseNumber,
  ui: { projectBar: projectBar, lifecycle: lifecycle }
};
});
