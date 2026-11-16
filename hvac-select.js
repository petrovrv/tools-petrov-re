/* hvac-select.js - HVAC heat & cold generator shortlist engine (hvacgenselect).
   Preliminary selection, not a design calculation. Ranking by fit to requirements only.
   Generated from _hvac/engine/e0*_*.js by assemble.py - edit the chunks, not this file. */
(function (root) {
'use strict';

/* ---- e01_tables.js ---- */
var CLIMATE = {
  brussels:{name:'Brussels',cc:'BE',t_win:-7,t_sum:30,grid:0.15},
  amsterdam:{name:'Amsterdam',cc:'NL',t_win:-10,t_sum:28,grid:0.33},
  paris:{name:'Paris',cc:'FR',t_win:-7,t_sum:32,grid:0.05},
  lyon:{name:'Lyon',cc:'FR',t_win:-10,t_sum:33,grid:0.05},
  berlin:{name:'Berlin',cc:'DE',t_win:-14,t_sum:31,grid:0.38},
  munich:{name:'Munich',cc:'DE',t_win:-16,t_sum:30,grid:0.38},
  hamburg:{name:'Hamburg',cc:'DE',t_win:-12,t_sum:29,grid:0.38},
  vienna:{name:'Vienna',cc:'AT',t_win:-13,t_sum:32,grid:0.10},
  zurich:{name:'Zurich',cc:'CH',t_win:-11,t_sum:30,grid:0.03},
  milan:{name:'Milan',cc:'IT',t_win:-5,t_sum:33,grid:0.28},
  rome:{name:'Rome',cc:'IT',t_win:0,t_sum:34,grid:0.28},
  madrid:{name:'Madrid',cc:'ES',t_win:-4,t_sum:37,grid:0.15},
  seville:{name:'Seville',cc:'ES',t_win:1,t_sum:41,grid:0.15},
  lisbon:{name:'Lisbon',cc:'PT',t_win:2,t_sum:34,grid:0.15},
  athens:{name:'Athens',cc:'GR',t_win:0,t_sum:37,grid:0.35},
  warsaw:{name:'Warsaw',cc:'PL',t_win:-20,t_sum:30,grid:0.66},
  prague:{name:'Prague',cc:'CZ',t_win:-12,t_sum:30,grid:0.42},
  stockholm:{name:'Stockholm',cc:'SE',t_win:-18,t_sum:27,grid:0.03},
  helsinki:{name:'Helsinki',cc:'FI',t_win:-26,t_sum:27,grid:0.08},
  london:{name:'London',cc:'GB',t_win:-3,t_sum:29,grid:0.20},
  oslo:{name:'Oslo',cc:'NO',t_win:-20,t_sum:27,grid:0.02},
  copenhagen:{name:'Copenhagen',cc:'DK',t_win:-12,t_sum:27,grid:0.12},
  budapest:{name:'Budapest',cc:'HU',t_win:-15,t_sum:33,grid:0.20},
  bucharest:{name:'Bucharest',cc:'RO',t_win:-18,t_sum:35,grid:0.26},
  dublin:{name:'Dublin',cc:'IE',t_win:-2,t_sum:24,grid:0.28}
};

var REFRIGERANTS = {
  R32:{gwp:675,cls:'A2L',natural:false,pl:0.061},
  R410A:{gwp:2088,cls:'A1',natural:false,pl:0.44},
  R454B:{gwp:466,cls:'A2L',natural:false,pl:0.069},
  R513A:{gwp:631,cls:'A1',natural:false,pl:0.35},
  R1234ze:{gwp:7,cls:'A2L',natural:false,pl:0.061},
  R290:{gwp:3,cls:'A3',natural:true,pl:0.008},
  R744:{gwp:1,cls:'A1',natural:true,pl:0.1},
  R717:{gwp:0,cls:'B2L',natural:true,pl:0.00035},
  R718:{gwp:0,cls:'A1',natural:true,pl:null},
  R134a:{gwp:1430,cls:'A1',natural:false,pl:0.25},
  R1234yf:{gwp:4,cls:'A2L',natural:false,pl:0.058},
  R454C:{gwp:148,cls:'A2L',natural:false,pl:0.059}
};

var CONFIG_IDS = ['hp_mono','hp_cascade_ht','hybrid_hp_boiler','chiller_boiler','rev_hp','multifunction_4p','vrf_2p','vrf_3p_hr','boiler_cascade','dh_chiller'];

var TECH = {
  hp_mono:{heat:true,cool:false,families:['hp_aw'],scop35:4.2,scop55:3.2,t_flow_max:65,t_amb_min:-20,t_amb_max:35,seer:null,eta_boiler:null,boiler_share:0,capex_eur_kw:650,foot_m2_kw:0.012,maint:0.35,charge_kg_kw:0.25,refrigerant:'R32',lw_a:66,compressors:2,hr_bonus:0,dh:false},
  hp_cascade_ht:{heat:true,cool:false,families:['hp_aw'],scop35:3.6,scop55:2.8,t_flow_max:90,t_amb_min:-20,t_amb_max:35,seer:null,eta_boiler:null,boiler_share:0,capex_eur_kw:950,foot_m2_kw:0.018,maint:0.45,charge_kg_kw:0.20,refrigerant:'R744',lw_a:67,compressors:4,hr_bonus:0,dh:false},
  hybrid_hp_boiler:{heat:true,cool:true,families:['hp_aw','boiler_gas'],scop35:4.0,scop55:3.0,t_flow_max:80,t_amb_min:-25,t_amb_max:43,seer:4.2,eta_boiler:0.92,boiler_share:0.3,capex_eur_kw:550,foot_m2_kw:0.014,maint:0.40,charge_kg_kw:0.18,refrigerant:'R32',lw_a:66,compressors:2,hr_bonus:0,dh:false},
  chiller_boiler:{heat:true,cool:true,families:['chiller_ac','boiler_gas'],scop35:null,scop55:null,t_flow_max:85,t_amb_min:-15,t_amb_max:46,seer:5.0,eta_boiler:0.93,boiler_share:1,capex_eur_kw:450,foot_m2_kw:0.010,maint:0.35,charge_kg_kw:0.22,refrigerant:'R513A',lw_a:66,compressors:2,hr_bonus:0,dh:false},
  rev_hp:{heat:true,cool:true,families:['hp_aw'],scop35:4.1,scop55:3.1,t_flow_max:60,t_amb_min:-20,t_amb_max:46,seer:4.6,eta_boiler:null,boiler_share:0,capex_eur_kw:700,foot_m2_kw:0.013,maint:0.35,charge_kg_kw:0.28,refrigerant:'R32',lw_a:66,compressors:2,hr_bonus:0,dh:false},
  multifunction_4p:{heat:true,cool:true,families:['hp_aw'],scop35:4.0,scop55:3.1,t_flow_max:65,t_amb_min:-15,t_amb_max:46,seer:4.4,eta_boiler:null,boiler_share:0,capex_eur_kw:900,foot_m2_kw:0.015,maint:0.40,charge_kg_kw:0.30,refrigerant:'R454B',lw_a:67,compressors:4,hr_bonus:0.25,dh:false},
  vrf_2p:{heat:true,cool:true,families:['vrf'],scop35:4.0,scop55:null,t_flow_max:50,t_amb_min:-20,t_amb_max:46,seer:6.0,eta_boiler:null,boiler_share:0,capex_eur_kw:800,foot_m2_kw:0.004,maint:0.25,charge_kg_kw:0.30,refrigerant:'R410A',lw_a:64,compressors:2,hr_bonus:0,dh:false},
  vrf_3p_hr:{heat:true,cool:true,families:['vrf'],scop35:4.0,scop55:null,t_flow_max:50,t_amb_min:-20,t_amb_max:46,seer:6.2,eta_boiler:null,boiler_share:0,capex_eur_kw:950,foot_m2_kw:0.004,maint:0.25,charge_kg_kw:0.30,refrigerant:'R410A',lw_a:64,compressors:2,hr_bonus:0.25,dh:false},
  boiler_cascade:{heat:true,cool:false,families:['boiler_gas'],scop35:null,scop55:null,t_flow_max:90,t_amb_min:-40,t_amb_max:50,seer:null,eta_boiler:0.94,boiler_share:1,capex_eur_kw:120,foot_m2_kw:0.006,maint:0.30,charge_kg_kw:0,refrigerant:null,lw_a:55,compressors:0,hr_bonus:0,dh:false},
  dh_chiller:{heat:true,cool:true,families:['chiller_ac'],scop35:null,scop55:null,t_flow_max:90,t_amb_min:-15,t_amb_max:46,seer:5.2,eta_boiler:null,boiler_share:0,capex_eur_kw:400,foot_m2_kw:0.008,maint:0.20,charge_kg_kw:0.22,refrigerant:'R1234ze',lw_a:66,compressors:2,hr_bonus:0,dh:true}
};

var WEIGHTS = {
  capex:{eff:.15,capex:.40,co2:.10,noise:.10,foot:.10,maint:.15},
  lcc:{eff:.35,capex:.20,co2:.15,noise:.10,foot:.05,maint:.15},
  co2:{eff:.25,capex:.10,co2:.45,noise:.10,foot:.05,maint:.05},
  compact:{eff:.15,capex:.15,co2:.10,noise:.15,foot:.35,maint:.10}
};

var CONST = {gas_kg_kwh:0.202, leak_rate:0.03, years:20, eflh_heat:1800, eflh_cool:1000, gwp_low:750, vrf_sys_max_kw:150, vrf_sys_min_kw:14, vrf_charge_extra_kg_m:0.06, pl_factor:{general:1, supervised:1, restricted:0.5}, qlmv_factor:{general:1.0, supervised:1.0, restricted:0.5}};

var PRESETS = {
  office:{city:'brussels',need:'both',load_kw:300,load_cool_kw:350,simultaneous:false,t_flow_heat:45,t_return_heat:35,t_chw_supply:7,t_chw_return:12,glycol:false,location:'roof',environment:'normal',noise_limit_dba:55,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'lcc',reliability:'business',redundancy:'N+1',critical_share:0.2,part_load_share:0.6,dhw:false,vrf_zones:40,pipe_m:80,smallest_room_m3:40,occupancy:'general',gas_available:true,bms:'bacnet',aha:'Internal gains make offices cooling-led, so seasonal part-load efficiency matters more than full-load COP.'},
  hotel:{city:'paris',need:'both',load_kw:400,load_cool_kw:350,simultaneous:true,t_flow_heat:45,t_return_heat:35,t_chw_supply:7,t_chw_return:12,glycol:false,location:'roof',environment:'normal',noise_limit_dba:50,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'lcc',reliability:'business',redundancy:'N+1',critical_share:0.5,part_load_share:0.5,dhw:true,vrf_zones:120,pipe_m:60,smallest_room_m3:30,occupancy:'supervised',gas_available:true,bms:'bacnet',aha:'Simultaneous room heating and cooling plus year-round hot water make heat recovery worth more than peak efficiency.'},
  school:{city:'brussels',need:'heat',load_kw:250,load_cool_kw:0,simultaneous:false,t_flow_heat:55,t_return_heat:45,t_chw_supply:7,t_chw_return:12,glycol:false,location:'ground',environment:'normal',noise_limit_dba:50,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'capex',reliability:'standard',redundancy:'N',critical_share:0,part_load_share:0.5,dhw:false,vrf_zones:0,pipe_m:100,smallest_room_m3:150,occupancy:'general',gas_available:true,bms:'none',aha:'Short occupancy hours mean high-capex plant rarely pays back, so emitter upgrades to lower flow temperature often beat plant upgrades.'},
  hospital:{city:'brussels',need:'both',load_kw:800,load_cool_kw:700,simultaneous:true,t_flow_heat:55,t_return_heat:45,t_chw_supply:7,t_chw_return:12,glycol:false,location:'roof',environment:'normal',noise_limit_dba:50,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'lcc',reliability:'critical',redundancy:'N+1',critical_share:0.6,part_load_share:0.4,dhw:true,vrf_zones:0,pipe_m:150,smallest_room_m3:12,occupancy:'restricted',gas_available:true,bms:'bacnet',aha:'Small rooms with restricted occupancy make EN 378 charge limits, not capacity, the deciding constraint for direct expansion.'},
  data_center:{city:'amsterdam',need:'cool',load_kw:0,load_cool_kw:1000,simultaneous:false,t_flow_heat:45,t_return_heat:35,t_chw_supply:18,t_chw_return:24,glycol:true,location:'ground',environment:'normal',noise_limit_dba:55,noise_dist_m:50,refrigerant_policy:'low_gwp',priority:'lcc',reliability:'life',redundancy:'2N',critical_share:1,part_load_share:0.3,dhw:false,vrf_zones:0,pipe_m:120,smallest_room_m3:200,occupancy:'supervised',gas_available:false,bms:'bacnet',aha:'At 18 C chilled water, free cooling covers most hours in northern Europe and the rejected heat can feed district heating.'},
  pool:{city:'munich',need:'both',load_kw:350,load_cool_kw:150,simultaneous:true,t_flow_heat:45,t_return_heat:35,t_chw_supply:7,t_chw_return:12,glycol:false,location:'plantroom',environment:'humid_indoor',noise_limit_dba:55,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'lcc',reliability:'business',redundancy:'N+1',critical_share:0.3,part_load_share:0.7,dhw:true,vrf_zones:0,pipe_m:60,smallest_room_m3:50,occupancy:'general',gas_available:true,bms:'bacnet',aha:'Heat recovered from dehumidification can cover most pool water heating, while chlorinated humid air rules out unprotected indoor coils.'},
  warehouse:{city:'hamburg',need:'heat',load_kw:200,load_cool_kw:0,simultaneous:false,t_flow_heat:45,t_return_heat:35,t_chw_supply:7,t_chw_return:12,glycol:false,location:'ground',environment:'normal',noise_limit_dba:60,noise_dist_m:30,refrigerant_policy:'any',priority:'capex',reliability:'standard',redundancy:'N',critical_share:0,part_load_share:0.5,dhw:false,vrf_zones:0,pipe_m:150,smallest_room_m3:2000,occupancy:'general',gas_available:true,bms:'none',aha:'High ceilings and frequent door openings favour radiant or destratified heating over higher flow temperatures.'},
  industry:{city:'milan',need:'both',load_kw:1200,load_cool_kw:800,simultaneous:true,t_flow_heat:70,t_return_heat:50,t_chw_supply:7,t_chw_return:12,glycol:true,location:'ground',environment:'industrial',noise_limit_dba:65,noise_dist_m:30,refrigerant_policy:'low_gwp',priority:'co2',reliability:'business',redundancy:'N+1',critical_share:0.5,part_load_share:0.5,dhw:false,vrf_zones:0,pipe_m:200,smallest_room_m3:500,occupancy:'supervised',gas_available:true,bms:'bacnet',aha:'Process cooling rejects heat that a heat pump can lift for process heating at a combined COP above 6.'},
  offshore:{city:'oslo',need:'both',load_kw:500,load_cool_kw:600,simultaneous:false,t_flow_heat:55,t_return_heat:45,t_chw_supply:7,t_chw_return:12,glycol:true,location:'ground',environment:'coastal',noise_limit_dba:70,noise_dist_m:10,refrigerant_policy:'natural',priority:'compact',reliability:'critical',redundancy:'N+1',critical_share:0.8,part_load_share:0.6,dhw:true,vrf_zones:0,pipe_m:100,smallest_room_m3:20,occupancy:'restricted',gas_available:false,bms:'bacnet',aha:'Salt air, no gas supply and confined escape routes push towards seawater-cooled, low-charge or natural-refrigerant packages.'}
};

function clamp(x,a,b){ return x<a?a:(x>b?b:x); }

function lerp(x,x0,x1,y0,y1){
  if(x1===x0) return y0;
  var t=clamp((x-x0)/(x1-x0),0,1);
  return y0+t*(y1-y0);
}

function round(x,d){
  var f=Math.pow(10,d||0);
  return Math.round(x*f)/f;
}

/* ---- e02_state.js ---- */
var DEFAULT_STATE = {
  need: 'both',
  preset: 'office',
  city: 'brussels',
  t_win: null,
  t_sum: null,
  grid: null,
  load_kw: 300,
  load_cool_kw: 300,
  simultaneous: false,
  sources: ['air'],
  t_flow_heat: 45,
  t_return_heat: 35,
  t_chw_supply: 7,
  t_chw_return: 12,
  glycol: false,
  location: 'roof',
  environment: 'normal',
  noise_limit_dba: 55,
  noise_dist_m: 30,
  refrigerant_policy: 'any',
  priority: 'lcc',
  reliability: 'standard',
  redundancy: 'N',
  critical_share: 0,
  part_load_share: 0.3,
  dhw: false,
  atex_zone: 'none',
  atex_equipment_in_zone: false,
  vrf_zones: 0,
  pipe_m: 50,
  smallest_room_m3: 40,
  occupancy: 'general',
  voltage: 400,
  hz: 50,
  kw_avail: null,
  gas_available: true,
  gas_ban: false,
  bms: 'bacnet',
  delivery_year: 2027
};

function _cpVal(v) {
  if (Array.isArray(v)) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(_cpVal(v[i]));
    return a;
  }
  if (v !== null && typeof v === 'object') {
    var o = {};
    for (var k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = _cpVal(v[k]);
    }
    return o;
  }
  return v;
}

function _isNull(v) {
  return v === null || v === undefined;
}

function _hasKey(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function _applyClimate(state, city) {
  var c = CLIMATE[city];
  state.t_win = c.t_win;
  state.t_sum = c.t_sum;
  state.grid = c.grid;
}

function defaults(preset, city) {
  var state = _cpVal(DEFAULT_STATE);
  var p = _hasKey(PRESETS, preset) ? preset : 'office';
  var pr = PRESETS[p] || {};
  for (var k in pr) {
    if (!Object.prototype.hasOwnProperty.call(pr, k)) continue;
    if (k === 'aha') continue;
    state[k] = _cpVal(pr[k]);
  }
  state.preset = p;
  var c;
  if (_hasKey(CLIMATE, city)) c = city;
  else if (_hasKey(CLIMATE, pr.city)) c = pr.city;
  else c = 'brussels';
  state.city = c;
  if (_hasKey(CLIMATE, c)) _applyClimate(state, c);
  state._answered = [];
  return state;
}

function setParam(state, key, value) {
  var ns, i, k;
  var prevAnswered = (state && Array.isArray(state._answered)) ? state._answered.slice() : [];
  if (key === 'preset') {
    ns = defaults(value, state ? state.city : undefined);
    for (i = 0; i < prevAnswered.length; i++) {
      k = prevAnswered[i];
      if (k === 'preset' || k === '_answered') continue;
      if (state && Object.prototype.hasOwnProperty.call(state, k)) ns[k] = _cpVal(state[k]);
    }
  } else {
    ns = {};
    for (k in state) {
      if (!Object.prototype.hasOwnProperty.call(state, k)) continue;
      ns[k] = Array.isArray(state[k]) ? state[k].slice() : state[k];
    }
    ns[key] = Array.isArray(value) ? value.slice() : value;
    if (key === 'city' && _hasKey(CLIMATE, value)) _applyClimate(ns, value);
  }
  ns._answered = prevAnswered;
  if (ns._answered.indexOf(key) === -1) ns._answered.push(key);
  return ns;
}

function refrigOf(s) {
  if (!s || typeof s.refrigerant !== 'string') return null;
  var name = s.refrigerant.split('/')[0].replace(/[-\s]/g, '');
  if (!name) return null;
  if (_hasKey(REFRIGERANTS, name)) return REFRIGERANTS[name];
  var up = name.toUpperCase();
  if (_hasKey(REFRIGERANTS, up)) return REFRIGERANTS[up];
  return null;
}

function seriesMatches(s, cfgId, state) {
  var codes = [];
  function add(c) {
    if (codes.indexOf(c) === -1) codes.push(c);
  }
  var tech = TECH[cfgId];
  if (!s || !tech || !Array.isArray(tech.families) || tech.families.indexOf(s.family) === -1) {
    return ['FAMILY'];
  }
  var fam = s.family;
  var heatNeeded = state.need !== 'cool';
  var coolNeeded = state.need === 'cool' || state.need === 'both';

  if (typeof s.notes === 'string' && s.notes.toLowerCase().indexOf('discontinued') !== -1) {
    add('DISCONTINUED');
  }

  if (state.refrigerant_policy === 'natural' && fam !== 'boiler_gas') {
    var r = refrigOf(s);
    if (!r || r.natural !== true) add('REFRIG_POLICY');
  }

  if (heatNeeded && (fam === 'hp_aw' || fam === 'vrf') &&
      !_isNull(s.t_flow_max) && s.t_flow_max < state.t_flow_heat) {
    add('T_FLOW');
  }
  if (heatNeeded && cfgId === 'hp_cascade_ht' &&
      (_isNull(s.t_flow_max) || s.t_flow_max < Math.max(60, state.t_flow_heat))) {
    add('T_FLOW');
  }

  if ((fam === 'hp_aw' || fam === 'vrf') && heatNeeded &&
      !_isNull(s.t_amb_min) && !_isNull(state.t_win) && s.t_amb_min > state.t_win) {
    add('T_AMB_LOW');
  }

  if (coolNeeded && (fam === 'chiller_ac' || fam === 'vrf' || fam === 'hp_aw') &&
      !_isNull(s.t_amb_max) && !_isNull(state.t_sum) && s.t_amb_max < state.t_sum) {
    add('T_AMB_HIGH');
  }

  if (cfgId === 'vrf_3p_hr' && s.heat_recovery !== true) {
    add('NO_HR');
  }

  if (fam === 'vrf' && !_isNull(s.max_pipe_length_m) && state.pipe_m > s.max_pipe_length_m) {
    add('PIPE_LENGTH');
  }

  if (state.atex_equipment_in_zone &&
      ['1', '2', '21', '22'].indexOf(String(state.atex_zone)) !== -1 && !s.atex) {
    add('ATEX_IN_ZONE');
  }

  var cap = s.capacity_kw;
  if (cap) {
    if (fam !== 'vrf' && heatNeeded && _isNull(cap.heat_max) && _isNull(cap.cool_max)) {
      add('NO_CAPACITY');
    }
    if (fam === 'chiller_ac' && _isNull(cap.cool_max)) {
      add('NO_CAPACITY');
    }
  }

  return codes;
}

function dbSeries(db) {
  return (db && db.series) || [];
}

/* ---- e03_tech.js ---- */
function requiredFamilies(cfgId, state) {
  var t = TECH[cfgId];
  var fams = (t && t.families) ? t.families.slice() : [];
  var st = state || {};
  if (cfgId === 'chiller_boiler' && st.need === 'cool') {
    fams = fams.filter(function (f) { return f !== 'boiler_gas'; });
  }
  return fams;
}

function vrfCheck(cfgId, state) {
  var st = state || {};
  var t = TECH[cfgId] || {};
  var ref = REFRIGERANTS[t.refrigerant] || {};
  var factors = CONST.pl_factor || {};
  var occ = st.occupancy || 'general';
  var factor = _isNull(factors[occ]) ? (_isNull(factors.general) ? 1 : factors.general) : factors[occ];
  var pl = (_isNull(ref.pl) ? 0 : ref.pl) * factor;
  var pipe = _isNull(st.pipe_m) ? 0 : Number(st.pipe_m);
  var extra = CONST.vrf_charge_extra_kg_m || 0;
  var ckw = t.charge_kg_kw || 0;
  var allowed;
  var maxKw;
  if (_isNull(st.smallest_room_m3)) {
    allowed = null;
    maxKw = CONST.vrf_sys_max_kw;
  } else {
    allowed = pl * Number(st.smallest_room_m3);
    var byRoom = ckw > 0 ? (allowed - extra * pipe) / ckw : CONST.vrf_sys_max_kw;
    maxKw = Math.min(CONST.vrf_sys_max_kw, byRoom);
  }
  var ok = maxKw >= CONST.vrf_sys_min_kw;
  return { ok: ok, max_sys_kw: maxKw, allowed_kg: allowed, code: ok ? null : 'EN378_ROOM' };
}

function _techHasFam(fams, f) {
  return fams.indexOf(f) >= 0;
}

function technologies(state, db) {
  var st = state || {};
  var need = st.need;
  var hasDb = !!db;
  var series = hasDb ? (dbSeries(db) || []) : [];
  var hasSeries = hasDb && series.length > 0;
  var feasible = [];
  var excluded = [];
  var handoff = null;
  var zone = _isNull(st.atex_zone) ? null : String(st.atex_zone);

  for (var i = 0; i < CONFIG_IDS.length; i++) {
    var id = CONFIG_IDS[i];
    var t = TECH[id] || {};
    var fams = requiredFamilies(id, st);
    var reasons = [];
    var add = function (c) { if (reasons.indexOf(c) < 0) reasons.push(c); };
    var isVrf = (id === 'vrf_2p' || id === 'vrf_3p_hr');
    var usesHpOrVrf = _techHasFam(fams, 'hp_aw') || _techHasFam(fams, 'vrf');

    // Ventilation handoff
    if (need === 'vent') {
      add('VENT_HANDOFF');
      handoff = 'luchtgroepselector';
    }

    // ATEX
    if (st.atex_equipment_in_zone && zone !== null) {
      if (zone === '0' || zone === '20') {
        add('ATEX_ZONE0');
        add('ATEX_IN_ZONE');
      } else if (['1', '21', '2', '22'].indexOf(zone) >= 0) {
        var certified = false;
        if (hasDb && fams.length > 0) {
          certified = fams.every(function (f) {
            return series.some(function (s) {
              return s.family === f && !!s.atex && seriesMatches(s, id, st).length === 0;
            });
          });
        }
        if (!certified) add('ATEX_IN_ZONE');
      }
    }

    // Natural refrigerant policy
    if (st.refrigerant_policy === 'natural') {
      var usesRefrig = fams.some(function (f) { return f !== 'boiler_gas'; });
      if (isVrf) {
        add('REFRIG_POLICY');
      } else if (usesRefrig && !hasDb) {
        var r = REFRIGERANTS[t.refrigerant];
        if (!r || !r.natural) add('REFRIG_POLICY');
      }
    }

    // Need
    if (id === 'hp_mono' || id === 'hp_cascade_ht' || id === 'boiler_cascade') {
      if (need !== 'heat') add('NEED');
    } else if (id === 'rev_hp') {
      if (need !== 'both') add('NEED');
      else if (st.simultaneous) add('SIMULTANEOUS');
    } else if (id === 'multifunction_4p' || id === 'vrf_3p_hr') {
      if (need !== 'both') add('NEED');
      else if (!st.simultaneous) add('NOT_SIMULTANEOUS');
    } else if (id === 'vrf_2p') {
      if (need === 'both' && st.simultaneous) add('SIMULTANEOUS');
    } else if (id === 'chiller_boiler' || id === 'dh_chiller') {
      if (need !== 'cool' && need !== 'both') add('NEED');
    } else if (id === 'hybrid_hp_boiler') {
      if (need === 'cool') add('NEED');
    }

    // Gas
    if (_techHasFam(fams, 'boiler_gas')) {
      if (st.gas_ban) add('GAS_BAN');
      else if (!st.gas_available) add('GAS_UNAVAILABLE');
    }

    // District
    if (id === 'dh_chiller') {
      if ((st.sources || []).indexOf('district') < 0) add('NO_DISTRICT');
    }

    // Flow temperature
    if (need !== 'cool' && t.heat && !_isNull(st.t_flow_heat)) {
      var tf = Number(st.t_flow_heat);
      if (!_isNull(t.t_flow_max) && tf > t.t_flow_max) add('T_FLOW');
      if (id === 'hp_cascade_ht' && tf < 60) add('T_FLOW');
    }

    // Ambient (TECH level, no db)
    if (!hasDb) {
      if (usesHpOrVrf && need !== 'cool' && !_isNull(st.t_win) && !_isNull(t.t_amb_min)) {
        if (Number(st.t_win) < t.t_amb_min) add('T_AMB_LOW');
      }
      var hasCooling = _techHasFam(fams, 'chiller_ac') || _techHasFam(fams, 'vrf') ||
        (_techHasFam(fams, 'hp_aw') && !!t.cool);
      if ((need === 'cool' || need === 'both') && hasCooling && !_isNull(st.t_sum) && !_isNull(t.t_amb_max)) {
        if (Number(st.t_sum) > t.t_amb_max) add('T_AMB_HIGH');
      }
    }

    // VRF
    if (isVrf) {
      if (st.reliability === 'critical' || st.reliability === 'life') add('RELIABILITY');
      if (!hasSeries && !_isNull(st.pipe_m) && Number(st.pipe_m) > 165) add('PIPE_LENGTH');
      var vc = vrfCheck(id, st);
      if (!vc.ok) add('EN378_ROOM');
    }

    // Electrical
    if (!_isNull(st.kw_avail)) {
      var loadH = _isNull(st.load_kw) ? 0 : Number(st.load_kw);
      var loadC = _isNull(st.load_cool_kw) ? 0 : Number(st.load_cool_kw);
      var heatPart = (need !== 'cool' && usesHpOrVrf) ? loadH / ((t.scop35 || 3) * 0.6) : 0;
      var coolPart = (need !== 'heat' && t.seer) ? loadC / (t.seer * 0.55) : 0;
      var boilerOnly = fams.length > 0 && fams.every(function (f) { return f === 'boiler_gas'; });
      var inputKw = Math.max(heatPart, coolPart) + (boilerOnly ? 0.01 * loadH : 0);
      if (inputKw > Number(st.kw_avail)) add('ELECTRICAL');
    }

    // Series
    var seriesOk = hasDb ? [] : null;
    if (hasSeries) {
      for (var j = 0; j < fams.length; j++) {
        var f = fams[j];
        var passing = [];
        var failCodes = [];
        for (var k = 0; k < series.length; k++) {
          var s = series[k];
          if (s.family !== f) continue;
          var fails = seriesMatches(s, id, st) || [];
          if (fails.length === 0) {
            passing.push(s);
          } else {
            for (var m = 0; m < fails.length; m++) {
              if (fails[m] !== 'FAMILY' && failCodes.indexOf(fails[m]) < 0) failCodes.push(fails[m]);
            }
          }
        }
        if (passing.length === 0) {
          add('NO_SERIES');
          for (var n = 0; n < failCodes.length; n++) add(failCodes[n]);
        } else {
          for (var p = 0; p < passing.length; p++) {
            if (seriesOk.indexOf(passing[p].id) < 0) seriesOk.push(passing[p].id);
          }
        }
      }
    }

    if (reasons.length === 0) {
      feasible.push({ id: id, tech: t, families: fams, series_ok: seriesOk });
    } else {
      excluded.push({ id: id, reasons: reasons });
    }
  }

  return { feasible: feasible, excluded: excluded, handoff_to: handoff };
}

/* ---- e04_score.js ---- */
function techMetrics(id, state) {
  var t = TECH[id];
  var H = state.need !== 'cool' ? (state.load_kw || 0) : 0;
  var C = state.need !== 'heat' ? (state.load_cool_kw || state.load_kw || 0) : 0;
  var kw_main = state.need === 'cool' ? C : (state.need === 'heat' ? H : Math.max(H, C));
  var heat_kwh = H * CONST.eflh_heat;
  var cool_kwh = C * CONST.eflh_cool;

  var scop = null;
  if (!_isNull(t.scop35)) {
    var tf = _isNull(state.t_flow_heat) ? 35 : state.t_flow_heat;
    var s55 = !_isNull(t.scop55) ? t.scop55 : t.scop35 * 0.75;
    if (tf <= 55) {
      scop = lerp(tf, 35, 55, t.scop35, s55);
    } else {
      scop = Math.max(1.5, s55 * (1 - 0.03 * (tf - 55)));
    }
  }

  var elec_kwh = 0, gas_kwh = 0, dh_kwh = 0;
  if (heat_kwh > 0) {
    if (t.dh) {
      dh_kwh = heat_kwh;
    } else {
      var bs = clamp(_isNull(t.boiler_share) ? 0 : t.boiler_share, 0, 1);
      if (_isNull(scop) && bs < 1) bs = 1;
      var eta = !_isNull(t.eta_boiler) && t.eta_boiler > 0 ? t.eta_boiler : 0.9;
      if (bs > 0) gas_kwh = heat_kwh * bs / eta;
      if (bs < 1) elec_kwh += heat_kwh * (1 - bs) / scop;
    }
  }

  if (cool_kwh > 0) {
    elec_kwh += (!_isNull(t.seer) && t.seer > 0) ? cool_kwh / t.seer : cool_kwh / 3;
  }

  if ((t.hr_bonus || 0) > 0 && state.simultaneous) {
    var f = 1 - t.hr_bonus * Math.min(heat_kwh, cool_kwh) / Math.max(1, heat_kwh + cool_kwh) * 2;
    elec_kwh *= Math.max(0.5, f);
  }

  var primary = 2.1 * elec_kwh + 1.1 * gas_kwh + 1.3 * dh_kwh;
  var eff = (heat_kwh + cool_kwh) / Math.max(1, primary);

  var ck = t.capex_eur_kw || 0;
  var capex_eur;
  if (id === 'chiller_boiler') capex_eur = ck * C + 120 * H;
  else if (id === 'hybrid_hp_boiler') capex_eur = ck * kw_main + 120 * H * 0.5;
  else if (id === 'dh_chiller') capex_eur = ck * C + 80 * H;
  else capex_eur = ck * kw_main;

  var ref = t.refrigerant ? REFRIGERANTS[t.refrigerant] : null;
  var gwp = ref && !_isNull(ref.gwp) ? ref.gwp : 0;
  var charge_kg = (t.charge_kg_kw || 0) * kw_main;
  var grid = state.grid || 0;
  var co2_t20 = CONST.years * (elec_kwh * grid + gas_kwh * CONST.gas_kg_kwh + dh_kwh * 0.1) / 1000 +
    CONST.years * charge_kg * gwp * CONST.leak_rate / 1000;

  var lw_db = null, lp_db = null, noise_margin_db = null;
  if (!_isNull(t.lw_a)) {
    lw_db = t.lw_a + 10 * Math.log10(Math.max(1, kw_main));
    var r = Math.max(1, state.noise_dist_m || 1);
    lp_db = lw_db - 20 * Math.log10(r) - 8;
    if (state.location === 'indoor' || state.location === 'plantroom') lp_db -= 15;
    if (!_isNull(state.noise_limit_dba)) noise_margin_db = state.noise_limit_dba - lp_db;
  }

  var foot_m2 = (t.foot_m2_kw || 0) * kw_main;
  var maint = (t.maint || 0) + (gas_kwh > 0 ? 0.1 : 0) + 0.05 * (t.compressors || 0) / 4;

  return {
    kw_main: kw_main,
    heat_kwh: heat_kwh,
    cool_kwh: cool_kwh,
    elec_kwh: elec_kwh,
    gas_kwh: gas_kwh,
    dh_kwh: dh_kwh,
    scop_eff: scop,
    eff: eff,
    capex_eur: capex_eur,
    co2_t20: co2_t20,
    lw_db: lw_db,
    lp_db: lp_db,
    noise_margin_db: noise_margin_db,
    foot_m2: foot_m2,
    maint: maint,
    gwp: gwp,
    charge_kg: charge_kg
  };
}

function scoreAll(state, db, techRes) {
  techRes = techRes || technologies(state, db);
  var feasible = (techRes && techRes.feasible) || [];
  if (!feasible.length) return [];

  var seriesMap = {};
  if (db) {
    var list = dbSeries(db) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && !_isNull(list[i].id)) seriesMap[list[i].id] = list[i];
    }
  }

  var items = feasible.map(function (f) {
    return { f: f, m: techMetrics(f.id, state) };
  });

  function range(key) {
    var mn = Infinity, mx = -Infinity;
    for (var j = 0; j < items.length; j++) {
      var v = items[j].m[key];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return { min: mn, max: mx };
  }
  function normHigh(v, r) { return r.max === r.min ? 1 : (v - r.min) / (r.max - r.min); }
  function normLow(v, r) { return r.max === r.min ? 1 : (r.max - v) / (r.max - r.min); }

  var rEff = range('eff'), rCapex = range('capex_eur'), rCo2 = range('co2_t20'),
      rFoot = range('foot_m2'), rMaint = range('maint');
  var w = WEIGHTS[state.priority] || WEIGHTS.lcc;
  var envCoat = state.environment === 'coastal' || state.environment === 'industrial';
  var critical = state.reliability === 'critical' || state.reliability === 'life';

  var out = items.map(function (it) {
    var f = it.f, m = it.m, t = TECH[f.id];
    var n = {
      eff: normHigh(m.eff, rEff),
      capex: normLow(m.capex_eur, rCapex),
      co2: normLow(m.co2_t20, rCo2),
      noise: _isNull(m.noise_margin_db) ? 1 : clamp(m.noise_margin_db, 0, 10) / 10,
      foot: normLow(m.foot_m2, rFoot),
      maint: normLow(m.maint, rMaint)
    };
    var base = 0;
    ['eff', 'capex', 'co2', 'noise', 'foot', 'maint'].forEach(function (k) {
      base += (w[k] || 0) * n[k];
    });

    var series = [];
    if (db && f.series_ok && f.series_ok.length) {
      for (var s = 0; s < f.series_ok.length; s++) {
        var rec = seriesMap[f.series_ok[s]];
        if (rec) series.push(rec);
      }
    }
    var hasSeries = series.length > 0;
    function anyOpt(name) {
      return series.some(function (r) { return r.options && r.options[name] === true; });
    }

    var penalties = [];
    if (state.refrigerant_policy === 'low_gwp' && m.gwp > CONST.gwp_low) {
      penalties.push({ code: 'GWP_HIGH', value: -0.15 });
    }
    if (hasSeries && envCoat && !anyOpt('coil_coating')) {
      penalties.push({ code: 'NO_COATING', value: -0.10 });
    }
    if (hasSeries && state.environment === 'desert' && !anyOpt('high_ambient')) {
      penalties.push({ code: 'NO_HIGH_AMBIENT', value: -0.15 });
    }
    if (!_isNull(m.noise_margin_db) && m.noise_margin_db < 0 && (!db || !anyOpt('low_noise'))) {
      penalties.push({ code: 'NOISE', value: -0.20 });
    }
    if (critical) {
      var single = hasSeries
        ? series.every(function (r) { return r.circuits_min === 1; })
        : t.compressors === 1;
      if (single) penalties.push({ code: 'SINGLE_CIRCUIT', value: -0.20 });
    }

    var pen = 0;
    for (var p = 0; p < penalties.length; p++) pen += penalties[p].value;

    return {
      id: f.id,
      score: round(base + pen, 4),
      base: round(base, 4),
      criteria: {
        eff: round(n.eff, 4),
        capex: round(n.capex, 4),
        co2: round(n.co2, 4),
        noise: round(n.noise, 4),
        foot: round(n.foot, 4),
        maint: round(n.maint, 4)
      },
      penalties: penalties,
      metrics: m
    };
  });

  out.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return CONFIG_IDS.indexOf(a.id) - CONFIG_IDS.indexOf(b.id);
  });

  return out;
}

