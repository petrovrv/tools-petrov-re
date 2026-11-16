/* acu-req.js — global AcuReq: engine of the tool `acousticreqbe` (Acoustic Requirements BE) of the tools.petrov.re Acoustics BE package.
   Which DA (= DnT,w + C), RA,50, L′nT,w, LI,50, DAtr / D2m,A, service-equipment level and absorption / reverberation targets a room pair,
   a façade pane, an installation or a space needs in Belgium:
   - dwellings: NBN S 01-400-1:2022 §5.2 Tab. 1, §5.3, §5.4 (airborne); §6.2 Tab. 2, §6.3, §6.4 (impact); §7.2 Tab. 3 (façade);
     §8.3 Tab. 4–6, §8.2, §8.4 (service equipment); §9.2 (common circulation, atrium);
   - non-residential: NBN S 01-400-3:2026 §5.2 + Tab. 1–5, Annex B Tab. B.1 (airborne); §6.2 + Tab. 6–10, Annex C Tab. C.1 (impact);
     Annex A Tab. A.1 (production / sensitivity / confidentiality of spaces); §7.2.1 Tab. 11–12 (façade); §9.2 Tab. 15–16, Annex E Tab. E.1 (absorption).
   Table cells were transcribed from the rendered pages (text layer garbled) into short computational data with the clause reference (D-BW-13);
   no norm text or table is reproduced on the page. Pure functions, no DOM. UMD: browser global AcuReq (AcuCore loaded first), node module.exports.
   Planning aid only — acoustic design and in-situ verification by a qualified acoustician per NBN S 01-400-1 / -3. */
