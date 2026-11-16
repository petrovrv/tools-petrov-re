/* vt-traffic.js — global VTTraffic: lift traffic design helpers of the tools.petrov.re Vertical Transport package
   (page lifttraffic.html). Built on VTCore (vt-core.js): the classical up-peak round-trip time VTCore.upPeak /
   VTCore.upPeakFromDoc, the jerk-limited kinematics VTCore.motion and the design criteria VTCore.CRITERIA.
   1 analyse   — one group (or every group) of a scenario: RTT, interval, HC5, %POP, AWT estimate + traffic lights
   2 sizing    — grid n cars × rated load × rated speed -> options meeting the criteria, fewest shafts first
   3 zoning    — split the floors above the main terminal into 1–3 stacked zones with express runs, best split + car allocation
   4 zoneDoc   — the scenario rewritten with one group per zone (handoff to the simulator liftwait)
   5 kinematics— trip time against trip length: why one-floor trips never reach rated speed
   Pure functions, no DOM, UMD (browser global VTTraffic, node module.exports). Planning aid only — final lift design per
   EN 81-20 / ISO 8100-32 by a qualified lift consultant. */
(function (root, factory) {
  var core = (typeof module === 'object' && module.exports && typeof require === 'function') ? require('./vt-core.js') : (root && root.VTCore);
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VTTraffic = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (C) {
'use strict';

var VERSION = '0.2.0';
var TOOL = 'lifttraffic';

/* Preferred rated loads (kg) of passenger lifts, ISO 8100-30:2019 (formerly ISO 4190-1) — the values used in practice for
   office/residential/hotel/bed lifts. Rated speeds (m/s): common catalogue steps of modern traction lifts (learning assumption). */
var LOADS = [630, 800, 1000, 1275, 1600, 1800, 2000];
var SPEEDS = [1.0, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0];
var CARS = [1, 2, 3, 4, 5, 6, 7, 8];
/* per-use minimum rated load of the sizing grid (CR-28): a hospital lift group must carry a bed with attendants — ISO 8100-30
   class III bed lift 2500 kg (car 1.8 × 2.7 m), the size UK HTM 08-02 recommends for bed passenger lifts. Other uses: none. */
var MIN_LOAD = { hospital: 2500 };
var BED_LOADS = [2500];
function loadsFor(use) { var m = MIN_LOAD[use] || 0; var l = LOADS.concat(m ? BED_LOADS : []).filter(function (q) { return q >= m; }); return l.filter(function (q, i) { return l.indexOf(q) === i; }); }
var SOURCES_LOCAL = {
  iso8100_30: { title: 'ISO 8100-30 Lifts — Class I, II, III and VI lifts installation (preferred rated loads and car sizes)', edition: '2019 (formerly ISO 4190-1)', url: 'https://www.iso.org/standard/73005.html', kind: 'standard' },
  htm08_02: { title: 'Health Technical Memorandum 08-02: Lifts (bed passenger lifts 2500 kg)', edition: 'Department of Health (England), 2016', url: 'https://www.england.nhs.uk/publication/specialist-services-health-technical-memorandum-08-02-lifts/', kind: 'guidance' }
};

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function num(v, d) { v = +v; return isFinite(v) ? v : d; }
function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
function useOf(doc) { var u = doc && doc.building && doc.building.use; return C && C.CRITERIA && C.CRITERIA[u] ? u : 'office'; }

/* traffic lights of one up-peak result against the criteria of the building use */
function lights(use, r) {
  if (r.no_cars) return { hc5: 'grey', int: 'grey', awt: 'grey', verdict: 'no_cars' };
  var hc = C.light(use, 'hc5', r.pctPOP), it = C.light(use, 'int', r.INT), aw = C.light(use, 'awt', r.AWT_est);
  var verdict = (hc === 'red' || it === 'red') ? 'fails' : (hc === 'green' && it === 'green') ? 'meets' : 'marginal';
  return { hc5: hc, int: it, awt: aw, verdict: verdict };
}

/* the zone of one group as plain arrays (main terminal, floors above it with effective population and level) */
function zoneOf(doc, groupId) {
  var d = C.scenario.normalize(doc);
  var g = (d.groups || []).filter(function (x) { return x.id === groupId; })[0] || d.groups[0];
  if (!g) return null;
  var floors = d.building.floors, served = {};
  g.served.forEach(function (id) { served[id] = 1; });
  var idx = floors.map(function (f, i) { return served[f.id] ? i : -1; }).filter(function (i) { return i >= 0; });
  if (!idx.length) return null;
  /* main terminal: one definition for the package (D-VT-13, VTCore.mainTerminal: lobby first, else largest entrance share) */
  var main = C.mainTerminal ? C.mainTerminal(d, g) : idx.filter(function (i) { return floors[i].role === 'lobby'; })[0];
  if (main == null || main < 0) {
    var ent = idx.filter(function (i) { return floors[i].entrance; });
    ent.sort(function (a, b) { return (floors[b].entrance_share || 0) - (floors[a].entrance_share || 0); });
    main = ent.length ? ent[0] : idx[0];
  }
  var pres = d.building.presence;
  var above = idx.filter(function (i) { return i > main; });
  return { doc: d, group: g, main: main, mainId: floors[main].id, mainLevel: floors[main].level_m, below: idx.filter(function (i) { return i < main; }).map(function (i) { return floors[i].id; }),
    floors: above.map(function (i) { return { id: floors[i].id, label: floors[i].label, level_m: floors[i].level_m, pop: (floors[i].population || 0) * pres }; }) };
}

/* ---------------------------------------------------------------------------------- 1. analyse */
function carOf(g) {
  var cars = g.cars.filter(function (c) { return c.in_service !== false; });
  return { car: clone(cars[0] || g.cars[0] || C.CAR_DEFAULTS), n: cars.length, total: g.cars.length };
}
function analyse(doc, groupId, over) {
  var z = zoneOf(doc, groupId);
  if (!z) return null;
  var r = C.upPeakFromDoc(z.doc, z.group.id, over);
  if (!r) return null;
  var use = useOf(z.doc);
  var top = z.floors.length ? z.floors[z.floors.length - 1].level_m - z.mainLevel : 0;
  var inp = r.inputs;
  r.use = use; r.criteria = clone(C.CRITERIA[use]); r.lights = lights(use, r);
  r.travel_m = top;
  r.flight_top_s = top > 0 ? C.flightTime(top, inp.speed, inp.accel, inp.jerk) : 0;
  r.reach_m = C.motion(1e6, inp.speed, inp.accel, inp.jerk).vp > 0 ? reachDistance(inp.speed, inp.accel, inp.jerk) : 0;
  r.speed_reached = top >= r.reach_m;
  r.cars_total = z.group.cars.length; r.cars_out = z.group.cars.length - r.L;
  r.group_name = z.group.name || z.group.id;
  r.shares = {}; Object.keys(r.breakdown).forEach(function (k) { r.shares[k] = r.RTT > 0 ? r.breakdown[k] / r.RTT : 0; });
  r.no_zone = !z.floors.length || !(r.POP > 0);
  return r;
}
/* rest-to-rest distance needed to just reach rated speed v (and stop again) */
function reachDistance(v, a, j) { var aE = Math.min(a, Math.sqrt(v * j)); return v * v / aE + v * aE / j; }

/* every group of the scenario + the building total (zoned buildings) */
function analyseAll(doc, over) {
  var d = C.scenario.normalize(doc);
  var rows = (d.groups || []).map(function (g) { return analyse(d, g.id, over); }).filter(Boolean);
  var pop = sum(rows.map(function (r) { return r.POP; })), hc = sum(rows.map(function (r) { return r.HC5 || 0; }));
  var ints = rows.map(function (r) { return r.INT; }).filter(function (x) { return x != null; });
  return { groups: rows, POP: pop, HC5: hc, pctPOP: pop > 0 ? 100 * hc / pop : null, INT_max: ints.length ? Math.max.apply(null, ints) : null };
}

/* ---------------------------------------------------------------------------------- 2. sizing */
/* opts: {cars:[], loads:[], speeds:[], load_factor} ; everything else (accel, jerk, doors, floors) from the group */
function sizing(doc, groupId, opts) {
  opts = opts || {};
  var z = zoneOf(doc, groupId);
  if (!z || !z.floors.length) return { rows: [], feasible: [], best: null };
  var base = C.upPeakFromDoc(z.doc, z.group.id);
  var use = useOf(z.doc), top = z.floors[z.floors.length - 1].level_m - z.mainLevel;
  var lf = num(opts.load_factor, C.ACTUAL_LOAD_FACTOR);
  var rows = [], loads = opts.loads || loadsFor(use);
  (opts.cars || CARS).forEach(function (n) {
    loads.forEach(function (q) {
      (opts.speeds || SPEEDS).forEach(function (v) {
        var inp = clone(base.inputs); inp.n_cars = n; inp.rated_load_kg = q; inp.speed = v;
        var cc = C.carCapacity(q); inp.P = lf * cc;
        var r = C.upPeak(inp), li = lights(use, r);
        var reach = reachDistance(v, inp.accel, inp.jerk);
        rows.push({ n: n, load: q, speed: v, CC: cc, P: r.P, S: r.S, H: r.H, RTT: r.RTT, INT: r.INT, HC5: r.HC5, pctPOP: r.pctPOP, AWT: r.AWT_est,
          lights: li, reach_ok: top >= reach, meets: li.verdict !== 'fails' && top >= reach, good: li.verdict === 'meets' && top >= reach });
      });
    });
  });
  var feasible = rows.filter(function (r) { return r.meets; });
  /* fewest shafts first, then the smaller car, then the slower drive (cheapest-first proxy); good before marginal */
  feasible.sort(function (a, b) { return a.n - b.n || (b.good - a.good) || a.load - b.load || a.speed - b.speed; });
  var best = feasible[0] || null;
  /* the smallest group that is green on both criteria */
  var bestGood = feasible.filter(function (r) { return r.good; })[0] || null;
  return { rows: rows, feasible: feasible, best: best, best_good: bestGood, use: use, loads: loads, min_load: MIN_LOAD[use] || null, travel_m: top, load_factor: lf, base: base.inputs };
}

/* ---------------------------------------------------------------------------------- 3. zoning */
var VRANK = { meets: 2, marginal: 1, fails: 0 };
function zoneCalc(z, block, carIn, speed, lf) {
  var pops = block.map(function (f) { return f.pop; });
  var first = block[0], last = block[block.length - 1];
  var df = block.length > 1 ? (last.level_m - first.level_m) / (block.length - 1) : Math.max(0.1, first.level_m - z.mainLevel);
  var ex = Math.max(0, first.level_m - z.mainLevel - df);
  var cc = C.carCapacity(carIn.rated_load_kg);
  var r = C.upPeak({ populations: pops, n_cars: 1, rated_load_kg: carIn.rated_load_kg, P: lf * cc, speed: speed, accel: carIn.accel, jerk: carIn.jerk,
    floor_height_m: df, express_m: ex, door_open_s: carIn.door_open_s, door_close_s: carIn.door_close_s, start_delay_s: carIn.start_delay_s, transfer_s: carIn.transfer_s });
  return { floors: block.map(function (f) { return f.id; }), from: first.id, to: last.id, from_label: first.label, to_label: last.label, POP: r.POP, express_m: ex, floor_height_m: df, speed: speed, RTT: r.RTT, P: r.P, S: r.S, H: r.H, AWT_ratio: r.AWT_est / r.INT };
}
/* give n cars to the zones (CR-29, D-VT-11): every allocation with ≥ minCars per zone is tried (k ≤ 3 zones, ≤ 24 cars: at most
   a few hundred) and ranked like the zoning options — verdict, then the weakest zone's %POP, then the longest interval;
   on a tie the first in lexicographic order wins. Exhaustive by design, so the brute-force reference must match exactly. */
function allocate(zs, n, minCars, use) {
  var k = zs.length, m0 = Math.max(1, minCars | 0 || 1); if (n < k * m0) return null;
  use = use || 'office';
  var best = null, bestKey = null, cars = [];
  function key(c) {
    var pmin = Infinity, imax = -Infinity;
    for (var i = 0; i < k; i++) { var HC5 = 300 * zs[i].P * c[i] / zs[i].RTT, p = zs[i].POP > 0 ? 100 * HC5 / zs[i].POP : Infinity, it = zs[i].RTT / c[i]; if (p < pmin) pmin = p; if (it > imax) imax = it; }
    var hc = C.light(use, 'hc5', pmin), il = C.light(use, 'int', imax);
    return { v: VRANK[(hc === 'red' || il === 'red') ? 'fails' : (hc === 'green' && il === 'green') ? 'meets' : 'marginal'], p: pmin, i: imax };
  }
  function gt(a, b) { if (a.v !== b.v) return a.v > b.v; if (Math.abs(a.p - b.p) > 1e-9) return a.p > b.p; return a.i < b.i - 1e-9; }
  (function rec(i, left) {
    if (i === k - 1) { if (left < m0) return; cars[i] = left; var kk = key(cars); if (!best || gt(kk, bestKey)) { best = cars.slice(); bestKey = kk; } return; }
    for (var c = m0; c <= left - m0 * (k - 1 - i); c++) { cars[i] = c; rec(i + 1, left - c); }
  })(0, n);
  return best;
}
function finishOption(zs, cars, use) {
  var zones = zs.map(function (q, i) {
    var L = cars[i], HC5 = 300 * q.P * L / q.RTT, INT = q.RTT / L;
    var o = clone(q); o.cars = L; o.INT = INT; o.HC5 = HC5; o.pctPOP = q.POP > 0 ? 100 * HC5 / q.POP : null; o.AWT = INT * q.AWT_ratio;
    o.lights = { hc5: C.light(use, 'hc5', o.pctPOP), int: C.light(use, 'int', INT) };
    return o;
  });
  var pop = sum(zones.map(function (q) { return q.POP; })), hc = sum(zones.map(function (q) { return q.HC5; }));
  var minPct = Math.min.apply(null, zones.map(function (q) { return q.pctPOP == null ? Infinity : q.pctPOP; }));
  var maxInt = Math.max.apply(null, zones.map(function (q) { return q.INT; }));
  var awt = pop > 0 ? sum(zones.map(function (q) { return q.AWT * q.POP; })) / pop : null;
  var verdict = (C.light(use, 'hc5', minPct) === 'red' || C.light(use, 'int', maxInt) === 'red') ? 'fails' : (C.light(use, 'hc5', minPct) === 'green' && C.light(use, 'int', maxInt) === 'green') ? 'meets' : 'marginal';
  return { k: zones.length, zones: zones, cars: sum(cars), POP: pop, HC5: hc, pctPOP: pop > 0 ? 100 * hc / pop : null, pct_min: minPct, INT_max: maxInt, AWT_mean: awt, verdict: verdict };
}
/* ranking of zoning options: verdict first (meets > marginal > fails), then the higher handling capacity of the worst zone,
   then the shorter longest interval */
function better(o, b) {
  if (VRANK[o.verdict] !== VRANK[b.verdict]) return VRANK[o.verdict] > VRANK[b.verdict];
  if (Math.abs(o.pct_min - b.pct_min) > 1e-9) return o.pct_min > b.pct_min;
  return o.INT_max < b.INT_max - 1e-9;
}
/* opts: {zones:[1,2,3], cars_total, speed (zone 1), speed_high (zones 2..k), load_factor, min_floors (per zone, default 2), min_cars (per zone when k > 1, default 2)} */
function zoning(doc, groupId, opts) {
  opts = opts || {};
  var z = zoneOf(doc, groupId);
  if (!z || !z.floors.length) return { options: [], best: null };
  var cr = carOf(z.group), car = cr.car;
  car.transfer_s = num(z.doc.traffic && z.doc.traffic.transfer_s, 1.2);
  var lf = num(opts.load_factor, C.ACTUAL_LOAD_FACTOR);
  var nTot = Math.max(1, Math.round(num(opts.cars_total, cr.n)));
  var v1 = num(opts.speed, car.speed), vh = num(opts.speed_high, v1);
  var minF = Math.max(1, Math.round(num(opts.min_floors, 2)));
  /* a zone of its own needs at least two cars, otherwise it has no lift while one is out of service */
  var minC = Math.max(1, Math.round(num(opts.min_cars, 2)));
  var use = useOf(z.doc), F = z.floors, N = F.length;
  var ks = (opts.zones || [1, 2, 3]).filter(function (k) { return k >= 1 && k <= 3 && k * minF <= N && (k === 1 || k * minC <= nTot); });
  var options = [];
  ks.forEach(function (k) {
    var best = null, tried = 0;
    function consider(cuts) {
      var blocks = [], s = 0;
      cuts.concat([N]).forEach(function (c) { blocks.push(F.slice(s, c)); s = c; });
      if (blocks.some(function (b) { return b.length < minF || !(sum(b.map(function (f) { return f.pop; })) > 0); })) return;
      var zs = blocks.map(function (b, i) { return zoneCalc(z, b, car, i === 0 ? v1 : vh, lf); });
      var cars = allocate(zs, nTot, k === 1 ? 1 : minC, use); if (!cars) return;
      var o = finishOption(zs, cars, use); tried++;
      if (!best || better(o, best)) best = o;
    }
    if (k === 1) consider([]);
    else if (k === 2) { for (var a = minF; a <= N - minF; a++) consider([a]); }
    else { for (var b1 = minF; b1 <= N - 2 * minF; b1++) for (var b2 = b1 + minF; b2 <= N - minF; b2++) consider([b1, b2]); }
    if (best) { best.splits_tried = tried; options.push(best); }
  });
  var bestOpt = options.slice().sort(function (a, b) { return better(a, b) ? -1 : better(b, a) ? 1 : 0; })[0] || null;
  return { options: options, best: bestOpt, use: use, cars_total: nTot, main: z.mainId, group: z.group.id, speed: v1, speed_high: vh, load_factor: lf };
}

/* ---------------------------------------------------------------------------------- 4. zoneDoc */
/* the scenario with group `groupId` replaced by one group per zone of `option` (cars copied from the group's first car) */
function zoneDoc(doc, groupId, option) {
  var z = zoneOf(doc, groupId);
  if (!z || !option || !option.zones) return null;
  var d = clone(z.doc), g = z.group, car = carOf(g).car;
  var below = z.below.slice(), k = option.zones.length;
  var taken = {}; d.groups.forEach(function (x) { if (x.id !== g.id) taken[x.id] = 1; });
  var ids = k === 1 ? [g.id] : (k === 2 ? ['L', 'H'] : ['L', 'M', 'H']);
  if (ids.some(function (x) { return taken[x]; })) ids = option.zones.map(function (q, i) { return g.id + (i + 1); });
  var groups = option.zones.map(function (q, i) {
    var id = ids[i];
    var cars = [];
    for (var c = 1; c <= q.cars; c++) { var x = clone(car); x.id = id + c; x.speed = q.speed; x.in_service = true; x.home = z.mainId; cars.push(x); }
    var served = (i === 0 ? below : []).concat([z.mainId]).concat(q.floors);
    return { id: id, name: (q.from_label || q.from) + '–' + (q.to_label || q.to), served: served, express_zone: i > 0, cars: cars,
      call_system: g.call_system, dispatch: g.dispatch, parking: g.parking, load_limit: g.load_limit };
  });
  var at = d.groups.map(function (x) { return x.id; }).indexOf(g.id);
  d.groups.splice.apply(d.groups, [at, 1].concat(groups));
  return d;
}

/* ---------------------------------------------------------------------------------- 5. kinematics */
/* trips of 1..nMax floors of height df: flight time, the time the same distance would take at rated speed, peak speed */
function kinematics(v, a, j, df, nMax) {
  var out = [];
  for (var n = 1; n <= Math.max(1, nMax | 0); n++) {
    var d = n * df, m = C.motion(d, v, a, j);
    out.push({ floors: n, d: d, t: m.T, t_ideal: d / v, vp: m.vp, vp_share: m.vp / v, reached: m.reached.speed, cruise_s: m.cruise, lost_s: m.T - d / v });
  }
  return out;
}
/* smallest number of floors at which the car reaches rated speed (null if never within nMax) */
function floorsToSpeed(v, a, j, df) { var d = reachDistance(v, a, j); return df > 0 ? Math.ceil(d / df - 1e-9) : null; }

/* ---------------------------------------------------------------------------------- module payload for the scenario */
function modulePayload(state, res) {
  return { state: clone(state || {}), results: clone(res || {}), summary: res && res.summary ? clone(res.summary) : {}, updatedAt: new Date().toISOString() };
}

/* set the cars of a group from one car type: n cars, load, speed ... (ids kept where possible, out-of-service count kept at the end) */
function setGroupCars(doc, groupId, carType, n, nOut) {
  var g = (doc.groups || []).filter(function (x) { return x.id === groupId; })[0];
  if (!g) return doc;
  n = Math.max(1, Math.min(16, Math.round(n || 1))); nOut = Math.max(0, Math.min(n - 1, Math.round(nOut || 0)));
  var cars = [];
  for (var i = 0; i < n; i++) {
    var c = Object.assign(clone(C.CAR_DEFAULTS), clone(g.cars[i] || g.cars[0] || {}), clone(carType || {}));
    c.id = (g.cars[i] && g.cars[i].id) || (g.id + (i + 1));
    c.in_service = i < n - nOut;
    if (!c.home) c.home = g.served[0];
    cars.push(c);
  }
  g.cars = cars;
  return doc;
}

return {
  version: VERSION, TOOL: TOOL, LOADS: LOADS, MIN_LOAD: MIN_LOAD, loadsFor: loadsFor, SPEEDS: SPEEDS, CARS: CARS, SOURCES: SOURCES_LOCAL,
  lights: lights, zoneOf: zoneOf, analyse: analyse, analyseAll: analyseAll, reachDistance: reachDistance,
  sizing: sizing, zoning: zoning, zoneDoc: zoneDoc, allocate: allocate, kinematics: kinematics, floorsToSpeed: floorsToSpeed,
  modulePayload: modulePayload, setGroupCars: setGroupCars
};
});