function scoreTech(config, state, db) {
  var id = typeof config === 'string' ? config : (config && config.id);
  if (_isNull(id)) return null;
  var ranked = scoreAll(state, db);
  for (var i = 0; i < ranked.length; i++) {
    if (ranked[i].id === id) {
      return { score: ranked[i].score, criteria: ranked[i].criteria, penalties: ranked[i].penalties };
    }
  }
  return null;
}

function topGap(ranked) {
  if (!ranked || !ranked.length) return 0;
  return ranked.length > 1 ? round(ranked[0].score - ranked[1].score, 4) : 1;
}

/* ---- e05_series.js ---- */
var GENERIC_UNIT_KW = {hp_aw: 200, chiller_ac: 400, boiler_gas: 300, vrf: 100};

// turndown text -> min load fraction: 'x-100 %' wins, then ratio a:b = min/max, else first number as %.
var _TD_RANGE = /(\d+(?:[.,]\d+)?)\s*-\s*100\s*%/;
var _TD_RATIO = /(?<![\p{L}\p{N}_-])(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)/u;
var _TD_PCT = /(\d+(?:[.,]\d+)?)\s*%?/;

function _tdNum(g) {
  return parseFloat(g.replace(',', '.'));
}

function parseTurndown(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number' && !isFinite(str)) return null;
  var s = String(str);
  var m = _TD_RANGE.exec(s);
  if (m) return clamp(_tdNum(m[1]) / 100.0, 0.0, 1.0);
  m = _TD_RATIO.exec(s);
  if (m) {
    var a = _tdNum(m[1]);
    var b = _tdNum(m[2]);
    if (a > 0 && b > 0) return clamp(Math.min(a, b) / Math.max(a, b), 0.0, 1.0);
  }
  m = _TD_PCT.exec(s);
  if (!m) return null;
  var v = _tdNum(m[1]);
  if (!isFinite(v)) return null;
  return clamp(v / 100.0, 0.0, 1.0);
}
function _dutyLoads(state) {
  var need = state.need;
  var H = need !== 'cool' ? (Number(state.load_kw) || 0) : 0;
  var C = need !== 'heat' ? (Number(state.load_cool_kw) || Number(state.load_kw) || 0) : 0;
  return {H: H, C: C};
}

