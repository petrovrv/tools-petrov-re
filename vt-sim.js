/* vt-sim.js — deterministic lift-group simulator of the Vertical Transport package (tools.petrov.re).
   VTSim: pure engine, no DOM; UMD (browser global VTSim, node module). Depends on VTCore (vt-core.js) for the
   passenger list (VTCore.passengers) and the car capacity (VTCore.carCapacity); kinematics are evaluated here with the
   same jerk-limited rest-to-rest S-curve as VTCore.flightTime (Peters 1996; CIBSE Guide D ch. 4) so that positions,
   mid-run stop decisions and flight times are consistent inside one time step.
   Strategies are TEXTBOOK group-control strategies (collective, nearest car, ETA/minimum cost, destination assignment —
   Barney "Elevator Traffic Handbook", Strakosch "The Vertical Transportation Handbook", Siikonen/KONE papers).
   Manufacturers' algorithms are proprietary; nothing here claims to reproduce one.
   Fixed time step (default 0.1 s) with exact event timing inside a step (time budget per car), seeded behaviour:
   same doc + same passenger list => identical results (A/B comparisons use ONE list). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VTSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '0.2.0';

  function core() {
    if (typeof VTCore !== 'undefined') return VTCore; /* eslint-disable-line no-undef */
    if (typeof globalThis !== 'undefined' && globalThis.VTCore) return globalThis.VTCore;
    if (typeof require === 'function') { try { return require('./vt-core.js'); } catch (e) { /* not available */ } }
    return null;
  }

  /* mulberry32 — the same generator as VTCore.rng (used here only for the per-passenger "presses both buttons" draw) */
  function rng(seed) {
    var s = (seed >>> 0) || 0x6d2b79f5;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var r = s;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------------------------
     Kinematics: rest-to-rest jerk-limited run over distance d (m) with v, a, j.
     A) rated speed reached: T = d/v + v/a' + a'/j, a' = min(a, √(v·j))
     B) speed not reached, acceleration reached: v_p from v_p² + v_p·a²/j − a·d = 0
     C) neither: v_p = (d·√j/2)^(2/3)
     --------------------------------------------------------------------------------- */
  /* shared cache, bounded (CR-30): cleared when it holds 5000 entries; each sim also keeps its own per-car tables */
  var KCACHE = {}, KCOUNT = 0, KMAX = 5000;
  function kin(d, v, a, j) {
    var key = d.toFixed(4) + '|' + v + '|' + a + '|' + j;
    var hit = KCACHE[key];
    if (hit) return hit;
    if (KCOUNT >= KMAX) { KCACHE = {}; KCOUNT = 0; }
    KCOUNT++;
    var m;
    if (!(d > 1e-9)) m = { d: 0, T: 0, x: function () { return 0; }, v: function () { return 0; } };
    else {
      var aEff = Math.min(a, Math.sqrt(v * j)), dTh = v * v / aEff + v * aEff / j, vp, ap, cruise = 0;
      if (d >= dTh) { vp = v; ap = aEff; cruise = (d - dTh) / v; }
      else if (d >= 2 * a * a * a / (j * j)) { ap = a; vp = (-a * a / j + Math.sqrt(a * a * a * a / (j * j) + 4 * a * d)) / 2; }
      else { vp = Math.pow(d * Math.sqrt(j) / 2, 2 / 3); ap = Math.sqrt(vp * j); }
      var t1 = ap / j, t2 = Math.max(0, vp / ap - ap / j);
      var spec = [[t1, j], [t2, 0], [t1, -j], [cruise, 0], [t1, -j], [t2, 0], [t1, j]];
      var segs = [], x0 = 0, v0 = 0, a0 = 0, t0 = 0;
      for (var i = 0; i < 7; i++) {
        var dt = spec[i][0], jj = spec[i][1];
        segs.push([t0, x0, v0, a0, jj]);
        x0 += v0 * dt + a0 * dt * dt / 2 + jj * dt * dt * dt / 6;
        v0 += a0 * dt + jj * dt * dt / 2;
        a0 += jj * dt;
        t0 += dt;
      }
      var T = t0;
      var seg = function (t) { for (var k = 6; k >= 0; k--) if (t >= segs[k][0]) return segs[k]; return segs[0]; };
      m = {
        d: d, T: T, vp: vp,
        x: function (t) {
          if (t <= 0) return 0; if (t >= T) return d;
          var s = seg(t), u = t - s[0];
          return Math.min(d, Math.max(0, s[1] + s[2] * u + s[3] * u * u / 2 + s[4] * u * u * u / 6));
        },
        v: function (t) {
          if (t <= 0 || t >= T) return 0;
          var s = seg(t), u = t - s[0];
          return Math.max(0, s[2] + s[3] * u + s[4] * u * u / 2);
        }
      };
    }
    KCACHE[key] = m;
    return m;
  }

  /* 7-language labels for pages */
  function L(en, uk, de, nl, fr, es, pl) { return { en: en, uk: uk, de: de, nl: nl, fr: fr, es: es, pl: pl }; }
  var DISPATCHERS = {
    collective: { label: L('Directional collective', 'Спрямований збірний', 'Richtungssammelsteuerung', 'Richtingsafhankelijke verzamelbesturing', 'Collectif sélectif', 'Colectivo selectivo', 'Zbiorcze kierunkowe'),
      note: L('every car answers the calls ahead in its direction (classic relay logic)', 'кожна кабіна обслуговує виклики попереду за своїм напрямком (класична релейна логіка)',
        'jede Kabine bedient die Rufe vor ihr in Fahrtrichtung (klassische Relaislogik)', 'elke kooi bedient de oproepen vóór haar in haar rijrichting (klassieke relaislogica)',
        'chaque cabine dessert les appels devant elle dans son sens (logique à relais classique)', 'cada cabina atiende las llamadas por delante en su sentido (lógica clásica de relés)',
        'każda kabina obsługuje wezwania przed sobą w swoim kierunku (klasyczna logika przekaźnikowa)') },
    nearest: { label: L('Nearest car', 'Найближча кабіна', 'Nächste Kabine', 'Dichtstbijzijnde kooi', 'Cabine la plus proche', 'Cabina más cercana', 'Najbliższa kabina'),
      note: L('each hall call goes to the car closest in distance, ignoring direction and committed stops', 'кожен поверховий виклик отримує найближча за відстанню кабіна, без урахування напрямку та вже призначених зупинок',
        'jeder Etagenruf geht an die räumlich nächste Kabine, ohne Richtung und zugesagte Halte', 'elke etage-oproep gaat naar de kooi die het dichtst bij is, zonder rekening te houden met richting en geplande stops',
        'chaque appel palier va à la cabine la plus proche en distance, sans tenir compte du sens ni des arrêts engagés', 'cada llamada de rellano va a la cabina más cercana en distancia, sin considerar sentido ni paradas comprometidas',
        'każde wezwanie z przystanku dostaje kabina najbliższa odległościowo, bez uwzględnienia kierunku i zaplanowanych zatrzymań') },
    eta: { label: L('ETA / minimum cost', 'ETA / мінімальна вартість', 'ETA / minimale Kosten', 'ETA / minimale kosten', 'ETA / coût minimal', 'ETA / coste mínimo', 'ETA / minimalny koszt'),
      note: L('each hall call goes to the car with the shortest estimated time of arrival incl. its committed stops; re-allocated while better', 'виклик отримує кабіна з найменшим розрахунковим часом прибуття з урахуванням її зупинок; перепризначається, поки є краща',
        'jeder Ruf geht an die Kabine mit der kürzesten geschätzten Ankunftszeit inkl. zugesagter Halte; Umverteilung solange besser', 'elke oproep gaat naar de kooi met de kortste geschatte aankomsttijd incl. geplande stops; herverdeeld zolang beter',
        'chaque appel va à la cabine ayant le plus court temps d’arrivée estimé, arrêts engagés compris ; réaffecté tant que c’est mieux', 'cada llamada va a la cabina con el menor tiempo estimado de llegada incl. sus paradas; se reasigna mientras mejore',
        'wezwanie dostaje kabina o najkrótszym szacowanym czasie przyjazdu z uwzględnieniem jej zatrzymań; przydział zmieniany, dopóki jest lepszy') },
    dcs: { label: L('Destination control', 'Керування за пунктом призначення', 'Zielwahlsteuerung', 'Bestemmingskeuzesturing', 'Contrôle de destination', 'Control de destino', 'Sterowanie z wyborem celu'),
      note: L('the passenger keys in the destination at the hall and is told the car; the system groups people going to the same floors', 'пасажир вводить поверх призначення на поверсі й отримує літеру кабіни; система групує людей до однакових поверхів',
        'der Fahrgast gibt das Ziel am Etagenterminal ein und erhält die Kabine; das System bündelt gleiche Ziele', 'de passagier toetst de bestemming in op de etage en krijgt de kooi te zien; het systeem groepeert gelijke bestemmingen',
        'le passager saisit sa destination au palier et reçoit la lettre de la cabine ; le système regroupe les mêmes destinations', 'el pasajero marca el destino en el rellano y recibe la letra de la cabina; el sistema agrupa destinos iguales',
        'pasażer wybiera piętro docelowe na przystanku i dostaje literę kabiny; system grupuje osoby jadące na te same piętra') }
  };

  var EPS = 1e-6;

  function num(x, d) { x = +x; return isFinite(x) ? x : d; }

  /* -------------------------------------------------------------------------------- build */
  function build(doc, opts) {
    opts = opts || {};
    var C = core();
    var B = (doc && doc.building) || {};
    var floors = (B.floors || []).map(function (f, i) { return { id: f.id != null ? String(f.id) : 'F' + i, level: num(f.level_m, i * 3.5), role: f.role || '', entrance: !!f.entrance, share: num(f.entrance_share, f.entrance ? 1 : 0) }; });
    var nF = floors.length;
    if (nF < 2) throw new Error('VTSim: the building needs at least 2 floors');
    var fIndex = {}; floors.forEach(function (f, i) { fIndex[f.id] = i; });
    var levels = floors.map(function (f) { return f.level; });
    var traffic = (doc && doc.traffic) || {};
    var transfer = Math.max(0.1, num(traffic.transfer_s, 1.2));
    var capFn = (C && C.carCapacity) ? C.carCapacity : function (q) { return Math.floor(q / 75 + 1e-9); };

    var groups = (doc.groups || []).map(function (g, gi) {
      var served = new Array(nF).fill(false);
      var list = (g.served && g.served.length) ? g.served : floors.map(function (f) { return f.id; });
      list.forEach(function (id) { var k = typeof id === 'number' ? id : fIndex[id]; if (k != null && k >= 0 && k < nF) served[k] = true; });
      var idx = []; for (var k = 0; k < nF; k++) if (served[k]) idx.push(k);
      /* main terminal: one definition with VTCore.mainTerminal (D-VT-13: role lobby first, else the largest entrance_share) */
      var lobby = -1, best = -1;
      if (C && C.mainTerminal) { var mt = C.mainTerminal(doc, g); if (mt >= 0 && served[mt]) lobby = mt; }
      if (lobby < 0) {
        idx.forEach(function (k) { if (floors[k].role === 'lobby' && lobby < 0) lobby = k; });
        if (lobby < 0) idx.forEach(function (k) { if (floors[k].entrance && floors[k].share > best) { best = floors[k].share; lobby = k; } });
      }
      if (lobby < 0) lobby = idx[0];
      var callSys = ({ single: 1, updown: 1, dcs: 1 })[g.call_system] ? g.call_system : 'updown';
      var disp = DISPATCHERS[g.dispatch] ? g.dispatch : 'collective';
      if (callSys === 'dcs') disp = 'dcs';
      else if (disp === 'dcs') disp = 'eta';
      var G = {
        gi: gi, id: g.id != null ? String(g.id) : String.fromCharCode(65 + gi), served: served, idx: idx, lobby: lobby,
        callSys: callSys, disp: disp, parking: ({ lobby: 1, distributed: 1, stay: 1 })[g.parking] ? g.parking : 'lobby',
        loadLimit: Math.min(1, Math.max(0.2, num(g.load_limit, 0.8))),
        calls: { up: new Array(nF).fill(null), dn: new Array(nF).fill(null), any: new Array(nF).fill(null) },
        waiting: [], cars: []
      };
      for (var w = 0; w < nF; w++) G.waiting.push([]);
      (g.cars || []).forEach(function (c, ci) {
        var cc = Math.max(1, capFn(num(c.rated_load_kg, 1000)));
        var home = c.home != null && fIndex[c.home] != null && served[fIndex[c.home]] ? fIndex[c.home] : lobby;
        var car = {
          id: c.id != null ? String(c.id) : G.id + (ci + 1), g: G, ci: ci,
          v: Math.max(0.1, num(c.speed, 1.6)), a: Math.max(0.1, num(c.accel, 0.8)), j: Math.max(0.1, num(c.jerk, 1.2)),
          tOpen: Math.max(0, num(c.door_open_s, 2)), tClose: Math.max(0, num(c.door_close_s, 3)), tStart: Math.max(0, num(c.start_delay_s, 0.5)),
          tDwell: Math.max(0, num(c.door_dwell_s, 2)), inService: c.in_service !== false,
          cc: cc, capBoard: Math.max(1, Math.round(G.loadLimit * cc)), home: home,
          pos: levels[home], fi: home, speed: 0, dir: 0, lamp: 0, state: 'idle', rem: 0, door: 0,
          trip: null, onboard: [], stop: new Array(nF).fill(false), pu: new Array(nF).fill(0), pd: new Array(nF).fill(0),
          openStart: 0, fullOpenAt: 0, depDir: 0, xfers: 0, seenVer: -1, parking: false,
          bq: {}, bno: {}, starts: 0, stops: 0, falseStops: 0, km: 0, wStarts: 0, wTrips: 0, wKm: 0, served: 0, loadSum: 0, deps: 0, loadHist: new Array(10).fill(0), assignedWaiting: 0
        };
        G.cars.push(car);
      });
      return G;
    });
    if (!groups.length) throw new Error('VTSim: no lift group');

    /* passengers */
    var raw = opts.passengers;
    if (!raw) {
      if (!C || !C.passengers) throw new Error('VTSim: no passenger list and VTCore.passengers is not available');
      raw = C.passengers(doc, opts.seed == null ? 1 : opts.seed);
    }
    var both = Math.min(1, Math.max(0, num(traffic.both_buttons_share, 0)));
    var r = rng(((opts.seed == null ? 1 : opts.seed) ^ 0x5bd1e995) >>> 0);
    var gIndex = {}; groups.forEach(function (G) { gIndex[G.id] = G.gi; });
    var pax = [];
    raw.forEach(function (p, k) {
      var o = typeof p.origin === 'number' ? p.origin : fIndex[p.origin];
      var d = typeof p.dest === 'number' ? p.dest : fIndex[p.dest];
      var bothDraw = r(); /* drawn for every passenger so the list stays aligned between A and B */
      if (o == null || d == null || o === d || !(o >= 0 && o < nF && d >= 0 && d < nF)) return;
      var P = { id: p.id != null ? p.id : k, t: num(p.t, 0), origin: o, dest: d, cur: o, legDest: d, g: null, legs: [],
        dir: 0, both: typeof p.both === 'boolean' ? p.both : bothDraw < both, car: null, state: 0, legT: num(p.t, 0), wait: 0, transit: 0, boardT: null, alightT: null,
        legOpen: 0, firstBoard: null, carId: null, represses: 0 };
      /* group: the requested one if it serves both floors, else the first that does, else a two-leg trip via a shared entrance floor */
      var gpref = p.group != null ? (typeof p.group === 'number' ? p.group : gIndex[p.group]) : null;
      var serves = function (G, a, b) { return G.served[a] && G.served[b] && G.cars.length; };
      var G0 = (gpref != null && groups[gpref] && serves(groups[gpref], o, d)) ? groups[gpref] : null;
      if (!G0) for (var q = 0; q < groups.length; q++) if (serves(groups[q], o, d)) { G0 = groups[q]; break; }
      if (G0) P.legs = [[G0.gi, o, d]];
      else {
        var found = null;
        for (var a1 = 0; a1 < groups.length && !found; a1++) for (var b1 = 0; b1 < groups.length && !found; b1++) {
          if (a1 === b1) continue;
          var GA = groups[a1], GB = groups[b1];
          if (!GA.served[o] || !GB.served[d]) continue;
          var tf = -1, bs = -1;
          for (var f = 0; f < nF; f++) if (GA.served[f] && GB.served[f] && f !== o && f !== d) { var sc = (floors[f].entrance ? 10 : 0) + floors[f].share; if (sc > bs) { bs = sc; tf = f; } }
          if (tf >= 0) found = [[a1, o, tf], [b1, tf, d]];
        }
        if (!found) { P.unservable = true; P.legs = []; }
        else P.legs = found;
      }
      pax.push(P);
    });
    pax.sort(function (x, y) { return x.t - y.t || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0); });

    return { floors: floors, levels: levels, nF: nF, groups: groups, cars: [].concat.apply([], groups.map(function (G) { return G.cars; })),
      pax: pax, transfer: transfer, dt: Math.max(0.01, num(opts.dt, 0.1)), drain: num(opts.drain_s, 1800), maxT: opts.max_t,
      recordQueue: opts.recordQueue !== false,
      /* arrival window (D-VT-5): opts.window_s, else traffic.duration_min, else the last arrival */
      windowS: opts.window_s != null ? num(opts.window_s, 0) : (traffic.duration_min != null ? 60 * num(traffic.duration_min, 0) : null) };
  }

  /* -------------------------------------------------------------------------------- simulator */
  function create(doc, opts) {
    opts = opts || {};
    var W = build(doc, opts);
    var levels = W.levels, nF = W.nF, groups = W.groups, cars = W.cars, pax = W.pax, dt = W.dt;
    var now = 0, tick = 0, nextPax = 0, ver = 0, events = [], doneCount = 0, unservable = 0;
    var lastArrival = pax.length ? pax[pax.length - 1].t : 0;
    var endT = W.maxT != null ? W.maxT : lastArrival + W.drain;
    var winEnd = W.windowS != null ? W.windowS : lastArrival;
    function inWin(t) { return t <= winEnd + 1e-9; }
    var waitingAll = [];       /* passengers currently waiting at a hall */
    var queueSamples = [];     /* [t, waitingCount] each second */
    pax.forEach(function (P) { if (P.unservable) unservable++; });

    function ev(type, car, fi, extra) {
      var e = { t: now, type: type, car: car ? car.id : null, floorIdx: fi };
      if (extra) for (var k in extra) e[k] = extra[k];
      events.push(e);
      if (events.length > 400) events.splice(0, events.length - 200);
    }
    function bump() { ver++; }

    /* ---------- hall-call bookkeeping */
    function callAt(G, fi, d) { return d > 0 ? G.calls.up[fi] : d < 0 ? G.calls.dn[fi] : G.calls.any[fi]; }
    function setCall(G, fi, d, c) { if (d > 0) G.calls.up[fi] = c; else if (d < 0) G.calls.dn[fi] = c; else G.calls.any[fi] = c; }
    function register(G, fi, d) {
      if (G.callSys === 'single') d = 0;
      var c = callAt(G, fi, d);
      if (c) return c;
      c = { fi: fi, dir: d, t: now, car: null, claim: null };
      setCall(G, fi, d, c);
      if (G.disp === 'nearest') assignNearest(G, c);
      else if (G.disp === 'eta') assignEta(G, c, false);
      ev('call', null, fi, { dir: d, group: G.id });
      bump();
      return c;
    }
    function clearCall(G, fi, d) {
      var c = callAt(G, fi, d);
      if (c) { setCall(G, fi, d, null); bump(); }
    }
    function full(car) { return car.onboard.length >= car.capBoard; }

    /* does this car have hall work at floor fi in direction d (d = 0: any direction)? */
    function hallHere(car, fi, d, strict) {
      var G = car.g;
      if (full(car)) return false;
      if (G.disp === 'dcs') return d > 0 ? car.pu[fi] > 0 : d < 0 ? car.pd[fi] > 0 : (car.pu[fi] > 0 || car.pd[fi] > 0);
      var own = function (c) {
        if (!c) return false;
        if (G.disp === 'collective') return strict ? (c.claim == null || c.claim === car) : true;
        if (c.car === car) return true;
        /* main-terminal rule: a car standing at the main entrance floor may always answer its up call */
        return fi === G.lobby && c.dir >= 0 && car.state !== 'move' && Math.abs(car.pos - levels[fi]) < EPS;
      };
      if (G.callSys === 'single') return own(G.calls.any[fi]);
      if (d > 0) return own(G.calls.up[fi]);
      if (d < 0) return own(G.calls.dn[fi]);
      return own(G.calls.up[fi]) || own(G.calls.dn[fi]);
    }
    function sameDirHall(car, fi, d) {
      if (car.g.callSys === 'single') return hallHere(car, fi, 0, false);
      return hallHere(car, fi, d, false);
    }
    function oppDirHall(car, fi, d) {
      if (car.g.callSys === 'single') return false;
      return hallHere(car, fi, -d, true);
    }
    function demandAhead(car, fromFi, d) {
      var G = car.g;
      if (!d) return false;
      for (var k = fromFi + d; k >= 0 && k < nF; k += d) {
        if (!G.served[k]) continue;
        if (car.stop[k] || hallHere(car, k, 0, true) || (car.g.disp === 'collective' && sameDirHall(car, k, d))) return true;
      }
      return false;
    }

    /* SCAN choice of the next stop. moving: only floors that pass feasible(fi). Returns {fi, dir} or null */
    function nextTarget(car, feasible) {
      var G = car.g, p = car.pos, D = car.dir, k;
      var moving = !!feasible;
      if (D === 0) {
        var bestK = -1, bestD = Infinity;
        for (k = 0; k < nF; k++) {
          if (!G.served[k]) continue;
          if (car.stop[k] || hallHere(car, k, 0, true)) { var dd = Math.abs(levels[k] - p); if (dd < bestD - EPS) { bestD = dd; bestK = k; } }
        }
        if (bestK < 0) return null;
        if (bestD < EPS) return { fi: bestK, dir: 0 };
        D = levels[bestK] > p ? 1 : -1;
      }
      var passes = moving ? [D] : [D, -D];
      for (var pi = 0; pi < passes.length; pi++) {
        var d = passes[pi];
        var start = nearestAhead(p, d);
        for (k = start; k >= 0 && k < nF; k += d) {
          if (!G.served[k]) continue;
          if (moving && !feasible(k)) continue;
          if (car.stop[k] || sameDirHall(car, k, d)) return { fi: k, dir: d };
        }
        /* reversal point: the farthest opposite-direction call ahead */
        for (k = d > 0 ? nF - 1 : 0; d > 0 ? k >= start : k <= start; k -= d) {
          if (k < 0 || k >= nF || !G.served[k]) continue;
          if (moving && !feasible(k)) continue;
          if (oppDirHall(car, k, d)) return { fi: k, dir: d, rev: true };
        }
      }
      return null;
    }
    function nearestAhead(p, d) {
      if (d > 0) { for (var k = 0; k < nF; k++) if (levels[k] > p + EPS) return k; return nF; }
      for (var k2 = nF - 1; k2 >= 0; k2--) if (levels[k2] < p - EPS) return k2; return -1;
    }

    function parkTarget(car) {
      var G = car.g;
      if (G.parking === 'stay') return null;
      if (G.parking === 'lobby') return G.lobby;
      var act = G.cars.filter(function (c) { return c.inService; });
      var m = act.indexOf(car), n = act.length;
      if (m < 0 || !G.idx.length) return null;
      if (m === 0) return G.lobby;
      var others = G.idx.filter(function (k) { return k !== G.lobby; });
      if (!others.length) return G.lobby;
      return others[Math.min(others.length - 1, Math.floor((m - 0.5) * others.length / Math.max(1, n - 1)))];
    }

    /* ---------- estimates for ETA / DCS dispatch */
    function tStop(car) { return car.tOpen + car.tClose + car.tDwell + car.tStart + W.transfer + (car.v / car.a + car.a / car.j) * 0.5; }
    /* floor-to-floor run of a car (cached table) */
    function kff(car, i, j) {
      var tb = car.kt || (car.kt = new Array(nF * nF));
      var m = tb[i * nF + j];
      if (!m) m = tb[i * nF + j] = kin(Math.abs(levels[j] - levels[i]), car.v, car.a, car.j);
      return m;
    }
    function travel(car, i, j) { return kff(car, i, j).T; }
    /* committed stops of a car (car calls + its hall work), cached per state version */
    function isStop(car, k) {
      if (car.maskVer !== ver) {
        var m = car.mask || (car.mask = new Array(nF));
        for (var q = 0; q < nF; q++) m[q] = car.stop[q] || car.pu[q] > 0 || car.pd[q] > 0 || hallHere(car, q, 0, false);
        car.maskVer = ver;
      }
      return car.mask[k];
    }
    function stateRemain(car) {
      switch (car.state) {
        case 'opening': return car.rem + car.tDwell + car.tClose + car.tStart;
        case 'xfer': case 'dwell': return Math.max(car.rem, 0) + car.tDwell * 0.5 + car.tClose + car.tStart;
        case 'closing': return car.rem + car.tStart;
        case 'start': return car.rem;
        default: return 0;
      }
    }
    /* estimated time for the car to reach hall (fi, d), sweeping through its committed stops */
    function etaTo(car, fi, d) {
      var t = stateRemain(car), cur, curDir = car.dir, from;
      if (car.state === 'move' && car.trip) { from = car.trip.toFi; t += Math.max(0, car.trip.m.T - car.trip.el); if (car.trip.toFi !== fi && isStop(car, car.trip.toFi)) t += tStop(car); }
      else from = car.fi;
      cur = levels[from];
      if (curDir === 0) curDir = levels[fi] > cur + EPS ? 1 : levels[fi] < cur - EPS ? -1 : (d || 1);
      if (Math.abs(levels[fi] - cur) < EPS && (d === 0 || d === curDir || car.state === 'idle')) return t;
      var pos = from;
      for (var leg = 0; leg < 3; leg++) {
        var ahead = curDir > 0 ? levels[fi] > levels[pos] + EPS : levels[fi] < levels[pos] - EPS;
        if (ahead && (d === 0 || d === curDir)) {
          var n = 0;
          for (var k = pos + curDir; k !== fi; k += curDir) if (isStop(car, k)) n++;
          return t + travel(car, pos, fi) + n * tStop(car);
        }
        var end = -1, cnt = 0;
        for (var k2 = pos + curDir; k2 >= 0 && k2 < nF; k2 += curDir) if (isStop(car, k2) || k2 === fi) { end = k2; cnt++; }
        if (end >= 0) {
          t += travel(car, pos, end) + Math.max(0, cnt - 1) * tStop(car);
          if (end !== fi || d !== -curDir) t += tStop(car);
          pos = end;
          if (end === fi) return t;
        }
        curDir = -curDir;
      }
      return t + travel(car, pos, fi);
    }
    function loadPenalty(car) {
      var exp = car.onboard.length + car.assignedWaiting;
      return exp >= car.capBoard ? 40 : 0;
    }
    /* nearest car among the in-service cars that are not full; if all are full, the nearest in-service car regardless of
       load (it answers after unloading). CR-1: a call is never left without a car while one is in service. */
    function assignNearest(G, c) {
      var best = null, bd = Infinity, any = null, ad = Infinity;
      G.cars.forEach(function (car) {
        if (!car.inService) return;
        var dd = Math.abs(car.pos - levels[c.fi]);
        if (dd < ad - EPS) { ad = dd; any = car; }
        if (full(car)) return;
        if (dd < bd - EPS) { bd = dd; best = car; }
      });
      c.car = best || any;
    }
    function assignEta(G, c, re) {
      var best = null, bc = Infinity, curCost = Infinity, cs = G.cars;
      for (var i = 0; i < cs.length; i++) {
        var car = cs[i];
        if (!car.inService) continue;
        var cost = etaTo(car, c.fi, c.dir) + loadPenalty(car);
        if (car === c.car) curCost = cost;
        if (cost < bc - 1e-9) { bc = cost; best = car; }
      }
      if (!re || !c.car) { c.car = best; return; }
      if (best && best !== c.car && bc < curCost - 3) { c.car = best; bump(); }
    }
    /* ETA groups re-evaluate uncommitted calls every second (reallocation until the car is running to the call) */
    function reallocate() {
      for (var gi = 0; gi < groups.length; gi++) {
        var G = groups[gi];
        if (G.disp === 'nearest') { reallocNearest(G); continue; }
        if (G.disp !== 'eta') continue;
        var lists = [G.calls.up, G.calls.dn, G.calls.any];
        for (var li = 0; li < 3; li++) {
          var arr = lists[li];
          for (var k = 0; k < nF; k++) {
            var c = arr[k];
            if (!c) continue;
            var a = c.car;
            if (a && a.fi === c.fi && a.state !== 'move' && a.state !== 'idle') continue; /* being served now */
            if (a && a.state === 'move' && a.trip && a.trip.toFi === c.fi) {
              /* committed: only a car standing idle at that floor may take it over */
              for (var q = 0; q < G.cars.length; q++) {
                var o = G.cars[q];
                if (o !== a && o.inService && o.state === 'idle' && o.fi === c.fi && !full(o)) { c.car = o; bump(); break; }
              }
              continue;
            }
            assignEta(G, c, true);
          }
        }
      }
    }
    /* nearest-car groups: calls without a car, or whose car went out of service, are allocated again every second */
    function reallocNearest(G) {
      [G.calls.up, G.calls.dn, G.calls.any].forEach(function (arr) {
        for (var k = 0; k < nF; k++) {
          var c = arr[k];
          if (c && (!c.car || !c.car.inService)) { var was = c.car; assignNearest(G, c); if (c.car !== was) bump(); }
        }
      });
    }
    /* destination control: the passenger is allocated to a car AND to one of its future trips from this floor
       ("batch"); the cost is the passenger's own waiting + transit time plus the delay that an extra stop would cause
       to everyone already allocated to that trip — this is what groups people with the same destination. */
    function rttEst(car) {
      var G = car.g, lo = G.idx[0], hi = G.idx[G.idx.length - 1];
      return 2 * travel(car, lo, hi) + 4 * tStop(car) + 2 * car.capBoard * W.transfer;
    }
    function assignDcs(G, P) {
      var o = P.cur, de = P.legDest, d = P.dir, key = o + ':' + d, best = null, bestB = null, bc = Infinity;
      G.cars.forEach(function (car) {
        if (!car.inService) return;
        var list = car.bq[key] || [], cur = car.bno[key] || 0;
        var cands = list.filter(function (b) { return b.size < car.capBoard; });
        cands.push({ no: list.length ? list[list.length - 1].no + 1 : cur, n: 0, size: 0, dests: null, fresh: true });
        var w0 = etaTo(car, o, d), rt = rttEst(car), tr0 = travel(car, o, de), ts = tStop(car);
        cands.forEach(function (b) {
          var k = Math.max(0, b.no - cur), between = 0, pen = 0;
          for (var x = o + d; x !== de; x += d) if ((b.dests && b.dests[x] > 0) || (k === 0 && car.stop[x])) between++;
          var transit = tr0 + between * ts;
          if (!(b.dests && b.dests[de] > 0)) {
            pen += ts * b.size;
            if (k === 0 && !car.stop[de]) pen += ts * car.onboard.length;
          }
          var cost = w0 + k * rt + transit + pen;
          if (cost < bc - 1e-9) { bc = cost; best = car; bestB = b; }
        });
      });
      if (!best) return;
      var list2 = best.bq[key] || (best.bq[key] = []);
      if (bestB.fresh) { bestB = { no: bestB.no, n: 0, size: 0, dests: new Array(nF).fill(0) }; list2.push(bestB); }
      bestB.n++; bestB.size++; bestB.dests[de]++;
      P.car = best; P.batch = bestB;
      if (d > 0) best.pu[o]++; else best.pd[o]++;
      best.assignedWaiting++;
      ev('assign', best, o, { pax: P.id, dest: de });
      bump();
    }
    function dcsAfterClose(car, fi) {
      [1, -1].forEach(function (d) {
        var key = fi + ':' + d, list = car.bq[key];
        if (!list) return;
        var last = list.length ? list[list.length - 1].no : 0;
        for (var i = list.length - 1; i >= 0; i--) if (list[i].n <= 0) list.splice(i, 1);
        car.bno[key] = list.length ? list[0].no : last + 1;
      });
    }

    /* ---------- passengers */
    function startLeg(P) {
      var leg = P.legs[0];
      var G = groups[leg[0]];
      P.g = G; P.cur = leg[1]; P.legDest = leg[2]; P.dir = levels[leg[2]] > levels[leg[1]] ? 1 : -1;
      P.legT = now; P.car = null; P.state = 1;
      G.waiting[P.cur].push(P);
      waitingAll.push(P);
      if (G.callSys === 'dcs') assignDcs(G, P);
      else {
        register(G, P.cur, P.dir);
        if (P.both && G.callSys === 'updown') {
          var od = -P.dir, k = P.cur + od, ok = false;
          for (; k >= 0 && k < nF; k += od) if (G.served[k]) { ok = true; break; }
          if (ok) register(G, P.cur, od);
        }
      }
    }
    function arrivals() {
      while (nextPax < pax.length && pax[nextPax].t <= now + 1e-9) {
        var P = pax[nextPax++];
        if (P.unservable) continue;
        startLeg(P);
      }
    }

    /* ---------- car state machine */
    function decideDir(car, fi) {
      var D = car.dir;
      if (D !== 0) {
        if (demandAhead(car, fi, D) || hallHere(car, fi, D, false) || (car.g.callSys === 'single' && hallHere(car, fi, 0, false))) return D;
        if (hallHere(car, fi, -D, false) || demandAhead(car, fi, -D)) return -D;
        return 0;
      }
      var cu = car.g.callSys === 'single' ? null : (car.g.disp === 'dcs' ? (car.pu[fi] > 0 ? { t: 0 } : null) : car.g.calls.up[fi]);
      var cd = car.g.callSys === 'single' ? null : (car.g.disp === 'dcs' ? (car.pd[fi] > 0 ? { t: 1 } : null) : car.g.calls.dn[fi]);
      /* CR-19: a car level at the floor ignores another car's claim on a call at this floor */
      if (cu && hallHere(car, fi, 1, false) && (!cd || !hallHere(car, fi, -1, false) || cu.t <= cd.t)) return 1;
      if (cd && hallHere(car, fi, -1, false)) return -1;
      if (demandAhead(car, fi, 1)) return 1;
      if (demandAhead(car, fi, -1)) return -1;
      return 0;
    }
    function wantsOpen(car, fi) {
      if (car.stop[fi]) return true;
      var D = car.dir;
      if (car.g.callSys === 'single') return hallHere(car, fi, 0, D === 0);
      /* CR-19: the car is level at the floor (idle, or arriving and reversing): another car's claim does not keep its doors shut */
      if (D === 0) return hallHere(car, fi, 0, false);
      if (hallHere(car, fi, D, false)) return true;
      return !demandAhead(car, fi, D) && hallHere(car, fi, -D, false);
    }
    function beginOpen(car) {
      var fi = car.fi, G = car.g;
      car.dir = decideDir(car, fi);
      car.lamp = car.dir;
      car.stop[fi] = false;
      if (G.disp !== 'dcs') {
        if (G.callSys === 'single') clearCall(G, fi, 0);
        else if (car.dir !== 0) clearCall(G, fi, car.dir);
      }
      car.state = 'opening'; car.rem = car.tOpen; car.openStart = now; car.xfers = 0; car.stops++;
      car.parking = false;
      ev('open', car, fi, { dir: car.dir });
      bump();
    }
    function boardable(car, P) {
      var G = car.g;
      if (G.callSys === 'dcs') return P.car === car && (car.dir === 0 || P.dir === car.dir) && (!P.batch || P.batch.no <= (car.bno[P.cur + ':' + P.dir] || 0));
      if (G.callSys === 'single') return true;
      return car.dir === 0 || P.dir === car.dir;
    }
    /* one transfer (alight first, then board). returns true if a transfer started */
    function nextTransfer(car, tEv) {
      var fi = car.fi, i;
      for (i = 0; i < car.onboard.length; i++) {
        var P = car.onboard[i];
        if (P.legDest === fi) {
          car.onboard.splice(i, 1);
          P.transit += car.openStart - P.legOpen;
          P.legs.shift();
          car.served++;
          car.xfers++;
          car.rem = W.transfer;
          if (!P.legs.length) { P.state = 3; P.alightT = tEv + W.transfer; doneCount++; ev('alight', car, fi, { pax: P.id }); }
          else { P.state = 4; P.resumeAt = tEv + W.transfer; pendingTransfer.push(P); ev('alight', car, fi, { pax: P.id, transfer: true }); }
          bump();
          return true;
        }
      }
      if (full(car)) return false;
      var Q = car.g.waiting[fi];
      for (i = 0; i < Q.length; i++) {
        var R = Q[i];
        if (!boardable(car, R)) continue;
        if (car.dir === 0) { car.dir = R.dir; car.lamp = R.dir; if (car.g.callSys === 'updown' && car.g.disp !== 'dcs') clearCall(car.g, fi, R.dir); }
        Q.splice(i, 1);
        var wi = waitingAll.indexOf(R); if (wi >= 0) waitingAll.splice(wi, 1);
        /* waiting time = registration -> doors of the car begin to open (0 if the doors were already open) */
        R.wait += Math.max(0, car.openStart - R.legT);
        R.legOpen = Math.max(car.openStart, R.legT);
        if (R.boardT == null) R.boardT = tEv;
        R.carId = R.carId ? R.carId + '+' + car.id : car.id;
        R.represses += car.openStart - R.legT > 30 ? Math.floor((car.openStart - R.legT - 30) / 10) + 1 : 0;
        R.state = 2;
        if (car.g.disp === 'dcs' && R.car === car) { if (R.dir > 0) car.pu[fi]--; else car.pd[fi]--; car.assignedWaiting--; if (R.batch) R.batch.n--; }
        car.onboard.push(R);
        car.stop[R.legDest] = true;
        if (car.g.callSys === 'single' && car.dir !== 0 && ((levels[R.legDest] - levels[fi]) * car.dir < 0) && !demandAhead(car, fi, car.dir)) { car.dir = -car.dir; car.lamp = car.dir; }
        car.xfers++;
        car.rem = W.transfer;
        ev('board', car, fi, { pax: R.id });
        bump();
        return true;
      }
      return false;
    }
    function reopenable(car) {
      if (full(car)) return false;
      var Q = car.g.waiting[car.fi];
      for (var i = 0; i < Q.length; i++) if (boardable(car, Q[i])) return true;
      return false;
    }
    function afterClose(car) {
      var fi = car.fi, G = car.g;
      if (car.xfers === 0) car.falseStops++;
      if (G.disp === 'dcs') dcsAfterClose(car, fi);
      /* passengers left behind (car full or wrong way) keep / re-register their call */
      if (G.callSys !== 'dcs') {
        [1, -1, 0].forEach(function (d) {   /* a call registered while the doors were open must not stay with the leaving car */
          var c = callAt(G, fi, d);
          if (c && (c.car === car || c.claim === car)) { setCall(G, fi, d, null); bump(); }
        });
        var Q = G.waiting[fi];
        for (var i = 0; i < Q.length; i++) register(G, fi, G.callSys === 'single' ? 0 : Q[i].dir);
      }
      car.state = 'idle'; car.rem = 0; car.door = 0;
      if (car.onboard.length === 0 && !demandAhead(car, fi, car.dir)) car.dir = 0;
      car.seenVer = -1;
    }
    function depart(car, target, parking) {
      car.state = 'start'; car.rem = car.tStart; car.pendingTarget = target; car.parking = !!parking;
      if (car.dir === 0 || parking) car.dir = levels[target] > car.pos ? 1 : -1;
    }
    function beginTrip(car, target) {
      var d = Math.abs(levels[target] - car.pos);
      car.trip = { fromPos: car.pos, fromFi: car.fi, toFi: target, sgn: levels[target] > car.pos ? 1 : -1, m: kff(car, car.fi, target), el: 0 };
      car.dir = car.trip.sgn;
      car.state = 'move'; car.starts++; car.deps++;
      if (inWin(now)) { car.wStarts++; car.wTrips++; }
      car.loadSum += car.onboard.length;
      car.loadHist[Math.min(9, Math.floor(10 * car.onboard.length / car.cc))]++;
      ev('depart', car, car.fi, { to: target, load: car.onboard.length });
    }
    /* can the running trip be re-targeted to floor k (same origin) without a jump in position/speed? */
    function feasibleFor(car) {
      var tr = car.trip;
      return function (k) {
        var dk = (levels[k] - tr.fromPos) * tr.sgn;
        if (dk <= EPS) return false;
        if (k === tr.toFi) return true;
        var mk = kff(car, tr.fromFi, k);
        if (tr.el > mk.T) return false;
        return Math.abs(mk.x(tr.el) - tr.m.x(tr.el)) < 2e-3 && Math.abs(mk.v(tr.el) - tr.m.v(tr.el)) < 2e-3;
      };
    }
    function retarget(car) {
      var tr = car.trip;
      var f = feasibleFor(car);
      var nt = nextTarget(car, f);
      var want = nt ? nt.fi : null;
      if (want == null) {
        if (isStop(car, tr.toFi) || car.parking) return;
        var pk = parkTarget(car);
        if (pk != null && f(pk)) want = pk; else return;
      }
      if (want === tr.toFi) return;
      var dk = Math.abs(levels[want] - tr.fromPos);
      var mk = kff(car, tr.fromFi, want);
      var closer = (levels[want] - levels[tr.toFi]) * tr.sgn < 0;
      if (!closer && isStop(car, tr.toFi)) return; /* keep the committed stop; extend later */
      tr.toFi = want; tr.m = mk;
      if (nt) car.parking = false;
    }

    function stepCar(car, budget) {
      var guard = 0;
      while (budget > 1e-12 && guard++ < 200) {
        var tEv = now + (dt - budget);
        switch (car.state) {
          case 'idle': {
            if (!car.inService) { car.speed = 0; return; }
            if (car.seenVer === ver && car.parkChecked) return;
            car.seenVer = ver; car.parkChecked = true;
            var fi = car.fi;
            if (wantsOpen(car, fi)) { var sv = now; now = tEv; beginOpen(car); now = sv; continue; }
            var nt = nextTarget(car, null);
            if (nt) {
              if (nt.fi === fi) { car.dir = nt.dir; var sv2 = now; now = tEv; beginOpen(car); now = sv2; continue; }
              if (car.g.disp === 'collective') claimFor(car, nt);
              car.dir = levels[nt.fi] > car.pos ? 1 : -1;
              depart(car, nt.fi, false); continue;
            }
            car.dir = 0;
            var pk = parkTarget(car);
            if (pk != null && pk !== fi) { depart(car, pk, true); continue; }
            return;
          }
          case 'start': {
            if (budget < car.rem) { car.rem -= budget; return; }
            budget -= car.rem; car.rem = 0;
            var tg = car.pendingTarget, n2 = nextTarget(car, null);
            if (n2 && n2.fi !== car.fi && !car.parking) tg = n2.fi;
            else if (!n2 && !car.parking) { var pk2 = parkTarget(car); tg = pk2 != null && pk2 !== car.fi ? pk2 : null; car.parking = tg != null; }
            else if (n2 && n2.fi === car.fi) { var sv3 = now; now = now + (dt - budget); car.dir = n2.dir; beginOpen(car); now = sv3; continue; }
            else if (n2 && car.parking) { tg = n2.fi; car.parking = false; }
            if (tg == null) { car.state = 'idle'; car.seenVer = -1; continue; }
            beginTrip(car, tg); continue;
          }
          case 'move': {
            var tr = car.trip;
            var left = tr.m.T - tr.el;
            if (budget < left - 1e-12) {
              tr.el += budget;
              var x = tr.m.x(tr.el);
              var np = tr.fromPos + tr.sgn * x;
              car.km += Math.abs(np - car.pos) / 1000;
              if (inWin(tEv)) car.wKm += Math.abs(np - car.pos) / 1000;
              car.pos = np; car.speed = tr.m.v(tr.el) * tr.sgn;
              car.fi = nearestFloor(car.pos);
              return;
            }
            budget -= Math.max(0, left);
            var dest = levels[tr.toFi];
            car.km += Math.abs(dest - car.pos) / 1000;
            if (inWin(tEv)) car.wKm += Math.abs(dest - car.pos) / 1000;
            car.pos = dest; car.speed = 0; car.fi = tr.toFi; car.trip = null;
            var sv4 = now; now = now + (dt - budget);
            ev('arrive', car, car.fi);
            if (wantsOpen(car, car.fi)) { beginOpen(car); ev('ding', car, car.fi, { dir: car.dir }); }
            else { car.state = 'idle'; car.seenVer = -1; car.parkChecked = false; if (!car.onboard.length) car.dir = 0; }
            now = sv4;
            continue;
          }
          case 'opening': {
            if (budget < car.rem) { car.rem -= budget; car.door = 1 - car.rem / Math.max(1e-9, car.tOpen); return; }
            budget -= car.rem; car.rem = 0; car.door = 1;
            car.fullOpenAt = now + (dt - budget);
            car.state = 'xfer';
            if (!nextTransfer(car, car.fullOpenAt)) { car.state = 'dwell'; car.rem = car.tDwell; }
            continue;
          }
          case 'xfer': {
            if (budget < car.rem) { car.rem -= budget; return; }
            budget -= car.rem; car.rem = 0;
            var te = now + (dt - budget);
            var sv5 = now; now = te;
            var more = nextTransfer(car, te);
            now = sv5;
            if (!more) { car.state = 'dwell'; car.rem = Math.max(0, car.tDwell - (te - car.fullOpenAt)); car.rem = Math.max(car.rem, car.xfers ? 0.8 : 0); }
            continue;
          }
          case 'dwell': {
            /* passengers arriving while the doors are open still get in */
            var te2 = now + (dt - budget);
            var sv6 = now; now = te2;
            var got = nextTransfer(car, te2);
            now = sv6;
            if (got) { car.state = 'xfer'; continue; }
            if (budget < car.rem) { car.rem -= budget; return; }
            budget -= car.rem; car.rem = 0;
            car.state = 'closing'; car.rem = car.tClose;
            continue;
          }
          case 'closing': {
            /* a passenger for this car's direction arriving while the doors close reopens them (safety edge / hall button) */
            if (car.door > 0.15 && reopenable(car)) {
              car.state = 'opening'; car.rem = car.tOpen * (1 - car.door); ev('reopen', car, car.fi); continue;
            }
            if (budget < car.rem) { car.rem -= budget; car.door = car.rem / Math.max(1e-9, car.tClose); return; }
            budget -= car.rem; car.rem = 0; car.door = 0;
            var sv7 = now; now = now + (dt - budget);
            afterClose(car);
            now = sv7;
            continue;
          }
          default: return;
        }
      }
    }
    function claimFor(car, nt) {
      var G = car.g;
      ['up', 'dn', 'any'].forEach(function (key) { G.calls[key].forEach(function (c) { if (c && c.claim === car) c.claim = null; }); });
      if (car.stop[nt.fi]) return;
      var c = G.callSys === 'single' ? G.calls.any[nt.fi] : (nt.rev ? callAt(G, nt.fi, -nt.dir) : callAt(G, nt.fi, nt.dir));
      if (!c) c = callAt(G, nt.fi, 1) || callAt(G, nt.fi, -1);
      if (c && c.claim == null) c.claim = car;
    }
    function nearestFloor(p) {
      var b = 0, bd = Infinity;
      for (var k = 0; k < nF; k++) { var d = Math.abs(levels[k] - p); if (d < bd) { bd = d; b = k; } }
      return b;
    }

    var pendingTransfer = [];

    function step(seconds) {
      var nSteps = Math.max(1, Math.round((seconds == null ? dt : seconds) / dt));
      for (var s = 0; s < nSteps && !sim.done; s++) one();
      return sim;
    }
    function one() {
      now = tick * dt;
      arrivals();
      /* passengers who finished the first leg of a two-leg trip */
      if (pendingTransfer.length) {
        for (var i = pendingTransfer.length - 1; i >= 0; i--) {
          var P = pendingTransfer[i];
          if (P.resumeAt <= now + 1e-9) { pendingTransfer.splice(i, 1); startLeg(P); }
        }
      }
      if (tick % Math.max(1, Math.round(1 / dt)) === 0) {
        reallocate();
        if (W.recordQueue) queueSamples.push([now, waitingAll.length]);
      }
      for (var c = 0; c < cars.length; c++) {
        var car = cars[c];
        var before = car.state;
        if (car.state === 'move') {
          if (car.seenVer !== ver) { car.seenVer = ver; retarget(car); }
        }
        stepCar(car, dt);
        if (before !== 'idle' && car.state === 'idle') car.parkChecked = false;
      }
      tick++;
      now = tick * dt;
      if ((doneCount + unservable >= pax.length && nextPax >= pax.length && !pendingTransfer.length) || now > endT) sim.done = true;
    }
    function state() {
      var halls = [];
      for (var k = 0; k < nF; k++) halls.push({ floorIdx: k, up: { lamp: false, waiting: 0, oldest_s: 0 }, down: { lamp: false, waiting: 0, oldest_s: 0 }, dcs: { waiting: 0, byCar: {} } });
      groups.forEach(function (G) {
        for (var k = 0; k < nF; k++) {
          var h = halls[k];
          if (G.calls.up[k] || G.calls.any[k]) h.up.lamp = true;
          if (G.calls.dn[k] || G.calls.any[k]) h.down.lamp = true;
          G.waiting[k].forEach(function (P) {
            var side = P.dir > 0 ? h.up : h.down;
            side.waiting++; side.oldest_s = Math.max(side.oldest_s, now - P.legT);
            if (G.callSys === 'dcs') { h.dcs.waiting++; var id = P.car ? P.car.id : '?'; h.dcs.byCar[id] = (h.dcs.byCar[id] || 0) + 1; }
          });
        }
      });
      return {
        t: now,
        cars: cars.map(function (car) {
          var st = [], as = [];
          for (var k = 0; k < nF; k++) { if (car.stop[k]) st.push(k); if (car.pu[k] || car.pd[k] || hallHere(car, k, 0, false)) as.push(k); }
          return { id: car.id, group: car.g.id, pos_m: car.pos, floorIdx: car.fi, v: car.speed, dir: car.dir, lamp: car.lamp, door: car.door,
            doorState: car.state === 'opening' ? 'opening' : (car.state === 'xfer' || car.state === 'dwell') ? 'open' : car.state === 'closing' ? 'closing' : 'closed',
            state: car.state, target: car.trip ? car.trip.toFi : null, parking: car.parking,
            load: car.onboard.length, cap: car.cc, capBoard: car.capBoard, stops: st, assigned: as, inService: car.inService,
            onboard: car.onboard.map(function (P) { return P.legDest; }) };
        }),
        halls: halls,
        waiting: waitingAll.map(function (P) { return { id: P.id, floorIdx: P.cur, dest: P.legDest, finalDest: P.dest, dir: P.dir, since: P.legT, arrived: P.t, car: P.car ? P.car.id : null, group: P.g.id, both: P.both }; }),
        recent: events.slice(-30),
        served: doneCount, total: pax.length, done: sim.done
      };
    }

    function pct(sorted, q) {
      if (!sorted.length) return 0;
      var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }
    function results() {
      var done = pax.filter(function (P) { return P.state === 3; });
      var waits = done.map(function (P) { return P.wait; }).sort(function (a, b) { return a - b; });
      var mean = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; };
      var pop = 0, pres = num((doc.building || {}).presence, 1);
      (doc.building.floors || []).forEach(function (f) { pop += Math.max(0, num(f.population, 0)); });
      pop *= pres;
      /* achieved handling capacity: best sliding 5-min window of completed journeys */
      var al = done.map(function (P) { return P.alightT; }).sort(function (a, b) { return a - b; });
      var hc = 0, jx = 0;
      for (var ix = 0; ix < al.length; ix++) { while (al[ix] - al[jx] > 300) jx++; hc = Math.max(hc, ix - jx + 1); }
      var bins = Math.max(1, Math.ceil((lastArrival + 1) / 300));
      var series = [];
      for (var b = 0; b < bins; b++) series.push({ t: b * 300, arrivals: 0, served: 0, awt: 0, p95: 0, queue_max: 0, _w: [] });
      pax.forEach(function (P) { var b2 = Math.min(bins - 1, Math.floor(P.t / 300)); series[b2].arrivals++; if (P.state === 3) { series[b2].served++; series[b2]._w.push(P.wait); } });
      queueSamples.forEach(function (q) { var b3 = Math.floor(q[0] / 300); if (b3 < bins) series[b3].queue_max = Math.max(series[b3].queue_max, q[1]); });
      series.forEach(function (s) { s._w.sort(function (a, b) { return a - b; }); s.awt = mean(s._w); s.p95 = pct(s._w, 0.95); delete s._w; });
      var heat = [];
      for (var k = 0; k < nF; k++) { var row = []; for (var b4 = 0; b4 < bins; b4++) row.push(null); heat.push(row); }
      var hs = {};
      done.forEach(function (P) { var b5 = Math.min(bins - 1, Math.floor(P.t / 300)), key = P.origin + ':' + b5; hs[key] = hs[key] || [0, 0]; hs[key][0] += P.wait; hs[key][1]++; });
      Object.keys(hs).forEach(function (key) { var p = key.split(':'); heat[+p[0]][+p[1]] = hs[key][0] / hs[key][1]; });
      var loadHist = new Array(10).fill(0);
      cars.forEach(function (c) { c.loadHist.forEach(function (n, i) { loadHist[i] += n; }); });
      var deps = cars.reduce(function (s, c) { return s + c.deps; }, 0);
      var metrics = {
        passengers: pax.length, served: done.length, unserved: pax.length - done.length,
        awt: mean(waits), wait_p50: pct(waits, 0.5), wait_p90: pct(waits, 0.9), wait_p95: pct(waits, 0.95), wait_max: waits.length ? waits[waits.length - 1] : 0,
        pct_wait_gt_30: done.length ? 100 * waits.filter(function (w) { return w > 30; }).length / done.length : 0,
        pct_wait_gt_60: done.length ? 100 * waits.filter(function (w) { return w > 60; }).length / done.length : 0,
        /* PLAN §2 naming: att = time to destination (wait + ride), ajt = ride time in the car.
           (CIBSE Guide D calls the in-car time ATT and wait + ride AJT — use the unambiguous aliases to_dest / ride.) */
        att: mean(done.map(function (P) { return P.wait + P.transit; })),
        ajt: mean(done.map(function (P) { return P.transit; })),
        hc5_achieved_persons: hc, hc5_achieved_pct: pop > 0 ? 100 * hc / pop : null, population: pop,
        car_trips: deps, starts: cars.reduce(function (s, c) { return s + c.starts; }, 0), stops: cars.reduce(function (s, c) { return s + c.stops; }, 0),
        false_stops: cars.reduce(function (s, c) { return s + c.falseStops; }, 0),
        km: cars.reduce(function (s, c) { return s + c.km; }, 0),
        avg_load: deps ? cars.reduce(function (s, c) { return s + c.loadSum; }, 0) / deps : 0,
        load_hist: loadHist, represses: done.reduce(function (s, P) { return s + P.represses; }, 0),
        sim_time_s: now
      };
      /* D-VT-5 (CR-3): activity inside the arrival window only (t ≤ duration_s) — for the energy handoff */
      metrics.window = { duration_s: winEnd, starts: cars.reduce(function (s, c) { return s + c.wStarts; }, 0),
        trips: cars.reduce(function (s, c) { return s + c.wTrips; }, 0), km: cars.reduce(function (s, c) { return s + c.wKm; }, 0),
        by_car: cars.map(function (c) { return { id: c.id, group: c.g.id, starts: c.wStarts, trips: c.wTrips, km: c.wKm }; }) };
      /* D-VT-6 (CR-9): the metrics above are over served passengers. If some are not served when the run stops, add
         censored metrics with wait = end of run − registration for those still waiting (or the time already waited for
         those in a car / between legs) — the true values are at least this large. Unservable trips (no group connects
         origin and destination) are counted separately and left out. */
      metrics.unservable = unservable;
      if (metrics.unserved > 0) {
        var cw = [];
        pax.forEach(function (P) {
          if (P.unservable) return;
          if (P.state === 3) cw.push(P.wait);
          else if (P.state === 1) cw.push(P.wait + Math.max(0, now - P.legT));
          else if (P.state === 0) cw.push(Math.max(0, now - P.t));
          else cw.push(P.wait);
        });
        cw.sort(function (a, b) { return a - b; });
        metrics.censored = { awt: mean(cw), p95: pct(cw, 0.95), gt60: cw.length ? 100 * cw.filter(function (w) { return w > 60; }).length / cw.length : 0, n: cw.length, end_s: now };
        metrics.lower_bound = true;
      } else metrics.lower_bound = false;
      metrics.pct_gt_60 = metrics.pct_wait_gt_60;
      metrics.to_dest = metrics.att; metrics.ride = metrics.ajt;
      metrics.p95 = metrics.wait_p95; metrics.p90 = metrics.wait_p90; metrics.max = metrics.wait_max;
      return {
        version: VERSION,
        passengers: pax.map(function (P) {
          return { id: P.id, t: P.t, origin: P.origin, dest: P.dest, board_t: P.boardT, alight_t: P.alightT, car: P.carId, wait: P.state === 3 ? P.wait : null,
            transit: P.state === 3 ? P.transit : null, both: P.both, represses: P.represses };
        }),
        metrics: metrics, series5min: series, heat: heat,
        byCar: cars.map(function (c) { return { id: c.id, group: c.g.id, inService: c.inService, trips: c.deps, starts: c.starts, stops: c.stops, false_stops: c.falseStops, km: c.km, window: { starts: c.wStarts, trips: c.wTrips, km: c.wKm }, served: c.served, avg_load: c.deps ? c.loadSum / c.deps : 0, cap: c.cc }; })
      };
    }

    var sim = { step: step, state: state, results: results, done: pax.length === 0, dt: dt, version: VERSION,
      floors: W.floors.map(function (f) { return { id: f.id, level_m: f.level, role: f.role }; }),
      get t() { return now; } };
    return sim;
  }

  function run(doc, opts) {
    var sim = create(doc, opts);
    var guard = 0;
    while (!sim.done && guard++ < 1e7) sim.step(60);
    return sim.results();
  }

  return { version: VERSION, create: create, run: run, kin: kin, kcacheSize: function () { return KCOUNT; }, DISPATCHERS: DISPATCHERS, CALL_SYSTEMS: ['single', 'updown', 'dcs'], PARKING: ['lobby', 'distributed', 'stay'] };
});
