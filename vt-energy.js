/* vt-energy.js — VTEnergy: daily and annual energy of one lift, ISO 25745-2:2015 method and classes, VDI 4707-1:2009 classes.
 * Part of the Vertical Transport package of tools.petrov.re (unit energy). Pure, no DOM, UMD.
 *
 * Provenance of every number in this file (see _vt/energy/METHOD.md; campaign bw-r1 decision D-BW-8):
 *  - ISO 25745-2:2015, read in the licensed text (2026-11-06, replaces the ISO/DIS 25745-2 tables of Barney & Lorente 2013):
 *    Table 1 (usage categories, trips per day), Table 2 (percentage of average travel distance; 2015 text, Amd.1:2023 not read),
 *    Formulae (1)-(5) (running energy per metre, start/stop energy, average cycle, daily running energy),
 *    Formulae (6)-(11) (load factor kL by counterbalance, incl. traction 30 %), Table 3 (average car load, categories 1-6),
 *    Formulae (12)-(14) (running time, time of an average trip incl. doors, non-running time), Table 4 (time ratios
 *    idle / standby after 5 min / standby after 30 min, categories 1-6) and Formula (15) (non-running energy),
 *    Formulae (16)-(17) (daily, annual energy), Formulae (18)-(19) (specific running energy), clause 6 Tables 5-7
 *    (performance levels for running and idle/standby, energy efficiency class A-G). Category 6 is now calculated.
 *  - Classes VDI 4707 Blatt 1 (March 2009) Table 1 (usage categories 1-5: 0.2/0.5/1.5/3/6 h travel,
 *    23.8/23.5/22.5/21/18 h standby), Table 2 (standby A <= 50 ... F <= 1600 W), Table 3 (travel A <= 0.56 ...
 *    F <= 4.20 mWh/(kg m)) and Eq. 1 (overall specific demand, limits for the lift's own Q and v), as reprinted
 *    in Zukunft Bau "Energiekennwerte von Personenaufzuegen" (2015) Tables 3, 5, 6, 7; checked against Schindler
 *    certificates referencing "VDI 4707 Part 1 (Issue March 2009)". The December 2007 draft stays as a labelled
 *    legacy option (edition '2007'). VDI 4707 uses one standby power: the 5-min standby power P_st.
 *  - Typical specific running energies by drive and the lever defaults are learning assumptions, anchored
 *    only where a public certificate exists (Schindler VDI brochure, TÜV report) — see DRIVES.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VTEnergy = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '0.3.0';

  /* ISO 25745-2:2015 Table 1 — categorised number of trips per day (nd) and typical range (lower bound) */
  var USAGE = [
    null,
    { cat: 1, nd: 50,   from: 0,    to: 75 },
    { cat: 2, nd: 125,  from: 75,   to: 200 },
    { cat: 3, nd: 300,  from: 200,  to: 500 },
    { cat: 4, nd: 750,  from: 500,  to: 1000 },
    { cat: 5, nd: 1500, from: 1000, to: 2000 },
    { cat: 6, nd: 2500, from: 2000, to: Infinity }
  ];
  /* ISO 25745-2:2015 Table 2 (2015 text; Amd.1:2023 not read) — percentage of average travel distance, > 3 stopping floors, by category */
  var PAV_MANY = [null, 49, 49, 49, 44, 39, 32];
  /* ISO 25745-2:2015 Table 3 — average car load, % of rated load, columns cat 1-3, 4, 5, 6 */
  var PCTQ = [
    { maxQ: 800,      v: [7.5, 9.0, 13.0, 19.0] },
    { maxQ: 1275,     v: [4.5, 6.0, 8.2, 13.5] },
    { maxQ: 2000,     v: [3.0, 3.5, 5.0, 9.0] },
    { maxQ: Infinity, v: [2.0, 2.2, 3.0, 6.0] }
  ];
  /* ISO 25745-2:2015 Formulae (6)-(11): kL = 1 + c·%Q. Traction (6)-(8): c < 0, i.e. kL = 1 - |c|·%Q as printed.
     Hydraulic (9)-(11): c > 0 (ISO/DIS sign) — a deliberate deviation: the 2015 print reads 1 - c·%Q, taken as a misprint because
     car load raises the up-trip energy of a hydraulic lift and c grows with the counterbalance (D-BW-10). */
  var DRIVE_KL = {
    traction50:  -0.0164,
    traction40:  -0.0192,
    traction30:  -0.0197,
    hydraulic0:   0.0071,
    hydraulic35:  0.0100,
    hydraulic70:  0.0187
  };
  /* ISO 25745-2:2015 Table 4 — time ratios idle / standby after 5 min / standby after 30 min, categories 1-6 (5-6 one column) */
  var RATIOS = [null, [0.13, 0.55, 0.32], [0.23, 0.45, 0.32], [0.36, 0.31, 0.33], [0.45, 0.19, 0.36], [0.42, 0.17, 0.41], [0.42, 0.17, 0.41]];
  var RID = RATIOS.map(function (r) { return r ? r[0] : null; });
  /* ISO 25745-2:2015 Table 5 (running, mWh/(kg·m)) and Table 6 (idle/standby, W): upper limits of performance levels 1-6, 7 above */
  var ISO_RUN = [0.72, 1.08, 1.62, 2.43, 3.65, 5.47];
  var ISO_PWR = [50, 100, 200, 400, 800, 1600];

  /* VDI 4707 Blatt 1 (March 2009), via Zukunft Bau 2015 Tables 3, 5, 6 (see header) */
  var VDI2009 = {
    edition: '2009', ncat: 5,
    standbyW:   [50, 100, 200, 400, 800, 1600],          /* Table 2 (report Table 5), W, class A..F upper limits */
    travel:     [0.56, 0.84, 1.26, 1.89, 2.80, 4.20],     /* Table 3 (report Table 6), mWh/(kg·m) */
    hours:      [null, 0.2, 0.5, 1.5, 3, 6],              /* Table 1 average travel time h/day */
    standbyH:   [null, 23.8, 23.5, 22.5, 21, 18],         /* Table 1 average standby time h/day */
    hoursTo:    [null, 0.3, 1, 2, 4.5, Infinity]          /* Table 1 ranges (<=0.3, >0.3-1, >1-2, >2-4.5, >4.5) */
  };
  /* VDI 4707 draft (Dec 2007) — legacy option */
  var VDI = {
    edition: '2007', ncat: 4,
    standbyW:   [50, 100, 200, 400, 800, 1600],          /* Table 2, class A..F upper limits, G above */
    travel:     [0.8, 1.2, 1.8, 2.7, 4.0, 6.0],          /* Table 3, mWh/(kg·m) */
    hours:      [null, 0.5, 1.5, 3, 6],                   /* Table 1 average travel time h/day */
    standbyH:   [null, 23.5, 22.5, 21, 18],               /* Table 1 average standby time h/day */
    hoursTo:    [null, 1, 2, 4.5, Infinity],              /* Table 1 ranges (≤1, >1-2, >2-4.5, >4.5) */
    total: [null,                                         /* Table 4, class A..F upper limits by usage category */
      [1.45, 2.51, 4.41, 7.92, 14.41, 26.88],
      [1.01, 1.62, 2.63, 4.37, 7.33, 12.67],
      [0.90, 1.39, 2.19, 3.48, 5.56, 9.11],
      [0.84, 1.28, 1.97, 3.04, 4.67, 7.33]]
  };
  var CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  /* Drive types: kL family and a typical specific running energy of the empty reference cycle, mWh/(kg·m).
     ALL e_spr values are learning assumptions for when nothing is measured; anchors: gearless traction
     certificates 0.37-0.54 mWh/(kg·m) (Schindler VDI brochure; TÜV Rheinland report for Hitachi Yungtay);
     VDI 4707 draft worked example of a hydraulic lift 8.93 mWh/(kg·m). Enter a measured E_rc when you have one. */
  var DRIVES = {
    gearless_regen: { e_spr: 0.40, traction: true, regen: true },
    gearless:       { e_spr: 0.55, traction: true, regen: false },
    geared_vvvf:    { e_spr: 0.90, traction: true, regen: false },
    geared_2speed:  { e_spr: 1.60, traction: true, regen: false },
    hydraulic:      { e_spr: 5.00, traction: false, regen: false }
  };

  /* lever defaults — learning assumptions, all editable on the page */
  var LEVER_DEFAULTS = {
    regen_share: 0.25,         /* share of the running energy returned by a regenerative drive */
    light_old_W: 60,           /* car lighting before (fluorescent) */
    light_new_W: 15,           /* car lighting after (LED) */
    standby_sleep_W: 40        /* standby power with a deep standby (light, display, drive off) */
  };

  function num(x, d) { x = Number(x); return isFinite(x) ? x : d; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function usageCategory(nd) {
    nd = num(nd, 0);
    for (var c = 1; c <= 6; c++) if (nd < USAGE[c].to) return c;
    return 6;
  }
  function pav(cat, stops) {
    stops = Math.round(num(stops, 2));
    if (stops <= 2) return 100;
    if (stops === 3) return 67;
    return PAV_MANY[clamp(cat, 1, 6)];
  }
  function pctQ(cat, Q) {
    var col = cat <= 3 ? 0 : cat === 4 ? 1 : cat === 5 ? 2 : 3;
    for (var i = 0; i < PCTQ.length; i++) if (Q <= PCTQ[i].maxQ) return PCTQ[i].v[col];
    return PCTQ[PCTQ.length - 1].v[col];
  }
  function kL(family, pq) { var c = DRIVE_KL[family]; if (c == null) c = DRIVE_KL.traction50; return 1 + c * pq; }
  function ratios(cat) { var r = RATIOS[clamp(Math.round(num(cat, 3)), 1, 6)]; return { Rid: r[0], Rst5: r[1], Rst30: r[2], Rst: r[1] + r[2], unsupported: false }; }
  /* ISO 25745-2:2015 Formula (13): time to travel the average distance incl. door times */
  function tav(sav, v, a, j, td) { return sav / v + v / a + a / j + td; }
  function classOf(value, limits) { for (var i = 0; i < limits.length; i++) if (value <= limits[i] + 1e-12) return CLASSES[i]; return 'G'; }
  function levelOf(value, limits) { for (var i = 0; i < limits.length; i++) if (value <= limits[i] + 1e-12) return i + 1; return limits.length + 1; }
  /* counterbalance -> kL formula family: traction 50 | 40 | 30 %, hydraulic 0 | 35 | 70 % of the car weight */
  function klFamily(drive, balance) {
    var d = DRIVES[drive] || DRIVES.gearless, b = String(balance == null ? '' : balance);
    if (d.traction) return b === '40' ? 'traction40' : b === '30' ? 'traction30' : 'traction50';
    return b === '35' ? 'hydraulic35' : b === '70' ? 'hydraulic70' : 'hydraulic0';
  }
  function vdiTable(ed) { return String(ed) === '2007' ? VDI : VDI2009; }
  function vdiCategory(hours, ed) { var T = vdiTable(ed); for (var c = 1; c <= T.ncat; c++) if (hours <= T.hoursTo[c]) return c; return T.ncat; }
  /* overall class limits, mWh/(kg·m): 2009 Eq. 1 with the same-letter limits of Tables 2+3 for the lift's own Q and v
     (Zukunft Bau Table 7 prints them for 630 kg, 1 m/s); the 2007 draft prints one fixed Table 4 */
  function vdiTotalLimits(cat, Q, v, ed) {
    var T = vdiTable(ed);
    if (T === VDI) return VDI.total[cat].slice();
    var d = v * T.hours[cat] * 3600;
    return T.travel.map(function (e, k) { return e + T.standbyW[k] * T.standbyH[cat] * 1000 / (Q * d); });
  }

  var DEFAULTS = {
    Q: 1000, v: 1.0, a: 0.8, j: 1.0, travel_m: 30, stops: 10, drive: 'gearless', balance: null, td: 8,
    nd_mode: 'category', cat: 3, nd: 300, vdi_edition: '2009',
    erc_mode: 'typical', e_spr: null, Erc: 50, Esc: null, ssc: null,
    pav: null, pctQ: null, Rid: null,
    Pid: 300, Pst: 150, Pst30: null, light_in_standby: true,
    days: 365, price: 0.25, co2: 0.25
  };

  /* the core calculation for one lift */
  function calc(inp) {
    var x = Object.assign({}, DEFAULTS, inp || {});
    var flags = [];
    var Q = num(x.Q, 1000), v = num(x.v, 1), a = num(x.a, 0.8), j = num(x.j, 1), src = num(x.travel_m, 30), td = num(x.td, 8);
    if (!(Q > 0 && v > 0 && a > 0 && j > 0 && src > 0)) return { ok: false, error: 'inputs' };
    var drv = DRIVES[x.drive] || DRIVES.gearless;
    var family = klFamily(x.drive, x.balance);
    var nd = x.nd_mode === 'trips' ? Math.max(0, num(x.nd, 0)) : USAGE[clamp(Math.round(num(x.cat, 3)), 1, 6)].nd;
    var cat = x.nd_mode === 'trips' ? usageCategory(nd) : clamp(Math.round(num(x.cat, 3)), 1, 6);
    var p_av = x.pav != null && isFinite(x.pav) ? clamp(num(x.pav), 1, 100) : pav(cat, x.stops);
    var sav = src * p_av / 100;
    var pq = x.pctQ != null && isFinite(x.pctQ) ? clamp(num(x.pctQ), 0, 100) : pctQ(cat, Q);
    var k = kL(family, pq);
    var rr = ratios(cat);
    var userR = x.Rid != null && isFinite(x.Rid);
    /* a user R_id keeps the Table 4 split of the rest between 5-min and 30-min standby */
    var Rid = userR ? clamp(num(x.Rid), 0, 1) : rr.Rid;
    var Rst = 1 - Rid, Rst5 = Rst * rr.Rst5 / rr.Rst, Rst30 = Rst - Rst5;

    /* reference cycle energy: measured, or typical specific running energy × Q × 2·s_rc */
    var e_spr = x.erc_mode === 'measured' ? null : (x.e_spr != null && isFinite(x.e_spr) ? num(x.e_spr) : drv.e_spr);
    var Erc = x.erc_mode === 'measured' ? Math.max(0, num(x.Erc, 0)) : e_spr * Q * 2 * src / 1000;
    if (x.erc_mode !== 'measured') flags.push('erc_typical');
    var e_spr_eff = Erc * 1000 / (Q * 2 * src);

    /* average cycle: Formulae (1)-(3) when a short cycle is given and rated speed is reached, else Formula (4) */
    var Erav, method = 'formula4', Erm = null, Essc = null;
    var Esc = x.Esc, ssc = x.ssc;
    if (x.erc_mode === 'measured' && Esc != null && ssc != null && isFinite(Esc) && isFinite(ssc) && ssc > 0 && ssc < src) {
      Erm = (Erc - Esc) / (2 * (src - ssc));                 /* (1) Wh/m */
      Essc = (Erc - Erm * src * 2) / 2;                      /* (2) Wh per trip */
      Erav = Erm * sav * 2 + Essc * 2;                       /* (3) */
      method = 'formula3';
      if (Essc < 0) flags.push('short_cycle_negative');
    } else {
      Erav = Erc * sav / src;                                /* (4) */
    }
    var Erd = k * nd * Erav / 2;                             /* (5) Wh/day */

    /* non-running: Formulae (12)-(15) */
    var t_av = tav(sav, v, a, j, td);
    var t_rd = nd * t_av / 3600;
    if (t_rd > 24) flags.push('saturated');
    var t_nr = Math.max(0, 24 - t_rd);
    var Pid = Math.max(0, num(x.Pid, 0)), Pst = Math.max(0, num(x.Pst, 0));
    var Pst30 = x.Pst30 != null && x.Pst30 !== '' && isFinite(x.Pst30) ? Math.max(0, num(x.Pst30)) : Pst;  /* none -> same as 5 min (Note to 5.3.4) */
    var Enr_id = t_nr * Pid * Rid, Enr_st5 = t_nr * Pst * Rst5, Enr_st30 = t_nr * Pst30 * Rst30;
    var Enr_st = Enr_st5 + Enr_st30;
    var Enr = Enr_id + Enr_st;
    var Ed = Erd + Enr;                                      /* (16) */
    var days = clamp(num(x.days, 365), 0, 366);
    var Ey = Ed * days / 1000;                               /* kWh/year */

    /* VDI 4707 classes: Blatt 1 (2009) by default, draft 2007 as legacy */
    var ed = String(x.vdi_edition) === '2007' ? '2007' : '2009', VT = vdiTable(ed);
    var t_travel = nd * Math.max(0, t_av - td) / 3600;
    var vcat = vdiCategory(t_travel, ed);
    var cls_st = classOf(Pst, VT.standbyW), cls_tr = classOf(e_spr_eff, VT.travel);
    var dist = v * VT.hours[vcat] * 3600;
    var e_spec = (e_spr_eff * Q * dist + Pst * VT.standbyH[vcat] * 1000) / (dist * Q);
    var lim = vdiTotalLimits(vcat, Q, v, ed);
    var cls_tot = classOf(e_spec, lim);
    /* nominal annual demand as printed on VDI 4707 certificates: (P_st·t_standby + e·Q·v·t_travel)·days, kWh */
    var vdi_year = (Pst * VT.standbyH[vcat] + e_spr_eff * Q * dist / 1000) * days / 1000;

    /* ISO 25745-2:2015 clause 6: Formula (18), Tables 5-6 levels, Table 7 class thresholds with this nd, sav and t_nr */
    var Espc = sav > 0 ? 1000 * k * Erav / (Q * 2 * sav) : null;
    var iso_lim = ISO_RUN.map(function (e, i) { return e * Q * nd * sav / 1000 + ISO_PWR[i] * t_nr; });
    var iso = { Espc: Espc, Espr: e_spr_eff, lvl_running: Espc == null ? null : levelOf(Espc, ISO_RUN),
      lvl_idle: levelOf(Pid, ISO_PWR), lvl_st5: levelOf(Pst, ISO_PWR), lvl_st30: levelOf(Pst30, ISO_PWR),
      limits: iso_lim, cls: classOf(Ed, iso_lim) };

    return {
      ok: true, method: method, flags: flags,
      cat: cat, nd: nd, pav: p_av, sav: sav, pctQ: pq, kL: k, kl_family: family, Rid: Rid, Rst: Rst,
      Erc: Erc, e_spr: e_spr_eff, Erm: Erm, Essc: Essc, Erav: Erav, Erd: Erd,
      Rst5: Rst5, Rst30: Rst30, Pst30: Pst30,
      t_av: t_av, t_rd: t_rd, t_nr: t_nr, Pid: Pid, Pst: Pst, Enr_id: Enr_id, Enr_st: Enr_st, Enr_st5: Enr_st5, Enr_st30: Enr_st30, Enr: Enr,
      Ed: Ed, Ey: Ey, days: days,
      per_trip_Wh: nd > 0 ? Ed / nd : null,
      share_running: Ed > 0 ? Erd / Ed : 0,
      cost: Ey * num(x.price, 0), co2_kg: Ey * num(x.co2, 0),
      iso: iso,
      vdi: { edition: ed, t_travel: t_travel, cat: vcat, cls_standby: cls_st, cls_travel: cls_tr, e_travel: e_spr_eff, e_spec: e_spec, cls_total: cls_tot, limits: lim, year_kWh: vdi_year }
    };
  }

  /* levers in a fixed order, each applied on top of the previous one (a waterfall) */
  var LEVER_IDS = ['regen', 'standby', 'led'];
  function levers(inp, opt) {
    var p = Object.assign({}, LEVER_DEFAULTS, opt || {});
    var on = p.on || { regen: true, standby: true, led: true };
    var x = Object.assign({}, DEFAULTS, inp || {});
    var drv = DRIVES[x.drive] || DRIVES.gearless;
    var base = calc(x);
    if (!base.ok) return { ok: false };
    var steps = [{ id: 'base', Ey: base.Ey, delta: 0, applicable: true }];
    var cur = Object.assign({}, x), prev = base, regenShare = 0;
    var lightOld = Math.max(0, num(p.light_old_W, 0)), lightNew = Math.max(0, Math.min(lightOld, num(p.light_new_W, 0)));
    function push(id, applicable, r) {
      steps.push({ id: id, Ey: r.Ey, delta: r.Ey - prev.Ey, applicable: applicable });
      prev = r;
    }
    function withRegen(r) { if (!regenShare) return r; var y = Object.assign({}, r); y.Erd = r.Erd * (1 - regenShare); y.Ed = y.Erd + r.Enr; y.Ey = y.Ed * r.days / 1000; return y; }
    /* 1. regenerative drive (traction only, if not already regenerative) */
    var rgApplicable = !!on.regen && drv.traction && !drv.regen;
    if (rgApplicable) regenShare = clamp(num(p.regen_share, 0), 0, 0.9);
    push('regen', rgApplicable, withRegen(calc(cur)));
    /* 2. deep standby: standby power falls to the sleep value (lighting and displays off) */
    var sleepW = Math.max(0, num(p.standby_sleep_W, 0));
    var sbApplicable = !!on.standby && sleepW < num(cur.Pst, 0);
    if (sbApplicable) { cur.Pst = sleepW; if (cur.Pst30 != null && cur.Pst30 !== '' && num(cur.Pst30, 0) > sleepW) cur.Pst30 = sleepW; cur.light_in_standby = false; }
    push('standby', sbApplicable, withRegen(calc(cur)));
    /* 3. LED car light: idle power falls by the lighting difference; standby too if the light stays on in standby */
    var dL = lightOld - lightNew;
    var ledApplicable = !!on.led && dL > 0;
    if (ledApplicable) {
      cur.Pid = Math.max(0, num(cur.Pid, 0) - dL);
      if (cur.light_in_standby !== false) { cur.Pst = Math.max(0, num(cur.Pst, 0) - dL); if (cur.Pst30 != null && cur.Pst30 !== '') cur.Pst30 = Math.max(0, num(cur.Pst30, 0) - dL); }
    }
    push('led', ledApplicable, withRegen(calc(cur)));
    var fin = prev;
    return { ok: true, base: base, final: fin, steps: steps, saved: base.Ey - fin.Ey, saved_pct: base.Ey > 0 ? (base.Ey - fin.Ey) / base.Ey : 0 };
  }

  /* energy against trips per day: where the standing energy dominates */
  function curve(inp, nds) {
    nds = nds || [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500];
    var out = [];
    nds.forEach(function (nd) {
      var r = calc(Object.assign({}, inp, { nd_mode: 'trips', nd: nd }));
      if (r.ok) out.push({ nd: nd, Erd: r.Erd, Enr: r.Enr, Ed: r.Ed, share_running: r.share_running, cat: r.cat });
    });
    return out;
  }

  /* inputs from a vertical-transport scenario document (VTCore schema v1): one car of one group */
  function fromDoc(doc, groupId, carId) {
    if (!doc || !doc.building || !Array.isArray(doc.groups) || !doc.groups.length) return null;
    var g = doc.groups.filter(function (x) { return x.id === groupId; })[0] || doc.groups[0];
    var cars = g.cars || [];
    var c = cars.filter(function (x) { return x.id === carId; })[0] || cars[0];
    if (!c) return null;
    var floors = doc.building.floors || [];
    var served = (g.served && g.served.length ? g.served : floors.map(function (f) { return f.id; }));
    var lv = served.map(function (id) { var f = floors.filter(function (q) { return q.id === id; })[0]; return f ? num(f.level_m, 0) : null; }).filter(function (z) { return z != null; });
    var travel = lv.length >= 2 ? Math.max.apply(null, lv) - Math.min.apply(null, lv) : 3;
    var use = doc.building.use || 'office';
    return {
      group: g.id, car: c.id, n_cars: cars.length,
      Q: num(c.rated_load_kg, 1000), v: num(c.speed, 1), a: num(c.accel, 0.8), j: num(c.jerk, 1),
      travel_m: Math.round(travel * 100) / 100, stops: served.length,
      td: Math.round((num(c.door_open_s, 2) + num(c.door_dwell_s, 2) + num(c.door_close_s, 3)) * 10) / 10,
      days: use === 'office' ? 260 : 365, use: use
    };
  }

  /* trips per day and average travel distance from the simulator's results (modules.liftwait), D-VT-5:
     1) results.metrics.window — counts inside the arrival window / window.duration_s (basis 'window');
     2) results.metrics totals / metrics.sim_time_s — the whole run incl. the drain (basis 'sim_time');
     3) legacy: totals (metrics, results.A or summary) / the arrival window — over-counts trips/h (basis 'legacy'). */
  function fromSim(doc, opt) {
    opt = opt || {};
    var m = doc && doc.modules && doc.modules.liftwait;
    if (!m || (!m.results && !m.summary)) return null;
    var res = m.results || {}, sum = m.summary || {};
    var met = res.metrics || res.A || {};
    var w = met.window || res.window || sum.window || null;
    var trips = NaN, km = NaN, dur = NaN, basis = null, byCar = null;
    function pickTrips(o) { var t = num(o && o.trips, NaN); if (!isFinite(t)) t = num(o && o.car_trips, NaN); if (!isFinite(t)) t = num(o && o.starts, NaN); return t; }
    if (w && num(w.duration_s, 0) > 0 && isFinite(pickTrips(w))) {
      trips = pickTrips(w); km = num(w.km, NaN); dur = num(w.duration_s, NaN); basis = 'window';
      /* window.by_car lists every car (VTSim 0.2.0 without an in-service flag): use it only when the flag is there */
      byCar = Array.isArray(w.by_car) && w.by_car.length && w.by_car.every(function (c) { return c && (c.inService != null || c.in_service != null); }) ? w.by_car : null;
    } else {
      var src = isFinite(pickTrips(met)) ? met : sum;
      trips = pickTrips(src); km = num(src.km, NaN);
      var simT = num(met.sim_time_s, NaN); if (!isFinite(simT)) simT = num(res.sim_time_s, NaN);
      if (simT > 0) { dur = simT; basis = 'sim_time'; }
      else {
        dur = num(res.duration_s, NaN);
        if (!isFinite(dur) && isFinite(num(sum.duration_min, NaN))) dur = num(sum.duration_min) * 60;
        if (!isFinite(dur) && m.state) { var sd = num(m.state.duration_min, NaN); if (!isFinite(sd)) sd = num(m.state.duration, NaN); if (isFinite(sd)) dur = sd * 60; }
        if (!isFinite(dur) && doc.traffic && isFinite(doc.traffic.duration_min)) dur = doc.traffic.duration_min * 60;
        basis = 'legacy';
      }
    }
    if (!isFinite(trips) || !(dur > 0)) return null;
    var nCars = 0;
    var cars = byCar || (Array.isArray(res.byCar) && res.byCar.length ? res.byCar : null);
    if (cars) nCars = cars.filter(function (c) { return c && c.inService !== false && c.in_service !== false; }).length;
    if (!nCars) (doc.groups || []).forEach(function (g) { (g.cars || []).forEach(function (c) { if (c.in_service !== false) nCars++; }); });
    if (!nCars) return null;
    var perCarHour = trips / nCars / (dur / 3600);
    var hours = num(opt.equiv_hours, 4);
    var savM = isFinite(km) && trips > 0 ? km * 1000 / trips : null;
    return { trips: trips, km: isFinite(km) ? km : null, duration_s: dur, basis: basis, cars: nCars, trips_per_car_hour: perCarHour,
             equiv_hours: hours, nd: Math.round(perCarHour * hours), sav_m: savM, updatedAt: m.updatedAt || null };
  }

  /* Example lifts. Two are the published worked examples (Barney & Lorente 2013, after SAFE 2005), one is the
     VDI 4707 draft example; the others take the car from a shared VTCore preset building. Idle and standby
     powers of the building presets are learning assumptions (no measurement exists for an invented building). */
  var PRESETS = {
    barney_office:    { core: null, inputs: { Q: 1600, v: 2.5, a: 1.0, j: 1.25, travel_m: 75, stops: 20, drive: 'gearless', balance: '50', td: 8, nd_mode: 'trips', nd: 1500,
                        erc_mode: 'measured', Erc: 170, ovr: { pav: 33 }, Pid: 500, Pst: 120, days: 260, n_cars: 1 } },
    barney_hydraulic: { core: null, inputs: { Q: 500, v: 0.6, a: 0.3, j: 0.5, travel_m: 13, stops: 5, drive: 'hydraulic', balance: '0', td: 8, nd_mode: 'trips', nd: 30,
                        erc_mode: 'measured', Erc: 91, ovr: { pav: 44 }, Pid: 50, Pst: 31, days: 365, n_cars: 1 } },
    residential10:    { core: 'residential10',   inputs: { drive: 'geared_vvvf', nd_mode: 'category', cat: 2, erc_mode: 'typical', Pid: 180, Pst: 150 } },
    residential10_2:  { core: 'residential10_2', inputs: { drive: 'geared_vvvf', nd_mode: 'category', cat: 1, erc_mode: 'typical', Pid: 180, Pst: 150 } },
    office15:         { core: 'office15',        inputs: { drive: 'gearless', nd_mode: 'category', cat: 4, erc_mode: 'typical', Pid: 400, Pst: 250 } },
    hospital8:        { core: 'hospital8',       inputs: { drive: 'geared_vvvf', nd_mode: 'category', cat: 4, erc_mode: 'typical', Pid: 500, Pst: 300 } },
    hotel20:          { core: 'hotel20',         inputs: { drive: 'gearless_regen', nd_mode: 'category', cat: 4, erc_mode: 'typical', Pid: 300, Pst: 120 } },
    vdi_example:      { core: null, inputs: { Q: 320, v: 0.63, a: 0.5, j: 0.8, travel_m: 11.2, stops: 5, drive: 'hydraulic', balance: '0', td: 8, nd_mode: 'trips', nd: 100,
                        erc_mode: 'typical', e_spr: 8.93, Pid: 150, Pst: 110, days: 365, n_cars: 1, vdi_edition: '2007' } }
  };
  /* full calc inputs of a preset; core = the VTCore module (needed for the building presets) */
  function presetInputs(id, core) {
    var p = PRESETS[id]; if (!p) return null;
    var base = {};
    if (p.core) { if (!core || !core.preset) return null; base = fromDoc(core.preset(p.core)) || {}; }
    var x = Object.assign({}, base, JSON.parse(JSON.stringify(p.inputs)));
    if (x.ovr) { Object.assign(x, x.ovr); delete x.ovr; }
    if (x.e_spr == null) x.e_spr = (DRIVES[x.drive] || DRIVES.gearless).e_spr;
    return x;
  }

  return {
    version: VERSION, PRESETS: PRESETS, presetInputs: presetInputs, USAGE: USAGE, PAV_MANY: PAV_MANY, PCTQ: PCTQ, DRIVE_KL: DRIVE_KL, RID: RID, RATIOS: RATIOS, ISO_RUN: ISO_RUN, ISO_PWR: ISO_PWR, VDI: VDI2009, VDI2009: VDI2009, VDI_DRAFT: VDI, CLASSES: CLASSES,
    DRIVES: DRIVES, LEVER_DEFAULTS: LEVER_DEFAULTS, LEVER_IDS: LEVER_IDS, DEFAULTS: DEFAULTS,
    usageCategory: usageCategory, klFamily: klFamily, pav: pav, pctQ: pctQ, kL: kL, ratios: ratios, tav: tav, classOf: classOf, levelOf: levelOf, vdiCategory: vdiCategory, vdiTotalLimits: vdiTotalLimits,
    calc: calc, levers: levers, curve: curve, fromDoc: fromDoc, fromSim: fromSim
  };
}));