function familyDuty(cfgId, fam, state) {
  var L = _dutyLoads(state);
  var H = L.H, C = L.C, need = state.need;
  if (fam === 'boiler_gas') return {role: 'boiler', duty_kw: H, mode: 'heat'};
  if (fam === 'chiller_ac') return {role: 'chiller', duty_kw: C, mode: 'cool'};
  if (fam === 'hp_aw') {
    if (cfgId === 'hybrid_hp_boiler') return {role: 'heat', duty_kw: 0.5 * H, mode: 'heat'};
    if ((cfgId === 'rev_hp' || cfgId === 'multifunction_4p') && need === 'both') {
      return {role: 'both', duty_kw: Math.max(H, C), mode: 'both'};
    }
    return {role: 'heat', duty_kw: H, mode: 'heat'};
  }
  if (fam === 'vrf') {
    if (need === 'both') return {role: 'both', duty_kw: Math.max(H, C), mode: 'both'};
    if (need === 'cool') return {role: 'cool', duty_kw: C, mode: 'cool'};
    return {role: 'heat', duty_kw: H, mode: 'heat'};
  }
  return {role: 'heat', duty_kw: H, mode: 'heat'};
}

function sizeUnits(state, cfgId, fam, unitHeat, unitCool, opts) {
  opts = opts || {};
  var warnings = [];
  var d = familyDuty(cfgId, fam, state);
  var L = _dutyLoads(state);
  var mode = d.mode;
  var hDuty = mode === 'both' ? L.H : (mode === 'heat' ? d.duty_kw : 0);
  var cDuty = mode === 'both' ? L.C : (mode === 'cool' ? d.duty_kw : 0);
  var needHeat = mode === 'heat' || mode === 'both';
  var needCool = mode === 'cool' || mode === 'both';
  var generic = GENERIC_UNIT_KW[fam] || 100;
  var uh = Number(unitHeat), uc = Number(unitCool);
  var noData = false;
  if (needHeat && (_isNull(unitHeat) || !isFinite(uh) || uh <= 0)) { uh = generic; noData = true; }
  if (needCool && (_isNull(unitCool) || !isFinite(uc) || uc <= 0)) { uc = generic; noData = true; }
  if (noData) warnings.push('NO_CAPACITY_DATA');
  if (fam === 'vrf' && !_isNull(opts.max_sys_kw) && Number(opts.max_sys_kw) > 0) {
    var mx = Number(opts.max_sys_kw);
    if (needHeat) uh = Math.min(uh, mx);
    if (needCool) uc = Math.min(uc, mx);
  }
  var nH = needHeat ? Math.ceil(hDuty / uh) : 0;
  var nC = needCool ? Math.ceil(cDuty / uc) : 0;
  var nBase = Math.max(1, nH, nC);
  var unitCap;
  if (mode === 'heat') unitCap = uh;
  else if (mode === 'cool') unitCap = uc;
  else unitCap = nH >= nC ? uh : uc;

  var rel = state.reliability || 'standard';
  var red = state.redundancy || 'N';
  if ((rel === 'critical' || rel === 'life') && red === 'N') red = 'N+1';
  var units = red === '2N' ? 2 * nBase : (red === 'N+1' ? nBase + 1 : nBase);
  if (rel === 'critical' || rel === 'life') units = Math.max(units, 2);
  if (rel === 'life' && red !== '2N') {
    var cs = clamp(Number(state.critical_share) || 0, 0, 1);
    units = Math.max(units, nBase + Math.ceil(nBase * cs));
  }

  var isBoiler = fam === 'boiler_gas';
  var circMap = {standard: 1, business: 2, critical: 2, life: 2};
  var circuitsRequired = isBoiler ? null : (circMap[rel] || 1);
  var dualPower = rel === 'life';
  var compressors;
  if (isBoiler) compressors = 0;
  else if (opts.circuits_min) compressors = Math.max(Number(opts.circuits_min), circuitsRequired || 1);
  else compressors = circuitsRequired || 1;

  var pls = clamp(Number(state.part_load_share) || 0, 0, 1);
  var minLoad = pls * d.duty_kw;
  var unitMin;
  if (opts.inverter === true || isBoiler) {
    var td = _isNull(opts.turndown) ? null : Number(opts.turndown);
    if (td === null || !isFinite(td)) {
      td = isBoiler ? 0.2 : 0.3;
      warnings.push('TURNDOWN_ASSUMED');
    }
    unitMin = unitCap * td;
  } else {
    unitMin = unitCap / Math.max(1, compressors);
  }
  var partLoad = {min_load_kw: round(minLoad, 2), unit_min_kw: round(unitMin, 2), ok: true};
  if (d.duty_kw > 0) {
    partLoad.ok = unitMin <= minLoad;
    if (!partLoad.ok) {
      warnings.push('BUFFER_TANK');
      partLoad.extra_modules = minLoad > 0 ? Math.max(0, Math.ceil(unitMin / minLoad) - 1) : null;
    }
  }

  return {
    duty_kw: d.duty_kw,
    role: d.role,
    mode: mode,
    unit_cap_kw: unitCap,
    n_base: nBase,
    units: units,
    redundancy: red,
    circuits_required: circuitsRequired,
    dual_power: dualPower,
    compressors: compressors,
    part_load: partLoad,
    warnings: warnings
  };
}