(function (root, factory) {
  var core = (root && root.AcuCore) || (typeof require === 'function' ? require('./acoustics-be-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AcuReq = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.2.0';
var lg = function (x) { return Math.log(x) / Math.LN10; };
var isNum = function (x) { return typeof x === 'number' && isFinite(x); };
var r1 = function (x) { return Math.round(x * 10) / 10; };
var CLS = ['A', 'B', 'C'];

/* ---------------------------------------------------------------- 1. sources (norm + clause) */
var N1 = 'NBN S 01-400-1 Critères acoustiques pour les immeubles d’habitation', N3 = 'NBN S 01-400-3 Acoustic requirements in non-residential buildings';
var Src = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  s1_t1: Src(N1, '2022', '§5.2 Tab. 1 (airborne, classes A/B/C, notes a–d)'),
  s1_53: Src(N1, '2022', '§5.3 (class C minimum; class B between two new houses separated only by party walls)'),
  s1_54: Src(N1, '2022', '§5.4 (non-receiving rooms; +(LAeq,Tm − 80) / +(LAF5,Tm − 80) dB; in-situ tolerance 2 / 4 dB)'),
  s1_t2: Src(N1, '2022', '§6.2 Tab. 2 (impact, notes a–c; row 2 only for a common circulation on the same floor, staircases excluded), §6.1 (whatever the floor covering)'),
  s1_63: Src(N1, '2022', '§6.3 (class C minimum; class B between two new houses)'),
  s1_64: Src(N1, '2022', '§6.4 (exclusions; adapted to the situation for non-residential activities; tolerance 2 / 4 dB)'),
  s1_t3: Src(N1, '2022', '§7.2 Tab. 3 (façade panes, notes a–c), §7.3.1–7.3.2'),
  s1_t456: Src(N1, '2022', '§8.3 Tab. 4–6 (service equipment), §8.2 (tonal penalty 5 dB)'),
  s1_84: Src(N1, '2022', '§8.4 (−10 lg q in common technical rooms; tolerance 1 / 3 dB)'),
  s1_92: Src(N1, '2022', '§9.2 (common circulation serving ≥ 3 dwellings: Aw ≥ 0,3·SH; atrium T ≤ max(1,5 s; lg(V/50)))'),
  s3_52: Src(N3, '2026', '§5.2 (Table B.1 for other cases, +4 dB other companies, ≥ 50 dB between two buildings, door −4 dB, to dwellings 54 / 58 dB, +(LAeq,15min − 80), Note 2 +4 / +8 dB, tolerance 2 / 4 dB)'),
  s3_t1: Src(N3, '2026', '§5.3 Tab. 1 (hotels)'), s3_t2: Src(N3, '2026', '§5.4 Tab. 2 (offices; +4 dB other companies, max 50 dB)'),
  s3_t3: Src(N3, '2026', '§5.5 Tab. 3 (retirement homes)'), s3_t4: Src(N3, '2026', '§5.6 Tab. 4 (student lodgings, co-housing)'),
  s3_t5: Src(N3, '2026', '§5.7 Tab. 5 (healthcare facilities)'),
  s3_62: Src(N3, '2026', '§6.2 (Table C.1 for other cases, −5 dB other companies, ≤ 55 dB between two buildings, to dwellings 52 / 48 dB, Note 2 −5 / −10 / −15 dB, tolerance 2 / 4 dB)'),
  s3_t6: Src(N3, '2026', '§6.3 Tab. 6 (hotels)'), s3_t7: Src(N3, '2026', '§6.4 Tab. 7 (offices; −5 dB other companies, min 50 dB)'),
  s3_t8: Src(N3, '2026', '§6.5 Tab. 8 (retirement homes)'), s3_t9: Src(N3, '2026', '§6.6 Tab. 9 (student lodgings, co-housing)'),
  s3_t10: Src(N3, '2026', '§6.7 Tab. 10 (healthcare facilities)'),
  s3_a1: Src(N3, '2026', 'Annex A Tab. A.1 (sound production, acoustic sensitivity, confidentiality)'),
  s3_b1: Src(N3, '2026', 'Annex B Tab. B.1 (generic DA, notes 1–2)'), s3_c1: Src(N3, '2026', 'Annex C Tab. C.1 (generic L′nT,w, note 1)'),
  s3_t11: Src(N3, '2026', '§7.2.1 Tab. 11 (façade panes, notes 1–3, Note 1 DAtr > 38 dB to be avoided)'),
  s3_t12: Src(N3, '2026', '§7.2.1 Tab. 12 (upper indoor levels LAeq,nT,fac,day / night)'),
  s3_t15: Src(N3, '2026', '§9.2 a) Tab. 15 (absorption for the design: Tab. 15 is sufficient)'), s3_t16: Src(N3, '2026', '§9.2 b) Tab. 16 (Tnom of the finished building; met → Tab. 15 cancelled, not met → Tab. 15 + correct workmanship)'),
  s3_93: Src(N3, '2026', '§9.3 (Tnom never below 0,4 s; measured Tnom +10 %; other furnishing state −10 % / +10 %)'),
  s3_e: Src(N3, '2026', 'Annex E.2 Aeff = εspat·Adiff, Tab. E.1 (εspat, ceiling as main absorber)'),
  la_req_sabine: Src('Learning assumption of this tool: T = 0,16·V / Aeff (Sabine, no air absorption, one value for 500–2 000 Hz) — detailed room acoustics → roomacoustics', 'acu-req ' + VERSION, '', 'learning_assumption'),
  la_req_eps: Src('Learning assumption of this tool: εspat of Tab. E.1 taken at the nearest room-proportion row (log distance) and interpolated linearly in αw,ceil (0,4–1; below 0,4 the 0,4 column)', 'acu-req ' + VERSION, '', 'learning_assumption'),
  la_req_note2: Src('Interpretation of this tool: NBN S 01-400-3 §5.2 / §6.2 Note 2 (A.1 production → +4 / +8 dB, −5 / −10 / −15 dB) used only towards dwellings when LAeq,15min is not known; Tables 1–5 / B.1 already contain the production of the sending space', 'acu-req ' + VERSION, '', 'learning_assumption'),
  la_req_act3: Src('Interpretation of this tool: the NBN S 01-400-3 §5.2 increase +(LAeq,15min − 80) / +(LAF5,15min − 80) dB is applied only towards dwellings (the paragraph of the 54 / 58 dB values); Tables 1–5 / B.1 already contain the production of the sending space', 'acu-req ' + VERSION, '', 'learning_assumption'),
  la_req_conf: Src('Interpretation of this tool: the door relief of NBN S 01-400-3 §5.2 is refused when the sending space requires confidentiality (flag or Tab. A.1); a Tab. 2 note 3 / Tab. 4 note 3 value replaces the table value and gets no door relief', 'acu-req ' + VERSION, '', 'learning_assumption'),
  la_req_ra50: Src('Interpretation of this tool: RA,50 / LI,50 (element values, NBN S 01-400-1 §4.1–4.2) are required for party walls / floors between two dwellings (relation other_dwelling) when the receiving room is a bedroom, study, kitchen, living / dining room or bathroom', 'acu-req ' + VERSION, '', 'learning_assumption')
};

/* ---------------------------------------------------------------- 2. NBN S 01-400-1 data (classes A, B, C) */
/* Tab. 1 DA ≥ / Tab. 2 L′nT,w ≤ per relation; RA,50 / LI,50 extra rows */
var S1_AIR = { other_dwelling: [62, 58, 54], circulation_lobby: [58, 54, 50], circulation_1door: [44, 44, 40], same_dwelling: [44, 38, 34] };
var S1_RA50 = [59, 55, 51];
var S1_IMP = { other_dwelling: [44, 48, 52], circulation: [48, 52, 56], same_dwelling: [54, 58, 58] };
var S1_LI50 = [48, 52, 56];
/* rooms of a dwelling that may be receiving rooms (§5.4, §6.4); 'protected' = bedroom, study, kitchen, living / dining, bathroom (Tab. 1 row 3, Tab. 2 row 3) */
var S1_NONRECV = { storage: 1, technical: 1, garage: 1, laundry: 1, none: 1, attic: 1, circulation: 1 };
var S1_PROTECTED = { bedroom: 1, study: 1, kitchen: 1, living: 1, bath: 1 };
var S1_USES = ['bedroom', 'study', 'living', 'kitchen', 'bath', 'wc', 'storage', 'laundry', 'garage', 'technical', 'circulation', 'none',
  'shop', 'horeca', 'office', 'meeting', 'attic'];
/* Tab. 3 façade: [day offset, day floor] A/B and C; bedrooms night offset; note c 34 dB; galleries D2m,A */
var S1_FAC = { dayOff: [30, 30, 34], dayMin: [32, 32, 28], nightOff: [25, 25, 28], lmax: 34, gallery: [44, 44, 40] };
/* Tab. 4–6 service equipment: LAeq,nT (long) or LAFmax,nT (short) ≤, classes A/B/C (null = no requirement) */
var S1_SERVICE = {
  own: {
    long: { q: 'LAeqnT', rooms: { bedroom: [25, 25, 28], living: [29, 29, 32], bath: [32, 32, 35], technical: [58, 58, 62] } },
    hood: { q: 'LAeqnT', rooms: { kitchen: [48, 56, 63], living: [39, 47, 54] }, note: 'hood' },
    sanitary: { q: 'LAFmaxnT', rooms: { bedroom: [29, 29, null], living: [34, 34, null] }, note: 'own_bath' },
    short: { q: 'LAFmaxnT', rooms: { bedroom: [29, 29, 34], living: [34, 34, 39] }, note: 'shutters' }
  },
  other: {
    long: { q: 'LAeqnT', rooms: { bedroom: [24, 24, 24], living: [26, 26, 29], work: [29, 29, 34] } },
    short: { q: 'LAFmaxnT', rooms: { bedroom: [29, 29, 34], living: [34, 34, 39], work: [34, 34, 39] }, note: 'shutters' }
  }
};
/* room use → row of Tab. 4/5 (bedroom row includes the study / office; living row the dining room and — Tab. 4 — the kitchen; Tab. 5 kitchen and bath join living) */
var S1_SERVICE_ROOM = {
  own: { bedroom: 'bedroom', study: 'bedroom', office: 'bedroom', living: 'living', kitchen: 'living', bath: 'bath', wc: 'bath', technical: 'technical' },
  other: { bedroom: 'bedroom', study: 'bedroom', living: 'living', kitchen: 'living', bath: 'living', office: 'work', meeting: 'work', teaching: 'work', consultation: 'work' }
};

/* ---------------------------------------------------------------- 3. NBN S 01-400-3 data */
/* Annex A Tab. A.1: [impact production, airborne production, sensitivity, confidentiality]; levels vl l n h vh x; '-' none */
var LV = ['vl', 'l', 'n', 'h', 'vh', 'x'];
var A1 = {};
('student_room n n vh 0|common_kitchen n h n 0|common_bathroom n h l 0|cohousing_bedroom n n vh 0|hotel_bedroom n n vh 0|comfort_hotel_bedroom n n x 0|' +
 'hotel_bathroom n n n 0|hospital_bedroom n n h 0|longstay_bedroom n n vh 0|maternity n h h 0|healthcare_bathroom n n n 0|retirement_bedroom n n vh 0|' +
 'retirement_bathroom n n n 0|boarding_bedroom n n vh 0|coffee_small n n l 0|coffee_large h h l 0|private_office n n n 1|standard_office n n n 0|' +
 'elementary_office n n n 0|open_plan n n n 0|call_centre l h n 0|cubicle l n n 0|confidential_meeting n n n 1|standard_meeting n n n 0|conference n h n 0|' +
 'translation_booth l n h 1|operating n n h 0|obstetric n h n 0|examination n n n 1|consultation n n n 1|laboratory n n n 0|lab_loud n vh n 0|waiting n n l 0|' +
 'service_room n n h 0|revalidation h h n 0|daycare_day h h l 0|daycare_rest l n h 0|workshop h h l 0|interview n n h 1|court n n h 1|' +
 'arena h vh l 0|sport_hall vh h l 0|fitness x h l 0|dance vh h n 0|pool l h l 0|wellness l n n 0|bowling x h l 0|squash vh h l 0|riding vh h l 0|' +
 'bar h vh l 0|cafeteria h h l 0|restaurant h h l 0|mall h n l 0|shop n n l 0|supermarket n n l 0|casino n h l 0|museum n l n 0|library n n n 0|' +
 'youth_centre n vh n 0|playing_area vh vh l 0|cinema n vh vh 0|disco vh vh l 0|theatre n vh vh 0|concert n vh vh 0|multipurpose h vh h 0|' +
 'community_room h h n 0|reception n n n 0|lounge n n l 0|dining h h l 0|funeral n n h 0|atrium n n l 0|circulation n n vl 0|small_kitchen n h l 0|' +
 'large_kitchen h h l 0|fridge l n vl 0|terrace n - l 0|restroom n h l 0|tech_quiet n - vl 0|tech_loud n - vl 0|tech_vloud n - vl 0|printer n n l 0|' +
 'luggage l l vl 0|garbage l n l 0|laundry n h l 0|goods_corridor x l vl 0|changing n h l 0|bike_park n n l 0|car_park n h l 0')
  .split('|').forEach(function (s) { var p = s.split(' '); A1[p[0]] = { imp: p[1], air: p[2], sens: p[3], conf: p[4] === '1' }; });
var A1_IDS = Object.keys(A1);
var SLEEPING = { student_room: 1, cohousing_bedroom: 1, hotel_bedroom: 1, comfort_hotel_bedroom: 1, hospital_bedroom: 1, longstay_bedroom: 1,
  retirement_bedroom: 1, boarding_bedroom: 1, daycare_rest: 1, maternity: 1 };
/* Tab. B.1 DA ≥ (rows airborne production l n h vh; cols sensitivity vl l n h vh x; null = n.r.); note 1 cells (confidential sending → 48) */
var B1 = { l: [null, 28, 32, 36, 40, 44], n: [null, 28, 40, 44, 48, 52], h: [null, 32, 44, 48, 52, 56], vh: [null, 32, 52, 56, 60, 64] };
var B1_N1 = { l: [1, 1, 1, 1, 1, 1], n: [1, 1, 1, 1, 0, 0], h: [1, 1, 1, 0, 0, 0], vh: [1, 1, 0, 0, 0, 0] };
/* Tab. C.1 L′nT,w ≤ (rows impact production vl … x); note 1 cells = situation to be avoided, specific study */
var C1 = { vl: [null, null, null, 65, 60, 55], l: [null, null, 65, 60, 55, 50], n: [null, null, 60, 55, 50, 50], h: [null, null, 55, 50, 45, 40],
  vh: [null, 65, 50, 45, 40, 35], x: [null, 60, 45, 40, 35, 30] };
var C1_N1 = { h: [0, 0, 0, 0, 1, 1], vh: [0, 0, 0, 1, 1, 1], x: [0, 0, 1, 1, 1, 1] };

/* Tables 1–10. Space definition: id → [airborne send row, airborne recv col, impact send row, impact recv col, A.1 id]  ('-' = not in that table).
   Cells: number | [no door, with door] | '*' (other direction) | 'nr' | 'tech' (Clause 8); cell notes in N. */
function spaces(str) { var o = {}; str.split('|').forEach(function (s) { var p = s.split(' '); o[p[0]] = { as: p[1], ar: p[2], is: p[3], ir: p[4], a1: p[5] }; }); return o; }
var S3 = {
  hotel: {
    air: 's3_t1', imp: 's3_t6',
    spaces: spaces('circulation circ - r1 - circulation|hotel_bedroom bed std r0 std hotel_bedroom|comfort_hotel_bedroom bed comfort r0 comfort comfort_hotel_bedroom|' +
      'hotel_bathroom bed - r0 - hotel_bathroom|standard_office office work r1 work standard_office|standard_meeting meeting work r1 work standard_meeting|' +
      'conference conf work r1 work conference|pool loud - r4 - pool|fitness loud - r3 - fitness|restaurant loud rest r2 rest restaurant|' +
      'large_kitchen loud - r2 - large_kitchen|laundry loud - r1 - laundry|car_park loud - - - car_park|luggage store - r4 - luggage|storage store - r4 - luggage|' +
      'reception recep recep r1 work reception|shop recep - r1 - shop|wellness recep - r4 - wellness|restroom restroom - r1 - restroom|garbage garbage - r4 - garbage|' +
      'technical tech - r1 - tech_loud'),
    airCols: ['std', 'comfort', 'work', 'recep', 'rest'],
    airRows: { circ: [[48, 38], [52, 40], [40, 32], 'nr', 'nr'], bed: [48, 52, '*', '*', '*'], office: [48, 52, 42, '*', '*'], meeting: [48, 52, 42, 40, '*'],
      conf: [52, 56, 48, 44, 32], loud: [52, 56, 44, 44, 32], store: [48, 52, 32, 'nr', 'nr'], recep: [48, 52, 40, 'nr', 'nr'], restroom: [52, 56, 44, 40, 32],
      garbage: [48, 52, 40, 40, 28], tech: ['tech', 'tech', 'tech', 'tech', 'tech'] },
    airNotes: { 'recep.work': 't1_5', 'restroom.recep': 'transition', 'restroom.rest': 'transition', 'bed.std': 't1_1', 'bed.comfort': 't1_1' },
    impCols: ['std', 'comfort', 'work', 'rest'],
    impRows: { r0: [55, 50, 60, 'nr'], r1: [50, 50, 60, 'nr'], r2: [45, 40, 55, 'nr'], r3: [35, 30, 45, 60], r4: [55, 50, 65, 'nr'] },
    impNotes: { 'r3.std': 'avoid_above_bedroom', 'r3.comfort': 'avoid_above_bedroom', 'r0.std': 't1_1', 'r0.comfort': 't1_1' }
  },
  office: {
    air: 's3_t2', imp: 's3_t7',
    spaces: spaces('circulation circ circ r0 - circulation|private_office priv off r0 off private_office|confidential_meeting priv off r0 off confidential_meeting|' +
      'standard_office std off r0 off standard_office|elementary_office std open r0 off elementary_office|cubicle std open r0 off cubicle|' +
      'standard_meeting std off r0 off standard_meeting|open_plan open open r0 off open_plan|conference conf off r0 off conference|' +
      'coffee_small coffee coffee r0 coffee coffee_small|printer printer - r0 - printer|large_kitchen kitchen - r1 - large_kitchen|dining kitchen coffee r1 coffee dining|' +
      'coffee_large kitchen coffee r1 coffee coffee_large|restroom restroom - r0 - restroom|technical tech - r0 - tech_loud'),
    airCols: ['off', 'open', 'coffee', 'circ'],
    airRows: { circ: [[40, 32], [36, 28], 'nr', 'nr'], priv: [48, 48, 48, [48, 38]], std: [42, 38, '*', '*'], open: [[42, 34], [38, 30], '*', '*'],
      conf: [48, 48, 48, [48, 38]], coffee: [42, 38, 'nr', 'nr'], printer: [40, 40, 28, 'nr'], kitchen: [48, 44, 'nr', 'nr'], restroom: [44, 44, 44, 'nr'],
      tech: ['tech', 'tech', 'tech', 'tech'] },
    airNotes: { 'priv.off': 't2_1', 'priv.open': 't2_1', 'priv.coffee': 't2_1', 'priv.circ': 't2_7', 'conf.off': 't2_3', 'coffee.off': 't2_5', 'restroom.coffee': 'transition', 'conf.circ': 't2_7' },
    impCols: ['off', 'coffee'],
    impRows: { r0: [60, 'nr'], r1: [55, 'nr'] }, impNotes: {}
  },
  retirement: {
    air: 's3_t3', imp: 's3_t8',
    spaces: spaces('circulation circ - r0 - circulation|retirement_bedroom unit unit r0 unit retirement_bedroom|living_room unit unit r0 unit retirement_bedroom|' +
      'retirement_bathroom unit - r0 - retirement_bathroom|service_room service service r0 unit service_room|small_community small comm r1 comm community_room|' +
      'large_community large comm r1 comm community_room|dining large dining r1 comm dining|large_kitchen kitchen - r1 - large_kitchen|laundry laundry - r0 - laundry|' +
      'technical tech - r0 - tech_loud'),
    airCols: ['unit', 'service', 'comm', 'dining'],
    airRows: { circ: [[48, 36], [40, 32], 'nr', 'nr'], unit: [48, '*', '*', '*'], service: [48, 44, '*', '*'], small: [[52, 40], 48, 32, 32], large: [52, 48, 32, 32],
      kitchen: [52, 48, 44, 'nr'], laundry: [52, 48, 44, 44], tech: ['tech', 'tech', 'tech', 'tech'] },
    airNotes: { 'circ.unit': 't3_3' },
    impCols: ['unit', 'comm'], impRows: { r0: [55, 60], r1: [50, 55] }, impNotes: {}
  },
  student: {
    air: 's3_t4', imp: 's3_t9',
    spaces: spaces('circulation circ - r0 - circulation|student_room room room r0 room student_room|comfort_student_room room room_comfort r0 room student_room|' +
      'cohousing_bedroom room room r0 room cohousing_bedroom|community_room common - r1 - community_room|common_kitchen common - r0 - common_kitchen|' +
      'common_sanitary common - r0 - common_bathroom|technical tech - r0 - tech_loud'),
    airCols: ['room', 'room_comfort'],
    airRows: { circ: [[48, 32], [48, 36]], room: [48, 48], common: [52, 52], tech: ['tech', 'tech'] },
    airNotes: { 'room.room': 't4_3', 'room.room_comfort': 't4_3' },
    impCols: ['room'], impRows: { r0: [55], r1: [50] }, impNotes: { 'r0.room': 't9_5' }
  },
  healthcare: {
    air: 's3_t5', imp: 's3_t10',
    spaces: spaces('circulation circ - r0 - circulation|waiting circ wait r0 wait waiting|hospital_bedroom care care r0 care hospital_bedroom|' +
      'maternity mixed care r0 care maternity|service_room care care r0 care service_room|examination care care r0 care examination|' +
      'consultation conf care r0 care consultation|confidential_examination conf care r0 care examination|operating care care r0 care operating|' +
      'longstay_bedroom care long r0 long longstay_bedroom|laboratory care lab r0 lab laboratory|obstetric mixed lab r0 lab obstetric|' +
      'revalidation mixed lab r1 lab revalidation|small_community care lab r0 lab community_room|dining mixed - r1 - dining|large_kitchen mixed - r1 - large_kitchen|' +
      'laundry mixed - r0 - laundry|lab_loud loud - r0 - lab_loud|technical tech - r0 - tech_loud'),
    airCols: ['care', 'long', 'lab', 'wait'],
    airRows: { circ: [[44, 36], [48, 36], [40, 36], 'nr'], care: [44, 48, 40, 28], conf: [48, 48, 48, [48, 38]], mixed: [48, 52, 44, 32], loud: [56, 60, 52, 32],
      tech: ['tech', 'tech', 'tech', 'tech'] },
    airNotes: { 'conf.care': 't5_2', 'conf.long': 't5_2', 'conf.lab': 't5_2', 'conf.wait': 't5_4', 'loud.care': 't5_7', 'loud.long': 't5_7', 'loud.lab': 't5_7', 'loud.wait': 't5_7' },
    impCols: ['care', 'long', 'lab', 'wait'], impRows: { r0: [55, 50, 60, 'nr'], r1: [50, 45, 55, 'nr'] }, impNotes: {}
  }
};
S3.generic = { spaces: {} };
A1_IDS.forEach(function (id) { S3.generic.spaces[id] = { as: '-', ar: '-', is: '-', ir: '-', a1: id }; });

/* Tab. 12 upper indoor levels from outdoor noise [day, night] (null = none) — keys = A.1 ids (+ bathroom split) */
var T12 = { student_room: [34, 28], cohousing_bedroom: [34, 28], hotel_bedroom: [34, 28], comfort_hotel_bedroom: [34, 28], hospital_bedroom: [34, 28],
  longstay_bedroom: [34, 28], retirement_bedroom: [34, 28], boarding_bedroom: [34, 28], maternity: [34, 28], hotel_bathroom: [35, null],
  healthcare_bathroom: [40, null], retirement_bathroom: [40, null], common_kitchen: [40, null], private_office: [37, null], standard_office: [37, null],
  open_plan: [45, null], call_centre: [45, null], cubicle: [37, null], standard_meeting: [37, null], confidential_meeting: [37, null], conference: [37, null],
  operating: [40, null], obstetric: [40, null], examination: [35, null], consultation: [35, null], laboratory: [45, null], lab_loud: [35, null],
  service_room: [35, null], revalidation: [40, null], daycare_rest: [40, null], interview: [35, null], court: [35, null], dance: [40, null], wellness: [40, null],
  museum: [35, null], library: [35, null], youth_centre: [45, null], cinema: [30, null], theatre: [30, null], concert: [25, null], multipurpose: [40, null],
  community_room: [40, null], reception: [45, null], funeral: [35, null] };
var T12_STUDY = { cinema: 1, theatre: 1, concert: 1, translation_booth: 1 };

/* Tab. 15 design absorption; Tab. 16 Tnom (part 3); part 1 §9.2 */
var T15 = { sport: { q: 'alpha', k: 0.2 }, circulation: { q: 'SH', k: 0.3 }, cafe: { q: 'N', k: 0.65 }, restaurant: { q: 'N', k: 1.25 }, reception: { q: 'N', k: 0.9 } };
/* Tnom ≤ f(V, N): kinds c = constant, lc = 0,35 lg(1,25 V), lg50 = min(lg(V/50), cap), max1 = max(1, lg(V/50)), lg20 = lg(V/20), vn = k·V/N, study */
var T16 = { bedroom: ['c', 0.8, 'furn'], maternity: ['c', 0.8, 'furn'], coffee: ['c', 0.8], collective_office: ['c', 0.8], open_plan: ['c', 0.6, 'furn'],
  call_centre: ['c', 0.6, 'furn'], meeting: ['c', 0.8], conference: ['lc'], operating: ['c', 0.8], obstetric: ['c', 0.8], examination: ['c', 0.8],
  consultation: ['c', 0.8], laboratory: ['c', 0.8], lab_loud: ['c', 0.8], waiting: ['c', 0.8], service_room: ['c', 0.8], revalidation: ['lc'],
  daycare_day: ['c', 0.6, 'furn'], interview: ['c', 0.8], court: ['lc'], sport_hall: ['lg50', 2.4], dance: ['c', 1.2], bar: ['vn', 0.25],
  restaurant: ['vn', 0.13], shopping_mall: ['study'], museum: ['max1'], library: ['c', 1], playing_area: ['lg50', 2.4], cinema: ['study'], theatre: ['study'],
  concert: ['study'], multipurpose: ['study'], community_room: ['c', 1], reception: ['lg20'], lounge: ['lg20'], dining_room: ['vn', 0.25],
  exhibition: ['vn', 0.18], atrium: ['lg20'], corridor: ['none'] };
/* Tab. E.1 εspat: rows L:W:H, columns αw,ceil 0,4 0,6 0,8 0,9 1; situations a (floor 0,05, walls 0,05), b (walls 0,20), c (floor 0,15) */
var E1_RATIO = [[1, 1], [2, 1], [5, 1], [10, 1], [2, 2], [5, 2], [10, 2], [5, 5], [10, 5], [10, 10]];
var E1_ALPHA = [0.4, 0.6, 0.8, 0.9, 1];
var E1 = {
  a: [[.93, .92, .90, .89, .88], [.92, .89, .87, .86, .85], [.90, .87, .84, .83, .81], [.89, .86, .83, .81, .80], [.88, .85, .81, .80, .78],
    [.84, .79, .75, .73, .71], [.82, .76, .72, .70, .68], [.74, .68, .62, .60, .57], [.68, .61, .55, .52, .50], [.58, .50, .44, .41, .39]],
  b: [[.91, .92, .92, .92, .91], [.91, .91, .90, .90, .89], [.88, .89, .88, .87, .86], [.87, .88, .86, .86, .85], [.91, .89, .87, .85, .84],
    [.88, .85, .81, .80, .78], [.86, .82, .79, .77, .75], [.81, .75, .70, .68, .66], [.75, .69, .63, .61, .59], [.66, .59, .53, .50, .48]],
  c: [[.91, .90, .88, .87, .86], [.88, .86, .84, .83, .82], [.86, .83, .81, .79, .78], [.84, .82, .79, .78, .76], [.83, .80, .77, .76, .74],
    [.77, .73, .70, .68, .66], [.74, .70, .66, .64, .62], [.64, .59, .55, .53, .51], [.55, .50, .46, .44, .42], [.42, .38, .34, .32, .31]]
};

/* ---------------------------------------------------------------- 4. helpers */
function clsIdx(c) { var i = CLS.indexOf(c); return i < 0 ? 2 : i; }
function item(q, op, value, src, extra) { var o = { q: q, op: op, value: value, src: src, steps: [], notes: [] }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
function step(it, code, delta, src) { it.steps.push({ code: code, delta: delta, src: src }); it.value = it.value == null ? null : it.value + delta; }
function actIncrease(LAeq, LAF5) {
  var a = isNum(LAeq) ? Math.max(0, LAeq - 80) : 0, b = isNum(LAF5) ? Math.max(0, LAF5 - 80) : 0;
  return { delta: Math.max(a, b), which: b > a ? 'LAF5' : 'LAeq' };
}
/* in-situ tolerance (part 1 §5.4 / §6.4, part 3 §5.2 / §6.2): 2 dB, 4 dB for receiving rooms < 25 m³ that are not bedrooms */
function tolerance(V, bedroom) { return isNum(V) && V < 25 && !bedroom ? 4 : 2; }
/* verdict of a measured (rounded to the unit) value */
function checkMeasured(it, measured, V, bedroom, kind) {
  if (!isNum(measured) || !it || it.value == null) return null;
  var m = Math.round(measured), tol = kind === 'service' ? (isNum(V) && V < 25 && !bedroom ? 3 : 1) : tolerance(V, bedroom);
  var lim = it.op === '>=' ? it.value - tol : it.value + tol;
  var pass = it.op === '>=' ? m >= lim : m <= lim;
  var design = it.op === '>=' ? measured >= it.value : measured <= it.value;
  return { measured: measured, rounded: m, tol: tol, limit: lim, pass: pass, passDesign: design, margin: r1(it.op === '>=' ? measured - it.value : it.value - measured) };
}

/* ---------------------------------------------------------------- 5. NBN S 01-400-1 room pair */
/* in: {cls, relation: other_dwelling | circulation_lobby | circulation_1door | same_dwelling, sendUse, recvUse, element: wall|floor,
        twoNewHouses, noSourceLoad, oneBedroom, sendAbove, circSameFloor (common circulation on the same floor, not a staircase), LAeq_dB, LAF5_dB} */
function pairS1(inp) {
  var cls = CLS.indexOf(inp.cls) >= 0 ? inp.cls : 'C', ci = clsIdx(cls), rel = inp.relation || 'other_dwelling', recv = inp.recvUse || 'bedroom', send = inp.sendUse || 'living';
  var out = { ok: true, norm: 'S01-400-1', cls: cls, items: [], notes: [], target: {}, sources: ['s1_t1', 's1_54', 's1_t2', 's1_64'] };
  if (!S1_AIR[rel]) return { ok: false, reason: 'relation' };
  /* class floor §5.3 / §6.3 */
  var eff = ci;
  if (inp.twoNewHouses && rel === 'other_dwelling' && ci > 1) { eff = 1; out.notes.push('two_new_houses'); out.sources.push('s1_53', 's1_63'); }
  out.clsEff = CLS[eff];
  var recvOk = !S1_NONRECV[recv];
  /* airborne */
  var air;
  if (!recvOk) { air = item('DA', '>=', null, 's1_54'); air.nr = 'not_receiving'; }
  else if (rel === 'same_dwelling') {
    if (!(recv === 'bedroom' || recv === 'study')) { air = item('DA', '>=', null, 's1_t1'); air.nr = 'inside_not_bedroom'; }
    else if (!S1_PROTECTED[send]) { air = item('DA', '>=', null, 's1_t1'); air.nr = 'inside_send'; }
    else if (inp.oneBedroom) { air = item('DA', '>=', null, 's1_t1'); air.nr = 'note_d'; }
    else air = item('DA', '>=', S1_AIR.same_dwelling[ci], 's1_t1');
  } else if (rel === 'other_dwelling' && inp.noSourceLoad) { air = item('DA', '>=', null, 's1_t1'); air.nr = 'note_a'; }
  else {
    air = item('DA', '>=', S1_AIR[rel][rel === 'other_dwelling' ? eff : ci], 's1_t1');
    if (rel === 'circulation_1door') air.notes.push('note_b', 'note_c');
    var act = actIncrease(inp.LAeq_dB, inp.LAF5_dB);
    if (act.delta > 0) step(air, act.which === 'LAF5' ? 'act_LAF5' : 'act_LAeq', act.delta, 's1_54');
  }
  out.items.push(air);
  /* RA,50 extra row (element value) */
  if (rel === 'other_dwelling' && recvOk && S1_PROTECTED[recv] && !inp.noSourceLoad) {
    var ra = item('RA50', '>=', S1_RA50[eff], 's1_t1'); ra.element = true; ra.notes.push('element_value'); out.items.push(ra); out.sources.push('la_req_ra50');
  }
  /* impact */
  var IMP_NR = { circulation: 1, technical: 1, storage: 1, laundry: 1, garage: 1, none: 1, attic: 1 };
  var imp;
  if (IMP_NR[recv]) { imp = item('LnTw', '<=', null, 's1_64'); imp.nr = 'not_receiving_imp'; }
  else if (rel === 'same_dwelling') {
    if (!(recv === 'bedroom' || recv === 'study')) { imp = item('LnTw', '<=', null, 's1_t2'); imp.nr = 'inside_not_bedroom'; }
    else if (!S1_PROTECTED[send]) { imp = item('LnTw', '<=', null, 's1_t2'); imp.nr = 'inside_send'; }
    else if (ci === 2 && !inp.sendAbove) { imp = item('LnTw', '<=', null, 's1_t2'); imp.nr = 'note_c_imp'; }
    else imp = item('LnTw', '<=', S1_IMP.same_dwelling[ci], 's1_t2');
  } else if (inp.noSourceLoad) { imp = item('LnTw', '<=', null, 's1_t2'); imp.nr = 'note_b_imp'; }
  else if (rel === 'circulation_1door' || rel === 'circulation_lobby') {
    /* Tab. 2 row 2 only for a common circulation (staircases excluded) on the same floor; a staircase or a circulation on another floor → row 1 */
    if (inp.circSameFloor) { imp = item('LnTw', '<=', S1_IMP.circulation[ci], 's1_t2'); imp.notes.push('same_floor'); }
    else { imp = item('LnTw', '<=', S1_IMP.other_dwelling[ci], 's1_t2'); imp.notes.push('circ_row1'); }
  }
  else imp = item('LnTw', '<=', S1_IMP.other_dwelling[eff], 's1_t2');
  if (imp.value != null) {
    imp.notes.push('any_covering');
    if (rel !== 'same_dwelling' && (S1_NR_ACT[send] || isNum(inp.LAeq_dB))) imp.notes.push('adapt_activity');
  }
  out.items.push(imp);
  if (rel === 'other_dwelling' && inp.element === 'floor' && !IMP_NR[recv] && S1_PROTECTED[recv] && !inp.noSourceLoad) {
    var li = item('LI50', '<=', S1_LI50[eff], 's1_t2'); li.element = true; li.notes.push('element_value'); out.items.push(li);
  }
  fillTarget(out);
  return out;
}
var S1_NR_ACT = { shop: 1, horeca: 1, office: 1, meeting: 1 };

function shortRef(s) { var m = /^(NBN S [0-9-]+|EN ISO [0-9-]+)/.exec(s.title); return (m ? m[1] : s.title) + ':' + s.edition + ' ' + s.clause.split(' (')[0]; }
function fillTarget(out) {
  var map = { DA: 'DA_min', RA50: 'RA50_min', LnTw: 'LnTw_max', LI50: 'LI50_max' };
  out.items.forEach(function (it) { if (it.value != null && map[it.q]) out.target[map[it.q]] = it.value; });
  out.target.source = out.items.filter(function (it) { return it.value != null; }).map(function (it) { return shortRef(SOURCES[it.src]); })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).join('; ');
}

/* ---------------------------------------------------------------- 6. NBN S 01-400-3 room pair */
function lookupCell(tbl, cols, rowId, colId) {
  if (!rowId || rowId === '-' || !colId || colId === '-') return null;
  var row = tbl[rowId]; var ci = cols.indexOf(colId);
  if (!row || ci < 0) return null;
  return row[ci];
}
/* in: {type, send, recv (space ids of S3[type].spaces; recv 'dwelling' = room of a dwelling), door, confidential, otherCompany, otherBuilding,
        dwellingBuilding: 'same'|'other', LAeq_dB, LAF5_dB, sameUnit, sendAbove} */
function pairS3(inp) {
  var type = S3[inp.type] ? inp.type : 'generic', T = S3[type];
  var sp = T.spaces[inp.send], rp = inp.recv === 'dwelling' ? null : T.spaces[inp.recv];
  if (!sp || (!rp && inp.recv !== 'dwelling')) return { ok: false, reason: 'space' };
  var out = { ok: true, norm: 'S01-400-3', type: type, items: [], notes: [], target: {}, sources: [] };
  var sa = A1[sp.a1], ra = rp ? A1[rp.a1] : null;
  var conf = !!inp.confidential || (sa && sa.conf);
  var air, imp, act = actIncrease(inp.LAeq_dB, inp.LAF5_dB);
  if (inp.recv === 'dwelling') {
    /* §5.2 / §6.2: to a dwelling of the same building 54 / 52, of another adjacent building 58 / 48 */
    var other = inp.dwellingBuilding === 'other';
    air = item('DA', '>=', other ? 58 : 54, 's3_52'); imp = item('LnTw', '<=', other ? 48 : 52, 's3_62');
    if (act.delta > 0) { step(air, act.which === 'LAF5' ? 'act_LAF5' : 'act_LAeq', act.delta, 's3_52'); out.sources.push('la_req_act3'); }
    else if (sa && (sa.air === 'h' || sa.air === 'vh') && !isNum(inp.LAeq_dB)) { step(air, 'a1_air_' + sa.air, sa.air === 'h' ? 4 : 8, 's3_52'); out.sources.push('la_req_note2'); }
    if (sa && (sa.imp === 'h' || sa.imp === 'vh' || sa.imp === 'x')) { step(imp, 'a1_imp_' + sa.imp, sa.imp === 'h' ? -5 : sa.imp === 'vh' ? -10 : -15, 's3_62'); out.sources.push('la_req_note2'); }
    air.notes.push('dwelling_v25'); imp.notes.push('dwelling_v25');
    out.items.push(air, imp); out.sources.push('s3_52', 's3_62', 's1_t1');
    fillTarget(out); return out;
  }
  /* airborne: specific table, '*' → other direction, else B.1 */
  var cell = T.airRows ? lookupCell(T.airRows, T.airCols, sp.as, rp.ar) : null, from = T.air, cellNote = null, reversed = false;
  if (cell === '*') {
    var rev = lookupCell(T.airRows, T.airCols, rp.as, sp.ar);
    if (rev != null && rev !== '*') { cell = rev; reversed = true; cellNote = T.airNotes[rp.as + '.' + sp.ar]; } else cell = null;
  } else if (cell != null) cellNote = T.airNotes[sp.as + '.' + rp.ar];
  if (cell === 'tech') { air = item('DA', '>=', null, from); air.nr = 'tech_clause8'; }
  else if (cell === 'nr') { air = item('DA', '>=', null, from); air.nr = 'table_nr'; }
  else if (cell != null) {
    var withDoor = Array.isArray(cell), override = false;
    air = item('DA', '>=', withDoor ? (inp.door ? cell[1] : cell[0]) : cell, from);
    if (reversed) air.notes.push('other_direction');
    if (cellNote) air.notes.push(cellNote);
    /* special notes that replace the table value (before any step; no door relief on them — la_req_conf) */
    if (type === 'student' && sp.as === 'room' && inp.sameUnit) { air.value = 34; air.notes.push('t4_3_applied'); override = true; }
    if (type === 'office' && sp.as === 'conf' && rp.ar === 'off' && inp.mobilePartition) { air.value = 42; air.notes.push('t2_3_applied'); override = true; }
    if (withDoor) air.notes.push(inp.door ? 'door_value' : 'no_door_value');
    else if (inp.door) { if (conf || override) { air.notes.push(override ? 'override_no_door' : 'door_conf_no_relief'); out.sources.push('la_req_conf'); } else step(air, 'door', -4, 's3_52'); }
    if (inp.otherCompany) {
      if (type === 'office') { var v0 = air.value, v1 = Math.min(v0 + 4, Math.max(v0, 50)); step(air, 'other_company_cap50', v1 - v0, 's3_t2'); }
      else air.notes.push('other_company_specific');
    }
  } else {
    /* Table B.1 with the A.1 classes */
    from = 's3_b1';
    if (!sa || !ra || sa.air === '-') { air = item('DA', '>=', null, 's3_b1'); air.nr = sa && sa.air === '-' ? 'tech_clause8' : 'no_class'; }
    else {
      var si = LV.indexOf(ra.sens), v = B1[sa.air] ? B1[sa.air][si] : null;
      var n1 = B1_N1[sa.air] && B1_N1[sa.air][si] && conf;
      if (n1) { air = item('DA', '>=', Math.max(v == null ? 0 : v, 48), 's3_b1'); air.notes.push('b1_n1'); }
      else if (v == null) { air = item('DA', '>=', null, 's3_b1'); air.nr = 'table_nr'; }
      else air = item('DA', '>=', v, 's3_b1');
      if (sa.air === 'l' && si >= 4 && SLEEPING[rp.a1] && air.value != null && air.value < 48) { air.value = 48; air.notes.push('b1_n2'); }
      air.cls = { prod: sa.air, sens: ra.sens };
      if (air.value != null) {
        if (inp.door) { if (conf) { air.notes.push('door_conf_no_relief'); out.sources.push('la_req_conf'); } else step(air, 'door', -4, 's3_52'); }
        if (inp.otherCompany) step(air, 'other_company', 4, 's3_52');
      }
    }
    out.sources.push('s3_a1');
  }
  if (air.value != null) {
    /* §5.2: the +(LAeq,15min − 80) increase belongs to the requirements towards dwellings (la_req_act3) */
    if (act.delta > 0) { air.notes.push('act_dwelling_only'); out.sources.push('la_req_act3'); }
    if (inp.otherBuilding && air.value < 50) step(air, 'two_buildings_50', 50 - air.value, 's3_52');
    if (sp.a1 === 'lab_loud' && isNum(inp.LAeq_dB) && inp.LAeq_dB > 85) air.notes.push('t5_7_study');
    if (sp.a1 === 'workshop' && isNum(inp.LAeq_dB) && inp.LAeq_dB > 75) air.notes.push('a1_1_study');
  }
  out.items.push(air);
  /* impact */
  var ic = T.impRows ? lookupCell(T.impRows, T.impCols, sp.is, rp.ir) : null, ifrom = T.imp;
  if (ic === 'nr') { imp = item('LnTw', '<=', null, ifrom); imp.nr = 'table_nr'; }
  else if (ic != null) {
    imp = item('LnTw', '<=', ic, ifrom);
    var inote = T.impNotes[sp.is + '.' + rp.ir]; if (inote) imp.notes.push(inote);
    if (type === 'student' && inp.sameUnit && sp.is === 'r0' && (inp.send === 'student_room' || inp.send === 'cohousing_bedroom' || inp.send === 'comfort_student_room')) { imp.value = null; imp.nr = 't9_5'; }
    if (imp.value != null && inp.otherCompany) {
      if (type === 'office') { var w0 = imp.value, w1 = Math.max(w0 - 5, Math.min(w0, 50)); step(imp, 'other_company_min50', w1 - w0, 's3_t7'); }
      else imp.notes.push('other_company_specific');
    }
  } else {
    ifrom = 's3_c1';
    if (!sa || !ra) { imp = item('LnTw', '<=', null, 's3_c1'); imp.nr = 'no_class'; }
    else {
      var sj = LV.indexOf(ra.sens), cv = C1[sa.imp] ? C1[sa.imp][sj] : null;
      if (cv == null) { imp = item('LnTw', '<=', null, 's3_c1'); imp.nr = 'table_nr'; }
      else {
        imp = item('LnTw', '<=', cv, 's3_c1');
        if (C1_N1[sa.imp] && C1_N1[sa.imp][sj]) imp.notes.push('c1_n1');
        if (inp.otherCompany) step(imp, 'other_company', -5, 's3_62');
      }
      imp.cls = { prod: sa.imp, sens: ra.sens };
    }
    if (out.sources.indexOf('s3_a1') < 0) out.sources.push('s3_a1');
  }
  if (imp.value != null && inp.otherBuilding && imp.value > 55) step(imp, 'two_buildings_55', 55 - imp.value, 's3_62');
  out.items.push(imp);
  out.sources.push(from, ifrom, 's3_52', 's3_62');
  out.sources = out.sources.filter(function (v, i, a) { return a.indexOf(v) === i; });
  fillTarget(out);
  return out;
}

function pair(inp) { return (inp && inp.norm === 'S01-400-3') ? pairS3(inp) : pairS1(inp || {}); }

/* ---------------------------------------------------------------- 7. façade panes */
/* part 1: in {cls, use: bedroom|living|kitchen|study|..., LAday, LAnight, LAmax3xNight, secondPane (other façade pane with vent or RAtr < 48), gallery}
   part 3: in {norm:'S01-400-3', space (A.1 id), LAday, LAnight, LAmax3xNight, secondPane, gallery, dayUse (bedroom also used by day)} */
function facade(inp) {
  inp = inp || {};
  var out = { ok: true, items: [], notes: [], target: {} }, terms = [];
  var day = inp.LAday, night = inp.LAnight;
  if (inp.norm === 'S01-400-3') {
    out.norm = 'S01-400-3'; out.sources = ['s3_t11', 's3_t12', 's3_a1'];
    var a = A1[inp.space], lev = T12[inp.space];
    if (!a) return { ok: false, reason: 'space' };
    if (LV.indexOf(a.sens) < 2) { out.items.push(Object.assign(item('DAtr', '>=', null, 's3_t11'), { nr: 'sens_below_normal' })); return out; }
    if (T12_STUDY[inp.space]) out.notes.push('t12_study');
    if (!lev) { out.items.push(Object.assign(item('DAtr', '>=', null, 's3_t12'), { nr: 'no_t12' })); return out; }
    var bed = !!SLEEPING[inp.space] && lev[1] != null;
    var p3 = function (L, fac) { return !!inp.secondPane && isNum(L) && L > fac + 28; };
    if (isNum(day)) terms.push({ code: 'day', v: day - lev[0] + (p3(day, lev[0]) ? 3 : 0), plus3: p3(day, lev[0]), fac: lev[0] });
    terms.push({ code: 'min28', v: 28 });
    if (bed && isNum(night)) terms.push({ code: 'night', v: night - lev[1] + (p3(night, lev[1]) ? 3 : 0), plus3: p3(night, lev[1]), fac: lev[1] });
    if (bed && inp.dayUse && isNum(day)) terms.push({ code: 'note6', v: day - lev[1] });
    if (bed && isNum(inp.LAmax3xNight) && inp.LAmax3xNight >= 70) terms.push({ code: 'lmax34', v: 34 });
    var it = item('DAtr', '>=', null, 's3_t11'); pick(it, terms); out.items.push(it);
    if (it.value != null && it.value > 38) it.notes.push('above38');
    if (inp.gallery && bed) out.items.push(item('D2mA', '>=', 44, 's3_t11'));
  } else {
    out.norm = 'S01-400-1'; out.sources = ['s1_t3'];
    var ci = clsIdx(inp.cls), use = inp.use || 'living';
    if (!(use === 'bedroom' || use === 'living' || use === 'kitchen' || use === 'study')) { out.items.push(Object.assign(item('DAtr', '>=', null, 's1_t3'), { nr: 'not_protected' })); return out; }
    var bedroom = use === 'bedroom';
    var plusDay = !!inp.secondPane && isNum(day) && day >= 62, plusNight = !!inp.secondPane && bedroom && isNum(night) && night >= 56;
    if (isNum(day)) terms.push({ code: 'day', v: day - S1_FAC.dayOff[ci] + (plusDay ? 3 : 0), plus3: plusDay });
    terms.push({ code: 'min', v: S1_FAC.dayMin[ci] });
    if (bedroom && isNum(night)) terms.push({ code: 'night', v: night - S1_FAC.nightOff[ci] + (plusNight ? 3 : 0), plus3: plusNight });
    if (bedroom && isNum(inp.LAmax3xNight) && inp.LAmax3xNight >= 70) terms.push({ code: 'lmax34', v: S1_FAC.lmax });
    var it1 = item('DAtr', '>=', null, 's1_t3'); pick(it1, terms); out.items.push(it1);
    if (inp.gallery) out.items.push(item('D2mA', '>=', S1_FAC.gallery[ci], 's1_t3'));
    if (bedroom && isNum(night) && night - 25 > 0) { /* nothing more: §7.3.1 class C minimum is the caller's class choice */ }
  }
  var m = { DAtr: 'DAtr_min', D2mA: 'D2mA_min' };
  out.items.forEach(function (x) { if (x.value != null) out.target[m[x.q]] = x.value; });
  out.target.source = out.norm === 'S01-400-3' ? 'NBN S 01-400-3:2026 §7.2.1 Tab. 11–12' : 'NBN S 01-400-1:2022 §7.2 Tab. 3';
  return out;
}
function pick(it, terms) {
  it.terms = terms; var best = null;
  terms.forEach(function (x) { if (best == null || x.v > best.v) best = x; });
  it.value = best ? best.v : null; it.governs = best ? best.code : null;
}

/* ---------------------------------------------------------------- 8. service equipment (part 1 §8) */
/* in: {cls, origin: own|other|common_tech, kind: long|hood|sanitary|short, room, dwellings (common_tech), q (number of installation types), measured, tonal, V, bedroom} */
function service(inp) {
  inp = inp || {}; var ci = clsIdx(inp.cls), out = { ok: true, items: [], notes: [], sources: ['s1_t456', 's1_84'] };
  var it;
  if (inp.origin === 'common_tech') {
    it = item('LAeqnT', '<=', (inp.dwellings >= 10 ? 84 : 74), 's1_t456');
    if (isNum(inp.q) && inp.q > 1) step(it, 'minus_10lgq', -r1(10 * lg(inp.q)), 's1_84');
  } else {
    var tab = S1_SERVICE[inp.origin === 'other' ? 'other' : 'own'], row = tab[inp.kind];
    if (!row) return { ok: false, reason: 'kind' };
    var rk = S1_SERVICE_ROOM[inp.origin === 'other' ? 'other' : 'own'][inp.room];
    if (inp.origin !== 'other' && inp.room === 'kitchen' && (inp.kind === 'sanitary' || inp.kind === 'short')) rk = null; /* Tab. 4: kitchen only in the long-noise row */
    if (inp.kind === 'hood') rk = inp.room === 'kitchen' ? 'kitchen' : (inp.room === 'living' ? 'living' : null);
    var v = rk && row.rooms[rk] ? row.rooms[rk][ci] : undefined;
    it = item(row.q, '<=', v === undefined ? null : v, 's1_t456');
    if (v === undefined) it.nr = 'room_not_in_table'; else if (v === null) it.nr = 'class_nr';
    if (row.note) it.notes.push(row.note);
  }
  out.items.push(it);
  if (isNum(inp.measured)) {
    var mv = inp.measured + (inp.tonal ? 5 : 0);
    out.check = checkMeasured(it, mv, inp.V, inp.bedroom, 'service');
    if (out.check && inp.tonal) out.check.tonal = 5;
  }
  return out;
}

/* ---------------------------------------------------------------- 9. absorption / reverberation */
/* εspat from Tab. E.1: nearest row by log distance of (L/H, W/H), linear in αw,ceil */
function epsSpat(Lm, Wm, Hm, alphaCeil, situation) {
  var tab = E1[situation] || E1.a;
  if (!(Lm > 0 && Wm > 0 && Hm > 0)) return { ok: false };
  var l = Math.max(Lm, Wm), w = Math.min(Lm, Wm);
  var rl = l / Hm, rw = w / Hm, best = 0, bd = Infinity;
  /* rows are L:W:H with the height = 1 unit; ratios < 1 (low wide rooms) use the same distance measure */
  E1_RATIO.forEach(function (r, i) { var d = Math.abs(Math.log(rl / r[0])) + Math.abs(Math.log(rw / r[1])); if (d < bd - 1e-12) { bd = d; best = i; } });
  var a = Math.max(0.4, Math.min(1, alphaCeil)), row = tab[best], e;
  for (var j = 0; j < E1_ALPHA.length - 1; j++) {
    if (a <= E1_ALPHA[j + 1] + 1e-12) { var f = (a - E1_ALPHA[j]) / (E1_ALPHA[j + 1] - E1_ALPHA[j]); e = row[j] + f * (row[j + 1] - row[j]); break; }
  }
  return { ok: true, eps: Math.round(e * 1000) / 1000, row: E1_RATIO[best][0] + ':' + E1_RATIO[best][1] + ':1', clampedAlpha: a !== alphaCeil, situation: tab === E1[situation] ? situation : 'a' };
}
/* in: {norm, space (part 1 'circulation' | 'atrium'), space15 / space16 (part 3 Tab. 15 / Tab. 16 keys), V, SH, N, surfaces:[{S, alpha}],
        ceilingOnly:{L,W,H,alphaCeil,situation} | null, T_measured, measOther (measured in the other furnishing state than the requirement)}
   out.verdict {pass, basis} follows part 3 §9.2 / §9.3: design → Tab. 15 decides (Sabine Tnom shown as information);
   measured Tnom ≤ 1,1·limit passes (Tab. 15 cancelled), else the space complies when Tab. 15 is met with correct workmanship. */
function absorption(inp) {
  inp = inp || {}; var out = { ok: true, items: [], notes: [], sources: [] };
  var surf = inp.surfaces || [], V = inp.V, Tm = isNum(inp.T_measured) && inp.T_measured > 0 ? inp.T_measured : null;
  var Adiff = 0, Sall = 0, Aall = 0;
  surf.forEach(function (s) { if (!(s.S > 0) || !isNum(s.alpha)) return; Sall += s.S; Aall += s.S * s.alpha; if (s.alpha > 0.05) Adiff += s.S * s.alpha; });
  var eps = 1, epsInfo = null;
  if (inp.ceilingOnly) { epsInfo = epsSpat(inp.ceilingOnly.L, inp.ceilingOnly.W, inp.ceilingOnly.H, inp.ceilingOnly.alphaCeil, inp.ceilingOnly.situation); if (epsInfo.ok) { eps = epsInfo.eps; out.sources.push('s3_e', 'la_req_eps'); } }
  var Aeff = Adiff * eps;
  out.Adiff = r1(Adiff); out.Aeff = r1(Aeff); out.eps = eps; out.epsInfo = epsInfo; out.Atotal = r1(Aall);
  /* Sabine estimate (learning assumption) */
  if (isNum(V) && V > 0 && Aeff > 0) { out.T_est = Math.round(C.CSAB * V / Aeff * 100) / 100; out.sources.push('la_req_sabine'); }
  var haveT = Tm != null ? Tm : out.T_est, kindT = Tm != null ? 'measured' : 'sabine';
  var t15i = null, t16i = null;
  if (inp.norm === 'S01-400-1') {
    out.sources.push('s1_92');
    if (inp.space === 'atrium') {
      var lim = Math.max(1.5, isNum(V) ? lg(V / 50) : 1.5); t16i = item('T', '<=', Math.round(lim * 100) / 100, 's1_92'); out.items.push(t16i);
    } else {
      t15i = item('Aw', '>=', isNum(inp.SH) && inp.SH > 0 ? r1(0.3 * inp.SH) : null, 's1_92'); t15i.achieved = r1(Adiff);
      if (t15i.value == null) t15i.nr = 'input_missing';
      out.items.push(t15i);
    }
    out.items.forEach(function (x) {
      var have = x.q === 'T' ? haveT : x.achieved; if (x.value == null || !isNum(have)) return;
      x.have = have; x.haveKind = x.q === 'T' ? kindT : 'design';
      x.pass = x.op === '>=' ? have >= x.value - 1e-9 : have <= x.value + 1e-9;
    });
    var d1 = out.items[0]; out.verdict = { pass: d1 && d1.pass != null ? d1.pass : null, basis: d1 && d1.q === 'T' ? kindT : 'design' };
    return out;
  }
  out.sources.push('s3_t15', 's3_t16');
  var t15 = T15[inp.space15];
  if (t15) {
    if (t15.q === 'alpha') { t15i = item('alphaEff', '>=', t15.k, 's3_t15'); t15i.achieved = Sall > 0 ? Math.round(Aeff / Sall * 1000) / 1000 : null; if (!(Sall > 0)) t15i.nr = 'input_missing'; }
    else {
      var base = t15.q === 'SH' ? inp.SH : inp.N;
      t15i = item('Aeff', '>=', isNum(base) && base > 0 ? r1(t15.k * base) : null, 's3_t15'); t15i.achieved = r1(Aeff);
      if (t15i.value == null) t15i.nr = 'input_missing';
      if (t15.q === 'SH') t15i.notes.push('alpha005');
    }
    out.items.push(t15i);
  }
  var t16 = T16[inp.space16];
  if (t16) {
    var k = t16[0], tl = null, missing = false;
    if (k === 'c') tl = t16[1]; else if (k === 'lc' && V > 0) tl = 0.35 * lg(1.25 * V); else if (k === 'lg50' && V > 0) tl = Math.min(lg(V / 50), t16[1]);
    else if (k === 'max1' && V > 0) tl = Math.max(1, lg(V / 50)); else if (k === 'lg20' && V > 0) tl = lg(V / 20); else if (k === 'vn' && V > 0 && inp.N > 0) tl = t16[1] * V / inp.N;
    else if (k !== 'study' && k !== 'none') missing = true;
    var floored = false;
    if (tl != null && tl < 0.4) { tl = 0.4; floored = true; } /* §9.3: never lower than 0,4 s */
    t16i = item('Tnom', '<=', tl == null ? null : Math.round(tl * 100) / 100, 's3_t16');
    if (k === 'study') t16i.nr = 'study'; else if (k === 'none') t16i.nr = 'no_T'; else if (missing) t16i.nr = 'input_missing';
    else if (t16[2] === 'furn') t16i.notes.push('furnished');
    if (floored) { t16i.notes.push('floor04'); out.sources.push('s3_93'); }
    t16i.notes.push('lowfreq');
    out.items.push(t16i);
  }
  var pass15 = null;
  if (t15i && t15i.value != null && isNum(t15i.achieved)) { t15i.have = t15i.achieved; t15i.haveKind = 'design'; pass15 = t15i.achieved >= t15i.value - 1e-9; }
  var pass16 = null;
  if (t16i && t16i.value != null && isNum(haveT)) {
    t16i.have = haveT; t16i.haveKind = kindT;
    if (kindT === 'measured') {
      /* §9.3: +10 % margin on a measured Tnom; measured in the other furnishing state: limit × 0,9 (unfurnished requirement) or × 1,1 (furnished requirement) */
      var adj = inp.measOther ? (t16[2] === 'furn' ? 1.1 : 0.9) : 1;
      t16i.limitMeasured = Math.round(t16i.value * adj * 1.1 * 1000) / 1000;
      if (inp.measOther) t16i.notes.push(t16[2] === 'furn' ? 'meas_unfurn' : 'meas_furn');
      t16i.notes.push('meas_10pct'); out.sources.push('s3_93');
      pass16 = haveT <= t16i.limitMeasured + 1e-9;
    } else pass16 = haveT <= t16i.value + 1e-9;
  }
  /* verdict per §9.2 */
  var v = { pass: null, basis: null };
  if (kindT === 'measured' && pass16 != null) {
    if (pass16) { v = { pass: true, basis: 'meas_tnom' }; if (t15i) t15i.info = true; }
    else if (pass15 === true) { v = { pass: true, basis: 'meas_t15_work' }; }
    else v = { pass: false, basis: 'meas_fail' };
  } else if (pass15 != null) { v = { pass: pass15, basis: 'design_t15' }; if (t16i && pass16 != null) t16i.info = true; }
  else if (pass16 != null) v = { pass: pass16, basis: 'sabine_t16' };
  if (t15i && pass15 != null) { if (t15i.info) t15i.infoPass = pass15; else t15i.pass = pass15; }
  if (t16i && pass16 != null) { if (t16i.info) t16i.infoPass = pass16; else t16i.pass = pass16; }
  if (v.basis) out.notes.push('v_' + v.basis);
  out.verdict = v;
  return out;
}

/* ---------------------------------------------------------------- 10. measured-value check of a pair item */
function check(res, q, measured, V, bedroom) {
  if (!res || !res.items) return null;
  var it = null; res.items.forEach(function (x) { if (x.q === q) it = x; });
  if (!it || it.element) return it && it.element ? { element: true } : null;
  return checkMeasured(it, measured, V, bedroom, 'pair');
}

return {
  VERSION: VERSION, SOURCES: SOURCES, CLS: CLS, LV: LV, A1: A1, A1_IDS: A1_IDS, SLEEPING: SLEEPING, S3: S3, S1_USES: S1_USES, T12: T12, T15: T15, T16: T16,
  E1: E1, E1_RATIO: E1_RATIO, E1_ALPHA: E1_ALPHA, S1_SERVICE: S1_SERVICE,
  pair: pair, pairS1: pairS1, pairS3: pairS3, facade: facade, service: service, absorption: absorption, epsSpat: epsSpat,
  tolerance: tolerance, check: check, shortRef: shortRef, checkMeasured: checkMeasured, actIncrease: actIncrease
};
});
