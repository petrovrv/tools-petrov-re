/* glz-safety.js — global GlzSafety: engine of the tool `glasssafety` (Safety Glazing Selector, BE) of the tools.petrov.re Glazing & Windows package.
   Which breakage type / EN 12600 class α(β)φ is required where people can hit or fall through glass, per
   NBN S 23-002/A1:2010 (+AC:2010) §4.4.2 (Amendement n°1 replaces §4.4.2 of NBN S 23-002:2007): cases 1–9, Tableau 5 / Tableau 6;
   NBN S 23-002:2007 §4.4.2.2.5 (visibility marking, not amended); NBN B 03-004:2017 §5.3.1 Tab. 1 (protection height) and §9 (glass balustrades);
   EN 12600:2002 §6 (classification). Rules are short data with clause references (D-BW-13); no norm text or table is reproduced.
   Pane order in the project document: panes[0] = outer (exterior side), last = inner (room side).
   Pure functions, no DOM. UMD: browser global GlzSafety (needs GlazingCore loaded first), node module.exports.
   Planning aid only — the final glazing specification is made by a qualified person per the cited NBN / EN. */
(function (root, factory) {
  var core = (root && root.GlazingCore) || (typeof require === 'function' ? require('./glazing-core.js') : null);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GlzSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.2.0';
var L = C.L;

/* ---------------------------------------------------------------- 1. sources (norm + clause) */
var A1 = 'NBN S 23-002/A1:2010 (+AC:2010) Vitrerie — Amendement n°1', S07 = 'NBN S 23-002:2007 Vitrerie (STS 38)',
  B03 = 'NBN B 03-004:2017 Garde-corps des bâtiments', EN = 'EN 12600:2002 Glass in building — Pendulum test — Impact test method and classification for flat glass';
var Src = function (title, edition, clause, kind) { return { title: title, edition: edition, clause: clause, kind: kind || 'standard' }; };
var SOURCES = {
  a1_class: Src(A1, '2010', '§4.4.2.1 Tab. 3 (drop heights), Tab. 4 (φ)'),
  a1_gen: Src(A1, '2010', '§4.4.2.2.1 (human-activity zones, notes 1–2; type A never safety glass; film; ±15° / 0,50 m; insulating glass rule)'),
  a1_cases: Src(A1, '2010', '§4.4.2.2.2 cases 1–8 (+AC:2010 corrigendum items 1–3)'),
  a1_t5: Src(A1, '2010', '§4.4.2.2.2 Tableau 5 (breakage types by category and case, notes 1–5)'),
  a1_t6: Src(A1, '2010', '§4.4.2.2.2 case 9, Tableau 6 (other applications)'),
  a1_ex: Src(A1, '2010', '§4.4.2.2.1 example (case 2 → 1B1 → 33.2 PVB is a minimum)'),
  s07_vis: Src(S07, '2007', '§4.4.2.2.5 (visibility of glazing in public places)'),
  b03_h: Src(B03, '2017', '§5.3.1 (4)–(6), Tab. 1 (protection heights H, H′, seat / kneel rule)'),
  b03_92: Src(B03, '2017', '§9.2 (1)–(3) (glass in balustrades)'),
  b03_93: Src(B03, '2017', '§9.3 (kmod 0,74 / 0,89) and §9.4 (clamping ≥ 100 mm)'),
  en12600: Src(EN, '2002', '§6.2 drop height class, §6.3 mode of breakage'),
  la_pub: Src('Learning assumption: a publicly accessible outdoor zone (pavement, school yard) is checked as the Tableau 5 row of category C5 with fall height 0 unless entered — A1 §4.4.2.2.1 names such zones human-activity zones without a Eurocode category', 'glz-safety ' + VERSION, '', 'learning_assumption'),
  la_cls: Src('Learning assumption: typical EN 12600 classes of common products (PVB 0,38 mm ≈ 2B2, ≥ 0,76 mm ≈ 1B1) — use the class declared by the manufacturer (DoP)', 'glz-safety ' + VERSION, '', 'learning_assumption')
};

/* ---------------------------------------------------------------- 2. data */
var DROP_MM = { 1: 1200, 2: 450, 3: 190 };                       // EN 12600 §6.2 / A1 Tab. 3
var CATEGORIES = ['A', 'B', 'C1', 'C2', 'C3', 'C4', 'C5', 'D', 'E'];
var KINDS = ['window', 'curtainwall', 'partition', 'door', 'roof', 'canopy', 'ceiling', 'cladding', 'balustrade',
  'shower', 'street_furniture', 'balcony_separation', 'showcase_fin'];
var group = function (cat) { return cat.charAt(0); };            // C1..C5 -> C, D1 -> D
/* A1 Tableau 5: alternatives (any one satisfies); null = safety glass not mandatory (*). Rows by category group A B C D E. */
var TAB5 = {
  1: { A: ['1C-', '2B2'], B: ['1C-', '2B2'], C: ['1C-', '2B2'], D: ['1C-', '2B2'], E: ['1C-', '2B2'] },   // AC:2010 item 1: 1C- (or 2B2)
  2: { A: ['1B1'], B: ['1B1'], C: ['1B1'], D: ['1B1'], E: ['1B1'] },
  3: { A: null, B: null, C: ['1C-', '1B1'], D: null, E: null },                                       // C: note (4) recommendation only
  4: { A: ['B', 'C'], B: ['B', 'C'], C: ['B', 'C'], D: ['B', 'C'], E: ['B', 'C'] },                    // specific prescriptions §4.4.2.2.2 case 4
  '5L': { A: ['1B1'], B: ['1B1'], C: ['1B1'], D: ['1B1'], E: ['1B1'] },                                // landing doors, S > 0,5 m², hb < 1,40 m
  '5O': { A: ['1C-', '2B2'], B: ['1C-', '2B2'], C: ['1C-', '2B2'], D: ['1C-', '2B2'], E: ['1C-', '2B2'] },
  6: { A: ['1B1'], B: ['1B1'], C: ['1B1'], D: ['1B1'], E: ['1B1'] },
  7: { A: ['2B2', '1C-'], B: ['2B2', '1C-'], C: ['2B2', '1C-'], D: ['2B2', '1C-'], E: ['2B2', '1C-'] },
  8: { A: ['3B3', '1C-'], B: ['3B3', '1C-'], C: ['3B3', '1C-'], D: ['3B3', '1C-'], E: ['3B3', '1C-'] }
};
/* A1 Tableau 6 (case 9): [base < 0,90 m, base ≥ 0,90 m] */
var TAB6 = {
  street_furniture: [['1B1', '1C1'], ['2B2', '1C2']],
  shower: [['1B1', '1C-'], ['1B1', '1C-']],
  balcony_separation: [['1C2'], ['1C2']],
  showcase_fin: [['1B1', '1C1'], ['1B1', '1C1']]
};
var LIM = {
  H_ref_m: 0.90,            // A1 reference protection height (specifications of the glazed work may set another)
  hc_case1_m: 1.50,         // case 1 / case 2 boundary of the fall height
  tilt_vertical: 15,        // ±15° counts as vertical (§4.4.2.2.1)
  overhang_vertical_m: 0.50,
  tilt_special: 30,         // beyond 30° from vertical: special study (case 4)
  small_area_m2: 0.5, small_width_m: 0.3,   // case 1 exemption
  door_area_m2: 0.5, door_hb_m: 1.40, landing_drop_m: 1.0, landing_dist_m: 1.0,
  clad_area_m2: 1.0, clad_bottom_m: 1.5,
  tab6_base_m: 0.90,
  rebate_inclined_mm: 25,
  vis_low_m: 0.60, vis_high_m: 1.50, vis_width_m: 0.55,
  balu_clamp_mm: 100, balu_x_mm: 950, balu_high_m: 12, balu_seat_hb_mm: 600
};
/* NBN B 03-004 Tab. 1: H [mm] by balustrade type; thin Ep ≤ 200, thick 200 < Ep < 400 → 1100 − 0,5·Ep, Ep ≥ 400 → 900; ≥ 12 m fall: 1200 (thin and thick) */
function protectionHeight(o) {
  o = o || {};
  var Ep = num(o.Ep_mm, 0), high = num(o.drop_m, 0) >= LIM.balu_high_m, H;
  if (o.stair) H = 900;
  else if (high) H = 1200;
  else if (Ep <= 200) H = 1100;
  else if (Ep < 400) H = 1100 - 0.5 * Ep;
  else H = 900;
  var Hp = H, rule = 'tab1';
  if (num(o.y_mm, 0) > 0 && num(o.x_mm, 1e9) <= LIM.balu_x_mm) { Hp = H + num(o.y_mm, 0); rule = 'h_prime'; }
  if (o.seat && num(o.ha_mm, 0) > 0) { var hs = num(o.ha_mm, 0) + Math.max(LIM.balu_seat_hb_mm, num(o.hb_mm, LIM.balu_seat_hb_mm)); if (hs > Hp) { Hp = hs; rule = 'seat'; } }
  return { H_mm: H, Hp_mm: Hp, rule: rule, src: 'b03_h' };
}

/* ---------------------------------------------------------------- 3. EN 12600 class strings */
/* parse '1B1' | '1C-' | '2B2' | 'B' | 'C' -> {alpha 1..3|null, beta 'A'|'B'|'C', phi 0..3|'-'|null} */
function parseClass(s) {
  if (s == null) return null;
  var m = /^\s*([123])?\s*\(?([ABC])\)?\s*([0123-])?\s*$/.exec(String(s).toUpperCase());
  if (!m) return null;
  return { alpha: m[1] ? +m[1] : null, beta: m[2], phi: m[3] == null ? null : (m[3] === '-' ? '-' : +m[3]), text: String(s).trim().toUpperCase().replace(/\s|\(|\)/g, '') };
}
function decode(s) {
  var c = parseClass(s); if (!c) return null;
  return { text: c.text, beta: c.beta, alpha: c.alpha, phi: c.phi,
    alpha_drop_mm: c.alpha ? DROP_MM[c.alpha] : null,
    phi_drop_mm: typeof c.phi === 'number' && c.phi > 0 ? DROP_MM[c.phi] : null };
}
/* does a pane of class `have` satisfy one requirement alternative `req`? -> 'pass' | 'fail' | 'verify' (type fits, class not declared) */
function meets(have, req) {
  var h = typeof have === 'string' ? parseClass(have) : have, r = typeof req === 'string' ? parseClass(req) : req;
  if (!h || !r) return 'fail';
  if (h.beta === 'A') return 'fail';                                     // annealed is never safety glass (A1 §4.4.2.2.1)
  if (r.beta === 'B' && h.beta !== 'B') return 'fail';
  // r.beta C: C fits; B fits too (general note of Tab. 5: C can always be replaced by B)
  if (r.alpha == null) return 'pass';                                    // type-only requirement (case 4 / barrier alternatives)
  if (h.alpha == null) return 'verify';
  if (h.alpha > r.alpha) return 'fail';                                  // class 1 = highest drop height
  if (r.phi == null || r.phi === '-' || h.beta === 'B' && r.beta === 'C') return 'pass';
  if (h.phi == null || h.phi === '-') return 'verify';
  if (h.phi === 0 || h.phi > r.phi) return 'fail';
  return 'pass';
}
function meetsAny(have, alts) {
  var best = 'fail';
  for (var i = 0; i < alts.length; i++) { var m = meets(have, alts[i]); if (m === 'pass') return 'pass'; if (m === 'verify') best = 'verify'; }
  return best;
}

/* ---------------------------------------------------------------- 4. what a pane of the project document is */
/* pane {plies_mm, interlayer_mm, glass} + optional declared class -> {cls, beta, laminated, allToughened, inferred, src} */
function paneClass(p, declared) {
  p = p || {};
  var plies = p.plies_mm || [], il = p.interlayer_mm || [], lam = plies.length >= 2;
  var glass = p.glass || 'float';
  var out = { laminated: lam, allToughened: lam && glass === 'toughened', glass: glass, plies: plies.length, interlayer_mm: il.reduce(function (a, b) { return a + b; }, 0) };
  var d = declared ? parseClass(declared) : null;
  if (d && d.alpha) { out.cls = d.text; out.beta = d.beta; out.inferred = false; return out; }
  if (lam) {
    out.beta = 'B';
    var minIl = il.length ? Math.min.apply(null, il) : 0;
    out.cls = minIl >= 0.76 - 1e-6 ? '1B1' : minIl >= 0.38 - 1e-6 ? '2B2' : 'B';
    out.inferred = true; out.src = 'la_cls';
  } else if (glass === 'toughened') { out.beta = 'C'; out.cls = 'C'; out.inferred = true; }
  else { out.beta = 'A'; out.cls = 'A'; out.inferred = true; }
  return out;
}

/* ---------------------------------------------------------------- 5. messages (7 languages) */
var M = {
  case1: L('Case 1 — vertical glazing, low sill (h < H) and fall height hc ≤ 1,5 m: injury by sharp pieces', 'Випадок 1 — вертикальне скління, низьке підвіконня (h < H), висота падіння hc ≤ 1,5 м: травми гострими уламками', 'Fall 1 — senkrechte Verglasung, niedrige Brüstung (h < H), Absturzhöhe hc ≤ 1,5 m: Verletzung durch scharfe Bruchstücke', 'Geval 1 — verticale beglazing, lage borstwering (h < H), valhoogte hc ≤ 1,5 m: verwonding door scherpe stukken', 'Cas 1 — paroi verticale, allège basse (h < H), hauteur de chute hc ≤ 1,5 m : blessure par morceaux coupants', 'Caso 1 — acristalamiento vertical, antepecho bajo (h < H), altura de caída hc ≤ 1,5 m: heridas por trozos cortantes', 'Przypadek 1 — oszklenie pionowe, niski parapet (h < H), wysokość upadku hc ≤ 1,5 m: zranienie ostrymi kawałkami'),
  case2: L('Case 2 — vertical glazing, low sill (h < H) and fall height hc > 1,5 m: risk of falling through', 'Випадок 2 — вертикальне скління, низьке підвіконня (h < H), висота падіння hc > 1,5 м: ризик випадіння', 'Fall 2 — senkrechte Verglasung, niedrige Brüstung (h < H), Absturzhöhe hc > 1,5 m: Absturzgefahr', 'Geval 2 — verticale beglazing, lage borstwering (h < H), valhoogte hc > 1,5 m: valgevaar', 'Cas 2 — paroi verticale, allège basse (h < H), hauteur de chute hc > 1,5 m : risque de défenestration', 'Caso 2 — acristalamiento vertical, antepecho bajo (h < H), altura de caída hc > 1,5 m: riesgo de caída', 'Przypadek 2 — oszklenie pionowe, niski parapet (h < H), wysokość upadku hc > 1,5 m: ryzyko wypadnięcia'),
  case3: L('Case 3 — vertical glazing above the protection height (h ≥ H)', 'Випадок 3 — вертикальне скління вище захисної висоти (h ≥ H)', 'Fall 3 — senkrechte Verglasung oberhalb der Schutzhöhe (h ≥ H)', 'Geval 3 — verticale beglazing boven de beschermingshoogte (h ≥ H)', 'Cas 3 — paroi verticale au-dessus de la hauteur de protection (h ≥ H)', 'Caso 3 — acristalamiento vertical por encima de la altura de protección (h ≥ H)', 'Przypadek 3 — oszklenie pionowe powyżej wysokości ochronnej (h ≥ H)'),
  case4: L('Case 4 — inclined glazing (15°–30° from vertical or overhang > 0,5 m) above a human-activity zone', 'Випадок 4 — похиле скління (15°–30° від вертикалі або виліт > 0,5 м) над зоною перебування людей', 'Fall 4 — geneigte Verglasung (15°–30° zur Senkrechten oder Überstand > 0,5 m) über einem Aufenthaltsbereich', 'Geval 4 — hellende beglazing (15°–30° t.o.v. verticaal of overstek > 0,5 m) boven een zone met menselijke activiteit', 'Cas 4 — paroi inclinée (15°–30° de la verticale ou surplomb > 0,5 m) au-dessus d’une zone d’activité humaine', 'Caso 4 — acristalamiento inclinado (15°–30° respecto a la vertical o voladizo > 0,5 m) sobre una zona de actividad humana', 'Przypadek 4 — oszklenie pochyłe (15°–30° od pionu lub wysięg > 0,5 m) nad strefą przebywania ludzi'),
  case5L: L('Case 5 — landing door (drop > 1 m within 1 m of the door), glass S > 0,5 m², bottom edge hb < 1,40 m', 'Випадок 5 — двері біля сходового прольоту (перепад > 1 м ближче 1 м), скло S > 0,5 м², нижній край hb < 1,40 м', 'Fall 5 — Tür am Treppenabgang (Höhenunterschied > 1 m innerhalb 1 m), Glas S > 0,5 m², Unterkante hb < 1,40 m', 'Geval 5 — deur bij een trapgat (niveauverschil > 1 m binnen 1 m), glas S > 0,5 m², onderrand hb < 1,40 m', 'Cas 5 — porte palière (dénivellation > 1 m à moins de 1 m), verre S > 0,5 m², bord inférieur hb < 1,40 m', 'Caso 5 — puerta de rellano (desnivel > 1 m a menos de 1 m), vidrio S > 0,5 m², borde inferior hb < 1,40 m', 'Przypadek 5 — drzwi przy schodach (różnica poziomów > 1 m w odległości < 1 m), szkło S > 0,5 m², dolna krawędź hb < 1,40 m'),
  case5O: L('Case 5 — door, glass S > 0,5 m², bottom edge hb < 1,40 m', 'Випадок 5 — двері, скло S > 0,5 м², нижній край hb < 1,40 м', 'Fall 5 — Tür, Glas S > 0,5 m², Unterkante hb < 1,40 m', 'Geval 5 — deur, glas S > 0,5 m², onderrand hb < 1,40 m', 'Cas 5 — porte, verre S > 0,5 m², bord inférieur hb < 1,40 m', 'Caso 5 — puerta, vidrio S > 0,5 m², borde inferior hb < 1,40 m', 'Przypadek 5 — drzwi, szkło S > 0,5 m², dolna krawędź hb < 1,40 m'),
  case5n: L('Case 5 — door glass with S ≤ 0,5 m² or bottom edge hb ≥ 1,40 m: safety glass not mandatory', 'Випадок 5 — скло дверей S ≤ 0,5 м² або hb ≥ 1,40 м: безпечне скло не обов’язкове', 'Fall 5 — Türglas S ≤ 0,5 m² oder hb ≥ 1,40 m: Sicherheitsglas nicht vorgeschrieben', 'Geval 5 — deurglas S ≤ 0,5 m² of hb ≥ 1,40 m: veiligheidsglas niet verplicht', 'Cas 5 — verre de porte S ≤ 0,5 m² ou hb ≥ 1,40 m : verre de sécurité non obligatoire', 'Caso 5 — vidrio de puerta S ≤ 0,5 m² o hb ≥ 1,40 m: vidrio de seguridad no obligatorio', 'Przypadek 5 — szkło drzwi S ≤ 0,5 m² lub hb ≥ 1,40 m: szkło bezpieczne nieobowiązkowe'),
  case6: L('Case 6 — roof or canopy (category H, accessible only for maintenance): the inner pane is the safety glass', 'Випадок 6 — дах або навіс (категорія H, доступ лише для обслуговування): безпечним має бути внутрішнє скло', 'Fall 6 — Dach oder Vordach (Kategorie H, nur zur Wartung begehbar): die innere Scheibe ist das Sicherheitsglas', 'Geval 6 — dak of luifel (categorie H, enkel toegankelijk voor onderhoud): de binnenste ruit is het veiligheidsglas', 'Cas 6 — toiture ou auvent (catégorie H, accessible uniquement pour l’entretien) : la feuille intérieure est le verre de sécurité', 'Caso 6 — cubierta o marquesina (categoría H, accesible solo para mantenimiento): la hoja interior es el vidrio de seguridad', 'Przypadek 6 — dach lub daszek (kategoria H, dostęp tylko do konserwacji): szkłem bezpiecznym jest tafla wewnętrzna'),
  case7: L('Case 7 — glass ceiling', 'Випадок 7 — скляна стеля', 'Fall 7 — Glasdecke', 'Geval 7 — glazen plafond', 'Cas 7 — plafond en verre', 'Caso 7 — techo de vidrio', 'Przypadek 7 — sufit szklany'),
  case8: L('Case 8 — glass cladding / applied glass > 1,0 m² with bottom edge < 1,5 m (impact zone)', 'Випадок 8 — скляне облицювання > 1,0 м² з нижнім краєм < 1,5 м (зона ударів)', 'Fall 8 — Glasbekleidung > 1,0 m² mit Unterkante < 1,5 m (Stoßzone)', 'Geval 8 — glasbekleding > 1,0 m² met onderrand < 1,5 m (stootzone)', 'Cas 8 — bardage / applique en verre > 1,0 m² dont le bord inférieur est à < 1,5 m (zone de chocs)', 'Caso 8 — revestimiento de vidrio > 1,0 m² con borde inferior < 1,5 m (zona de impacto)', 'Przypadek 8 — okładzina szklana > 1,0 m² z dolną krawędzią < 1,5 m (strefa uderzeń)'),
  case8n: L('Case 8 — cladding outside the impact zone or ≤ 1,0 m²: no breakage-type requirement', 'Випадок 8 — облицювання поза зоною ударів або ≤ 1,0 м²: вимог до типу руйнування немає', 'Fall 8 — Bekleidung außerhalb der Stoßzone oder ≤ 1,0 m²: keine Anforderung an die Bruchart', 'Geval 8 — bekleding buiten de stootzone of ≤ 1,0 m²: geen eis aan het breukgedrag', 'Cas 8 — bardage hors zone de chocs ou ≤ 1,0 m² : pas d’exigence de type de casse', 'Caso 8 — revestimiento fuera de la zona de impacto o ≤ 1,0 m²: sin requisito de tipo de rotura', 'Przypadek 8 — okładzina poza strefą uderzeń lub ≤ 1,0 m²: brak wymagań co do rodzaju pęknięcia'),
  case9: L('Case 9 — other application (Tableau 6)', 'Випадок 9 — інше застосування (табл. 6)', 'Fall 9 — sonstige Anwendung (Tabelle 6)', 'Geval 9 — andere toepassing (tabel 6)', 'Cas 9 — autre application (tableau 6)', 'Caso 9 — otra aplicación (tabla 6)', 'Przypadek 9 — inne zastosowanie (tabela 6)'),
  balu: L('Glass balustrade — NBN B 03-004 §9', 'Скляне огородження — NBN B 03-004 §9', 'Glasbrüstung — NBN B 03-004 §9', 'Glazen borstwering — NBN B 03-004 §9', 'Garde-corps en verre — NBN B 03-004 §9', 'Barandilla de vidrio — NBN B 03-004 §9', 'Balustrada szklana — NBN B 03-004 §9'),
  inclined_free: L('Inclined glazing that does not overhang a human-activity zone: case 4 does not apply; impact checked as vertical glazing', 'Похиле скління не нависає над зоною перебування людей: випадок 4 не застосовується; удар перевірено як для вертикального', 'Geneigte Verglasung ohne Aufenthaltsbereich darunter: Fall 4 gilt nicht; Stoß wie bei senkrechter Verglasung geprüft', 'Hellende beglazing zonder activiteitszone eronder: geval 4 geldt niet; stoot gecontroleerd als verticale beglazing', 'Paroi inclinée ne surplombant pas une zone d’activité humaine : le cas 4 ne s’applique pas ; choc vérifié comme paroi verticale', 'Acristalamiento inclinado que no vuela sobre una zona de actividad: no aplica el caso 4; impacto comprobado como vertical', 'Oszklenie pochyłe nie nad strefą przebywania: przypadek 4 nie ma zastosowania; uderzenie sprawdzone jak dla pionowego'),
  special: L('More than 30° from vertical and not a roof: special study required (case 4) — outside this tool', 'Понад 30° від вертикалі і не дах: потрібне спеціальне дослідження (випадок 4) — поза межами інструмента', 'Mehr als 30° zur Senkrechten und kein Dach: Sonderuntersuchung erforderlich (Fall 4) — außerhalb dieses Werkzeugs', 'Meer dan 30° t.o.v. verticaal en geen dak: speciale studie vereist (geval 4) — buiten dit hulpmiddel', 'Plus de 30° de la verticale et pas une toiture : étude spéciale requise (cas 4) — hors du champ de l’outil', 'Más de 30° respecto a la vertical y no es cubierta: se requiere estudio especial (caso 4), fuera del alcance', 'Ponad 30° od pionu i nie dach: wymagane specjalne opracowanie (przypadek 4) — poza zakresem narzędzia'),
  n_small: L('Small pane: daylight area < 0,5 m² or visible width < 0,3 m — safety glass not mandatory in case 1 (the pane size w × h is taken as the daylight size, the width w as the visible width)', 'Мале скло: світла площа < 0,5 м² або видима ширина < 0,3 м — у випадку 1 безпечне скло не обов’язкове (розмір скла w × h взято як світлий розмір, ширину w — як видиму ширину)', 'Kleine Scheibe: Lichtfläche < 0,5 m² oder sichtbare Breite < 0,3 m — Sicherheitsglas in Fall 1 nicht vorgeschrieben (Scheibengröße w × h als Lichtmaß, Breite w als sichtbare Breite angesetzt)', 'Kleine ruit: daglichtoppervlak < 0,5 m² of zichtbare breedte < 0,3 m — veiligheidsglas in geval 1 niet verplicht (ruitmaat w × h genomen als daglichtmaat, breedte w als zichtbare breedte)', 'Petit vitrage : surface de jour < 0,5 m² ou largeur visible < 0,3 m — verre de sécurité non obligatoire en cas 1 (dimensions du verre w × h prises comme surface de jour, largeur w comme largeur visible)', 'Vidrio pequeño: superficie de luz < 0,5 m² o ancho visible < 0,3 m — vidrio de seguridad no obligatorio en el caso 1 (se toma el tamaño w × h de la hoja como luz y el ancho w como ancho visible)', 'Mała szyba: powierzchnia światła < 0,5 m² lub widoczna szerokość < 0,3 m — w przypadku 1 szkło bezpieczne nieobowiązkowe (wymiar tafli w × h przyjęto jako wymiar w świetle, szerokość w jako widoczną szerokość)'),
  special_nz: L('More than 30° from vertical, not a roof and not above a human-activity zone: not covered by this tool (as a roof/canopy choose that kind → case 6; above a human-activity zone a special study is required, case 4)', 'Понад 30° від вертикалі, не дах і не над зоною перебування людей: поза межами інструмента (для даху/навісу оберіть цей тип → випадок 6; над зоною перебування людей потрібне спеціальне дослідження, випадок 4)', 'Mehr als 30° zur Senkrechten, kein Dach und nicht über einem Aufenthaltsbereich: von diesem Werkzeug nicht erfasst (als Dach/Vordach diese Art wählen → Fall 6; über einem Aufenthaltsbereich ist eine Sonderuntersuchung nötig, Fall 4)', 'Meer dan 30° t.o.v. verticaal, geen dak en niet boven een activiteitszone: niet gedekt door dit hulpmiddel (als dak/luifel die soort kiezen → geval 6; boven een activiteitszone is een speciale studie vereist, geval 4)', 'Plus de 30° de la verticale, pas une toiture et pas au-dessus d’une zone d’activité humaine : hors du champ de l’outil (toiture/auvent : choisir ce type → cas 6 ; au-dessus d’une zone d’activité humaine, étude spéciale requise, cas 4)', 'Más de 30° respecto a la vertical, no es cubierta y no está sobre una zona de actividad: fuera del alcance (como cubierta/marquesina elija ese tipo → caso 6; sobre una zona de actividad se requiere estudio especial, caso 4)', 'Ponad 30° od pionu, nie dach i nie nad strefą przebywania ludzi: poza zakresem narzędzia (dla dachu/daszka wybierz ten rodzaj → przypadek 6; nad strefą przebywania wymagane specjalne opracowanie, przypadek 4)'),
  n_case4room: L('Case 4 covers the overhead side; on the room side people can still hit or fall through the glass, so cases 1–3 (sill h, fall height hc) are checked on the inner pane as well', 'Випадок 4 стосується боку над головою; з боку приміщення людина все одно може вдаритися або випасти, тому внутрішнє скло також перевірено за випадками 1–3 (підвіконня h, висота падіння hc)', 'Fall 4 betrifft die Überkopfseite; auf der Raumseite kann man trotzdem gegen das Glas stoßen oder durchfallen, daher wird die innere Scheibe zusätzlich nach Fall 1–3 (Brüstung h, Absturzhöhe hc) geprüft', 'Geval 4 betreft de overhoofse zijde; aan de kamerzijde kan men toch tegen het glas stoten of erdoor vallen, dus wordt de binnenruit ook volgens geval 1–3 (borstwering h, valhoogte hc) gecontroleerd', 'Le cas 4 vise le côté en surplomb ; côté local, on peut toujours heurter le verre ou passer au travers : le verre intérieur est donc aussi vérifié selon les cas 1 à 3 (allège h, hauteur de chute hc)', 'El caso 4 cubre el lado en voladizo; en el lado del local aún se puede golpear o atravesar el vidrio, por eso la hoja interior se comprueba también según los casos 1–3 (antepecho h, altura de caída hc)', 'Przypadek 4 dotyczy strony nad głową; od strony pomieszczenia nadal można uderzyć w szkło lub przez nie wypaść, dlatego taflę wewnętrzną sprawdzono też wg przypadków 1–3 (parapet h, wysokość upadku hc)'),
  n_pub: L('Public outdoor zone checked as the category C5 row of Tableau 5, fall height 0 unless entered (learning assumption)', 'Публічну зовнішню зону перевірено за рядком категорії C5 табл. 5, висота падіння 0, якщо не задано (навчальне припущення)', 'Öffentlicher Außenbereich wie Zeile Kategorie C5 der Tabelle 5 geprüft, Absturzhöhe 0, sofern nicht eingegeben (Lernannahme)', 'Publieke buitenzone gecontroleerd als de rij categorie C5 van tabel 5, valhoogte 0 tenzij ingevuld (leeraanname)', 'Zone extérieure publique vérifiée comme la ligne catégorie C5 du tableau 5, hauteur de chute 0 sauf saisie (hypothèse d’apprentissage)', 'Zona exterior pública comprobada como la fila de la categoría C5 de la tabla 5, altura de caída 0 salvo que se indique (supuesto de aprendizaje)', 'Publiczną strefę zewnętrzną sprawdzono jak wiersz kategorii C5 tabeli 5, wysokość upadku 0, jeśli nie podano (założenie szkoleniowe)'),
  n_balu_hlow: L('The balustrade top ({top} mm) is below the required protection height {H} mm (NBN B 03-004 §5.3.1, Tab. 1): the guard does not meet the requirement', 'Верх огородження ({top} мм) нижчий за потрібну захисну висоту {H} мм (NBN B 03-004 §5.3.1, табл. 1): огородження не відповідає вимозі', 'Oberkante der Brüstung ({top} mm) liegt unter der erforderlichen Schutzhöhe {H} mm (NBN B 03-004 §5.3.1, Tab. 1): die Absturzsicherung erfüllt die Anforderung nicht', 'De bovenkant van de borstwering ({top} mm) ligt onder de vereiste beschermingshoogte {H} mm (NBN B 03-004 §5.3.1, tab. 1): de borstwering voldoet niet', 'Le haut du garde-corps ({top} mm) est sous la hauteur de protection requise {H} mm (NBN B 03-004 §5.3.1, tab. 1) : le garde-corps n’est pas conforme', 'La parte superior de la barandilla ({top} mm) está por debajo de la altura de protección exigida {H} mm (NBN B 03-004 §5.3.1, tabla 1): la barandilla no cumple', 'Górna krawędź balustrady ({top} mm) jest poniżej wymaganej wysokości ochronnej {H} mm (NBN B 03-004 §5.3.1, tab. 1): balustrada nie spełnia wymagania'),
  n_note5: L('Note (5): in single-family houses and apartments annealed glass (type A) is allowed in case 1 only if the specification prescribes it and the impact test on the glazed work (or an accepted equivalent calculation) shows the glass does not break', 'Примітка (5): в індивідуальних будинках і квартирах відпалене скло (тип A) у випадку 1 допускається, лише якщо це передбачено специфікацією і випробування виробу на удар (або прийнятий розрахунок) показує, що скло не руйнується', 'Anmerkung (5): in Einfamilienhäusern und Wohnungen ist Floatglas (Typ A) in Fall 1 nur zulässig, wenn das Leistungsverzeichnis es vorschreibt und die Stoßprüfung am Bauteil (oder eine anerkannte gleichwertige Berechnung) zeigt, dass das Glas nicht bricht', 'Noot (5): in eengezinswoningen en appartementen is floatglas (type A) in geval 1 alleen toegestaan als het bestek het voorschrijft en de stootproef op het element (of een aanvaarde gelijkwaardige berekening) aantoont dat het glas niet breekt', 'Note (5) : dans les maisons unifamiliales et appartements, un verre de type A est permis en cas 1 seulement si le cahier des charges le prescrit et que l’essai de choc sur l’ouvrage vitré (ou un calcul équivalent accepté) montre que le verre ne casse pas', 'Nota (5): en viviendas unifamiliares y apartamentos se permite vidrio recocido (tipo A) en el caso 1 solo si el pliego lo prescribe y el ensayo de impacto del elemento (o un cálculo equivalente aceptado) demuestra que no rompe', 'Uwaga (5): w domach jednorodzinnych i mieszkaniach szkło odprężone (typ A) w przypadku 1 dopuszcza się tylko, gdy przewiduje to specyfikacja, a badanie udarowe elementu (lub uznane obliczenie) wykaże, że szkło nie pęka'),
  n_barrier1: L('A permanent barrier per NBN B 03-004 that takes the impact may replace the safety glass: type A is then acceptable behind it', 'Постійне огородження за NBN B 03-004, що сприймає удар, може замінити безпечне скло: тоді за ним допускається тип A', 'Eine feste Absturzsicherung nach NBN B 03-004, die den Stoß aufnimmt, kann das Sicherheitsglas ersetzen: dahinter ist dann Typ A zulässig', 'Een vaste borstwering volgens NBN B 03-004 die de stoot opvangt, kan het veiligheidsglas vervangen: type A is er dan achter toegestaan', 'Une protection permanente conforme à la NBN B 03-004 recevant le choc peut remplacer le verre de sécurité : un verre de type A est alors acceptable derrière elle', 'Una protección permanente según NBN B 03-004 que recibe el impacto puede sustituir al vidrio de seguridad: detrás se admite tipo A', 'Stała balustrada wg NBN B 03-004 przejmująca uderzenie może zastąpić szkło bezpieczne: za nią dopuszcza się typ A'),
  n_barrier2a: L('Permanent barrier on the impact side: type A is acceptable behind it', 'Постійне огородження з боку удару: за ним допускається тип A', 'Feste Absturzsicherung auf der Stoßseite: dahinter ist Typ A zulässig', 'Vaste borstwering aan de stootzijde: type A is erachter toegestaan', 'Protection permanente du côté du choc : un verre de type A est acceptable derrière elle', 'Protección permanente en el lado del impacto: detrás se admite tipo A', 'Stała balustrada po stronie uderzenia: za nią dopuszcza się typ A'),
  n_barrier2b: L('Permanent barrier on the side opposite the impact: toughened glass (type C) is acceptable on the impact side', 'Постійне огородження з протилежного боку: з боку удару допускається загартоване скло (тип C)', 'Feste Absturzsicherung auf der stoßabgewandten Seite: auf der Stoßseite ist ESG (Typ C) zulässig', 'Vaste borstwering aan de andere zijde: aan de stootzijde is gehard glas (type C) toegestaan', 'Protection permanente du côté opposé au choc : un verre trempé (type C) est acceptable du côté du choc', 'Protección permanente en el lado opuesto al impacto: en el lado del impacto se admite vidrio templado (tipo C)', 'Stała balustrada po przeciwnej stronie: po stronie uderzenia dopuszcza się szkło hartowane (typ C)'),
  n_case2alt: L('Instead of laminated glass a permanent barrier per NBN B 03-004 may provide the fall protection', 'Замість багатошарового скла захист від падіння може забезпечити постійне огородження за NBN B 03-004', 'Statt VSG kann eine feste Absturzsicherung nach NBN B 03-004 den Absturzschutz übernehmen', 'In plaats van gelaagd glas kan een vaste borstwering volgens NBN B 03-004 de valbeveiliging verzorgen', 'Au lieu d’un verre feuilleté, une protection permanente conforme à la NBN B 03-004 peut assurer la protection contre la chute', 'En lugar de vidrio laminado, una protección permanente según NBN B 03-004 puede asegurar la protección frente a caídas', 'Zamiast szkła laminowanego ochronę przed upadkiem może zapewnić stała balustrada wg NBN B 03-004'),
  n_note4: L('Note (4): for categories C the 1C- / 1B1 line is a recommendation only where other impacts are reasonably foreseeable (ball games, playgrounds)', 'Примітка (4): для категорій C рядок 1C- / 1B1 — лише рекомендація, якщо можливі інші удари (м’ячі, ігрові майданчики)', 'Anmerkung (4): für Kategorien C ist 1C- / 1B1 nur eine Empfehlung, wenn andere Stöße vorhersehbar sind (Ballspiele, Pausenhof)', 'Noot (4): voor categorieën C is 1C- / 1B1 enkel een aanbeveling wanneer andere stoten redelijkerwijs te verwachten zijn (balspelen, speelplaats)', 'Note (4) : pour les catégories C, 1C- / 1B1 n’est qu’une recommandation lorsque d’autres chocs sont raisonnablement prévisibles (ballons, cour de récréation)', 'Nota (4): en las categorías C, 1C- / 1B1 es solo una recomendación cuando son previsibles otros impactos (balones, patios)', 'Uwaga (4): dla kategorii C wymaganie 1C- / 1B1 jest tylko zaleceniem, gdy można przewidzieć inne uderzenia (piłki, boiska)'),
  n_case4: L('Inclined glazing: rebate ≥ 25 mm, beads that carry the glass weight screwed (not only clipped), no laminate with all plies toughened, type A not acceptable', 'Похиле скління: фальц ≥ 25 мм, штапики, що несуть вагу скла, — на гвинтах (не лише клямки), без триплексу з усіма загартованими шарами, тип A неприйнятний', 'Geneigte Verglasung: Falztiefe ≥ 25 mm, lastabtragende Glashalteleisten verschraubt (nicht nur geklipst), kein VSG aus nur ESG, Typ A unzulässig', 'Hellende beglazing: sponning ≥ 25 mm, dragende glaslatten geschroefd (niet enkel geklikt), geen gelaagd glas met enkel geharde bladen, type A niet toegestaan', 'Paroi inclinée : feuillure ≥ 25 mm, parcloses reprenant le poids du verre vissées (pas seulement clipsées), pas de feuilleté entièrement trempé, type A non acceptable', 'Acristalamiento inclinado: galce ≥ 25 mm, junquillos portantes atornillados (no solo clipados), sin laminado con todas las hojas templadas, tipo A no admitido', 'Oszklenie pochyłe: wrąb ≥ 25 mm, listwy przyszybowe przenoszące ciężar przykręcone (nie tylko na zatrzask), bez laminatu z samych tafli hartowanych, typ A niedopuszczalny'),
  n_door: L('Glazed parts next to the door follow cases 1–3; door leaf profile stiffness EI ≥ 7·10⁹ N·mm²', 'Скляні частини біля дверей — за випадками 1–3; жорсткість профілю стулки EI ≥ 7·10⁹ Н·мм²', 'Verglaste Teile neben der Tür nach Fall 1–3; Steifigkeit der Flügelprofile EI ≥ 7·10⁹ N·mm²', 'Glasdelen naast de deur volgens geval 1–3; stijfheid van de vleugelprofielen EI ≥ 7·10⁹ N·mm²', 'Parties vitrées attenantes : cas 1 à 3 ; rigidité des profils du vantail EI ≥ 7·10⁹ N·mm²', 'Partes acristaladas junto a la puerta: casos 1–3; rigidez de los perfiles de la hoja EI ≥ 7·10⁹ N·mm²', 'Przeszklenia obok drzwi wg przypadków 1–3; sztywność profili skrzydła EI ≥ 7·10⁹ N·mm²'),
  n_door_small: L('Small door glass without safety glass: at least 4 mm, single glass bonded into the frame; for swing doors with hb < 1,40 m toughened or laminated glass is advised', 'Мале скло дверей без безпечного скла: не менше 4 мм, одинарне скло вклеєне в раму; для маятникових дверей з hb < 1,40 м радять загартоване або багатошарове', 'Kleines Türglas ohne Sicherheitsglas: mindestens 4 mm, Einfachglas in den Rahmen geklebt; bei Pendeltüren mit hb < 1,40 m ESG oder VSG empfohlen', 'Klein deurglas zonder veiligheidsglas: minstens 4 mm, enkel glas verlijmd in het kader; bij slingerdeuren met hb < 1,40 m gehard of gelaagd glas aanbevolen', 'Petit vitrage de porte sans verre de sécurité : au moins 4 mm, simple vitrage collé au cadre ; pour les portes battantes avec hb < 1,40 m, trempé ou feuilleté conseillé', 'Vidrio pequeño de puerta sin vidrio de seguridad: al menos 4 mm, vidrio simple pegado al marco; en puertas de vaivén con hb < 1,40 m se aconseja templado o laminado', 'Małe szkło drzwi bez szkła bezpiecznego: co najmniej 4 mm, szyba pojedyncza wklejona w ramę; dla drzwi wahadłowych z hb < 1,40 m zaleca się hartowane lub laminowane'),
  n_roof: L('Walking on the glass for maintenance: design it for a point load of 1000 N on 150 × 100 mm (→ Glass Thickness tool); not for non-public greenhouses', 'Якщо по склу ходять під час обслуговування: розрахунок на зосереджене навантаження 1000 Н на 150 × 100 мм (→ інструмент товщини скла); не для непублічних теплиць', 'Begehen zur Wartung: Bemessung für eine Einzellast von 1000 N auf 150 × 100 mm (→ Werkzeug Glasdicke); nicht für nicht öffentliche Gewächshäuser', 'Betreden voor onderhoud: berekenen op een puntlast van 1000 N op 150 × 100 mm (→ tool glasdikte); niet voor niet-publieke serres', 'Circulation sur le verre pour l’entretien : calcul sous une charge ponctuelle de 1000 N sur 150 × 100 mm (→ outil épaisseur de verre) ; pas pour les serres non accessibles au public', 'Si se pisa el vidrio para mantenimiento: cálculo con carga puntual de 1000 N sobre 150 × 100 mm (→ herramienta de espesor); no para invernaderos no públicos', 'Chodzenie po szkle przy konserwacji: obliczenie na siłę skupioną 1000 N na 150 × 100 mm (→ narzędzie grubości szkła); nie dotyczy niepublicznych szklarni'),
  n_ceiling: L('Mechanical devices must prevent whole elements from falling; on suspended ceilings prevent accidental lifting of the panels', 'Механічні пристрої мають запобігати падінню цілих елементів; на підвісних стелях — випадковому підійманню панелей', 'Mechanische Sicherungen müssen das Herabfallen ganzer Elemente verhindern; bei abgehängten Decken ungewolltes Anheben verhindern', 'Mechanische voorzieningen moeten het vallen van volledige elementen verhinderen; bij verlaagde plafonds ongewild oplichten voorkomen', 'Des dispositifs mécaniques doivent empêcher la chute d’éléments entiers ; sur plafond suspendu, empêcher le soulèvement fortuit', 'Dispositivos mecánicos deben impedir la caída de elementos enteros; en falsos techos, evitar el levantamiento fortuito', 'Urządzenia mechaniczne muszą zapobiegać spadaniu całych elementów; w sufitach podwieszanych — przypadkowemu podniesieniu paneli'),
  n_clad: L('Note (2): types B / C may be replaced by annealed glass (A) with a secured bonding over the whole surface or in ≥ 10 mm beads ≤ 15 cm apart, or A with a durable safety film, or A behind a barrier', 'Примітка (2): типи B / C можна замінити відпаленим склом (A) з надійним приклеюванням по всій площі або смугами ≥ 10 мм з кроком ≤ 15 см, або A з довговічною захисною плівкою, або A за огородженням', 'Anmerkung (2): Typ B / C kann durch Floatglas (A) mit gesicherter Verklebung (vollflächig oder Raupen ≥ 10 mm im Abstand ≤ 15 cm), A mit dauerhafter Sicherheitsfolie oder A hinter einer Absturzsicherung ersetzt werden', 'Noot (2): type B / C mag vervangen worden door floatglas (A) met een veilige verlijming (volvlakkig of rupsen ≥ 10 mm op ≤ 15 cm), A met duurzame veiligheidsfolie of A achter een borstwering', 'Note (2) : les types B / C peuvent être remplacés par un verre A avec collage sécurisé (pleine surface ou cordons ≥ 10 mm espacés ≤ 15 cm), un verre A avec film de sécurité durable, ou un verre A derrière un garde-corps', 'Nota (2): los tipos B / C pueden sustituirse por vidrio A con pegado seguro (toda la superficie o cordones ≥ 10 mm a ≤ 15 cm), A con lámina de seguridad duradera o A detrás de una barandilla', 'Uwaga (2): typ B / C można zastąpić szkłem A z bezpiecznym klejeniem (całopowierzchniowo lub pasy ≥ 10 mm co ≤ 15 cm), A z trwałą folią bezpieczną lub A za balustradą'),
  n_fin: L('Note (1): float glass may be used for fins if barriers prevent impacts on them', 'Примітка (1): для ребер жорсткості можна використати флоат, якщо огородження запобігають ударам по них', 'Anmerkung (1): Floatglas für Glasschwerter ist möglich, wenn Abschrankungen Stöße darauf verhindern', 'Noot (1): floatglas voor glasvinnen is mogelijk als borstweringen stoten erop verhinderen', 'Note (1) : un verre float peut être envisagé pour les raidisseurs si des garde-corps empêchent les chocs', 'Nota (1): se puede usar vidrio float en aletas si barreras impiden los impactos sobre ellas', 'Uwaga (1): na żebra można użyć szkła float, jeśli bariery zapobiegają uderzeniom'),
  n_igu: L('Insulating glass: safety glass on each side where an impact can occur; if the impact-side pane is toughened, the other pane must be safety glass too', 'Склопакет: безпечне скло з кожного боку, де можливий удар; якщо скло з боку удару загартоване, інше скло теж має бути безпечним', 'Isolierglas: Sicherheitsglas auf jeder Seite, auf der ein Stoß auftreten kann; ist die Scheibe auf der Stoßseite ESG, muss die andere Scheibe ebenfalls Sicherheitsglas sein', 'Isolerende beglazing: veiligheidsglas aan elke zijde waar een stoot kan optreden; is de ruit aan de stootzijde gehard, dan moet de andere ruit ook veiligheidsglas zijn', 'Vitrage isolant : verre de sécurité de chaque côté où le choc peut se produire ; si le verre côté choc est trempé, l’autre verre doit aussi être un verre de sécurité', 'Doble acristalamiento: vidrio de seguridad en cada lado donde pueda haber impacto; si la hoja del lado del impacto es templada, la otra también debe ser de seguridad', 'Szyba zespolona: szkło bezpieczne po każdej stronie, gdzie możliwe jest uderzenie; jeśli tafla po stronie uderzenia jest hartowana, druga też musi być bezpieczna'),
  n_annealed: L('Annealed float (type A) is never safety glass, even when classified to EN 12600; a film makes it type B only after an EN 12600 test, over the whole surface and taken into the rebate, with proven durability', 'Відпалений флоат (тип A) ніколи не є безпечним склом, навіть із класом за EN 12600; плівка робить його типом B лише після випробування за EN 12600, по всій площі із заведенням у фальц і з доведеною довговічністю', 'Floatglas (Typ A) ist nie Sicherheitsglas, auch nicht mit EN-12600-Klasse; eine Folie macht es erst nach EN-12600-Prüfung zu Typ B, vollflächig, in den Falz geführt und mit nachgewiesener Dauerhaftigkeit', 'Floatglas (type A) is nooit veiligheidsglas, ook niet met EN 12600-klasse; een folie maakt het pas type B na een EN 12600-proef, over het hele oppervlak, in de sponning en met bewezen duurzaamheid', 'Le float recuit (type A) n’est jamais un verre de sécurité, même classé EN 12600 ; un film n’en fait un type B qu’après essai EN 12600, sur toute la surface, repris en feuillure et à durabilité démontrée', 'El float recocido (tipo A) nunca es vidrio de seguridad, aunque esté clasificado según EN 12600; una lámina lo hace tipo B solo tras ensayo EN 12600, en toda la superficie, dentro del galce y con durabilidad probada', 'Szkło float odprężone (typ A) nigdy nie jest szkłem bezpiecznym, nawet z klasą EN 12600; folia czyni je typem B dopiero po badaniu EN 12600, na całej powierzchni, wprowadzona we wrąb i o udowodnionej trwałości'),
  n_min: L('EN 12600 classes are a minimum: the effective glass thickness follows from the loads, size and fixing (→ Glass Thickness tool); e.g. 1B1 ↔ 33.2 PVB as a minimum', 'Класи EN 12600 — це мінімум: ефективна товщина скла визначається навантаженнями, розміром і кріпленням (→ інструмент товщини скла); напр. 1B1 ↔ 33.2 PVB як мінімум', 'EN-12600-Klassen sind ein Minimum: die wirksame Glasdicke folgt aus Lasten, Größe und Lagerung (→ Werkzeug Glasdicke); z. B. 1B1 ↔ 33.2 PVB als Minimum', 'EN 12600-klassen zijn een minimum: de effectieve glasdikte volgt uit belasting, afmeting en bevestiging (→ tool glasdikte); bv. 1B1 ↔ 33.2 PVB als minimum', 'Les classes EN 12600 sont un minimum : l’épaisseur effective découle des sollicitations, des dimensions et de la fixation (→ outil épaisseur de verre) ; p. ex. 1B1 ↔ 33.2 PVB au minimum', 'Las clases EN 12600 son un mínimo: el espesor efectivo resulta de cargas, tamaño y fijación (→ herramienta de espesor); p. ej. 1B1 ↔ 33.2 PVB como mínimo', 'Klasy EN 12600 to minimum: efektywna grubość szkła wynika z obciążeń, wymiarów i mocowania (→ narzędzie grubości szkła); np. 1B1 ↔ 33.2 PVB jako minimum'),
  n_vis: L('Public place, transparent glass between 0,60 and 1,50 m, wider than 0,55 m, circulation on both sides: make it visible — doors: handle ≥ 400 cm² or a motif ≥ 100 cm² at ≈ 1,50 m; other glazing: a band ≥ 400 cm² per metre at ≈ 1 m or a motif ≥ 100 cm² per 1,50 m at ≈ 1,50 m', 'Публічне місце, прозоре скло між 0,60 і 1,50 м, ширше 0,55 м, рух з обох боків: зробіть його помітним — двері: ручка ≥ 400 см² або знак ≥ 100 см² на ≈ 1,50 м; інше скління: смуга ≥ 400 см² на метр на ≈ 1 м або знак ≥ 100 см² на кожні 1,50 м на ≈ 1,50 м', 'Öffentlicher Bereich, transparentes Glas zwischen 0,60 und 1,50 m, breiter als 0,55 m, Verkehr auf beiden Seiten: sichtbar machen — Türen: Griff ≥ 400 cm² oder Motiv ≥ 100 cm² bei ≈ 1,50 m; sonstige Verglasung: Band ≥ 400 cm² je Meter bei ≈ 1 m oder Motiv ≥ 100 cm² je 1,50 m bei ≈ 1,50 m', 'Publieke ruimte, transparant glas tussen 0,60 en 1,50 m, breder dan 0,55 m, circulatie aan beide zijden: zichtbaar maken — deuren: greep ≥ 400 cm² of motief ≥ 100 cm² op ≈ 1,50 m; andere beglazing: band ≥ 400 cm² per meter op ≈ 1 m of motief ≥ 100 cm² per 1,50 m op ≈ 1,50 m', 'Lieu public, verre transparent entre 0,60 et 1,50 m, plus large que 0,55 m, circulation des deux côtés : le rendre visible — portes : poignée ≥ 400 cm² ou motif ≥ 100 cm² à ≈ 1,50 m ; autres vitrages : bandeau ≥ 400 cm² par mètre à ≈ 1 m ou motif ≥ 100 cm² par 1,50 m à ≈ 1,50 m', 'Lugar público, vidrio transparente entre 0,60 y 1,50 m, más ancho de 0,55 m, circulación por ambos lados: hacerlo visible — puertas: tirador ≥ 400 cm² o motivo ≥ 100 cm² a ≈ 1,50 m; otros: banda ≥ 400 cm² por metro a ≈ 1 m o motivo ≥ 100 cm² por cada 1,50 m a ≈ 1,50 m', 'Miejsce publiczne, przezroczyste szkło między 0,60 a 1,50 m, szersze niż 0,55 m, ruch po obu stronach: oznakuj — drzwi: uchwyt ≥ 400 cm² lub motyw ≥ 100 cm² na ≈ 1,50 m; inne: pas ≥ 400 cm² na metr na ≈ 1 m lub motyw ≥ 100 cm² na każde 1,50 m na ≈ 1,50 m'),
  n_balu1: L('Only laminated safety glass to EN ISO 12543-2, class 1B1, with ground (polished) visible edges', 'Лише багатошарове безпечне скло за EN ISO 12543-2, клас 1B1, з видимими краями, обробленими шліфуванням', 'Nur VSG nach EN ISO 12543-2, Klasse 1B1, sichtbare Kanten geschliffen', 'Enkel gelaagd veiligheidsglas volgens EN ISO 12543-2, klasse 1B1, zichtbare randen geslepen', 'Uniquement du verre feuilleté de sécurité EN ISO 12543-2, classe 1B1, bords apparents rodés', 'Solo vidrio laminado de seguridad según EN ISO 12543-2, clase 1B1, con cantos visibles pulidos', 'Tylko szkło laminowane bezpieczne wg EN ISO 12543-2, klasa 1B1, widoczne krawędzie szlifowane'),
  n_balu3: L('All plies toughened: provide a top rail that protects the edge and holds the glass after breakage, or prove by the soft-body test that the balustrade does not collapse with all plies broken', 'Усі шари загартовані: передбачте поручень, що захищає край і тримає скло після руйнування, або доведіть випробуванням м’яким тілом, що огородження не обвалюється, коли всі шари зруйновані', 'Alle Scheiben ESG: Handlauf vorsehen, der die Kante schützt und das Glas nach Bruch hält, oder per Pendelschlag nachweisen, dass die Brüstung bei Bruch aller Scheiben nicht versagt', 'Alle bladen gehard: voorzie een leuning die de rand beschermt en het glas na breuk vasthoudt, of toon met de zachte-stootproef aan dat de borstwering met alle bladen gebroken niet bezwijkt', 'Toutes les feuilles trempées : prévoir une lisse protégeant le bord et maintenant le vitrage après bris, ou démontrer par le choc mou que le garde-corps ne s’effondre pas, toutes feuilles rompues', 'Todas las hojas templadas: prever un pasamanos que proteja el canto y retenga el vidrio tras la rotura, o demostrar con el impacto blando que no colapsa con todas las hojas rotas', 'Wszystkie tafle hartowane: przewidź pochwyt chroniący krawędź i utrzymujący szkło po stłuczeniu albo wykaż badaniem uderzenia miękkiego, że balustrada nie upada po pęknięciu wszystkich tafli'),
  n_balu_k: L('Design (→ Glass Thickness tool): kmod 0,74 when wind with line loads dominates, 0,89 for line or point loads alone; embedded clamping depth ≥ 100 mm; structurally bonded balustrades per EAD 002 with a favourable test', 'Розрахунок (→ інструмент товщини скла): kmod 0,74, коли домінує вітер з лінійними навантаженнями, 0,89 — для самих лінійних або зосереджених; глибина защемлення ≥ 100 мм; клеєні огородження — за EAD 002 з позитивним випробуванням', 'Bemessung (→ Werkzeug Glasdicke): kmod 0,74 bei maßgebendem Wind mit Linienlasten, 0,89 bei Linien- oder Einzellasten allein; Einspanntiefe ≥ 100 mm; geklebte Brüstungen nach EAD 002 mit positiver Prüfung', 'Berekening (→ tool glasdikte): kmod 0,74 als wind met lijnlasten overheerst, 0,89 voor lijn- of puntlasten alleen; inklemdiepte ≥ 100 mm; structureel verlijmde borstweringen volgens EAD 002 met gunstige proef', 'Dimensionnement (→ outil épaisseur de verre) : kmod 0,74 si le vent combiné aux charges linéaires domine, 0,89 pour les charges linéaires ou ponctuelles seules ; encastrement ≥ 100 mm ; collage structural selon EAD 002 avec essai favorable', 'Cálculo (→ herramienta de espesor): kmod 0,74 si domina el viento con cargas lineales, 0,89 para cargas lineales o puntuales solas; empotramiento ≥ 100 mm; barandillas pegadas según EAD 002 con ensayo favorable', 'Obliczenia (→ narzędzie grubości szkła): kmod 0,74 gdy dominuje wiatr z obciążeniem liniowym, 0,89 dla samych obciążeń liniowych lub skupionych; głębokość zamocowania ≥ 100 mm; balustrady klejone wg EAD 002 z pozytywnym badaniem'),
  n_balu_h: L('Protection height of the balustrade (NBN B 03-004 Tab. 1): {H} mm required', 'Захисна висота огородження (NBN B 03-004 табл. 1): потрібно {H} мм', 'Schutzhöhe der Brüstung (NBN B 03-004 Tab. 1): {H} mm erforderlich', 'Beschermingshoogte van de borstwering (NBN B 03-004 tab. 1): {H} mm vereist', 'Hauteur de protection du garde-corps (NBN B 03-004 tab. 1) : {H} mm requis', 'Altura de protección de la barandilla (NBN B 03-004 tabla 1): {H} mm exigidos', 'Wysokość ochronna balustrady (NBN B 03-004 tab. 1): wymagane {H} mm'),
  n_private: L('Outside is a private, not publicly accessible zone (private terrace or garden): Tableau 5 does not apply on that side', 'Зовні — приватна, не публічна зона (приватна тераса чи сад): з цього боку табл. 5 не застосовується', 'Außen ist ein privater, nicht öffentlich zugänglicher Bereich (private Terrasse, Garten): Tabelle 5 gilt auf dieser Seite nicht', 'Buiten is een private, niet publiek toegankelijke zone (private terras of tuin): tabel 5 geldt niet aan die zijde', 'L’extérieur est une zone privée non accessible au public (terrasse ou jardin privé) : le tableau 5 ne s’applique pas de ce côté', 'El exterior es una zona privada no accesible al público (terraza o jardín privado): la tabla 5 no se aplica en ese lado', 'Na zewnątrz jest strefa prywatna, niedostępna publicznie (prywatny taras, ogród): tabela 5 nie dotyczy tej strony'),
  n_declare: L('Class inferred from the composition — confirm with the EN 12600 class declared by the manufacturer', 'Клас визначено за складом — підтвердьте класом EN 12600, задекларованим виробником', 'Klasse aus dem Aufbau abgeleitet — mit der vom Hersteller erklärten EN-12600-Klasse bestätigen', 'Klasse afgeleid uit de samenstelling — bevestig met de door de fabrikant verklaarde EN 12600-klasse', 'Classe déduite de la composition — à confirmer par la classe EN 12600 déclarée par le fabricant', 'Clase deducida de la composición: confírmela con la clase EN 12600 declarada por el fabricante', 'Klasa wywnioskowana ze składu — potwierdź klasą EN 12600 deklarowaną przez producenta')
};
var ROLE = {
  outer: L('outer pane', 'зовнішнє скло', 'äußere Scheibe', 'buitenruit', 'verre extérieur', 'hoja exterior', 'tafla zewnętrzna'),
  middle: L('middle pane', 'середнє скло', 'mittlere Scheibe', 'middelste ruit', 'verre central', 'hoja central', 'tafla środkowa'),
  inner: L('inner pane', 'внутрішнє скло', 'innere Scheibe', 'binnenruit', 'verre intérieur', 'hoja interior', 'tafla wewnętrzna'),
  single: L('pane', 'скло', 'Scheibe', 'ruit', 'verre', 'hoja', 'tafla')
};

/* ---------------------------------------------------------------- 6. evaluation */
function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function roleOf(i, n) { return n === 1 ? 'single' : i === 0 ? 'outer' : i === n - 1 ? 'inner' : 'middle'; }

/* input (SI): { category, kind, w_m, h_m, sill_m (h on the risk side), fall_m (hc), H_m, tilt_deg, overhang_m, over_zone (bool), overhang_side 'out'|'in',
   outside 'none'|'private'|'public', sill_out_m, fall_out_m, barrier 'none'|'impact_side'|'opposite', extra_impacts (bool),
   door: {landing (bool), hb_m}, cladding_bottom_m, balustrade: {Ep_mm, drop_m, x_mm, y_mm, seat, ha_mm, handrail, postbreak_test, top_mm},
   public_place (bool), both_sides (bool), glazing {type, panes:[{plies_mm, interlayer_mm, glass}]}, declared: [class|null per pane] } */
function evaluate(inp) {
  inp = inp || {};
  var cat = CATEGORIES.indexOf(inp.category) >= 0 ? inp.category : 'A', g = group(cat);
  var kind = KINDS.indexOf(inp.kind) >= 0 ? inp.kind : 'window';
  var w = num(inp.w_m, 1), h = num(inp.h_m, 1), area = w * h;
  var sill = num(inp.sill_m, 0), hc = num(inp.fall_m, 0), H = num(inp.H_m, LIM.H_ref_m);
  var tilt = Math.abs(num(inp.tilt_deg, 0)), over = num(inp.overhang_m, 0);
  var panes = (inp.glazing && inp.glazing.panes && inp.glazing.panes.length) ? inp.glazing.panes : [{ plies_mm: [4], interlayer_mm: [], glass: 'float' }];
  var n = panes.length, declared = inp.declared || [];
  var res = { ok: true, version: VERSION, category: cat, kind: kind, area_m2: area, case: null, caseKey: null, sides: [], reqs: [], notes: [], panes: [], src: [] };
  var reqs = []; for (var i = 0; i < n; i++) reqs.push([]);
  function note(key, src, vars) { res.notes.push({ key: key, src: src, vars: vars || null }); }
  function add(paneIdx, alts, level, src, why) { reqs[paneIdx].push({ alts: alts, level: level || 'required', src: src, why: why || null }); }
  function addAll(alts, level, src, why) { for (var k = 0; k < n; k++) add(k, alts, level, src, why); }
  var outerIdx = 0, innerIdx = n - 1;

  // --- classification
  if (TAB6[kind]) {
    res.case = 9; res.caseKey = 'case9';
    var row = TAB6[kind][sill < LIM.tab6_base_m ? 0 : 1];
    addAll(row, 'required', 'a1_t6');
    if (kind === 'showcase_fin') note('n_fin', 'a1_t6');
  } else if (kind === 'balustrade') {
    res.case = 'B03'; res.caseKey = 'balu';
    addAll(['1B1'], 'required', 'b03_92', 'laminated');
    var b = inp.balustrade || {}, ph = protectionHeight(b);
    res.protection = ph;
    note('n_balu1', 'b03_92'); note('n_balu_h', 'b03_h', { H: ph.Hp_mm });
    if (num(b.top_mm, 0) > 0) {
      res.protection.top_mm = num(b.top_mm, 0); res.protection.ok = res.protection.top_mm >= ph.Hp_mm;
      if (!res.protection.ok) note('n_balu_hlow', 'b03_h', { top: Math.round(res.protection.top_mm), H: ph.Hp_mm });
    }
    var allT = panes.some(function (p) { return (p.plies_mm || []).length >= 2 && p.glass === 'toughened'; });
    res.balustrade = { allToughened: allT, handrail: !!b.handrail, postbreak_test: !!b.postbreak_test, ok: !allT || !!b.handrail || !!b.postbreak_test };
    if (allT) note('n_balu3', 'b03_92');
    note('n_balu_k', 'b03_93');
  } else if (kind === 'ceiling') {
    res.case = 7; res.caseKey = 'case7';
    add(innerIdx, TAB5[7][g], 'required', 'a1_t5'); note('n_ceiling', 'a1_cases');
  } else if (kind === 'cladding') {
    res.case = 8;
    var bottom = num(inp.cladding_bottom_m, sill);
    if (area > LIM.clad_area_m2 && bottom < LIM.clad_bottom_m) { res.caseKey = 'case8'; addAll(TAB5[8][g], 'required', 'a1_t5'); note('n_clad', 'a1_t5'); }
    else res.caseKey = 'case8n';
  } else if (kind === 'roof' || kind === 'canopy') {
    res.case = 6; res.caseKey = 'case6';
    add(innerIdx, TAB5[6][g], 'required', 'a1_t5', 'inner'); note('n_roof', 'a1_cases');
  } else if (kind === 'door') {
    res.case = 5;
    var d = inp.door || {}, hb = num(d.hb_m, sill);
    if (area > LIM.door_area_m2 && hb < LIM.door_hb_m) {
      res.caseKey = d.landing ? 'case5L' : 'case5O';
      addAll(TAB5[d.landing ? '5L' : '5O'][g], 'required', 'a1_t5');
    } else { res.caseKey = 'case5n'; note('n_door_small', 'a1_cases'); }
    note('n_door', 'a1_cases');
  } else if (tilt > LIM.tilt_special) {
    if (inp.over_zone) return { ok: false, reason: 'special', caseKey: 'special', version: VERSION, notes: [{ key: 'special', src: 'a1_cases' }] };
    return { ok: false, reason: 'not_covered', caseKey: 'special_nz', version: VERSION, notes: [{ key: 'special_nz', src: 'a1_cases' }] };
  } else if ((tilt > LIM.tilt_vertical || over > LIM.overhang_vertical_m) && inp.over_zone) {
    res.case = 4; res.caseKey = 'case4';
    var lower = inp.overhang_side === 'in' ? innerIdx : outerIdx;
    add(lower, TAB5[4][g], 'required', 'a1_t5', 'lower');
    note('n_case4', 'a1_cases');
    res.forbidAllToughened = true;
    // room side: impact / fall-through still possible (A1 §4.4.2.2.1 'côté(s) où le choc risque de se produire') -> cases 1–3 on the inner pane
    vertical([{ side: 'in', cat: cat, h: sill, hc: hc, pane: innerIdx }]);
    if (res.sides.some(function (sd) { return sd.level !== 'none'; })) note('n_case4room', 'a1_gen');
  } else {
    if (tilt > LIM.tilt_vertical || over > LIM.overhang_vertical_m) note('inclined_free', 'a1_gen');
    // vertical: cases 1–3 per side people can reach
    var sides = [{ side: 'in', cat: cat, h: sill, hc: hc, pane: innerIdx }];
    if (kind === 'partition') sides.push({ side: 'out', cat: cat, h: num(inp.sill_out_m, sill), hc: num(inp.fall_out_m, hc), pane: outerIdx });
    else if (inp.outside === 'public') { sides.push({ side: 'out', cat: 'C5', h: num(inp.sill_out_m, sill), hc: num(inp.fall_out_m, 0), pane: outerIdx }); note('n_pub', 'la_pub'); }
    else if (inp.outside === 'private') note('n_private', 'a1_gen');
    vertical(sides);
    // governing case = highest requirement among the sides
    var rank = function (sd) { return sd.level === 'none' ? 0 : sd.level === 'recommended' ? 1 : sd.case === 2 ? 3 : 2; };
    var gov = res.sides.slice().sort(function (a, b) { return rank(b) - rank(a); })[0];
    res.case = gov.case; res.caseKey = gov.caseKey;
  }
  function vertical(sides) {
    sides.forEach(function (s) {
      var cs = s.h >= H ? 3 : (s.hc <= LIM.hc_case1_m ? 1 : 2), gg = group(s.cat), alts = TAB5[cs][gg], level = 'required', key = 'case' + cs;
      var sd = { side: s.side, case: cs, caseKey: key, category: s.cat, h_m: s.h, hc_m: s.hc, pane: s.pane, level: null, alts: alts };
      if (cs === 1 && (area < LIM.small_area_m2 || w < LIM.small_width_m)) { sd.level = 'none'; sd.exempt = 'small'; note('n_small', 'a1_cases'); }
      else if (cs === 1 && inp.barrier === 'impact_side') { sd.level = 'none'; sd.barrier = true; note('n_barrier1', 'a1_cases'); }
      else if (cs === 2 && inp.barrier === 'impact_side') { sd.level = 'none'; sd.barrier = true; note('n_barrier2a', 'a1_cases'); }
      else if (cs === 2 && inp.barrier === 'opposite') { sd.alts = ['C', 'B']; sd.level = 'required'; sd.barrier = true; note('n_barrier2b', 'a1_cases'); }
      else if (cs === 3 && gg === 'C') { sd.level = inp.extra_impacts ? 'recommended' : 'none'; note('n_note4', 'a1_t5'); }
      else if (!alts) sd.level = 'none';
      else sd.level = level;
      if (cs === 1 && gg === 'A' && sd.level === 'required') note('n_note5', 'a1_t5');
      if (cs === 2 && sd.level === 'required' && !sd.barrier) note('n_case2alt', 'a1_cases');
      if (sd.level !== 'none') add(s.pane, sd.alts, sd.level, 'a1_t5', s.side);
      res.sides.push(sd);
    });
  }

  // --- what the panes are
  var have = panes.map(function (p, k) { return paneClass(p, declared[k]); });
  // --- insulating-glass rule (A1 §4.4.2.2.1): impact-side pane toughened -> the adjacent pane must be safety glass too
  if (n > 1 && res.case !== 6 && res.case !== 'B03') {
    var extra = [];
    reqs.forEach(function (rq, k) {
      if (!rq.some(function (r) { return r.level === 'required'; })) return;
      if (have[k].beta !== 'C') return;
      var adj = k === 0 ? 1 : k === n - 1 ? n - 2 : null;
      if (adj != null && extra.indexOf(adj) < 0 && !reqs[adj].some(function (r) { return r.level === 'required'; })) extra.push(adj);
    });
    extra.forEach(function (k) { add(k, ['B', 'C'], 'required', 'a1_gen', 'igu'); });
    if (reqs.some(function (r) { return r.length; })) note('n_igu', 'a1_gen');
  }
  // --- per pane check
  var anyFail = false, anyVerify = false;
  res.panes = panes.map(function (p, k) {
    var hv = have[k], checks = reqs[k].map(function (r) {
      var m = meetsAny(hv.cls, r.alts);
      if (m === 'fail' && hv.beta !== 'A' && r.level === 'required' && hv.cls === 'B') m = 'verify';
      return { alts: r.alts, level: r.level, src: r.src, why: r.why, result: m };
    });
    if ((res.forbidAllToughened || res.case === 'B03') && hv.allToughened) {
      if (res.case === 4) checks.push({ alts: ['not_all_toughened'], level: 'required', src: 'a1_cases', why: 'all_toughened', result: 'fail' });
      if (res.case === 'B03' && !res.balustrade.ok) checks.push({ alts: ['handrail_or_test'], level: 'required', src: 'b03_92', why: 'all_toughened', result: 'fail' });
    }
    if (res.case === 'B03' && !hv.laminated) checks.forEach(function (c) { c.result = 'fail'; });
    var req = checks.filter(function (c) { return c.level === 'required'; });
    var verdict = !checks.length ? 'free' : req.some(function (c) { return c.result === 'fail'; }) ? 'fail' : req.some(function (c) { return c.result === 'verify'; }) ? 'verify' : req.length ? 'pass'
      : (checks.some(function (c) { return c.result === 'fail'; }) ? 'advice' : 'pass');
    if (verdict === 'fail') anyFail = true; if (verdict === 'verify') anyVerify = true;
    return { index: k, role: roleOf(k, n), label: C.project.paneLabel(p), glass: hv.glass, have: hv.cls, beta: hv.beta, inferred: hv.inferred, laminated: hv.laminated, allToughened: hv.allToughened, checks: checks, verdict: verdict };
  });
  res.reqs = reqs;
  res.required = reqs.some(function (r) { return r.some(function (x) { return x.level === 'required'; }); });
  if (res.protection && res.protection.ok === false) anyFail = true;   // NBN B 03-004 Tab. 1: H is a requirement of the guard itself
  res.verdict = anyFail ? 'fail' : anyVerify ? 'verify' : res.required ? 'pass' : 'free';
  if (have.some(function (x) { return x.inferred && x.beta !== 'A'; }) && res.required) note('n_declare', 'la_cls');
  if (res.required && have.some(function (x) { return x.beta === 'A'; })) note('n_annealed', 'a1_gen');
  if (res.required) note('n_min', 'a1_ex');
  // visibility marking (2007 §4.4.2.2.5)
  var publicPlace = inp.public_place != null ? !!inp.public_place : (g === 'C' || g === 'D' || inp.outside === 'public');
  var bothSides = inp.both_sides != null ? !!inp.both_sides : (kind === 'door' || kind === 'partition');
  var bottomEdge = kind === 'door' ? num((inp.door || {}).hb_m, sill) : sill;
  if (publicPlace && bothSides && w > LIM.vis_width_m && bottomEdge < LIM.vis_high_m && bottomEdge + h > LIM.vis_low_m && ['door', 'partition', 'window', 'curtainwall'].indexOf(kind) >= 0) {
    res.marking = { required: true, door: kind === 'door' }; note('n_vis', 's07_vis');
  }
  var used = {}; res.notes.forEach(function (x) { used[x.src] = 1; }); reqs.forEach(function (r) { r.forEach(function (x) { used[x.src] = 1; }); });
  used.en12600 = 1; used.a1_class = 1;
  res.src = Object.keys(used);
  return res;
}

/* minimum composition hint for a class string (A1 example + learning assumption) */
function hint(cls) {
  var c = parseClass(cls); if (!c) return null;
  if (c.beta === 'B') return { text: c.alpha === 1 ? '33.2 PVB' : c.alpha === 2 ? '33.1 PVB' : '33.1 PVB', src: c.alpha === 1 ? 'a1_ex' : 'la_cls' };
  if (c.beta === 'C') return { text: 'toughened (EN 12150), class declared by the manufacturer', src: 'en12600' };
  return null;
}

/* ---------------------------------------------------------------- 7. presets (claims checked in _bw/r2/safety/test.mjs) */
var g2 = function (a, b) { return { type: 'double', panes: [a, b], cavity_mm: [16] }; };
var F4 = { plies_mm: [4], interlayer_mm: [], glass: 'float' }, T6 = { plies_mm: [6], interlayer_mm: [], glass: 'toughened' },
  L332 = { plies_mm: [3, 3], interlayer_mm: [0.76], glass: 'float' }, L331 = { plies_mm: [3, 3], interlayer_mm: [0.38], glass: 'float' },
  L442 = { plies_mm: [4, 4], interlayer_mm: [0.76], glass: 'float' }, L1010T = { plies_mm: [10, 10], interlayer_mm: [0.76], glass: 'toughened' };
var PRESETS = [
  { id: 'french-2nd', input: { category: 'A', kind: 'window', w_m: 0.9, h_m: 2.2, sill_m: 0, fall_m: 6, outside: 'none', glazing: g2(F4, T6) } },
  { id: 'french-ground', input: { category: 'A', kind: 'window', w_m: 0.9, h_m: 2.2, sill_m: 0, fall_m: 0.2, outside: 'private', glazing: g2(T6, T6), declared: [null, '1C2'] } },
  { id: 'sill-095', input: { category: 'A', kind: 'window', w_m: 1.2, h_m: 1.3, sill_m: 0.95, fall_m: 6, outside: 'none', glazing: g2(F4, F4) } },
  { id: 'office-igu', input: { category: 'B', kind: 'window', w_m: 1.5, h_m: 2.0, sill_m: 0.3, fall_m: 0.3, outside: 'none', glazing: g2(F4, T6), declared: [null, '1C2'] } },
  { id: 'landing-door', input: { category: 'A', kind: 'door', w_m: 0.8, h_m: 1.0, sill_m: 0, door: { landing: true, hb_m: 0 }, glazing: { type: 'single', panes: [{ plies_mm: [6], interlayer_mm: [], glass: 'toughened' }] } } },
  { id: 'roof-light', input: { category: 'A', kind: 'roof', w_m: 1.0, h_m: 1.5, tilt_deg: 80, glazing: g2(T6, T6) } },
  { id: 'balustrade-1010', input: { category: 'A', kind: 'balustrade', w_m: 1.2, h_m: 1.1, balustrade: { Ep_mm: 21, drop_m: 4, handrail: false, postbreak_test: false, top_mm: 1100 }, glazing: { type: 'single', panes: [L1010T] } } },
  { id: 'sidelight', input: { category: 'A', kind: 'window', w_m: 0.35, h_m: 1.15, sill_m: 0.1, fall_m: 0.1, outside: 'private', glazing: g2(F4, F4) } },
  { id: 'sloped-pavement', input: { category: 'D', kind: 'curtainwall', w_m: 1.5, h_m: 2.5, sill_m: 3, fall_m: 3, tilt_deg: 20, over_zone: true, overhang_side: 'out', outside: 'public', glazing: g2(L442, T6) } }
];
var COMPOSITIONS = { F4: F4, T6: T6, L332: L332, L331: L331, L442: L442, L1010T: L1010T };

return { VERSION: VERSION, SOURCES: SOURCES, DROP_MM: DROP_MM, CATEGORIES: CATEGORIES, KINDS: KINDS, TAB5: TAB5, TAB6: TAB6, LIM: LIM,
  M: M, ROLE: ROLE, PRESETS: PRESETS, COMPOSITIONS: COMPOSITIONS,
  parseClass: parseClass, decode: decode, meets: meets, meetsAny: meetsAny, paneClass: paneClass, protectionHeight: protectionHeight, evaluate: evaluate, hint: hint };
});