function _entryMargins(sz, s, state) {
  var duty = sz.duty_kw;
  var heatMode = sz.mode === 'heat' || sz.mode === 'both';
  return {
    capacity: round((sz.n_base * sz.unit_cap_kw - duty) / Math.max(1, duty), 3),
    t_flow: (s && heatMode && !_isNull(s.t_flow_max) && !_isNull(state.t_flow_heat)) ? s.t_flow_max - state.t_flow_heat : null,
    t_amb_low: (s && !_isNull(s.t_amb_min) && !_isNull(state.t_win)) ? state.t_win - s.t_amb_min : null,
    t_amb_high: (s && !_isNull(s.t_amb_max) && !_isNull(state.t_sum)) ? s.t_amb_max - state.t_sum : null
  };
}

function seriesFor(config, state, db) {
  var id = typeof config === 'string' ? config : (config && config.id);
  var seriesOk = (config && typeof config === 'object' && Array.isArray(config.series_ok)) ? config.series_ok : null;
  var fams = requiredFamilies(id, state) || [];
  var all = dbSeries(db) || [];
  var out = [];
  var vrfMax = null;
  if (fams.indexOf('vrf') >= 0) {
    var vc = vrfCheck(id, state);
    vrfMax = vc ? vc.max_sys_kw : null;
  }

  for (var i = 0; i < fams.length; i++) {
    var f = fams[i];

    if (all.length === 0) {
      var g = GENERIC_UNIT_KW[f] || 100;
      var gsz = sizeUnits(state, id, f, g, g, {
        max_sys_kw: f === 'vrf' ? vrfMax : null,
        inverter: true,
        turndown: null,
        circuits_min: null
      });
      var gfg = fgasCheck(f, TECH[id] ? TECH[id].refrigerant : null, null, gsz.unit_cap_kw, state, null);
      var gw = ['GENERIC'].concat(gsz.warnings);
      if (gfg.status === 'banned') gw.push('FGAS_BAN');
      out.push({
        family: f,
        role: gsz.role,
        series: null,
        units: gsz.units,
        n_base: gsz.n_base,
        unit_cap_kw: gsz.unit_cap_kw,
        circuits: gsz.circuits_required,
        compressors: gsz.compressors,
        redundancy: gsz.redundancy,
        dual_power: gsz.dual_power,
        part_load: gsz.part_load,
        warnings: gw,
        fgas: gfg,
        margins: _entryMargins(gsz, null, state)
      });
      continue;
    }

    var entries = [];
    for (var j = 0; j < all.length; j++) {
      var s = all[j];
      if (!s || s.family !== f) continue;
      if (seriesOk && seriesOk.indexOf(s.id) < 0) continue;
      var fails = seriesMatches(s, id, state) || [];
      if (fails.length !== 0) continue;
      var cap = s.capacity_kw || {};
      var circMin = _isNull(s.circuits_min) ? null : s.circuits_min;
      var sz = sizeUnits(state, id, f, cap.heat_max, cap.cool_max, {
        max_sys_kw: f === 'vrf' ? vrfMax : null,
        inverter: s.inverter,
        turndown: parseTurndown(s.turndown),
        circuits_min: circMin
      });
      var warns = sz.warnings.slice();
      if (circMin !== null && sz.circuits_required && circMin < sz.circuits_required && !(sz.units >= 2)) {
        warns.push('CIRCUITS');
      }
      var fg = fgasCheck(f, s.refrigerant, s.gwp, sz.unit_cap_kw, state, s.refrigerant_alt);
      if (fg.status === 'banned') warns.push('FGAS_BAN');
      else if (fg.status === 'alt') warns.push('FGAS_ALT');
      entries.push({
        family: f,
        role: sz.role,
        series: {
          id: s.id,
          manufacturer: s.manufacturer,
          series: s.series,
          url_source: s.url_source || [],
          data_date: _isNull(s.data_date) ? null : s.data_date,
          refrigerant: _isNull(s.refrigerant) ? null : s.refrigerant,
          inverter: _isNull(s.inverter) ? null : s.inverter
        },
        units: sz.units,
        n_base: sz.n_base,
        unit_cap_kw: sz.unit_cap_kw,
        circuits: sz.circuits_required,
        compressors: sz.compressors,
        redundancy: sz.redundancy,
        dual_power: sz.dual_power,
        part_load: sz.part_load,
        warnings: warns,
        fgas: fg,
        margins: _entryMargins(sz, s, state)
      });
    }

    entries.sort(function (a, b) {
      if (a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
      if (a.units !== b.units) return a.units - b.units;
      var na = (a.series.manufacturer || '') + ' ' + (a.series.series || '');
      var nb = (b.series.manufacturer || '') + ' ' + (b.series.series || '');
      var c = na.localeCompare(nb, 'en');
      if (c !== 0) return c;
      return String(a.series.id).localeCompare(String(b.series.id), 'en');
    });

    for (var k = 0; k < entries.length; k++) out.push(entries[k]);
  }

  return out;
}

/* ---- e06_explain.js ---- */
var QUESTIONS = [
  { param: 'need', level: 1, kind: 'enum', options: ['heat', 'cool', 'both', 'vent'] },
  { param: 'preset', level: 1, kind: 'enum', options: Object.keys(PRESETS) },
  { param: 'city', level: 1, kind: 'enum', options: Object.keys(CLIMATE) },
  { param: 'load_kw', level: 1, kind: 'number', min: 20, max: 500 },
  { param: 'location', level: 1, kind: 'enum', options: ['roof', 'ground', 'plantroom', 'indoor'] },
  { param: 'noise_limit_dba', level: 1, kind: 'number', min: 35, max: 70 },
  { param: 'refrigerant_policy', level: 1, kind: 'enum', options: ['any', 'low_gwp', 'natural'] },
  { param: 'priority', level: 1, kind: 'enum', options: ['capex', 'lcc', 'co2', 'compact'] },

  { param: 'simultaneous', level: 2, kind: 'bool' },
  { param: 't_flow_heat', level: 2, kind: 'number', min: 35, max: 90 },
  { param: 'reliability', level: 2, kind: 'enum', options: ['standard', 'business', 'critical', 'life'] },
  { param: 'redundancy', level: 2, kind: 'enum', options: ['N', 'N+1', '2N'] },
  { param: 'gas_available', level: 2, kind: 'bool' },
  { param: 'gas_ban', level: 2, kind: 'bool' },
  { param: 'sources', level: 2, kind: 'enum', options: [['air'], ['air', 'district']] },
  { param: 'environment', level: 2, kind: 'enum', options: ['normal', 'coastal', 'industrial', 'urban', 'desert', 'humid_indoor'] },
  { param: 'load_cool_kw', level: 2, kind: 'number', min: 20, max: 500 },
  { param: 'pipe_m', level: 2, kind: 'number', min: 10, max: 200 },
  { param: 'smallest_room_m3', level: 2, kind: 'number', min: 5, max: 200 },
  { param: 'occupancy', level: 2, kind: 'enum', options: ['general', 'supervised', 'restricted'] },
  { param: 'part_load_share', level: 2, kind: 'number', min: 0.1, max: 0.8 },
  { param: 'atex_zone', level: 2, kind: 'enum', options: ['none', '0', '1', '2', '20', '21', '22'] },
  { param: 'atex_equipment_in_zone', level: 2, kind: 'bool' },
  { param: 'noise_dist_m', level: 2, kind: 'number', min: 5, max: 100 },
  { param: 't_chw_supply', level: 2, kind: 'number', min: 5, max: 20 },
  { param: 'critical_share', level: 2, kind: 'number', min: 0, max: 1 },
  { param: 'dhw', level: 2, kind: 'bool' },
  { param: 'glycol', level: 2, kind: 'bool' },
  { param: 'kw_avail', level: 2, kind: 'number', min: 50, max: 1000 },
  { param: 'voltage', level: 2, kind: 'enum', options: [230, 400, 690] },
  { param: 'hz', level: 2, kind: 'enum', options: [50, 60] },
  { param: 'bms', level: 2, kind: 'enum', options: ['none', 'bacnet', 'modbus', 'knx', 'lon'] },
  { param: 'delivery_year', level: 2, kind: 'number', min: 2026, max: 2035 }
];

function _sameVal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_sameVal(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) return true;
  return false;
}

