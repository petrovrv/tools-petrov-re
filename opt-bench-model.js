/* opt-bench-model.js — OptBench: presets, checks, geometry, BOM and hand-overs of the Optical Bench 3D (opticbench.html).
   Pure UMD module, no DOM. Needs OptCore (opt-core.js) and OptTrace (opt-trace.js) loaded first (browser globals or node require).
   Units: mm, nm, W, degrees. Every preset "aha" is reproduced by check(id) and asserted in _opt/bench/test-presets.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root.OptCore || global.OptCore, root.OptTrace || global.OptTrace);
  else root.OptBench = factory(root.OptCore, root.OptTrace);
}(typeof self !== 'undefined' ? self : this, function (OptCore, OptTraceArg) {
'use strict';
var VERSION = '1.1.0';
function TR() { return OptTraceArg || (typeof OptTrace !== 'undefined' ? OptTrace : null); }   // eslint-disable-line no-undef
var D2R = Math.PI / 180;
function T(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }

/* ------------------------------------------------------------------ scene helpers */
function S(id, x, y, p, rz) {
  return { id: id, kind: 'source', pose: { x: x, y: y, z: 0, rx: 0, ry: 0, rz: rz || 0 },
           params: Object.assign({ type: 'collimated', n: 1, D: 0, P: 0.001, lambdaNm: 632.8, pattern: 'fan', pol: 'unpolarized' }, p || {}) };
}
function E(id, kind, x, y, rz, p) { return { id: id, kind: kind, pose: { x: x, y: y, z: 0, rx: 0, ry: 0, rz: rz || 0 }, params: p || {} }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function run(els, opts) { return TR().trace({ elements: effective(els) }, Object.assign({ keepEscaped: true, minRelPower: 1e-6 }, opts || {})); }
/* catalogue coatings (review R-7): a stock part whose catalogue coating is not "uncoated" is traced AR-coated (R = 0 per face — learning
   assumption; Thorlabs specifies an average R below 0.5 % per face inside the coating band) unless the user set params.ar explicitly */
function stockOf(p) { return p && p.stock && OptCore && OptCore.stock ? OptCore.stock.get(p.stock) : null; }
function coating(p) {
  var s = stockOf(p); if (!s || !s.coating || /^uncoated$/i.test(String(s.coating))) return null;
  var m = /(\d+)\s*[–-]\s*(\d+)\s*nm/.exec(String(s.coating));
  return { code: String(s.coating), band: m ? [Number(m[1]), Number(m[2])] : null };
}
function sourceLams(els) {                          /* every wavelength sent by the enabled sources, nm */
  var out = [];
  (els || []).forEach(function (e) {
    if (!e || e.kind !== 'source' || e.enabled === false) return;
    var p = e.params || {}, sp = p.spectrum;
    if (p.type === 'white' || (sp && sp.kind === 'white')) { out.push(Number(sp && sp.nm0) || 400, Number(sp && sp.nm1) || 700); return; }
    (Array.isArray(p.lambdaNm) ? p.lambdaNm : [p.lambdaNm == null ? 633 : p.lambdaNm]).forEach(function (l) { out.push(Number(l)); });
  });
  return out;
}
function effective(els) {                           /* coated only when some source wavelength lies in the coating band */
  var lams = null;
  return (els || []).map(function (e) {
    if (!e || !e.params || e.params.ar != null) return e;
    var co = coating(e.params); if (!co) return e;
    if (co.band) { lams = lams || sourceLams(els); if (lams.length && !lams.some(function (l) { return l >= co.band[0] && l <= co.band[1]; })) return e; }
    var c = clone(e); c.params.ar = true; return c;
  });
}
function strong(rays, frac) { var m = 0; rays.forEach(function (r) { m = Math.max(m, r.P); }); return rays.filter(function (r) { return r.P > (frac || 0.05) * m; }); }
function bySrc(rays, id) { return rays.filter(function (r) { return r.src === id; }); }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
function sumP(list) { return sum((list || []).map(function (h) { return h.P; })); }
function without(els, ids) { return els.filter(function (e) { return ids.indexOf(e.id) < 0; }); }
function find(els, id) { return els.filter(function (e) { return e.id === id; })[0]; }

/* ------------------------------------------------------------------ presets
   scene: elements (mm, deg). view: suggested table window. check(): reproduces the aha with numbers (pure, deterministic). */
var PRESETS = [
  { id: 'pcx', tags: ['lens'],
    label: T('Plano-convex lens: which side to the beam?', 'Плоско-опукла лінза: яким боком до пучка?', 'Plankonvexlinse: welche Seite zum Strahl?', 'Plano-convexe lens: welke kant naar de bundel?', 'Lentille plan-convexe : quel côté vers le faisceau ?', 'Lente plano-convexa: ¿qué cara hacia el haz?', 'Soczewka płasko-wypukła: którą stroną do wiązki?'),
    note: T('Same Thorlabs LA1509 (f = 100 mm), a 20 mm beam: curved side to the collimated beam gives a best-focus spot about 4× smaller than the flat side first.', 'Та сама Thorlabs LA1509 (f = 100 мм), пучок 20 мм: опуклим боком до паралельного пучка пляма в найкращому фокусі приблизно в 4 рази менша, ніж плоским.', 'Dieselbe Thorlabs LA1509 (f = 100 mm), 20-mm-Strahl: gewölbte Seite zum parallelen Strahl ergibt einen etwa 4× kleineren Fleck im besten Fokus als die plane Seite zuerst.', 'Dezelfde Thorlabs LA1509 (f = 100 mm), bundel van 20 mm: de bolle kant naar de evenwijdige bundel geeft een ongeveer 4× kleinere vlek in het beste brandpunt dan de vlakke kant eerst.', 'Même Thorlabs LA1509 (f = 100 mm), faisceau de 20 mm : face bombée vers le faisceau parallèle, la tache au meilleur foyer est environ 4× plus petite que face plane en premier.', 'La misma Thorlabs LA1509 (f = 100 mm), haz de 20 mm: con la cara curva hacia el haz paralelo, la mancha en el mejor foco es unas 4 veces menor que con la cara plana primero.', 'Ta sama Thorlabs LA1509 (f = 100 mm), wiązka 20 mm: stroną wypukłą do wiązki równoległej plamka w najlepszym ognisku jest ok. 4× mniejsza niż stroną płaską.'),
    view: { x0: -20, y0: -80, x1: 230, y1: 80 },
    scene: function () {
      return [S('S1', 0, 40, { n: 21, D: 20 }), E('L1', 'lens', 100, 40, 0, { stock: 'LA1509' }), E('SC1', 'screen', 198.7, 40, 0, { W: 25, H: 25 }),
              S('S2', 0, -40, { n: 21, D: 20 }), E('L2', 'lens', 100, -40, 0, { stock: 'LA1509', flip: true }), E('SC2', 'screen', 198.9, -40, 0, { W: 25, H: 25 })];
    },
    check: function (els) {
      var r = run(without(els, ['SC1', 'SC2'])), Tr = TR();
      var a = Tr.analysis.focusAlong(strong(bySrc(r.escapedRays, 'S1')), [100, 40, 0], [1, 0, 0]);
      var b = Tr.analysis.focusAlong(strong(bySrc(r.escapedRays, 'S2')), [100, -40, 0], [1, 0, 0]);
      var ratio = b.rms / a.rms;
      return { ok: ratio > 3.3 && ratio < 4.8, value: ratio, unit: '×', detail: { ratio: ratio, rmsCurvedFirst_um: a.rms * 1e3, rmsFlatFirst_um: b.rms * 1e3 } };
    } },

  { id: 'expanders', tags: ['lens', 'laser'],
    label: T('Keplerian vs Galilean beam expander (3×)', 'Розширювач пучка Кеплера проти Галілея (3×)', 'Kepler- vs. Galilei-Strahlaufweiter (3×)', 'Kepler- tegenover Galilei-bundelverbreder (3×)', 'Élargisseur de faisceau Kepler contre Galilée (3×)', 'Expansor de haz Kepler frente a Galileo (3×)', 'Ekspander wiązki Keplera kontra Galileusza (3×)'),
    note: T('Both make the beam 3× wider. The Galilean one (negative first lens) is shorter by 2|f₁| ≈ 100 mm and has no internal focus; the Keplerian one flips the beam (a ray above the axis leaves below it).', 'Обидва розширюють пучок утричі. Галілеїв (перша лінза від’ємна) коротший на 2|f₁| ≈ 100 мм і не має внутрішнього фокуса; Кеплерів перевертає пучок (промінь над віссю виходить під нею).', 'Beide weiten den Strahl 3× auf. Der Galilei-Aufweiter (negative erste Linse) ist um 2|f₁| ≈ 100 mm kürzer und hat keinen inneren Fokus; der Kepler-Aufweiter kehrt den Strahl um (ein Strahl über der Achse tritt darunter aus).', 'Beide maken de bundel 3× breder. De Galilei-versie (negatieve eerste lens) is 2|f₁| ≈ 100 mm korter en heeft geen inwendig brandpunt; de Kepler-versie keert de bundel om (een straal boven de as komt eronder uit).', 'Les deux élargissent le faisceau 3×. Le Galilée (première lentille négative) est plus court de 2|f₁| ≈ 100 mm et n’a pas de foyer interne ; le Kepler retourne le faisceau (un rayon au-dessus de l’axe ressort en dessous).', 'Ambos ensanchan el haz 3×. El de Galileo (primera lente negativa) es 2|f₁| ≈ 100 mm más corto y no tiene foco interno; el de Kepler invierte el haz (un rayo por encima del eje sale por debajo).', 'Oba poszerzają wiązkę 3×. Galileusza (pierwsza soczewka ujemna) jest krótszy o 2|f₁| ≈ 100 mm i nie ma ogniska wewnętrznego; Keplera odwraca wiązkę (promień nad osią wychodzi pod nią).'),
    view: { x0: -20, y0: -90, x1: 420, y1: 90 },
    scene: function () {
      return [S('SK', 0, 50, { type: 'laser', n: 7, w0: 2, clip: 2, pol: 'linear' }), E('K1', 'lens', 50, 50, 0, { stock: 'LA1131' }), E('K2', 'lens', 248.8, 50, 0, { stock: 'LA1433', flip: true }), E('SCK', 'screen', 400, 50, 0, { W: 25, H: 25 }),
              S('SG', 0, -50, { type: 'laser', n: 7, w0: 2, clip: 2, pol: 'linear' }), E('G1', 'lens', 50, -50, 0, { stock: 'LC1715' }), E('G2', 'lens', 149.1, -50, 0, { stock: 'LA1433', flip: true }), E('SCG', 'screen', 400, -50, 0, { W: 25, H: 25 })];
    },
    check: function (els) {
      var r = run(els);
      var kx = find(els, 'K2').pose.x - find(els, 'K1').pose.x, gx = find(els, 'G2').pose.x - find(els, 'G1').pose.x;
      function mag(id, y0) {                        /* top input ray (y = +2) → its height on the screen */
        var ys = (r.hits[id] || []).map(function (q) { return q.x; });
        return { min: Math.min.apply(null, ys), max: Math.max.apply(null, ys) };
      }
      var K = mag('SCK'), G = mag('SCG');
      var half = 2 * 2, Mk = (K.max - K.min) / (2 * half), Mg = (G.max - G.min) / (2 * half);   /* edge rays at ±clip·w0 = ±4 mm (2 w: 99.97 % of the power; 2.5 w would overfill the Ø25.4 output lens) */
      var kTop = (r.hits.SCK || []).filter(function (q) { return q.sample === 0; })[0], gTop = (r.hits.SCG || []).filter(function (q) { return q.sample === 0; })[0];
      var inverted = kTop && gTop ? (kTop.x * gTop.x < 0) : null;
      return { ok: Math.abs(Mk - 3) < 0.05 && Math.abs(Mg - 3) < 0.05 && Math.abs((kx - gx) - 99.6) < 2 && inverted === true,
               value: kx - gx, unit: 'mm', detail: { lengthKepler_mm: kx, lengthGalilean_mm: gx, magKepler: Mk, magGalilean: Mg, keplerInverts: inverted } };
    } },

  { id: 'filter4f', tags: ['lens', 'laser'],
    label: T('4f relay with a pinhole spatial filter', '4f-система з точковою діафрагмою (просторовий фільтр)', '4f-Relais mit Lochblende (Raumfilter)', '4f-relais met pinhole (ruimtelijk filter)', 'Relais 4f avec trou filtrant (filtre spatial)', 'Relé 4f con estenopo (filtro espacial)', 'Układ 4f z otworkiem (filtr przestrzenny)'),
    note: T('Two AC254-100 achromats 200 mm apart: the beam is relayed 1:1 and inverted. Light that arrives 1° off-axis (stray light, dust scatter) focuses 1.7 mm beside the 200 µm pinhole and is blocked completely.', 'Два ахромати AC254-100 на відстані 200 мм: пучок переноситься 1:1 і перевертається. Світло, що приходить під кутом 1° (розсіяне, від пилу), фокусується за 1,7 мм від точкової діафрагми 200 мкм і повністю блокується.', 'Zwei Achromate AC254-100 im Abstand 200 mm: der Strahl wird 1:1 übertragen und umgekehrt. Licht, das 1° schräg einfällt (Streulicht, Staub), fokussiert 1,7 mm neben der 200-µm-Lochblende und wird vollständig blockiert.', 'Twee achromaten AC254-100 op 200 mm: de bundel wordt 1:1 doorgegeven en omgekeerd. Licht dat 1° schuin invalt (strooilicht, stof) focust 1,7 mm naast de pinhole van 200 µm en wordt volledig tegengehouden.', 'Deux achromats AC254-100 à 200 mm : le faisceau est relayé 1:1 et inversé. La lumière qui arrive à 1° de l’axe (lumière parasite, poussière) se focalise à 1,7 mm du trou de 200 µm et est entièrement bloquée.', 'Dos acromáticos AC254-100 a 200 mm: el haz se transfiere 1:1 e invertido. La luz que llega 1° fuera de eje (luz parásita, polvo) se enfoca a 1,7 mm del estenopo de 200 µm y queda bloqueada por completo.', 'Dwa achromaty AC254-100 w odstępie 200 mm: wiązka jest przenoszona 1:1 i odwracana. Światło padające 1° od osi (rozproszone, kurz) ogniskuje się 1,7 mm obok otworka 200 µm i jest całkowicie blokowane.'),
    view: { x0: -20, y0: -60, x1: 470, y1: 60 },
    scene: function () {
      return [S('S', 0, 0, { type: 'laser', n: 9, w0: 3, clip: 2.5, pol: 'linear', P: 0.001 }), S('ST', 0, 0, { n: 5, D: 6, P: 0.0001, lambdaNm: 632.8 }, 1),
              E('L1', 'doublet', 100, 0, 0, { stock: 'AC254-100-A' }), E('PH', 'iris', 0, 0, 0, { D: 0.2, Dout: 25 }), E('L2', 'doublet', 0, 0, 0, { stock: 'AC254-100-A', flip: true }),
              E('SC', 'screen', 450, 0, 0, { W: 25, H: 25 })];
    },
    place: function (els) {                       /* pinhole at the paraxial focus of L1, L2 one focal length behind it */
      var Tr = TR(), r = run([els[0], els[2]]), f = Tr.analysis.focusAlong(strong(r.escapedRays), [100, 0, 0], [1, 0, 0]);
      find(els, 'PH').pose.x = Math.round((100 + f.s) * 100) / 100;
      find(els, 'L2').pose.x = Math.round((100 + 2 * f.s) * 100) / 100;
      return els;
    },
    check: function (els) {
      var r = run(els), h = r.hits.SC || [];
      var main = sumP(h.filter(function (q) { return q.src === 'S'; })) / 0.001, stray = sumP(h.filter(function (q) { return q.src === 'ST'; })) / 0.0001;
      return { ok: main > 0.97 && stray < 1e-9 && (r.absorbed.PH || 0) > 0.8e-4, value: main, unit: '', detail: { mainTransmitted: main, strayTransmitted: stray } };
    } },

  { id: 'michelson', tags: ['interferometer'],
    label: T('Michelson interferometer', 'Інтерферометр Майкельсона', 'Michelson-Interferometer', 'Michelson-interferometer', 'Interféromètre de Michelson', 'Interferómetro de Michelson', 'Interferometr Michelsona'),
    note: T('Arm 2 is 5 mm longer: the optical path difference is 2 × 5 = 10 mm, because the light runs the arm twice. Moving a mirror by λ/2 = 316 nm shifts the fringes by one whole fringe.', 'Плече 2 довше на 5 мм: різниця оптичних шляхів 2 × 5 = 10 мм, бо світло проходить плече двічі. Зсув дзеркала на λ/2 = 316 нм зсуває картину на одну смугу.', 'Arm 2 ist 5 mm länger: der optische Gangunterschied beträgt 2 × 5 = 10 mm, weil das Licht den Arm zweimal durchläuft. Ein Spiegelweg von λ/2 = 316 nm verschiebt das Muster um genau einen Streifen.', 'Arm 2 is 5 mm langer: het optische wegverschil is 2 × 5 = 10 mm, omdat het licht de arm twee keer doorloopt. Een spiegelverplaatsing van λ/2 = 316 nm verschuift het patroon precies één franje.', 'Le bras 2 est plus long de 5 mm : la différence de marche vaut 2 × 5 = 10 mm, car la lumière parcourt le bras deux fois. Déplacer un miroir de λ/2 = 316 nm décale les franges d’une frange entière.', 'El brazo 2 es 5 mm más largo: la diferencia de camino óptico es 2 × 5 = 10 mm, porque la luz recorre el brazo dos veces. Mover un espejo λ/2 = 316 nm desplaza las franjas una franja entera.', 'Ramię 2 jest dłuższe o 5 mm: różnica dróg optycznych wynosi 2 × 5 = 10 mm, bo światło przebiega ramię dwukrotnie. Przesunięcie zwierciadła o λ/2 = 316 nm przesuwa obraz o jeden prążek.'),
    view: { x0: -20, y0: -130, x1: 230, y1: 130 },
    scene: function () {
      return [S('S', 0, 0, { type: 'laser', n: 1, pol: 'linear', polAngle: 45 }), E('BS', 'bscube', 100, 0, 0, { a: 25.4, R: 0.5 }),
              E('M1', 'mirror', 200, 0, 0, { D: 25.4 }), E('M2', 'mirror', 100, 105, 90, { D: 25.4 }), E('SC', 'screen', 100, -100, -90, { W: 25, H: 25 })];
    },
    check: function (els) {
      var r = run(els), Tr = TR(), paths = Tr.analysis.pathTable(r.hits.SC || []);
      var two = paths.filter(function (p) { return p.P > 1e-6; });
      var L1 = find(els, 'M1').pose.x - find(els, 'BS').pose.x, L2 = find(els, 'M2').pose.y - find(els, 'BS').pose.y;
      var d = two.length >= 2 ? Math.abs(two[0].opl - two[1].opl) : NaN;
      return { ok: two.length === 2 && Math.abs(d - 2 * Math.abs(L2 - L1)) < 1e-6 && Math.abs(two[0].P - two[1].P) < 1e-9,
               value: d, unit: 'mm', detail: { dOPL_mm: d, twiceArmDifference_mm: 2 * Math.abs(L2 - L1), fringesPerMirrorMicron: 2e-3 / 632.8e-6 } };
    } },

  { id: 'machzehnder', tags: ['interferometer'],
    label: T('Mach–Zehnder interferometer', 'Інтерферометр Маха — Цендера', 'Mach-Zehnder-Interferometer', 'Mach-Zehnder-interferometer', 'Interféromètre de Mach-Zehnder', 'Interferómetro de Mach-Zehnder', 'Interferometr Macha-Zehndera'),
    note: T('With cube splitters both arms cross exactly the same glass, so the path difference is zero (white-light fringes are possible). Each arm reaches each output with a quarter of the power; which output lights up is decided by interference, not shown by ray tracing.', 'З кубічними подільниками обидва плечі проходять однакове скло, тож різниця ходу нульова (можливі смуги в білому світлі). Кожне плече приносить у кожен вихід чверть потужності; який вихід світиться, вирішує інтерференція, якої трасування променів не показує.', 'Mit Würfelteilern durchlaufen beide Arme genau dasselbe Glas, der Gangunterschied ist null (Weißlichtstreifen möglich). Jeder Arm bringt ein Viertel der Leistung an jeden Ausgang; welcher Ausgang hell ist, entscheidet die Interferenz, die Raytracing nicht zeigt.', 'Met kubusdelers doorlopen beide armen precies hetzelfde glas, dus het wegverschil is nul (witlichtfranjes mogelijk). Elke arm brengt een kwart van het vermogen naar elke uitgang; welke uitgang oplicht, bepaalt de interferentie, die raytracing niet toont.', 'Avec des cubes séparateurs, les deux bras traversent exactement le même verre : la différence de marche est nulle (franges en lumière blanche possibles). Chaque bras apporte un quart de la puissance à chaque sortie ; quelle sortie s’allume dépend de l’interférence, que le tracé de rayons ne montre pas.', 'Con divisores de cubo ambos brazos atraviesan exactamente el mismo vidrio, así que la diferencia de camino es cero (franjas con luz blanca posibles). Cada brazo lleva un cuarto de la potencia a cada salida; cuál se ilumina lo decide la interferencia, que el trazado de rayos no muestra.', 'Z kostkami dzielącymi oba ramiona przechodzą przez dokładnie to samo szkło, więc różnica dróg jest zerowa (możliwe prążki w świetle białym). Każde ramię daje każdemu wyjściu ćwierć mocy; które wyjście świeci, decyduje interferencja, której śledzenie promieni nie pokazuje.'),
    view: { x0: -20, y0: -40, x1: 430, y1: 330 },
    scene: function () {
      return [S('S', 0, 0, { type: 'laser', n: 1, pol: 'linear', polAngle: 45 }), E('BS1', 'bscube', 100, 0, 0, { a: 25.4, R: 0.5 }),
              E('M1', 'mirror', 100, 150, 135, { D: 25.4 }), E('M2', 'mirror', 250, 0, -45, { D: 25.4 }), E('BS2', 'bscube', 250, 150, 0, { a: 25.4, R: 0.5 }),
              E('D1', 'powermeter', 400, 150, 0, { D: 25 }), E('D2', 'powermeter', 250, 300, 90, { D: 25 })];
    },
    check: function (els) {
      var r = run(els), Tr = TR(), p1 = Tr.analysis.pathTable(r.hits.D1 || []), p2 = Tr.analysis.pathTable(r.hits.D2 || []);
      var d1 = p1.length === 2 ? Math.abs(p1[0].opl - p1[1].opl) : NaN, d2 = p2.length === 2 ? Math.abs(p2[0].opl - p2[1].opl) : NaN;
      var P = (r.detected.D1 || 0) + (r.detected.D2 || 0);
      return { ok: d1 < 1e-9 && d2 < 1e-9 && Math.abs(P / 0.001 - 1) < 1e-9 && Math.abs(r.detected.D1 / 0.001 - 0.5) < 1e-9, value: Math.max(d1, d2), unit: 'mm',
               detail: { dOPL_out1_mm: d1, dOPL_out2_mm: d2, P_out1: r.detected.D1 / 0.001, P_out2: r.detected.D2 / 0.001 } };
    } },

  { id: 'prism', tags: ['spectro'],
    label: T('Prism spectrometer: N-SF11 vs N-BK7', 'Призмовий спектрометр: N-SF11 проти N-BK7', 'Prismenspektrometer: N-SF11 vs. N-BK7', 'Prismaspectrometer: N-SF11 tegenover N-BK7', 'Spectromètre à prisme : N-SF11 contre N-BK7', 'Espectrómetro de prisma: N-SF11 frente a N-BK7', 'Spektrometr pryzmatyczny: N-SF11 kontra N-BK7'),
    note: T('White light through a 60° prism near minimum deviation: blue is bent more than red. The dense flint N-SF11 spreads the spectrum more than 3× wider than crown N-BK7 — change the prism glass in the inspector and watch the screen.', 'Біле світло крізь 60° призму поблизу мінімального відхилення: синє заломлюється сильніше за червоне. Важкий флінт N-SF11 розтягує спектр більш ніж утричі ширше, ніж крон N-BK7 — змініть скло призми в інспекторі й подивіться на екран.', 'Weißes Licht durch ein 60°-Prisma nahe der minimalen Ablenkung: Blau wird stärker gebrochen als Rot. Das Schwerflint N-SF11 fächert das Spektrum mehr als 3× breiter auf als das Kronglas N-BK7 — Glas im Inspektor wechseln und auf den Schirm schauen.', 'Wit licht door een prisma van 60° nabij minimale deviatie: blauw breekt sterker dan rood. Het zware flint N-SF11 spreidt het spectrum meer dan 3× breder dan kroonglas N-BK7 — verander het prismaglas in de inspector en kijk naar het scherm.', 'Lumière blanche à travers un prisme de 60° près du minimum de déviation : le bleu est plus dévié que le rouge. Le flint dense N-SF11 étale le spectre plus de 3× plus que le crown N-BK7 — changez le verre du prisme dans l’inspecteur et regardez l’écran.', 'Luz blanca a través de un prisma de 60° cerca de la desviación mínima: el azul se desvía más que el rojo. El flint denso N-SF11 abre el espectro más de 3 veces que el crown N-BK7 — cambie el vidrio del prisma en el inspector y mire la pantalla.', 'Światło białe przez pryzmat 60° w pobliżu minimum odchylenia: niebieskie załamuje się silniej niż czerwone. Ciężki flint N-SF11 rozciąga widmo ponad 3× szerzej niż kron N-BK7 — zmień szkło pryzmatu w inspektorze i spójrz na ekran.'),
    view: { x0: -20, y0: -60, x1: 200, y1: 160 },
    scene: function () {
      return [S('S', 0, -4, { type: 'white', n: 1, spectrum: { kind: 'white', n: 7 } }), E('P', 'prism', 80, 0, -26, { shape: 'equilateral', a: 25, material: 'N-SF11', ar: true }),
              E('SC', 'screen', 110, 70, 66, { W: 40, H: 20 })];
    },
    place: function (els) {                       /* prism turned to minimum deviation at 587.6 nm, screen 80 mm along the yellow ray */
      var src = clone(find(els, 'S')), pr = find(els, 'P');
      src.params = { type: 'collimated', n: 1, lambdaNm: 587.6 };
      function out(rz) { pr.pose.rz = rz; var r = run([src, pr]); return r.escapedRays.filter(function (x) { return x.via.join() === 'P,P'; })[0]; }
      function dev(rz) { var o = out(rz); return o ? Math.atan2(o.d[1], o.d[0]) : 9; }
      var a = -35, b = -17, g = (Math.sqrt(5) - 1) / 2;
      for (var i = 0; i < 60; i++) { var c1 = b - g * (b - a), c2 = a + g * (b - a); if (dev(c1) < dev(c2)) b = c2; else a = c1; }
      var rz = Math.round((a + b) / 2 * 100) / 100, o = out(rz), sc = find(els, 'SC');
      sc.pose.x = Math.round((o.o[0] + 80 * o.d[0]) * 100) / 100; sc.pose.y = Math.round((o.o[1] + 80 * o.d[1]) * 100) / 100;
      sc.pose.rz = Math.round(Math.atan2(o.d[1], o.d[0]) / D2R * 100) / 100;
      return els;
    },
    check: function (els) {
      function spread(mat) {
        var e = clone(els); find(e, 'P').params.material = mat;
        var r = run(without(e, ['SC'])), o = r.escapedRays.filter(function (x) { return x.via.join() === 'P,P'; });
        var ang = o.map(function (x) { return { nm: x.lam, a: Math.atan2(x.d[1], x.d[0]) / D2R }; }).sort(function (a, b) { return a.nm - b.nm; });
        return ang.length >= 7 ? { spread: ang[0].a - ang[ang.length - 1].a, blueMore: ang[0].a > ang[ang.length - 1].a } : { spread: NaN, blueMore: false };
      }
      var f = spread('N-SF11'), c = spread('N-BK7');
      return { ok: f.blueMore && c.blueMore && f.spread / c.spread > 3, value: f.spread / c.spread, unit: '×', detail: { spreadSF11_deg: f.spread, spreadBK7_deg: c.spread } };
    } },

  { id: 'grating', tags: ['spectro'],
    label: T('Grating spectrometer: orders', 'Ґратковий спектрометр: порядки', 'Gitterspektrometer: Ordnungen', 'Tralie-spectrometer: ordes', 'Spectromètre à réseau : ordres', 'Espectrómetro de red: órdenes', 'Spektrometr siatkowy: rzędy'),
    note: T('A 600 lines/mm transmission grating splits white light into orders m = ±1, ±2 on both sides of the straight beam. Unlike a prism, a grating bends red MORE than blue (sin θ = mλ/Λ), and the 2nd order is more than twice as wide as the 1st (2.6× in angle).', 'Пропускна ґратка 600 штр/мм розкладає біле світло на порядки m = ±1, ±2 по обидва боки прямого пучка. На відміну від призми, ґратка відхиляє червоне СИЛЬНІШЕ за синє (sin θ = mλ/Λ), а 2-й порядок більш ніж удвічі ширший за 1-й (у 2,6 раза за кутом).', 'Ein Transmissionsgitter mit 600 Linien/mm zerlegt Weißlicht in die Ordnungen m = ±1, ±2 beiderseits des geraden Strahls. Anders als ein Prisma beugt ein Gitter Rot STÄRKER als Blau (sin θ = mλ/Λ), und die 2. Ordnung ist mehr als doppelt so breit wie die 1. (2,6× im Winkel).', 'Een transmissietralie van 600 lijnen/mm splitst wit licht in ordes m = ±1, ±2 aan weerszijden van de rechte bundel. Anders dan een prisma buigt een tralie rood STERKER af dan blauw (sin θ = mλ/Λ), en de 2e orde is meer dan twee keer zo breed als de 1e (2,6× in hoek).', 'Un réseau en transmission de 600 traits/mm décompose la lumière blanche en ordres m = ±1, ±2 de part et d’autre du faisceau direct. Contrairement au prisme, le réseau dévie PLUS le rouge que le bleu (sin θ = mλ/Λ), et l’ordre 2 est plus de deux fois plus large que l’ordre 1 (2,6× en angle).', 'Una red de transmisión de 600 líneas/mm separa la luz blanca en órdenes m = ±1, ±2 a ambos lados del haz directo. A diferencia de un prisma, la red desvía MÁS el rojo que el azul (sin θ = mλ/Λ), y el 2.º orden es más del doble de ancho que el 1.º (2,6× en ángulo).', 'Siatka transmisyjna 600 linii/mm rozkłada światło białe na rzędy m = ±1, ±2 po obu stronach wiązki prostej. W przeciwieństwie do pryzmatu siatka odchyla czerwień SILNIEJ niż błękit (sin θ = mλ/Λ), a 2. rząd jest ponad dwa razy szerszy niż 1. (2,6× w kącie).'),
    view: { x0: -20, y0: -170, x1: 220, y1: 170 },
    scene: function () {
      return [S('S', 0, 0, { type: 'white', n: 1, spectrum: { kind: 'white', n: 7 } }), E('G', 'grating', 50, 0, 0, { lpmm: 600, mode: 'transmit', W: 25, H: 25, maxOrder: 2 }),
              E('SC', 'screen', 180, 0, 0, { W: 25, H: 25 }), E('SC1', 'screen', 160, 60, 0, { W: 80, H: 25 }), E('SC2', 'screen', 120, 140, 0, { W: 120, H: 25 })];
    },
    check: function (els) {
      var r = run(without(els, ['SC', 'SC1', 'SC2'])), Lam = 1e6 / 600;
      var o1 = r.escapedRays.filter(function (x) { return x.order === 1; }).sort(function (a, b) { return a.lam - b.lam; });
      var o2 = r.escapedRays.filter(function (x) { return x.order === 2; }).sort(function (a, b) { return a.lam - b.lam; });
      var angle = function (x) { return Math.asin(x.d[1]) / D2R; };
      var w1 = angle(o1[o1.length - 1]) - angle(o1[0]), w2 = o2.length ? angle(o2[o2.length - 1]) - angle(o2[0]) : NaN;
      var eq = o1.every(function (x) { return Math.abs(x.d[1] - x.lam / Lam) < 1e-12; });
      return { ok: w1 > 0 && eq && w2 / w1 > 2, value: w2 / w1, unit: '×', detail: { width1_deg: w1, width2_deg: w2, gratingEquation: eq } };
    } },

  { id: 'brewster', tags: ['polarisation'],
    label: T('Brewster window: p passes, s reflects', 'Вікно Брюстера: p проходить, s відбивається', 'Brewster-Fenster: p geht durch, s wird reflektiert', 'Brewstervenster: p gaat door, s reflecteert', 'Fenêtre de Brewster : p passe, s se réfléchit', 'Ventana de Brewster: p pasa, s se refleja', 'Okno Brewstera: p przechodzi, s się odbija'),
    note: T('An uncoated N-BK7 window tilted to Brewster’s angle (56.6°): p-polarised light passes with no reflection loss at all, s-polarised light loses about 27 % at the two faces. That is why laser tubes have Brewster windows and lase in p.', 'Непросвітлене вікно N-BK7 під кутом Брюстера (56,6°): p-поляризоване світло проходить зовсім без втрат на відбиття, s-поляризоване втрачає близько 27 % на двох гранях. Тому лазерні трубки мають вікна Брюстера й генерують у p.', 'Ein unvergütetes N-BK7-Fenster unter dem Brewster-Winkel (56,6°): p-polarisiertes Licht geht ganz ohne Reflexionsverlust durch, s-polarisiertes verliert an den zwei Flächen etwa 27 %. Deshalb haben Laserröhren Brewster-Fenster und schwingen in p.', 'Een onbehandeld N-BK7-venster onder de brewsterhoek (56,6°): p-gepolariseerd licht gaat er zonder enig reflectieverlies door, s-gepolariseerd verliest ongeveer 27 % aan de twee vlakken. Daarom hebben laserbuizen brewstervensters en laseren ze in p.', 'Une fenêtre N-BK7 non traitée inclinée à l’angle de Brewster (56,6°) : la lumière p passe sans aucune perte par réflexion, la lumière s perd environ 27 % sur les deux faces. C’est pourquoi les tubes laser ont des fenêtres de Brewster et émettent en p.', 'Una ventana N-BK7 sin tratamiento inclinada al ángulo de Brewster (56,6°): la luz p pasa sin ninguna pérdida por reflexión, la luz s pierde cerca del 27 % en las dos caras. Por eso los tubos láser tienen ventanas de Brewster y emiten en p.', 'Niepowlekane okno N-BK7 nachylone pod kątem Brewstera (56,6°): światło spolaryzowane p przechodzi zupełnie bez strat na odbicie, s traci około 27 % na dwóch powierzchniach. Dlatego rury laserowe mają okna Brewstera i generują w p.'),
    view: { x0: -20, y0: -110, x1: 220, y1: 110 },
    scene: function () {
      return [S('SP', 0, 40, { type: 'laser', n: 1, pol: 'linear', polAngle: 0, lambdaNm: 632.8 }), E('W1', 'window', 80, 40, 56.6, { D: 25.4, t: 5, material: 'N-BK7' }), E('PM1', 'powermeter', 180, 40, 0, { D: 20 }),
              S('SS', 0, -40, { type: 'laser', n: 1, pol: 'linear', polAngle: 90, lambdaNm: 632.8 }), E('W2', 'window', 80, -40, 56.6, { D: 25.4, t: 5, material: 'N-BK7' }), E('PM2', 'powermeter', 180, -40, 0, { D: 20 })];
    },
    place: function (els) {                       /* exact Brewster angle for the window glass at the laser line */
      var n = TR().util.n('N-BK7', 632.8), th = Math.round(Math.atan(n) / D2R * 1000) / 1000;
      find(els, 'W1').pose.rz = th; find(els, 'W2').pose.rz = th;
      return els;
    },
    check: function (els) {
      var r = run(els, { ghosts: true }), Tp = (r.detected.PM1 || 0) / 0.001, Ts = (r.detected.PM2 || 0) / 0.001;
      return { ok: Tp > 0.99999 && Ts < 0.8 && Ts > 0.7, value: Tp, unit: '', detail: { Tp: Tp, Ts: Ts, brewster_deg: find(els, 'W1').pose.rz } };
    } },

  { id: 'malus', tags: ['polarisation'],
    label: T('Two polarisers: Malus’s law', 'Два поляризатори: закон Малюса', 'Zwei Polarisatoren: Gesetz von Malus', 'Twee polarisatoren: wet van Malus', 'Deux polariseurs : loi de Malus', 'Dos polarizadores: ley de Malus', 'Dwa polaryzatory: prawo Malusa'),
    note: T('Unpolarised light: the first polariser passes half, the second one at 60° passes cos²60° = 25 % of that — 12.5 % in total. Crossed at 90° nothing passes; put a third polariser at 45° between them and 12.5 % comes back.', 'Неполяризоване світло: перший поляризатор пропускає половину, другий під 60° — cos²60° = 25 % від неї, разом 12,5 %. Схрещені під 90° не пропускають нічого; поставте між ними третій під 45° — і 12,5 % повернеться.', 'Unpolarisiertes Licht: der erste Polarisator lässt die Hälfte durch, der zweite unter 60° davon cos²60° = 25 % — insgesamt 12,5 %. Gekreuzt (90°) geht nichts durch; ein dritter Polarisator unter 45° dazwischen bringt 12,5 % zurück.', 'Ongepolariseerd licht: de eerste polarisator laat de helft door, de tweede onder 60° daarvan cos²60° = 25 % — in totaal 12,5 %. Gekruist (90°) gaat er niets door; een derde polarisator onder 45° ertussen brengt 12,5 % terug.', 'Lumière non polarisée : le premier polariseur en laisse passer la moitié, le second à 60° cos²60° = 25 % de celle-ci — 12,5 % au total. Croisés à 90°, rien ne passe ; un troisième polariseur à 45° entre eux fait revenir 12,5 %.', 'Luz no polarizada: el primer polarizador deja pasar la mitad y el segundo a 60°, cos²60° = 25 % de ella — 12,5 % en total. Cruzados a 90° no pasa nada; un tercer polarizador a 45° entre ellos devuelve un 12,5 %.', 'Światło niespolaryzowane: pierwszy polaryzator przepuszcza połowę, drugi pod 60° — cos²60° = 25 % z niej, razem 12,5 %. Skrzyżowane pod 90° nie przepuszczają nic; trzeci polaryzator pod 45° między nimi przywraca 12,5 %.'),
    view: { x0: -20, y0: -60, x1: 220, y1: 60 },
    scene: function () {
      return [S('S', 0, 0, { type: 'collimated', n: 1, pol: 'unpolarized' }), E('P1', 'polarizer', 60, 0, 0, { angle: 0, D: 25.4 }), E('P2', 'polarizer', 120, 0, 0, { angle: 60, D: 25.4 }),
              E('PM', 'powermeter', 180, 0, 0, { D: 20 })];
    },
    check: function (els) {
      var t = (run(els).detected.PM || 0) / 0.001;
      var e2 = clone(els); find(e2, 'P2').params.angle = 90; var tx = (run(e2).detected.PM || 0) / 0.001;
      e2.splice(2, 0, E('P3', 'polarizer', 90, 0, 0, { angle: 45, D: 25.4 })); var t3 = (run(e2).detected.PM || 0) / 0.001;
      return { ok: Math.abs(t - 0.125) < 1e-12 && tx < 1e-15 && Math.abs(t3 - 0.125) < 1e-12, value: t, unit: '', detail: { T60: t, Tcrossed: tx, Tcrossed45between: t3 } };
    } },

  { id: 'isolator', tags: ['polarisation', 'laser'],
    label: T('λ/4 + PBS optical isolator', 'Оптичний ізолятор λ/4 + PBS', 'Optischer Isolator λ/4 + PBS', 'Optische isolator λ/4 + PBS', 'Isolateur optique λ/4 + PBS', 'Aislador óptico λ/4 + PBS', 'Izolator optyczny λ/4 + PBS'),
    note: T('The laser light (p) passes the polarising cube, the λ/4 plate at 45° makes it circular; after the mirror it comes back as s and the cube sends ALL of it to the side detector — nothing returns into the laser.', 'Світло лазера (p) проходить поляризаційний куб, пластинка λ/4 під 45° робить його коловим; після дзеркала воно повертається як s, і куб відводить УСЕ в бічний детектор — у лазер не повертається нічого.', 'Das Laserlicht (p) passiert den Polarisationswürfel, die λ/4-Platte unter 45° macht es zirkular; nach dem Spiegel kommt es als s zurück und der Würfel lenkt ALLES zum seitlichen Detektor — nichts gelangt zurück in den Laser.', 'Het laserlicht (p) passeert de polariserende kubus, het λ/4-plaatje onder 45° maakt het circulair; na de spiegel komt het terug als s en de kubus stuurt ALLES naar de zijdetector — er komt niets terug in de laser.', 'La lumière laser (p) traverse le cube polariseur, la lame λ/4 à 45° la rend circulaire ; après le miroir elle revient en s et le cube envoie TOUT vers le détecteur latéral — rien ne retourne dans le laser.', 'La luz del láser (p) atraviesa el cubo polarizador, la lámina λ/4 a 45° la hace circular; tras el espejo vuelve como s y el cubo envía TODO al detector lateral — nada vuelve al láser.', 'Światło lasera (p) przechodzi przez kostkę polaryzacyjną, płytka λ/4 pod 45° robi je kołowym; po zwierciadle wraca jako s i kostka kieruje CAŁOŚĆ do bocznego detektora — nic nie wraca do lasera.'),
    view: { x0: -20, y0: -90, x1: 220, y1: 60 },
    scene: function () {
      return [S('S', 0, 0, { type: 'laser', n: 1, pol: 'linear', polAngle: 0, lambdaNm: 632.8 }), E('PBS', 'bscube', 60, 0, 0, { a: 12.7, pbs: true }),
              E('QWP', 'waveplate', 110, 0, 0, { waves: 0.25, angle: 45, lambda0Nm: 632.8, D: 12.7 }), E('M', 'mirror', 170, 0, 0, { D: 12.7 }),
              E('PD', 'powermeter', 60, -60, 90, { D: 10 })];
    },
    check: function (els) {
      var r = run(els), back = sumP(r.escapedRays.filter(function (x) { return x.d[0] < -0.999; })) / 0.001, side = (r.detected.PD || 0) / 0.001;
      return { ok: back < 1e-12 && side > 0.999, value: back, unit: '', detail: { backToLaser: back, sidePort: side } };
    } },

  { id: 'fiber', tags: ['laser', 'fiber'],
    label: T('Fibre coupling: NA limits the spot', 'Введення у волокно: NA обмежує пляму', 'Faserkopplung: die NA begrenzt den Fleck', 'Vezelkoppeling: de NA begrenst de vlek', 'Couplage fibre : l’ON limite la tache', 'Acoplo a fibra: la NA limita la mancha', 'Sprzęganie do światłowodu: NA ogranicza plamkę'),
    note: T('A 50 µm multimode fibre (NA 0.22) behind an aspheric lens f = 11 mm. A 3 mm beam couples almost completely; widened to 8 mm (1/e² diameter), the rays at the 1/e² radius meet the fibre at sin θ ≈ 0.31 > NA 0.22 and about 40 % of the light misses it — a smaller spot is not always better.', 'Багатомодове волокно 50 мкм (NA 0,22) за асферичною лінзою f = 11 мм. Пучок 3 мм вводиться майже повністю; після розширення до 8 мм (діаметр за 1/e²) промені на радіусі 1/e² падають на волокно під sin θ ≈ 0,31 > NA 0,22, і близько 40 % світла не потрапляє у волокно — менша пляма не завжди краща.', 'Eine 50-µm-Multimodefaser (NA 0,22) hinter einer Asphäre f = 11 mm. Ein 3-mm-Strahl koppelt fast vollständig ein; auf 8 mm (1/e²-Durchmesser) aufgeweitet treffen die Strahlen am 1/e²-Radius unter sin θ ≈ 0,31 > NA 0,22 auf die Faser und etwa 40 % des Lichts verfehlen sie — ein kleinerer Fleck ist nicht immer besser.', 'Een multimodevezel van 50 µm (NA 0,22) achter een asferische lens f = 11 mm. Een bundel van 3 mm koppelt bijna volledig in; verbreed tot 8 mm (1/e²-diameter) treffen de stralen op de 1/e²-straal de vezel onder sin θ ≈ 0,31 > NA 0,22 en mist ongeveer 40 % van het licht de vezel — een kleinere vlek is niet altijd beter.', 'Une fibre multimode de 50 µm (ON 0,22) derrière une lentille asphérique f = 11 mm. Un faisceau de 3 mm est couplé presque entièrement ; élargi à 8 mm (diamètre à 1/e²), les rayons au rayon 1/e² arrivent sur la fibre sous sin θ ≈ 0,31 > ON 0,22 et environ 40 % de la lumière la manque — une tache plus petite n’est pas toujours meilleure.', 'Una fibra multimodo de 50 µm (NA 0,22) tras una lente asférica f = 11 mm. Un haz de 3 mm se acopla casi por completo; ensanchado a 8 mm (diámetro a 1/e²), los rayos del radio 1/e² llegan a la fibra con sin θ ≈ 0,31 > NA 0,22 y cerca del 40 % de la luz no entra en ella — una mancha menor no siempre es mejor.', 'Światłowód wielomodowy 50 µm (NA 0,22) za soczewką asferyczną f = 11 mm. Wiązka 3 mm wchodzi niemal w całości; po poszerzeniu do 8 mm (średnica 1/e²) promienie na promieniu 1/e² padają na włókno pod sin θ ≈ 0,31 > NA 0,22 i ok. 40 % światła omija włókno — mniejsza plamka nie zawsze jest lepsza.'),
    view: { x0: -20, y0: -60, x1: 80, y1: 60 },
    scene: function () {
      var n = TR().util.n('N-BK7', 632.8), R = 11 * (n - 1);
      var lens = { R1: 0, R2: -R, k2: -n * n, CT: 4, D: 9, material: 'N-BK7', ar: true };
      return [S('SA', 0, 25, { type: 'laser', n: 199, w0: 1.5, clip: 2.5, pattern: 'disk', pol: 'linear' }), E('LA', 'lens', 30, 25, 0, Object.assign({}, lens)), E('FA', 'fiber', 0, 25, 0, { coreD: 0.05, NA: 0.22, Dferrule: 2.5 }),
              S('SB', 0, -25, { type: 'laser', n: 199, w0: 4, clip: 2.5, pattern: 'disk', pol: 'linear' }), E('LB', 'lens', 30, -25, 0, Object.assign({}, lens)), E('FB', 'fiber', 0, -25, 0, { coreD: 0.05, NA: 0.22, Dferrule: 2.5 })];
    },
    place: function (els) {                       /* fibre face at the marginal-ray focus of the plano-hyperbolic lens */
      var Tr = TR(), r = run([els[0], els[1]]), f = Tr.analysis.focusAlong(strong(r.escapedRays), [30, 25, 0], [1, 0, 0]);
      var x = Math.round((30 + f.s) * 1000) / 1000;
      find(els, 'FA').pose.x = x; find(els, 'FB').pose.x = x;
      return els;
    },
    check: function (els) {
      var r = run(els), a = (r.coupled.FA || 0) / 0.001, b = (r.coupled.FB || 0) / 0.001;
      /* exact angle at the fibre of the ray at the 1/e² radius (h = 4 mm): plano-hyperbolic lens, focus f behind the vertex of the hyperbola */
      var L = find(els, 'LB').params, c = -1 / L.R2, h = 4, sag = c * h * h / (1 + Math.sqrt(1 - (1 + L.k2) * c * c * h * h));
      var sinW = h / Math.hypot(h, 11 + sag);
      return { ok: a > 0.97 && b > 0.5 && b < 0.62 && sinW > 0.22, value: b, unit: '', detail: { coupled3mm: a, coupled8mm: b, sinThetaAtW8mm: sinW } };
    } },

  { id: 'newton', tags: ['mirror', 'telescope'],
    label: T('Newtonian telescope: parabola vs sphere', 'Телескоп Ньютона: парабола проти сфери', 'Newton-Teleskop: Parabel vs. Kugel', 'Newtontelescoop: parabool tegenover bol', 'Télescope de Newton : parabole contre sphère', 'Telescopio newtoniano: parábola frente a esfera', 'Teleskop Newtona: parabola kontra sfera'),
    note: T('Two 150 mm f/4 primaries lit by a 140 mm beam (f/4.3; the diagonal blocks its centre, as in a real Newtonian), screens at the best focus. The parabolic one brings every zone of a star’s light to one point; the spherical one smears it into a spot with an RMS radius about 7× the Airy radius — spherical aberration. That is why fast telescope mirrors are parabolised.', 'Два головні дзеркала 150 мм f/4, освітлені пучком 140 мм (f/4,3; діагональне дзеркало затуляє його центр, як у справжньому ньютоні), екрани в найкращому фокусі. Параболічне зводить світло зірки з усіх зон в одну точку; сферичне розмазує його в пляму із середньоквадратичним радіусом приблизно в 7 разів більшим за радіус диска Ейрі — сферична аберація. Тому світлосильні дзеркала телескопів параболізують.', 'Zwei 150-mm-Hauptspiegel f/4, beleuchtet von einem 140-mm-Strahl (f/4,3; der Fangspiegel verdeckt seine Mitte wie bei einem echten Newton), Schirme im besten Fokus. Der parabolische bündelt das Sternlicht aller Zonen in einem Punkt; der sphärische verschmiert es zu einem Fleck mit einem RMS-Radius von etwa dem 7-Fachen des Airy-Radius — sphärische Aberration. Deshalb werden lichtstarke Teleskopspiegel parabolisiert.', 'Twee hoofdspiegels van 150 mm f/4, belicht door een bundel van 140 mm (f/4,3; de vangspiegel blokkeert het midden, zoals in een echte newton), schermen in het beste brandpunt. De parabolische brengt het sterlicht van alle zones in één punt; de bolvormige smeert het uit tot een vlek met een RMS-straal van ongeveer 7× de Airy-straal — sferische aberratie. Daarom worden lichtsterke telescoopspiegels geparaboliseerd.', 'Deux miroirs primaires de 150 mm f/4 éclairés par un faisceau de 140 mm (f/4,3 ; le miroir secondaire masque son centre, comme dans un vrai Newton), écrans au meilleur foyer. Le parabolique ramène la lumière d’une étoile de toutes les zones en un point ; le sphérique l’étale en une tache de rayon RMS d’environ 7 fois le rayon d’Airy — aberration sphérique. C’est pourquoi les miroirs de télescope ouverts sont paraboliques.', 'Dos espejos primarios de 150 mm f/4 iluminados por un haz de 140 mm (f/4,3; el espejo diagonal tapa su centro, como en un newtoniano real), pantallas en el mejor foco. El parabólico lleva la luz de una estrella de todas las zonas a un punto; el esférico la extiende en una mancha con un radio RMS de unas 7 veces el radio de Airy — aberración esférica. Por eso los espejos de telescopio luminosos se parabolizan.', 'Dwa zwierciadła główne 150 mm f/4 oświetlone wiązką 140 mm (f/4,3; zwierciadło wtórne zasłania jej środek, jak w prawdziwym newtonie), ekrany w najlepszym ognisku. Paraboliczne skupia światło gwiazdy ze wszystkich stref w jednym punkcie; sferyczne rozmazuje je w plamkę o promieniu RMS ok. 7 razy większym od promienia Airy’ego — aberracja sferyczna. Dlatego jasne zwierciadła teleskopów się parabolizuje.'),
    view: { x0: -40, y0: -330, x1: 760, y1: 330 },
    scene: function () {
      return [S('SP', 0, 120, { n: 91, D: 140, pattern: 'disk', lambdaNm: 550 }), E('MP', 'mirror', 700, 120, 0, { R: 1200, k: -1, D: 150 }), E('DP', 'mirror', 200, 120, -135, { D: 40 }), E('EP', 'screen', 200, 220, -90, { W: 10, H: 10 }),
              S('SS', 0, -120, { n: 91, D: 140, pattern: 'disk', lambdaNm: 550 }), E('MS', 'mirror', 700, -120, 0, { R: 1200, k: 0, D: 150 }), E('DS', 'mirror', 200, -120, 135, { D: 40 }), E('ES', 'screen', 200, -220, 90, { W: 10, H: 10 })];
    },
    place: function (els) {                       /* eyepiece screens at each mirror's best focus (folded by the diagonal at x = 200) */
      var Tr = TR();
      [['SP', 'MP', 'EP', 120, 1], ['SS', 'MS', 'ES', -120, -1]].forEach(function (q) {
        var r = run([find(els, q[0]), find(els, q[1])]), f = Tr.analysis.focusAlong(strong(r.escapedRays), [700, q[3], 0], [-1, 0, 0]);
        find(els, q[2]).pose.y = Math.round((q[3] + q[4] * (f.s - 500)) * 1000) / 1000;
      });
      return els;
    },
    check: function (els) {
      var Tr = TR();
      function rms(prim, s, y) {
        var r = run([find(els, s), find(els, prim)]), f = Tr.analysis.focusAlong(strong(r.escapedRays), [700, y, 0], [-1, 0, 0]);
        return f;
      }
      var p = rms('MP', 'SP', 120), s = rms('MS', 'SS', -120), airy = 1.22 * 550e-6 * (600 / 140);   /* working f-number of the 140 mm beam */
      return { ok: p.rms < 1e-6 && s.rms / airy > 6 && s.rms / airy < 8.5, value: s.rms / airy, unit: '×', detail: { rmsParabola_um: p.rms * 1e3, rmsSphere_um: s.rms * 1e3, airyRadius_um: airy * 1e3 } };
    } }
];
PRESETS.forEach(function (p) { p.build = function () { var e = clone(p.scene()); return p.place ? p.place(e) : e; }; });

function preset(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || null; }
function check(id, els) { var p = preset(id); if (!p) return null; return p.check(els || p.build()); }

/* ------------------------------------------------------------------ geometry for drawing (table section y = 0 of every element, and 3D meshes) */
function mul3(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
function apHalf(ap) { if (!ap) return 0; return ap.type === 'circle' ? ap.r : ap.type === 'rect' ? ap.hw : 0; }
/* polylines in world (x, y) of the element's section by its own local x–z plane */
function outline(cel) {
  var Tr = TR(), lines = [], W = cel.W, P = cel.pos;
  function toW(p) { var q = mul3(W, p); return [P[0] + q[0], P[1] + q[1], P[2] + q[2]]; }
  cel.surfaces.forEach(function (s) {
    if (s.shape.type === 'barrel') return;
    var col2 = [s.R[2], s.R[5], s.R[8]];           /* surface normal in element frame */
    if (Math.abs(col2[1]) > 0.9) return;           /* top/bottom caps */
    var h = apHalf(s.ap); if (!(h > 0)) return;
    var off = s.ap && s.ap.cx ? s.ap.cx : 0, n = s.shape.c || (s.shape.A && s.shape.A.length) ? 24 : 1, pts = [];
    for (var i = 0; i <= n; i++) {
      var x = -h + 2 * h * i / n + off, z = (s.shape.c || s.shape.A) ? Tr.util.sag(s.shape, x, 0) : 0;
      var e = mul3(s.R, [x, 0, isFinite(z) ? z : 0]);
      pts.push(toW([s.o[0] + e[0], s.o[1] + e[1], s.o[2] + e[2]]));
    }
    lines.push(pts);
  });
  return lines;
}
/* closed polygon for filled glass (lens, window, plate, cube, prism) */
function body(cel) {
  var L = outline(cel), k = cel.kind;
  if ((k === 'lens' || k === 'window' || k === 'bsplate') && L.length >= 2) return L[0].concat(L[1].slice().reverse());
  if (k === 'doublet' && L.length >= 3) return L[0].concat(L[2].slice().reverse());
  if (k === 'bscube' || k === 'prism') {
    var cap = cel.surfaces.filter(function (s) { return s.ap && s.ap.type === 'poly' && Math.abs(s.R[5]) > 0.9 && s.R[5] > 0; })[0] || cel.surfaces.filter(function (s) { return s.ap && s.ap.type === 'poly'; })[0];
    if (cap) return cap.ap.pts.map(function (q) { var e = mul3(cap.R, [q[0], q[1], 0]); var w = mul3(cel.W, [cap.o[0] + e[0], 0, cap.o[2] + e[2]]); return [cel.pos[0] + w[0], cel.pos[1] + w[1], cel.pos[2] + w[2]]; });
  }
  return null;
}

/* ------------------------------------------------------------------ bill of materials */
var MOUNT = {
  lens: 'lens mount Ø', doublet: 'lens mount Ø', thinlens: 'lens mount Ø', window: 'lens mount Ø', mirror: 'kinematic mirror mount Ø', idealmirror: 'kinematic mirror mount Ø',
  bsplate: 'kinematic mirror mount', bscube: 'cube platform', prism: 'prism platform', grating: 'kinematic grating mount', polarizer: 'rotation mount Ø', waveplate: 'rotation mount Ø',
  faraday: 'isolator V-clamp', iris: 'iris holder', slit: 'slit holder', blocker: 'beam block post', screen: 'card holder', powermeter: 'sensor post', fiber: 'fibre adapter (FC/PC)', retro: 'retroreflector mount', source: 'laser / source mount'
};
function bom(els) {
  var rows = {}, posts = 0;
  (els || []).forEach(function (e) {
    var p = e.params || {}, key, item;
    if (e.enabled === false) return;
    if (p.stock && OptCore && OptCore.stock && OptCore.stock.get(p.stock)) {
      var s = OptCore.stock.get(p.stock);
      key = 'stock:' + s.id;
      item = { part: s.id, vendor: s.vendor, description: s.type + ' f = ' + s.f + ' mm, Ø ' + s.D + ' mm' + (s.glass ? ', ' + s.glass : '') + (s.coating ? ', ' + s.coating : ''), url: s.url, read: s.read, generic: false,
               spec: { stockType: s.type, f: s.f, D: s.D, glass: s.glass || [s.glass1, s.glass2].filter(Boolean).join('/'), coating: s.coating } };
    } else {
      var d = p.D || p.a || p.W || '';
      key = 'gen:' + e.kind + ':' + JSON.stringify([d, p.material, p.R, p.lpmm, p.waves, p.f]);
      item = { part: '', vendor: '', description: e.kind + (d ? ' Ø/a ' + d + ' mm' : '') + (p.material ? ', ' + p.material : '') + (p.lpmm ? ', ' + p.lpmm + ' l/mm' : '') + (p.waves ? ', ' + (p.waves === 0.25 ? 'λ/4' : p.waves === 0.5 ? 'λ/2' : p.waves + ' waves') : '') + (p.f ? ', f = ' + p.f + ' mm' : '') + (p.R ? ', R = ' + p.R + ' mm' : ''), url: '', read: '', generic: true,
               spec: { D: d || null, glass: p.material || null, lpmm: p.lpmm || null, waves: p.waves || null, f: p.f || null, R: p.R || null } };
    }
    var r = rows[key] || (rows[key] = Object.assign({ qty: 0, ids: [], kind: e.kind }, item)); r.qty++; r.ids.push(e.id);
    var mk = MOUNT[e.kind] || 'mount', md = (p.D || (p.stock && OptCore.stock.get(p.stock) || {}).D);
    var mkey = 'mount:' + mk + (md && /Ø$/.test(mk) ? md : '');
    var m = rows[mkey] || (rows[mkey] = { qty: 0, ids: [], kind: 'mount', mount: e.kind, part: '', vendor: '', description: mk + (md && /Ø$/.test(mk) ? ' ' + md + ' mm' : ''), url: '', read: '', generic: true, spec: { D: md && /Ø$/.test(mk) ? md : null } });
    m.qty++; m.ids.push(e.id); posts++;
  });
  var list = Object.keys(rows).map(function (k) { return rows[k]; });
  list.push({ qty: posts, ids: [], kind: 'post', part: '', vendor: '', description: 'Ø12.7 mm post + post holder + base (M6 / ¼-20)', url: '', read: '', generic: true, spec: {} });
  return list;
}

/* ------------------------------------------------------------------ hand-overs */
function chief(els, opts) {                         /* the strongest path of a single central ray from the first source */
  var src = (els || []).filter(function (e) { return e.kind === 'source' && e.enabled !== false; })[0];
  if (!src) return null;
  var s1 = clone(src); s1.params.n = 1; s1.params.D = 0; s1.params.pattern = 'fan'; s1.params.divergence = false;
  if (s1.params.type === 'white') { s1.params.type = 'collimated'; s1.params.lambdaNm = 587.6; delete s1.params.spectrum; }
  var others = els.filter(function (e) { return e.kind !== 'source'; });
  var r = run([s1].concat(others), Object.assign({ ghosts: false }, opts || {}));
  /* follow the segments of maximum power: each segment end is an interaction */
  var segs = [], st = r.stride || 10;
  for (var i = 0; i < r.nSeg; i++) { var b = i * st; segs.push({ a: [r.segs[b], r.segs[b + 1], r.segs[b + 2]], b: [r.segs[b + 3], r.segs[b + 4], r.segs[b + 5]], P: r.segs[b + 6], depth: r.segs[b + 8] }); }
  var path = [], at = segs.filter(function (s) { return s.depth === 0; }).sort(function (a, b) { return b.P - a.P; })[0];
  var z = 0;
  while (at && path.length < 64) {
    var L = Math.hypot(at.b[0] - at.a[0], at.b[1] - at.a[1], at.b[2] - at.a[2]);
    path.push({ a: at.a, b: at.b, z0: z, z1: z + L, P: at.P }); z += L;
    var cur = at;
    at = segs.filter(function (s) { return s.depth === cur.depth + 1 && Math.hypot(s.a[0] - cur.b[0], s.a[1] - cur.b[1], s.a[2] - cur.b[2]) < 1e-6; }).sort(function (a, b) { return b.P - a.P; })[0];
  }
  return { source: src, path: path, result: r };
}
function nearestOnPath(path, p) {
  var best = null;
  path.forEach(function (s) {
    var d = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (!(L2 > 0)) return;
    var t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * d[0] + (p[1] - s.a[1]) * d[1] + (p[2] - s.a[2]) * d[2]) / L2));
    var q = [s.a[0] + t * d[0], s.a[1] + t * d[1], s.a[2] + t * d[2]], dist = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (!best || dist < best.dist) best = { dist: dist, z: s.z0 + t * Math.sqrt(L2), seg: s };
  });
  return best;
}
function lensFocal(e, lambdaNm) {                 /* effective focal length at the source wavelength (catalogue f is at its design λ, review R-13) */
  var p = e.params || {}, Tr = TR(), lam = isFinite(lambdaNm) && lambdaNm > 0 ? lambdaNm : 587.6;
  if (e.kind === 'thinlens') return p.f;
  var st = p.stock && OptCore.stock.get(p.stock);
  if (st) {
    p = st.R3 != null ? { R1: st.R1, R2: st.R2, R3: st.R3, CT1: st.CT1, CT2: st.CT2, mat1: st.glass1, mat2: st.glass2 } : { R1: st.R1, R2: st.R2, CT: st.CT, material: st.glass, k1: st.k1 };
    if (st.R3 == null && e.kind === 'doublet') e = { kind: 'lens' };
    if (st.R3 != null) e = { kind: 'doublet' };
  }
  try {
    var surf = e.kind === 'doublet'
      ? [{ R: p.R1, t: p.CT1, material: p.mat1 }, { R: p.R2, t: p.CT2, material: p.mat2 }, { R: p.R3, t: 0, material: null }]
      : [{ R: p.R1, t: p.CT, material: p.material, k: p.k1 }, { R: p.R2, t: 0, material: null, k: p.k2 }];
    surf.forEach(function (s) { if (!s.R) s.R = 0; });
    var par = Tr.seq.paraxial({ surfaces: surf }, lam);
    if (par && isFinite(par.efl)) return Math.round(par.efl * 1000) / 1000;
    return st ? st.f : null;
  } catch (err) { return st ? st.f : null; }
}
/* gaussbeam hand-over: summary.gauss.elements = [{label, kind, z_mm, f_mm, t_mm, n, aoi, D_mm}] along the chief path */
function gaussElements(els) {
  var c = chief(els); if (!c) return { elements: [], lambda_nm: null };
  var out = [], lam0 = c.source.params.lambdaNm, lamC = c.source.params.type === 'white' ? 587.6 : (Array.isArray(lam0) ? lam0[0] : lam0);
  els.forEach(function (e) {
    if (e.kind === 'source' || e.enabled === false) return;
    var at = nearestOnPath(c.path, [e.pose.x || 0, e.pose.y || 0, e.pose.z || 0]); if (!at || at.dist > 5) return;
    var p = e.params || {}, row = null, D = p.D || (p.stock && OptCore.stock.get(p.stock) || {}).D || 25.4;
    if (e.kind === 'lens' || e.kind === 'doublet' || e.kind === 'thinlens') { var f = lensFocal(e, lamC); if (f) row = { kind: p.cyl === 'x' ? 'cylx' : p.cyl === 'y' ? 'cyly' : 'lens', f_mm: f }; }
    else if (e.kind === 'mirror' || e.kind === 'idealmirror') {
      var fm = e.kind === 'idealmirror' ? p.f : (p.R ? p.R / 2 : 0);
      var dIn = at.seg ? [at.seg.b[0] - at.seg.a[0], at.seg.b[1] - at.seg.a[1]] : [1, 0], nrm = TR().util.poseMatrix(e.pose, false);
      var nz = [nrm[2], nrm[5]], cosI = Math.abs(dIn[0] * nz[0] + dIn[1] * nz[1]) / (Math.hypot(dIn[0], dIn[1]) * Math.hypot(nz[0], nz[1]) || 1);
      if (fm) row = { kind: 'mirror', f_mm: fm, aoi: Math.round(Math.acos(Math.min(1, cosI)) / D2R * 100) / 100 };
    } else if (e.kind === 'window' || e.kind === 'bsplate') row = { kind: 'slab', t_mm: p.t || 3, n: TR().util.n(p.material || 'N-BK7', 587.6) };
    else if (e.kind === 'iris') row = { kind: 'aperture', D_mm: p.D };
    if (row) out.push(Object.assign({ label: e.id, z_mm: Math.round(at.z * 1000) / 1000, f_mm: 0, t_mm: 0, n: 1.5, aoi: 0, D_mm: D }, row));
  });
  out.sort(function (a, b) { return a.z_mm - b.z_mm; });
  var lam = c.source.params.lambdaNm;
  return { elements: out, lambda_nm: Array.isArray(lam) ? lam[0] : lam };
}
/* shared source block (lasersafety / gaussbeam): w0_mm = 1/e² waist radius, divergence_mrad = full angle */
function sourceBlock(els) {
  var s = (els || []).filter(function (e) { return e.kind === 'source' && e.enabled !== false; })[0]; if (!s) return null;
  var p = Object.assign({}, TR().KINDS.source.defaults, s.params), lam = Array.isArray(p.lambdaNm) ? p.lambdaNm[0] : p.lambdaNm;
  var kind = p.type === 'laser' ? 'laser' : p.type === 'led' ? 'led' : p.type === 'white' ? 'white' : p.type === 'point' ? 'point' : 'collimated';
  var w0 = p.type === 'laser' ? (p.w0 || (p.D ? p.D / 2 : 0.5)) : (p.D ? p.D / 2 : null);
  /* review R-1/R-13: λ travels inside the block (D-OPT-6); w0_mm is a 1/e² Gaussian radius, so a top-hat (collimated) beam gives w0_mm null and its
     diameter_mm; the power is that of this one source (element id given), other sources on the table are counted in sources */
  if (p.type !== 'laser') w0 = null;
  var nSrc = (els || []).filter(function (e) { return e.kind === 'source' && e.enabled !== false; }).length;
  var out = { kind: kind, power_W: p.P, M2: p.type === 'laser' ? (p.M2 || 1) : null, w0_mm: w0, divergence_mrad: null,
              lambda_nm: p.type === 'white' || !isFinite(lam) ? null : Number(lam), pulse: { mode: 'cw', tau_s: null, prf_Hz: null, energy_J: null },
              element: String(s.id), sources: nSrc };
  if (p.type === 'collimated' && p.D > 0) out.diameter_mm = p.D;
  if (p.type === 'laser' && w0) out.divergence_mrad = 2 * out.M2 * lam * 1e-6 / (Math.PI * w0) * 1000;
  return { source: out, lambda_nm: out.lambda_nm };
}

return { version: VERSION, PRESETS: PRESETS, preset: preset, check: check, outline: outline, body: body, bom: bom, chief: chief, gaussElements: gaussElements, sourceBlock: sourceBlock, lensFocal: lensFocal, coating: coating, effective: effective, sourceLams: sourceLams, helpers: { S: S, E: E, run: run } };
}));