function _withVal(state, key, value) {
  var s = {};
  var src = state || {};
  for (var k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) {
      s[k] = Array.isArray(src[k]) ? src[k].slice() : src[k];
    }
  }
  s[key] = Array.isArray(value) ? value.slice() : value;
  if (key === 'city' && CLIMATE && Object.prototype.hasOwnProperty.call(CLIMATE, value)) {
    var c = CLIMATE[value] || {};
    if (c.t_win !== undefined) s.t_win = c.t_win;
    if (c.t_sum !== undefined) s.t_sum = c.t_sum;
    if (c.grid !== undefined) s.grid = c.grid;
  }
  return s;
}

function _findQ(param) {
  for (var i = 0; i < QUESTIONS.length; i++) {
    if (QUESTIONS[i].param === param) return QUESTIONS[i];
  }
  return null;
}

function sampleDomain(q, state) {
  if (!q) return [];
  if (q.kind === 'bool') return [true, false];
  if (q.kind === 'enum') return (q.options || []).slice();
  if (q.kind === 'number') {
    var raw = [q.min];
    var cur = state ? state[q.param] : undefined;
    if (typeof cur === 'number' && !isNaN(cur)) raw.push(cur);
    raw.push(q.max);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        if (out[j] === raw[i]) { dup = true; break; }
      }
      if (!dup) out.push(raw[i]);
    }
    return out;
  }
  return [];
}

function _gapNum(g) {
  return (typeof g === 'number' && !isNaN(g)) ? g : 0;
}

function run(state, db) {
  var tech = technologies(state, db);
  var ranked = scoreAll(state, db, tech) || [];
  var top = ranked[0] ? ranked[0].id : null;
  var series = [];
  if (ranked[0]) {
    var feas = (tech && tech.feasible) || [];
    var cfg = feas.filter(function (f) { return f.id === ranked[0].id; })[0];
    if (cfg) series = seriesFor(cfg, state, db) || [];
  }
  var result = {
    state: state,
    tech: tech,
    ranked: ranked,
    top: top,
    gap: topGap(ranked),
    handoff_to: tech ? tech.handoff_to : undefined,
    series: series
  };
  Object.defineProperty(result, '_db', { value: db, enumerable: false, writable: true, configurable: true });
  return result;
}

function _quick(state, db) {
  var tech = technologies(state, db);
  var ranked = scoreAll(state, db, tech) || [];
  return { top: ranked[0] ? ranked[0].id : null, gap: topGap(ranked) };
}

function sensitivity(q, state, db, base) {
  if (!q) return 0;
  if (!base) base = _quick(state, db);
  var cur = state ? state[q.param] : undefined;
  var samples = sampleDomain(q, state);
  var n = 0, changed = 0, sumD = 0;
  var baseGap = _gapNum(base.gap);
  for (var i = 0; i < samples.length; i++) {
    var v = samples[i];
    if (_sameVal(v, cur)) continue;
    var r = _quick(_withVal(state, q.param, v), db);
    n++;
    if (r.top !== base.top) changed++;
    sumD += Math.abs(_gapNum(r.gap) - baseGap);
  }
  if (n === 0) return 0;
  var S = (changed / n) + (sumD / n);
  return round(S, 4);
}

function _qOut(q, state, level, S) {
  var o = { param: q.param, level: level, kind: q.kind };
  if (q.kind === 'enum') o.options = q.options.slice();
  if (q.kind === 'bool') o.options = [true, false];
  if (q.kind === 'number') { o.min = q.min; o.max = q.max; }
  o.value = state ? state[q.param] : undefined;
  o.S = S;
  return o;
}

function nextQuestion(state, level, db) {
  var answered = (state && state._answered) || [];
  var i, q;
  for (i = 0; i < QUESTIONS.length; i++) {
    q = QUESTIONS[i];
    if (q.level === 1 && answered.indexOf(q.param) === -1) {
      return _qOut(q, state, 1, null);
    }
  }
  if (level === 1) return null;

  if (level === 3) {
    for (i = 0; i < QUESTIONS.length; i++) {
      q = QUESTIONS[i];
      if (q.level === 2 && answered.indexOf(q.param) === -1) {
        return _qOut(q, state, 3, sensitivity(q, state, db));
      }
    }
    return null;
  }

  var askedL2 = answered.filter(function (p) {
    var qq = _findQ(p);
    return qq && qq.level === 2;
  });
  if (askedL2.length >= 7) return null;
  var base = _quick(state, db);
  if (_gapNum(base.gap) > 0.15) return null;
  var best = null, bestS = -Infinity;
  for (i = 0; i < QUESTIONS.length; i++) {
    q = QUESTIONS[i];
    if (q.level !== 2 || answered.indexOf(q.param) !== -1) continue;
    var S = sensitivity(q, state, db, base);
    if (S > bestS) { bestS = S; best = q; }
  }
  if (!best || bestS < 0.05) return null;
  return _qOut(best, state, 2, bestS);
}

function explain(result) {
  var db = result._db;
  var st = result.state || {};
  var ranked = result.ranked || [];
  var w = WEIGHTS[st.priority] || WEIGHTS.lcc;
  var keys = ['eff', 'capex', 'co2', 'noise', 'foot', 'maint'];
  var top3 = [];
  var i, j;
  for (i = 0; i < ranked.length && i < 3; i++) {
    var r = ranked[i];
    var crit = r.criteria || {};
    var pens = r.penalties || [];
    var contrib = keys.map(function (k, idx) {
      return { k: k, v: (w[k] || 0) * (crit[k] || 0), idx: idx };
    });
    contrib.sort(function (a, b) {
      if (b.v !== a.v) return b.v - a.v;
      return a.idx - b.idx;
    });
    var why = contrib.slice(0, 2).map(function (c) { return c.k; });
    var against = pens.map(function (p) { return p.code; });
    for (j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (typeof crit[k] === 'number' && crit[k] < 0.25 && (w[k] || 0) >= 0.15) against.push(k);
    }
    top3.push({ id: r.id, score: r.score, criteria: r.criteria, penalties: r.penalties, why: why, against: against });
  }
  var runnerUp = ranked[1] ? { id: ranked[1].id, score: ranked[1].score } : null;
  var gap = ranked.length ? _gapNum(result.gap) : 0;

  var flips = [];
  for (i = 0; i < QUESTIONS.length && flips.length < 12; i++) {
    var q = QUESTIONS[i];
    var cur = st[q.param];
    var samples = sampleDomain(q, st);
    for (j = 0; j < samples.length; j++) {
      var v = samples[j];
      if (_sameVal(v, cur)) continue;
      var t = _quick(_withVal(st, q.param, v), db);
      if (t.top !== result.top) {
        flips.push({ param: q.param, value: v, newTop: t.top });
        break;
      }
    }
  }

  var base = { top: result.top, gap: gap };
  var answered = st._answered || [];
  var sumAll = 0, sumAns = 0;
  for (i = 0; i < QUESTIONS.length; i++) {
    var S = sensitivity(QUESTIONS[i], st, db, base);
    sumAll += S;
    if (answered.indexOf(QUESTIONS[i].param) !== -1) sumAns += S;
  }
  var part1 = sumAll > 0 ? sumAns / sumAll : 1;
  var confidence = round(0.5 * part1 + 0.5 * Math.min(1, gap / 0.2), 3);

  return {
    top3: top3,
    runnerUp: runnerUp,
    gap: gap,
    flips: flips,
    confidence: confidence,
    excluded: result.tech ? result.tech.excluded : [],
    handoff_to: result.handoff_to
  };
}

/* ---- e07_tender.js ---- */
function _tsNum(x) {
  if (_isNull(x)) return '?';
  if (typeof x === 'number') return String(round(x, 1));
  return String(x);
}

function _tsEq(text) {
  var t = String(text).replace(/\s+$/, '').replace(/[.;,]+$/, '');
  if (/or (an )?equivalent/.test(t)) return t + '.';
  return t + ', or equivalent.';
}

function _tsKind(fam, role) {
  var f = String(fam || '').toLowerCase();
  var r = String(role || '').toLowerCase();
  if (f.indexOf('boiler') >= 0) return 'boiler';
  if (f.indexOf('chiller') >= 0) return 'chiller';
  if (f.indexOf('heat_pump') >= 0 || f.indexOf('heatpump') >= 0 || f.indexOf('hp') >= 0) return 'hp';
  if (r.indexOf('cool') >= 0 && r.indexOf('heat') < 0) return 'chiller';
  return 'hp';
}

function _tsModes(kind, role) {
  var r = String(role || '').toLowerCase();
  var coolOnly = r.indexOf('cool') >= 0 && r.indexOf('heat') < 0;
  var heat = kind === 'boiler' || (kind === 'hp' && !coolOnly);
  var cool = kind === 'chiller' || r.indexOf('cool') >= 0 || r === 'both';
  return { heat: heat, cool: cool };
}

function _tsPolicy(state) {
  var v = state.refrigerant_policy;
  return (v === 'low_gwp' || v === 'natural' || v === 'any') ? v : 'any';
}

function _tsEnv(state) {
  return _isNull(state.environment) ? '' : String(state.environment).toLowerCase();
}

function _tsFirstEntry(entries, fam) {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i] && entries[i].family === fam) return entries[i];
  }
  return null;
}

function _tsSeriesAllowed(feasEntry, s) {
  if (!feasEntry || !Array.isArray(feasEntry.series_ok)) return true;
  return feasEntry.series_ok.indexOf(s.id) >= 0;
}

function _tsA(x) { return _isNull(x) ? null : (typeof x === 'number' ? round(x, 1) : x); }

function tenderSpec(state, result, db) {
  state = state || {};
  result = result || {};
  var cfgId = result.top;
  if (_isNull(cfgId) || !TECH[cfgId]) {
    return { config: null, clauses: [], matches: [], per_family: {}, ok: false, note: 'No feasible configuration' };
  }
  var families = requiredFamilies(cfgId, state) || [];
  var entries = result.series || seriesFor(cfgId, state, db) || [];
  var clauses = [];
  var i, fam, e, kind, role, fi;
  var famInfo = [];
  for (i = 0; i < families.length; i++) {
    fam = families[i];
    e = _tsFirstEntry(entries, fam);
    role = e ? e.role : '';
    kind = _tsKind(fam, role);
    famInfo.push({ fam: fam, entry: e, role: role, kind: kind, modes: _tsModes(kind, role) });
  }
  var roleKeySet = {both: true, heat: true, cool: true, chiller: true, boiler: true};
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    e = fi.entry;
    if (!e) continue;
    var duty, dutyNode, dutyP;
    if (fi.modes.heat && fi.modes.cool) {
      duty = _tsNum(state.load_kw) + ' kW heating / ' + _tsNum(state.load_cool_kw) + ' kW cooling';
      dutyNode = { key: 'duty_hc', args: { h: _tsA(state.load_kw), c: _tsA(state.load_cool_kw) } };
    } else if (fi.modes.cool) {
      duty = _tsNum(state.load_cool_kw) + ' kW';
      dutyNode = { key: 'duty_kw', args: { p: _tsA(state.load_cool_kw) } };
    } else {
      dutyP = fi.fam === 'hp_aw' && cfgId === 'hybrid_hp_boiler' ? state.load_kw * 0.5 : state.load_kw;
      duty = _tsNum(dutyP) + ' kW';
      dutyNode = { key: 'duty_kw', args: { p: _tsA(dutyP) } };
    }
    var roleTxt = {both: 'Heating/cooling', heat: 'Heating', cool: 'Cooling', chiller: 'Cooling (chiller)', boiler: 'Boiler'}[fi.role] || fi.fam;
    var roleNode = (typeof fi.role === 'string' && roleKeySet.hasOwnProperty(fi.role))
      ? { key: 'role_' + fi.role, args: {} }
      : { key: 'role_fam', args: { fam: fi.fam } };
    var redStr = _isNull(e.redundancy) ? 'N' : String(e.redundancy);
    clauses.push({
      id: 'C_DUTY', family: fi.fam,
      text: _tsEq(roleTxt + ' duty: ' + _tsNum(e.n_base) + ' x ' + _tsNum(e.unit_cap_kw) + ' kW, total installed ' +
        _tsNum(e.units) + ' units (' + (_isNull(e.redundancy) ? 'N' : String(e.redundancy)) + '), design load ' + duty),
      basis: 'Project design data',
      key: 'duty',
      args: {
        role: roleNode,
        n: _tsA(e.n_base),
        cap: _tsA(e.unit_cap_kw),
        units: _tsA(e.units),
        red: redStr,
        duty: dutyNode
      }
    });
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    var parts = [];
    var partNodes = [];
    if (fi.modes.heat) {
      parts.push('heating flow/return ' + _tsNum(state.t_flow_heat) + '/' + _tsNum(state.t_return_heat) +
        ' °C at outdoor ' + _tsNum(state.t_win) + ' °C');
      partNodes.push({ key: 'part_heat', args: { f: _tsA(state.t_flow_heat), r: _tsA(state.t_return_heat), t: _tsA(state.t_win) } });
    }
    if (fi.modes.cool) {
      parts.push('chilled water ' + _tsNum(state.t_chw_supply) + '/' + _tsNum(state.t_chw_return) +
        ' °C at outdoor ' + _tsNum(state.t_sum) + ' °C');
      partNodes.push({ key: 'part_cool', args: { s: _tsA(state.t_chw_supply), r: _tsA(state.t_chw_return), t: _tsA(state.t_sum) } });
    }
    if (parts.length) {
      clauses.push({ id: 'C_TEMPS', family: fi.fam, text: _tsEq('Rated capacity at ' + parts.join('; ')), basis: 'EN 14511',
        key: 'temps', args: { parts: partNodes } });
    }
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    var st, basis, seasKey;
    if (fi.kind === 'boiler') {
      st = 'Seasonal space heating energy efficiency ηs declared per Commission Regulation (EU) No 813/2013';
      basis = '(EU) 813/2013';
      seasKey = 'seasonal_boiler';
    } else if (fi.kind === 'chiller') {
      st = 'Seasonal efficiency SEER (comfort) / SEPR (process) declared per Commission Regulation (EU) 2016/2281';
      basis = '(EU) 2016/2281';
      seasKey = 'seasonal_chiller';
    } else {
      st = 'SCOP declared to EN 14825 for the average climate at 35 °C and 55 °C';
      basis = 'EN 14825';
      seasKey = 'seasonal_hp';
    }
    st += '; performance certified by Eurovent Certified Performance or equivalent third-party program';
    clauses.push({ id: 'C_SEASONAL', family: fi.fam, text: _tsEq(st), basis: basis + '; Eurovent',
      key: seasKey, args: {} });
  }
  var pol = _tsPolicy(state);
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    if (fi.kind === 'boiler') continue;
    var rt, rKey, rArgs;
    if (pol === 'low_gwp') {
      rt = 'Refrigerant with GWP (AR4, Regulation (EU) 2024/573 Annex) < ' + _tsNum(CONST.gwp_low);
      rKey = 'refrig_low';
      rArgs = { gwp: _tsA(CONST.gwp_low) };
    } else if (pol === 'natural') {
      rt = 'Natural refrigerant only: R290, R744, R717 or R718';
      rKey = 'refrig_natural';
      rArgs = {};
    } else {
      rt = 'Refrigerant compliant with Regulation (EU) 2024/573 placing-on-market prohibitions in force at delivery';
      rKey = 'refrig_any';
      rArgs = {};
    }
    clauses.push({ id: 'C_REFRIG', family: fi.fam, text: _tsEq(rt), basis: '(EU) 2024/573',
      key: rKey, args: rArgs });
    if (pol === 'low_gwp') {
      var dy = String(deliveryYear(state));
      clauses.push({ id: 'C_FGAS', family: fi.fam,
        text: _tsEq('Equipment not subject to a placing-on-the-market prohibition of Regulation (EU) 2024/573 Annex IV in force on 1 January ' + dy + ' (planned delivery year)'),
        basis: '(EU) 2024/573 Annex IV', key: 'fgas_delivery', args: { year: dy } });
    }
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    if (fi.kind === 'boiler') continue;
    clauses.push({ id: 'C_EN378', family: fi.fam,
      text: _tsEq('Refrigerant charge limits and machinery room requirements per EN 378-1:2016+A1:2020 and EN 378-3:2016+A1:2020'),
      basis: 'EN 378-1/-3',
      key: 'en378', args: {} });
    clauses.push({ id: 'C_A2L', family: fi.fam,
      text: _tsEq('Where an A2L or A3 refrigerant is offered: charge limits, leak detection and ventilation also per EN IEC 60335-2-40:2024 within its scope'),
      basis: 'EN IEC 60335-2-40:2024',
      key: 'iec60335', args: {} });
  }
  if (!_isNull(state.noise_limit_dba)) {
    clauses.push({ id: 'C_NOISE', family: null,
      text: _tsEq('Sound power Lw declared per EN ISO 9614-2 / EN 12102-1; sound pressure at receiver <= ' +
        _tsNum(state.noise_limit_dba) + ' dB(A) at ' + _tsNum(state.noise_dist_m) + ' m'),
      basis: 'EN ISO 9614-2; EN 12102-1',
      key: 'noise', args: { db: _tsA(state.noise_limit_dba), m: _tsA(state.noise_dist_m) } });
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    e = fi.entry;
    if (!e) continue;
    var rl = [];
    var rlItems = [];
    if (!_isNull(e.circuits)) {
      rl.push('independent circuits >= ' + _tsNum(e.circuits) + ' per unit');
      rlItems.push({ key: 'rel_circuits', args: { n: _tsA(e.circuits) } });
    }
    if (!_isNull(e.redundancy)) {
      rl.push('redundancy ' + String(e.redundancy));
      rlItems.push({ key: 'rel_red', args: { red: String(e.redundancy) } });
    }
    if (e.dual_power) {
      rl.push('dual power supply');
      rlItems.push({ key: 'rel_dual', args: {} });
    }
    if (rl.length) {
      clauses.push({ id: 'C_RELIAB', family: fi.fam, text: _tsEq('Reliability: ' + rl.join(', ')), basis: 'Project reliability requirement',
        key: 'reliab', args: { items: rlItems } });
    }
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    e = fi.entry;
    if (!e || !e.part_load || _isNull(e.part_load.min_load_kw)) continue;
    clauses.push({ id: 'C_PARTLOAD', family: fi.fam,
      text: _tsEq('Minimum stable capacity <= ' + _tsNum(e.part_load.min_load_kw) + ' kW per unit, or buffer storage provided'),
      basis: 'Manufacturer data',
      key: 'partload', args: { kw: _tsA(e.part_load.min_load_kw) } });
  }
  var env = _tsEnv(state);
  if (env === 'coastal' || env === 'industrial') {
    clauses.push({ id: 'C_ENV', family: null, text: _tsEq('Coil and casing corrosion protection suitable for ' + env + ' environments'), basis: 'EN ISO 12944-2',
      key: env === 'coastal' ? 'env_coastal' : 'env_industrial', args: {} });
  } else if (env === 'desert') {
    clauses.push({ id: 'C_ENV', family: null, text: _tsEq('High ambient operation kit for desert conditions at ' + _tsNum(state.t_sum) + ' °C'), basis: 'Manufacturer data',
      key: 'env_desert', args: { t: _tsA(state.t_sum) } });
  }
  if (!_isNull(state.atex_zone) && state.atex_zone !== 'none') {
    clauses.push({ id: 'C_ATEX', family: null,
      text: _tsEq('Equipment located in hazardous area zone ' + String(state.atex_zone) +
        ' certified per Directive 2014/34/EU for that zone; otherwise installed outside the hazardous area'),
      basis: 'Directive 2014/34/EU',
      key: 'atex', args: { zone: String(state.atex_zone) } });
  }
  if (!_isNull(state.bms) && state.bms !== 'none') {
    clauses.push({ id: 'C_BMS', family: null, text: _tsEq('Native BMS communication protocol: ' + String(state.bms)), basis: 'Project BMS standard',
      key: 'bms', args: { proto: String(state.bms) } });
  }
  if (!_isNull(state.voltage) || !_isNull(state.hz)) {
    clauses.push({ id: 'C_ELEC', family: null, text: _tsEq('Electrical supply ' + _tsNum(state.voltage) + ' V / ' + _tsNum(state.hz) + ' Hz'), basis: 'EN 60204-1',
      key: 'elec', args: { v: _tsA(state.voltage), hz: _tsA(state.hz) } });
  }
  for (i = 0; i < famInfo.length; i++) {
    fi = famInfo[i];
    if (fi.kind !== 'boiler') continue;
    clauses.push({ id: 'C_GAS', family: fi.fam,
      text: _tsEq('Gas appliance compliant with Regulation (EU) 2016/426 (GAR), NOx class 6 per EN 15502-1'),
      basis: '(EU) 2016/426; EN 15502-1',
      key: 'gas', args: {} });
  }
  var feas = (result.tech && result.tech.feasible) || [];
  var feasEntry = null;
  for (i = 0; i < feas.length; i++) {
    if (feas[i] && feas[i].id === cfgId) { feasEntry = feas[i]; break; }
  }
  var all = dbSeries(db) || [];
  var matches = [];
  var perFamily = {};
  for (i = 0; i < families.length; i++) {
    fam = families[i];
    var mfrs = {};
    var count = 0;
    for (var j = 0; j < all.length; j++) {
      var s = all[j];
      if (!s || s.family !== fam) continue;
      if ((seriesMatches(s, cfgId, state) || []).length !== 0) continue;
      if (!_tsSeriesAllowed(feasEntry, s)) continue;
      matches.push({ manufacturer: s.manufacturer, series: s.series, family: fam });
      var mk = String(s.manufacturer);
      if (!mfrs[mk]) { mfrs[mk] = true; count++; }
    }
    perFamily[fam] = count;
  }
  var short = [];
  for (i = 0; i < families.length; i++) {
    if ((perFamily[families[i]] || 0) < 3) short.push(families[i]);
  }
  var ok = families.length > 0 && short.length === 0;
  var note = ok ? '' : 'Fewer than 3 manufacturers comply for: ' +
    (short.length ? short.join(', ') : '(no required families)') + '; relax the clause or the requirement.';
  return { config: cfgId, clauses: clauses, matches: matches, per_family: perFamily, ok: ok, note: note };
}

function tenderText(spec) {
  spec = spec || {};
  var lines = [];
  var cl = spec.clauses || [];
  for (var i = 0; i < cl.length; i++) {
    lines.push((i + 1) + '. ' + cl[i].text + ' [' + cl[i].basis + ']');
  }
  lines.push('');
  var order = [];
  var groups = {};
  var m = spec.matches || [];
  for (i = 0; i < m.length; i++) {
    var f = String(m[i].family);
    if (!groups[f]) { groups[f] = []; order.push(f); }
    groups[f].push(m[i].manufacturer + ' ' + m[i].series);
  }
  var parts = [];
  for (i = 0; i < order.length; i++) {
    parts.push(order[i] + ': ' + groups[order[i]].join(', '));
  }
  lines.push('Complying series (indicative): ' + (parts.length ? parts.join('; ') : 'none'));
  return lines.join('\n');
}

function handoff(state, result) {
  state = state || {};
  result = result || {};
  var st = {};
  for (var k in state) {
    if (Object.prototype.hasOwnProperty.call(state, k) && k.charAt(0) !== '_') st[k] = state[k];
  }
  var entries = result.series || [];
  var series = [];
  var unitsBy = {};
  var redBy = {};
  var sources = [];
  var dataDate = null;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e) continue;
    var s = e.series;
    series.push({
      family: e.family,
      role: e.role,
      id: s ? s.id : null,
      manufacturer: s ? s.manufacturer : null,
      series: s ? s.series : null,
      units: e.units,
      unit_cap_kw: e.unit_cap_kw
    });
    if (!Object.prototype.hasOwnProperty.call(unitsBy, e.family)) {
      unitsBy[e.family] = e.units;
      redBy[e.family] = e.redundancy;
    }
    var urls = s && s.url_source ? (Array.isArray(s.url_source) ? s.url_source : [s.url_source]) : [];
    for (var u = 0; u < urls.length; u++) {
      if (sources.indexOf(urls[u]) < 0) sources.push(urls[u]);
    }
    if (s && !_isNull(s.data_date)) {
      var d = String(s.data_date);
      if (dataDate === null || d > dataDate) dataDate = d;
    }
  }
  var spec = tenderSpec(state, result, result._db);
  var specTexts = [];
  for (i = 0; i < spec.clauses.length; i++) specTexts.push(spec.clauses[i].text);
  var lk = _isNull(state.load_kw) ? null : state.load_kw;
  var lc = _isNull(state.load_cool_kw) ? null : state.load_cool_kw;
  var tf = _isNull(state.t_flow_heat) ? null : state.t_flow_heat;
  var tr = _isNull(state.t_return_heat) ? null : state.t_return_heat;
  return {
    version: 'hvacgenselect/1',
    state: st,
    config: _isNull(result.top) ? null : result.top,
    series: series,
    sizing: { load_kw: lk, load_cool_kw: lc, units: unitsBy, redundancy: redBy },
    spec: specTexts,
    sources: sources,
    data_date: dataDate,
    quantities: {
      Q_heat: { value: lk === null ? null : lk * 1000, unit: 'W' },
      Q_cool: { value: lc === null ? null : lc * 1000, unit: 'W' },
      T_flow: { value: tf === null ? null : tf + 273.15, unit: 'K' },
      T_return: { value: tr === null ? null : tr + 273.15, unit: 'K' }
    },
    offers: (state.need === 'vent' || result.handoff_to) ? ['luchtgroepselector'] : ['luchtgroepselector', 'verwarmenkoelenselector']
  };
}

function acceptHandoff(state, payload) {
  state = state || {};
  payload = payload || {};
  var ns = {};
  var k;
  for (k in state) {
    if (Object.prototype.hasOwnProperty.call(state, k)) ns[k] = state[k];
  }
  var answered = (state._answered && state._answered.slice) ? state._answered.slice() : [];
  var touched = [];
  function mark(key) {
    if (touched.indexOf(key) < 0) touched.push(key);
  }
  var ps = payload.state || {};
  for (k in ps) {
    if (!Object.prototype.hasOwnProperty.call(ps, k)) continue;
    if (k.charAt(0) === '_') continue;
    if (!Object.prototype.hasOwnProperty.call(state, k)) continue;
    ns[k] = ps[k];
    mark(k);
  }
  var q = payload.quantities || {};
  function qv(name) {
    var o = q[name];
    if (!o || _isNull(o.value) || typeof o.value !== 'number' || isNaN(o.value)) return null;
    return o.value;
  }
  var v = qv('Q_heat');
  if (v !== null) { ns.load_kw = round(v / 1000, 1); mark('load_kw'); }
  v = qv('Q_cool');
  if (v !== null) { ns.load_cool_kw = round(v / 1000, 1); mark('load_cool_kw'); }
  v = qv('T_flow');
  if (v !== null) { ns.t_flow_heat = round(v - 273.15, 1); mark('t_flow_heat'); }
  v = qv('T_return');
  if (v !== null) { ns.t_return_heat = round(v - 273.15, 1); mark('t_return_heat'); }
  for (var i = 0; i < touched.length; i++) {
    if (answered.indexOf(touched[i]) < 0) answered.push(touched[i]);
  }
  ns._answered = answered;
  return ns;
}

/* ---- e08_fgas.js ---- */
// F-gas Regulation (EU) 2024/573 Annex IV placing-on-the-market prohibitions (OJ L 2024/573, 20.2.2024).
// Per family: Annex IV point, GWP threshold (gwp >= limit; 0 = any fluorinated gas), rated capacity band (kW), year from 1 January.
// 'chiller' = primary function cooling a heat transfer fluid (Art. 3(44)) -> point 7; heating-led air/water heat pumps are
// self-contained heat pumps -> point 8; VRF = split systems -> point 9. Exemption 'safety requirements at the site of operation'
// (GWP limit 750) is not applied here; it is stated in the page text and the tender clause.
var FGAS_RULES = {
  chiller_ac: [
    {point: '7(a)', gwp: 2500, kw_min: null, kw_max: null, year: 2020},
    {point: '7(b)', gwp: 150, kw_min: null, kw_max: 12, year: 2027},
    {point: '7(c)', gwp: 0, kw_min: null, kw_max: 12, year: 2032},
    {point: '7(d)', gwp: 750, kw_min: 12, kw_max: null, year: 2027}
  ],
  hp_aw: [
    {point: '8(b)', gwp: 150, kw_min: null, kw_max: 12, year: 2027},
    {point: '8(c)', gwp: 0, kw_min: null, kw_max: 12, year: 2032},
    {point: '8(d)', gwp: 150, kw_min: 12, kw_max: 50, year: 2027},
    {point: '8(e)', gwp: 150, kw_min: 50, kw_max: null, year: 2030}
  ],
  vrf: [
    {point: '9(c)', gwp: 150, kw_min: null, kw_max: 12, year: 2029},
    {point: '9(d)', gwp: 0, kw_min: null, kw_max: 12, year: 2035},
    {point: '9(e)', gwp: 750, kw_min: 12, kw_max: null, year: 2029},
    {point: '9(f)', gwp: 150, kw_min: 12, kw_max: null, year: 2033}
  ]
};

function _fgasRef(name) {
  if (typeof name !== 'string') return null;
  var n = name.split('/')[0].replace(/[-\s]/g, '');
  if (_hasKey(REFRIGERANTS, n)) return {name: n, r: REFRIGERANTS[n]};
  if (_hasKey(REFRIGERANTS, n.toUpperCase())) return {name: n.toUpperCase(), r: REFRIGERANTS[n.toUpperCase()]};
  return null;
}

// first Annex IV ban (lowest year) that hits this family / refrigerant / unit size; null when none
function _fgasFirstBan(fam, refName, gwpFallback, unitKw) {
  var rules = FGAS_RULES[fam];
  if (!rules) return null;
  var fr = _fgasRef(refName);
  if (fr && fr.r.natural === true) return null;
  var gwp = fr && !_isNull(fr.r.gwp) ? fr.r.gwp : (_isNull(gwpFallback) ? null : Number(gwpFallback));
  if (gwp === null || !isFinite(gwp)) return null;
  var kw = Number(unitKw);
  var best = null;
  for (var i = 0; i < rules.length; i++) {
    var q = rules[i];
    if (gwp < q.gwp) continue;
    if (isFinite(kw)) {
      if (q.kw_min !== null && !(kw > q.kw_min)) continue;
      if (q.kw_max !== null && !(kw <= q.kw_max)) continue;
    }
    if (!best || q.year < best.year) best = q;
  }
  return best ? {point: best.point, year: best.year, gwp_limit: best.gwp, gwp: gwp, refrigerant: fr ? fr.name : refName} : null;
}

function deliveryYear(state) {
  var y = Math.round(Number(state && state.delivery_year));
  return isFinite(y) && y >= 2000 ? y : DEFAULT_STATE.delivery_year;
}

// status: 'ok' (no ban up to the delivery year), 'banned' (no compliant variant), 'alt' (main refrigerant banned,
// a listed refrigerant variant is not); next = first later ban of what will be supplied
function fgasCheck(fam, refName, gwpFallback, unitKw, state, alts) {
  var y = deliveryYear(state);
  var ban = _fgasFirstBan(fam, refName, gwpFallback, unitKw);
  if (!ban || ban.year > y) {
    return {status: 'ok', delivery_year: y, ban: null, alt: null, next: ban};
  }
  var list = Array.isArray(alts) ? alts : [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i] || {};
    var ab = _fgasFirstBan(fam, a.refrigerant, a.gwp, unitKw);
    if (!ab || ab.year > y) {
      return {status: 'alt', delivery_year: y, ban: ban,
        alt: {refrigerant: a.refrigerant, series: _isNull(a.series) ? null : a.series}, next: ab};
    }
  }
  return {status: 'banned', delivery_year: y, ban: ban, alt: null, next: null};
}

var API = {version: '0.2.0',
  defaults: defaults,
  setParam: setParam,
  nextQuestion: nextQuestion,
  technologies: technologies,
  scoreTech: scoreTech,
  scoreAll: scoreAll,
  seriesFor: seriesFor,
  run: run,
  explain: explain,
  tenderSpec: tenderSpec,
  tenderText: tenderText,
  handoff: handoff,
  acceptHandoff: acceptHandoff,
  techMetrics: techMetrics,
  sensitivity: sensitivity,
  sampleDomain: sampleDomain,
  vrfCheck: vrfCheck,
  requiredFamilies: requiredFamilies,
  seriesMatches: seriesMatches,
  fgasCheck: fgasCheck,
  deliveryYear: deliveryYear,
  CLIMATE: CLIMATE,
  PRESETS: PRESETS,
  TECH: TECH,
  CONFIG_IDS: CONFIG_IDS,
  REFRIGERANTS: REFRIGERANTS,
  WEIGHTS: WEIGHTS,
  CONST: CONST,
  QUESTIONS: QUESTIONS,
  DEFAULT_STATE: DEFAULT_STATE,
  FGAS_RULES: FGAS_RULES,
  disclaimer: 'Preliminary selection, not a design calculation.'
};
root.HvacSelect = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
