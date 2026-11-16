/* Thermal System Optimizer building-input browser bridge v0.1
 * Generated from unchanged working-model payloads.
 * base lazy preset SHA-256: 92c4f66deb95db032961a34730445639854ce5684a434a6c9e9cc6e69d0041e0
 * extended lazy preset SHA-256: 56f7d210148081be907329bb07dcd79587cb0afda81ac228de52b1879f895e21
 * program adapters SHA-256: 569174b4f405e289fa806469bf25002071ec06164fce25d33cfbbfbf05330dec
 */
(function(root){
'use strict';
const baseModule={exports:{}};
(function(module){
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ThermalLazyUsePresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SOURCES={
    ASHRAE62_1_OFFICE_RETAIL:{title:'ASHRAE Standard 62.1 addendum table family (office/retail/hotel/assembly screening values)',url:'https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/62_1_2016_s_20190726.pdf',kind:'published-reference'},
    ASHRAE62_1_2022_W:{title:'ANSI/ASHRAE Standard 62.1-2022 Addendum w (education/daycare table updates)',url:'https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/62_1_2022_w_20250930.pdf',kind:'published-reference'},
    ASHRAE_EDU:{title:'ASHRAE Handbook — HVAC Applications, Educational Facilities',url:'https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch08/a23_ch08_si.aspx',kind:'handbook'},
    ASHRAE_COMFORT:{title:'ASHRAE Handbook — Fundamentals, Thermal Comfort, metabolic activity table',url:'https://handbook.ashrae.org/Handbooks/F21/SI/F21_Ch09/F21_Ch09_si.aspx',kind:'handbook'},
    ASHRAE_LOADS:{title:'ASHRAE Handbook — Fundamentals, Nonresidential Cooling and Heating Load Calculations',url:'https://handbook.ashrae.org/Handbooks/F21/IP/f21_ch18/f21_ch18_ip.aspx',kind:'handbook'},
    ASHRAE_ASSEMBLY:{title:'ASHRAE Handbook — HVAC Applications, Places of Assembly',url:'https://handbook.ashrae.org/Handbooks/A15/SI/A15_CH05/a15_ch05_si.aspx',kind:'handbook'},
    DOE_PROTOTYPES:{title:'US DOE Commercial Reference / Prototype Buildings',url:'https://www.energy.gov/cmei/buildings/commercial-reference-buildings',kind:'reference-model-family'},
    ASHRAE170:{title:'ASHRAE Standard 170 healthcare ventilation is room/program specific',url:'https://www.ashrae.org/technical-resources/standards-and-guidelines/standards-addenda/standard-170-ventilation-of-health-care-facilities',kind:'reference-required'},
    ASHRAE62_2:{title:'ASHRAE Standard 62.2 residential ventilation requires dwelling/bedroom inputs',url:'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2',kind:'reference-required'}
  };
  const H={source:'engineering-screening-prior',confidence:'low',editable:true};
  const M={source:'engineering-screening-prior',confidence:'medium',editable:true};
  function p(id,label,density,vent,activity,extra={}){return {id,label,occupancy:{density_p_per_100m2:density,confidence:'medium'},ventilation:vent,activity,schedule:activity,ceilingHeight_m:extra.ceilingHeight_m||3,terminalFamilies:extra.terminalFamilies||['air','fanCoil'],acousticSensitivity:extra.acousticSensitivity||'medium',resilience:extra.resilience||'normal',gains:{equipment_W_m2:extra.equipment_W_m2??10,lighting_W_m2:extra.lighting_W_m2??8,provenance:H},notes:extra.notes||[],provenance:extra.provenance||[]};}
  const vr=(Rp,Ra,src,confidence='high')=>({mode:'people-plus-area',Rp_L_s_person:Rp,Ra_L_s_m2:Ra,confidence,source:src});
  const presets={
    office:p('office','Office',5,vr(2.5,0.3,'ASHRAE62_1_OFFICE_RETAIL'),'office',{equipment_W_m2:12,terminalFamilies:['air','fanCoil','radiantCeiling','TABS'],provenance:['ASHRAE62_1_OFFICE_RETAIL','ASHRAE_COMFORT','DOE_PROTOTYPES']}),
    school:p('school','School / classroom',65,vr(3.8,0.3,'ASHRAE62_1_2022_W'),'seated-learning',{equipment_W_m2:5,acousticSensitivity:'high',terminalFamilies:['air','radiantCeiling','floor'],provenance:['ASHRAE62_1_2022_W','ASHRAE_EDU','DOE_PROTOTYPES']}),
    daycare:p('daycare','Daycare',25,vr(5.0,0.9,'ASHRAE62_1_2022_W'),'light-active',{equipment_W_m2:4,terminalFamilies:['air','floor','radiantCeiling'],provenance:['ASHRAE62_1_2022_W']}),
    university:p('university','Higher education / lecture',65,vr(3.8,0.3,'ASHRAE62_1_2022_W'),'seated-learning',{equipment_W_m2:8,acousticSensitivity:'high',provenance:['ASHRAE62_1_2022_W','ASHRAE_EDU']}),
    retail:p('retail','Retail shop',15,vr(3.8,0.6,'ASHRAE62_1_OFFICE_RETAIL','medium'),'standing-walking',{equipment_W_m2:8,lighting_W_m2:12,terminalFamilies:['air','fanCoil'],provenance:['ASHRAE62_1_OFFICE_RETAIL','DOE_PROTOTYPES']}),
    supermarket:p('supermarket','Supermarket / food retail',8,vr(3.8,0.3,'ASHRAE62_1_OFFICE_RETAIL','medium'),'standing-walking',{equipment_W_m2:35,lighting_W_m2:12,terminalFamilies:['air','fanCoil','heatRecovery'],notes:['Refrigeration display/cold-room loads are a separate model input; equipment W/m² is only a placeholder until that subsystem is represented.'],provenance:['ASHRAE62_1_OFFICE_RETAIL','DOE_PROTOTYPES']}),
    restaurant:p('restaurant','Restaurant / cafe',70,vr(3.8,0.9,'ASHRAE62_1_OFFICE_RETAIL','medium'),'seated-dining',{equipment_W_m2:25,terminalFamilies:['air','fanCoil','heatRecovery'],notes:['Kitchen exhaust/makeup air must be modeled separately from dining ventilation.'],provenance:['ASHRAE62_1_OFFICE_RETAIL','DOE_PROTOTYPES']}),
    hotel:p('hotel','Hotel',10,vr(2.5,0.3,'ASHRAE62_1_OFFICE_RETAIL','medium'),'mixed-low',{equipment_W_m2:8,resilience:'normal',terminalFamilies:['fanCoil','air','radiator'],notes:['Guest rooms, lobby and back-of-house should eventually be separate space groups.'],provenance:['ASHRAE62_1_OFFICE_RETAIL','DOE_PROTOTYPES']}),
    gym:p('gym','Gym / fitness',40,{mode:'area-screening',Ra_L_s_m2:1.5,confidence:'medium',source:'ASHRAE_EDU'},'athletic',{ceilingHeight_m:3.5,equipment_W_m2:6,terminalFamilies:['air','fanCoil'],notes:['Occupant moisture/metabolic load is materially higher than office; final ventilation depends on activity/space subtype.'],provenance:['ASHRAE_EDU','ASHRAE_COMFORT']}),
    sportsHall:p('sportsHall','Sports hall',30,{mode:'area-screening',Ra_L_s_m2:1.5,confidence:'medium',source:'ASHRAE_EDU'},'athletic',{ceilingHeight_m:7,equipment_W_m2:3,terminalFamilies:['air','radiantPanel'],provenance:['ASHRAE_EDU','ASHRAE_COMFORT','ASHRAE_ASSEMBLY']}),
    warehouse:p('warehouse','Warehouse / logistics',0.5,vr(2.5,0.3,'engineering-screening-prior','low'),'walking-lifting',{ceilingHeight_m:8,equipment_W_m2:4,terminalFamilies:['unitHeater','radiantPanel','air'],notes:['Ventilation prior is not a normative warehouse value; process/vehicle emissions can dominate.'],provenance:['DOE_PROTOTYPES','ASHRAE_COMFORT']}),
    workshop:p('workshop','Light workshop / industrial',20,{mode:'combined-per-person',combined_L_s_person:9.5,confidence:'medium',source:'ASHRAE_EDU'},'walking-lifting',{ceilingHeight_m:4,equipment_W_m2:20,terminalFamilies:['air','radiantPanel','unitHeater'],notes:['Process exhaust and contaminant control override generic outdoor-air screening when present.'],provenance:['ASHRAE_EDU','ASHRAE_COMFORT']}),
    clinic:p('clinic','Clinic / outpatient',10,{mode:'room-program-required',confidence:'high',source:'ASHRAE170'},'mixed-low',{resilience:'elevated',terminalFamilies:['air','fanCoil'],notes:['Use-type alone cannot produce defensible airflow: room types/pressure relationships/ACH are required.'],provenance:['ASHRAE170','DOE_PROTOTYPES']}),
    hospital:p('hospital','Hospital / 24x7',10,{mode:'room-program-required',confidence:'high',source:'ASHRAE170'},'mixed-low',{resilience:'critical',terminalFamilies:['air','fanCoil'],notes:['Room program, pressure regime, filtration and air-change criteria are mandatory inputs.'],provenance:['ASHRAE170','DOE_PROTOTYPES']}),
    residential:p('residential','Residential / multifamily',3,{mode:'dwelling-program-required',confidence:'high',source:'ASHRAE62_2'},'residential',{equipment_W_m2:5,terminalFamilies:['radiator','floor','fanCoil'],notes:['Add dwelling count and bedroom count before automatic residential ventilation.'],provenance:['ASHRAE62_2','DOE_PROTOTYPES']}),
    assembly:p('assembly','Event / assembly hall',120,vr(2.5,0.3,'ASHRAE62_1_OFFICE_RETAIL','medium'),'seated-assembly',{ceilingHeight_m:6,equipment_W_m2:4,terminalFamilies:['air','radiantPanel'],acousticSensitivity:'high',notes:['Seat count should override area-derived population when known.'],provenance:['ASHRAE62_1_OFFICE_RETAIL','ASHRAE_ASSEMBLY']}),
    serverOffice:p('serverOffice','IT / server-heavy office',5,vr(2.5,0.3,'ASHRAE62_1_OFFICE_RETAIL'),'office',{equipment_W_m2:100,terminalFamilies:['air','fanCoil','directCooling'],resilience:'elevated',notes:['100 W/m² equipment is a broad placeholder; explicit IT kW/rack load must override it.'],provenance:['ASHRAE62_1_OFFICE_RETAIL','DOE_PROTOTYPES']})
  };
  const activity={
    office:{met_W_m2:65,confidence:'high',source:'ASHRAE_COMFORT'},'seated-learning':{met_W_m2:60,confidence:'medium',source:'ASHRAE_COMFORT'},'light-active':{met_W_m2:80,confidence:'medium',source:'ASHRAE_COMFORT'},'standing-walking':{met_W_m2:100,confidence:'medium',source:'ASHRAE_COMFORT'},'seated-dining':{met_W_m2:70,confidence:'medium',source:'ASHRAE_COMFORT'},'mixed-low':{met_W_m2:70,confidence:'low',source:'ASHRAE_COMFORT'},athletic:{met_W_m2:220,confidence:'low',source:'ASHRAE_COMFORT'},'walking-lifting':{met_W_m2:120,confidence:'medium',source:'ASHRAE_COMFORT'},residential:{met_W_m2:60,confidence:'low',source:'ASHRAE_COMFORT'},'seated-assembly':{met_W_m2:60,confidence:'medium',source:'ASHRAE_COMFORT'}
  };
  const schedules={
    office:{days:[1,2,3,4,5],occupiedStart_h:8,occupiedEnd_h:18,prestart_h:1},
    'seated-learning':{days:[1,2,3,4,5],occupiedStart_h:8,occupiedEnd_h:17,prestart_h:1},
    'light-active':{days:[1,2,3,4,5],occupiedStart_h:7,occupiedEnd_h:18,prestart_h:1},
    'standing-walking':{days:[1,2,3,4,5,6],occupiedStart_h:9,occupiedEnd_h:20,prestart_h:1},
    'seated-dining':{days:[0,1,2,3,4,5,6],occupiedStart_h:11,occupiedEnd_h:23,prestart_h:1},
    'mixed-low':{days:[0,1,2,3,4,5,6],occupiedStart_h:0,occupiedEnd_h:24,prestart_h:0},
    athletic:{days:[0,1,2,3,4,5,6],occupiedStart_h:6,occupiedEnd_h:22,prestart_h:1},
    'walking-lifting':{days:[1,2,3,4,5],occupiedStart_h:7,occupiedEnd_h:18,prestart_h:1},
    residential:{days:[0,1,2,3,4,5,6],occupiedStart_h:0,occupiedEnd_h:24,prestart_h:0},
    'seated-assembly':{days:[0,1,2,3,4,5,6],occupiedStart_h:18,occupiedEnd_h:23,prestart_h:2}
  };
  for(const x of Object.values(presets)){x.schedule={...schedules[x.schedule],provenance:M};x.activity={...activity[x.activity]};}
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function resolvePreset(id,input={}){
    if(!presets[id])throw new Error('unknown preset '+id);
    const base=clone(presets[id]);
    const area=Number(input.floorArea_m2??input.area_m2);
    const storeys=Number(input.storeys??1);
    const density=Number(input.occupancyDensity_p_per_100m2??base.occupancy.density_p_per_100m2);
    const peopleExplicit=Number(input.people);
    const people=Number.isFinite(peopleExplicit)&&peopleExplicit>=0?peopleExplicit:(Number.isFinite(area)&&area>=0?area*density/100:null);
    let outdoorAir_m3_h=null,ventReason=null;
    const v=base.ventilation;
    if(Number.isFinite(people)&&Number.isFinite(area)){
      if(v.mode==='people-plus-area')outdoorAir_m3_h=(people*v.Rp_L_s_person+area*v.Ra_L_s_m2)*3.6;
      else if(v.mode==='area-screening')outdoorAir_m3_h=area*v.Ra_L_s_m2*3.6;
      else if(v.mode==='combined-per-person')outdoorAir_m3_h=people*v.combined_L_s_person*3.6;
      else ventReason=v.mode;
    } else ventReason='area-or-people-unresolved';
    if(Number.isFinite(input.outdoorAir_m3_h)){outdoorAir_m3_h=Number(input.outdoorAir_m3_h);ventReason='explicit-user-override';}
    const overrides=['ceilingHeight_m','equipment_W_m2','lighting_W_m2','acousticSensitivity','resilience'];
    for(const k of overrides)if(input[k]!=null){if(k.endsWith('_W_m2'))base.gains[k]=Number(input[k]);else base[k]=input[k];}
    if(input.schedule)base.schedule={...base.schedule,...clone(input.schedule),provenance:{source:'explicit-user-override',confidence:'user'}};
    return {schema:'thermal-optimizer/lazy-use-resolved/v0.1',presetId:id,floorArea_m2:Number.isFinite(area)?area:null,storeys:Number.isFinite(storeys)?storeys:null,people,density_p_per_100m2:density,outdoorAir_m3_h,outdoorAir_m3_h_person:Number.isFinite(outdoorAir_m3_h)&&people>0?outdoorAir_m3_h/people:null,ventilationUnresolvedReason:ventReason,preset:base,overrideFields:Object.keys(input)};
  }
  return {schema:'thermal-optimizer/lazy-use-presets/v0.1',sources:SOURCES,presets,resolvePreset};
});

})(baseModule);
const lazyV2Module={exports:{}};
(function(module,require){
'use strict';
const base=require('./thermal-lazy-use-presets-v0.1.js.txt');
const REF={
 DOE:{title:'US DOE Commercial Reference Buildings / Prototype Buildings',url:'https://www.energy.gov/cmei/buildings/commercial-reference-buildings'},
 DOE_OFFICE:{title:'PNNL medium-office prototype internal loads',url:'https://www.pnnl.gov/sites/default/files/media/file/PNNL-25985.pdf'},
 DOE_SCHOOL:{title:'PNNL education prototype internal loads',url:'https://www.pnnl.gov/sites/default/files/media/file/PNNL-ACT-10055.pdf'},
 DOE_SUPERMARKET:{title:'PNNL supermarket prototype characteristics',url:'https://www.pnnl.gov/main/publications/external/technical_reports/PNNL-20955.pdf'},
 ASHRAE_COMFORT:{title:'ASHRAE Handbook Fundamentals Ch.9 metabolic rates',url:'https://handbook.ashrae.org/Handbooks/F21/SI/F21_Ch09/F21_Ch09_si.aspx'}
};
const range=(min,typ,max,unit,confidence,source)=>({min,typ,max,unit,confidence,source,editable:true});
const PROFILE={
 office:{schedule:{weekday:[7,19],saturday:[8,15],confidence:'medium',source:'DOE'},height_m:range(2.7,3.0,4.0,'m','medium','DOE'),lighting_W_m2:range(7,14.6,16,'W/m2','medium','DOE_OFFICE'),equipment_W_m2:range(4,8.1,12,'W/m2','medium','DOE_OFFICE')},
 school:{schedule:{weekday:[7,18],summerReduced:true,confidence:'medium',source:'DOE'},height_m:range(3.3,4.0,8.0,'m','medium','DOE_SCHOOL'),lighting_W_m2:range(5.4,12.2,15.1,'W/m2','medium','DOE_SCHOOL'),equipment_W_m2:range(5,9.7,12,'W/m2','medium','DOE_SCHOOL'),note:'Whole-building equipment averages are distorted by kitchen; classroom plug load is about 9.7 W/m2 in the cited prototype.'},
 retail:{schedule:{weekday:[8,22],saturday:[8,22],sunday:[10,18],confidence:'low',source:'DOE'},height_m:range(3.5,6.1,8,'m','medium','DOE'),lighting_W_m2:range(10,16.7,27,'W/m2','low','DOE'),equipment_W_m2:range(3,5,13,'W/m2','low','DOE')},
 supermarket:{schedule:{allDays:[7,23],confidence:'high',source:'DOE_SUPERMARKET'},height_m:range(4.5,6.1,7.5,'m','high','DOE_SUPERMARKET'),lighting_W_m2:range(11.8,30.1,30.1,'W/m2','medium','DOE_SUPERMARKET'),equipment_W_m2:range(4.3,4.3,4.3,'W/m2','high','DOE_SUPERMARKET'),note:'Generic plug load excludes refrigeration; refrigeration is a separate special-use submodel.'},
 hotel:{schedule:{allDays:[0,24],confidence:'high',source:'DOE'},height_m:range(2.7,2.9,3.6,'m','medium','DOE')},
 restaurant:{schedule:{allDays:[10,24],confidence:'low',source:'DOE'},height_m:range(2.7,3.2,4.5,'m','low','DOE'),note:'Dining and kitchen must be separate space groups; kitchen exhaust/makeup air is explicit.'},
 warehouse:{schedule:{weekday:[6,19],confidence:'low',source:'DOE'},height_m:range(6,9,14,'m','low','DOE')},
 residential:{schedule:{allDays:[0,24],confidence:'high',source:'DOE'},height_m:range(2.5,2.7,3.1,'m','medium','DOE')},
 hospital:{schedule:{allDays:[0,24],confidence:'high',source:'DOE'},note:'Room-program-specific ventilation/pressure remains mandatory.'},
 clinic:{schedule:{weekday:[7,19],confidence:'medium',source:'DOE'},note:'Room-program-specific ventilation/pressure remains mandatory.'}
};
const ACTIVITY={
 sedentary:{W_m2_body:range(55,60,70,'W/m2-body','high','ASHRAE_COMFORT')},
 shopping:{W_m2_body:range(70,93,115,'W/m2-body','medium','ASHRAE_COMFORT')},
 walking:{W_m2_body:range(115,150,220,'W/m2-body','high','ASHRAE_COMFORT')},
 packing:{W_m2_body:range(100,120,185,'W/m2-body','medium','ASHRAE_COMFORT')},
 fitnessLight:{W_m2_body:range(115,175,235,'W/m2-body','medium','ASHRAE_COMFORT')},
 fitnessHard:{W_m2_body:range(220,290,440,'W/m2-body','medium','ASHRAE_COMFORT')}
};
function specialUse(kind,input={}){
 if(kind==='restaurantKitchen'){
   const exhaust=Number(input.hoodExhaust_m3_h); const makeupFrac=Number(input.makeupAirFraction??0.85);
   return {kind,resolved:Number.isFinite(exhaust),kitchenArea_m2:Number(input.kitchenArea_m2)||null,hoodExhaust_m3_h:Number.isFinite(exhaust)?exhaust:null,makeupAir_m3_h:Number.isFinite(exhaust)?exhaust*makeupFrac:null,equipment_kW:Number(input.kitchenEquipment_kW)||null,unresolved:Number.isFinite(exhaust)?[]:['hoodExhaust_m3_h'],note:'No exhaust is inferred from restaurant floor area.'};
 }
 if(kind==='supermarketRefrigeration'){
   const kW=Number(input.refrigerationElectric_kW); return {kind,resolved:Number.isFinite(kW),refrigerationElectric_kW:Number.isFinite(kW)?kW:null,recoveredHeatFraction:Number(input.recoveredHeatFraction??0),unresolved:Number.isFinite(kW)?[]:['refrigerationElectric_kW'],note:'Refrigeration is not hidden inside generic plug W/m2.'};
 }
 if(kind==='healthcareRoomProgram'){
   const rooms=Array.isArray(input.rooms)?input.rooms:[]; const unresolved=rooms.filter(r=>!(Number.isFinite(Number(r.outdoorAir_m3_h))||Number.isFinite(Number(r.outdoorACH))));
   return {kind,resolved:rooms.length>0&&unresolved.length===0,rooms,unresolvedRooms:unresolved.map(r=>r.id||r.type||'?'),note:'Pressure/ACH/outdoor air stay room-specific.'};
 }
 if(kind==='residentialProgram'){
   const dwellings=Number(input.dwellings),bedrooms=Number(input.bedrooms); return {kind,resolved:Number.isFinite(dwellings)&&Number.isFinite(bedrooms),dwellings:Number.isFinite(dwellings)?dwellings:null,bedrooms:Number.isFinite(bedrooms)?bedrooms:null,explicitOutdoorAir_m3_h:Number(input.outdoorAir_m3_h)||null,note:'Standard-specific dwelling ventilation formula remains a separate adapter.'};
 }
 if(kind==='gymActivity'){
   const subtype=input.subtype||'fitnessLight'; return {kind,resolved:!!ACTIVITY[subtype],subtype,activity:ACTIVITY[subtype]||null,unresolved:ACTIVITY[subtype]?[]:['subtype']};
 }
 throw new Error('unknown special use '+kind);
}
function resolvePreset(id,input={}){
 const r=base.resolvePreset(id,input); const profile=PROFILE[id]||null;
 if(profile){r.referenceProfile=JSON.parse(JSON.stringify(profile)); if(input.referenceProfile)r.referenceProfile={...r.referenceProfile,...input.referenceProfile};}
 r.specialUseRequired=[];
 if(id==='restaurant')r.specialUseRequired.push('restaurantKitchen');
 if(id==='supermarket')r.specialUseRequired.push('supermarketRefrigeration');
 if(id==='clinic'||id==='hospital')r.specialUseRequired.push('healthcareRoomProgram');
 if(id==='residential')r.specialUseRequired.push('residentialProgram');
 if(id==='gym'||id==='sportsHall')r.specialUseRequired.push('gymActivity');
 r.schema='thermal-optimizer/lazy-use-resolved/v0.2'; return r;
}
module.exports={schema:'thermal-optimizer/lazy-use-presets/v0.2',base,refs:REF,referenceProfiles:PROFILE,activitySubtypes:ACTIVITY,specialUse,resolvePreset};

})(lazyV2Module,function(name){
  if(name==='./thermal-lazy-use-presets-v0.1.js.txt') return baseModule.exports;
  throw new Error('Unsupported building-input bridge require: '+name);
});
const programModule={exports:{}};
(function(module){
'use strict';

const SCHEMA = 'thermal-optimizer/program-adapters/v0.1';

function num(v, name, opts={}) {
  const x = Number(v);
  if (!Number.isFinite(x)) throw new Error(`${name} must be finite`);
  if (opts.min != null && x < opts.min) throw new Error(`${name} must be >= ${opts.min}`);
  return x;
}
function optNum(v, name, opts={}) {
  if (v == null || v === '') return null;
  return num(v, name, opts);
}
function arr(v){ return Array.isArray(v) ? v : []; }
function clone(v){ return JSON.parse(JSON.stringify(v)); }

function normalizePressure(v){
  if (v == null || v === '') return 'none';
  const s=String(v).toLowerCase();
  if (['positive','negative','neutral','none'].includes(s)) return s;
  throw new Error(`invalid pressure relationship: ${v}`);
}

function healthcareRoomProgram(input={}) {
  const rooms = arr(input.rooms);
  if (!rooms.length) {
    return {schema:SCHEMA, kind:'healthcareRoomProgram', resolved:false, rooms:[], diagnostics:[{code:'HC_NO_ROOMS',severity:'error'}], totals:{}};
  }
  const diagnostics=[];
  const out=[];
  let totalOA=0,totalSupply=0,totalExhaust=0,totalVolume=0;
  for (let i=0;i<rooms.length;i++) {
    const r=rooms[i]||{};
    const id=String(r.id || `room-${i+1}`);
    const count=num(r.count ?? 1,`${id}.count`,{min:0});
    const area=optNum(r.area_m2,`${id}.area_m2`,{min:0});
    const height=optNum(r.height_m,`${id}.height_m`,{min:0});
    const explicitVolume=optNum(r.volume_m3,`${id}.volume_m3`,{min:0});
    const volume = explicitVolume ?? (area!=null && height!=null ? area*height : null);
    const oaACH=optNum(r.outdoorACH,`${id}.outdoorACH`,{min:0});
    const totalACH=optNum(r.totalACH,`${id}.totalACH`,{min:0});
    const oaFlow=optNum(r.outdoorAir_m3_h,`${id}.outdoorAir_m3_h`,{min:0});
    const supplyFlow=optNum(r.supply_m3_h,`${id}.supply_m3_h`,{min:0});
    const exhaustFlow=optNum(r.exhaust_m3_h,`${id}.exhaust_m3_h`,{min:0});
    const pressure=normalizePressure(r.pressureRelationship);
    const directExhaust=!!r.directExhaust;
    const recircAllowed = r.recircAllowed == null ? null : !!r.recircAllowed;
    const tempMin=optNum(r.temperatureMin_C,`${id}.temperatureMin_C`);
    const tempMax=optNum(r.temperatureMax_C,`${id}.temperatureMax_C`);
    const rhMin=optNum(r.rhMin_frac,`${id}.rhMin_frac`,{min:0});
    const rhMax=optNum(r.rhMax_frac,`${id}.rhMax_frac`,{min:0});
    if (rhMin!=null && rhMin>1 || rhMax!=null && rhMax>1) throw new Error(`${id}.RH must be fraction 0..1`);
    if (tempMin!=null && tempMax!=null && tempMin>tempMax) throw new Error(`${id}.temperature bounds inverted`);
    if (rhMin!=null && rhMax!=null && rhMin>rhMax) throw new Error(`${id}.RH bounds inverted`);
    if ((oaACH!=null || totalACH!=null) && volume==null) diagnostics.push({code:'HC_VOLUME_REQUIRED_FOR_ACH',severity:'error',roomId:id});
    const derivedOA = oaFlow ?? (oaACH!=null && volume!=null ? oaACH*volume : null);
    const derivedSupply = supplyFlow ?? (totalACH!=null && volume!=null ? totalACH*volume : null);
    if (derivedOA==null) diagnostics.push({code:'HC_OUTDOOR_AIR_UNRESOLVED',severity:'error',roomId:id});
    if (pressure!=='none' && supplyFlow==null && exhaustFlow==null) diagnostics.push({code:'HC_PRESSURE_WITHOUT_AIRFLOW_BALANCE',severity:'warning',roomId:id});
    if (directExhaust && exhaustFlow==null) diagnostics.push({code:'HC_DIRECT_EXHAUST_FLOW_UNRESOLVED',severity:'warning',roomId:id});
    if (derivedSupply!=null && derivedOA!=null && derivedSupply+1e-9 < derivedOA) diagnostics.push({code:'HC_SUPPLY_BELOW_OUTDOOR_AIR',severity:'error',roomId:id});
    const multiplicity=count;
    totalOA += (derivedOA||0)*multiplicity;
    totalSupply += (derivedSupply||0)*multiplicity;
    totalExhaust += (exhaustFlow||0)*multiplicity;
    totalVolume += (volume||0)*multiplicity;
    out.push({id,type:r.type||null,count,area_m2:area,height_m:height,volume_m3:volume,outdoorACH:oaACH,totalACH,outdoorAir_m3_h:derivedOA,supply_m3_h:derivedSupply,exhaust_m3_h:exhaustFlow,pressureRelationship:pressure,directExhaust,recircAllowed,temperatureMin_C:tempMin,temperatureMax_C:tempMax,rhMin_frac:rhMin,rhMax_frac:rhMax,ruleRef:r.ruleRef||null});
  }
  return {
    schema:SCHEMA,kind:'healthcareRoomProgram',resolved:!diagnostics.some(d=>d.severity==='error'),rooms:out,diagnostics,
    totals:{roomCount:out.reduce((s,r)=>s+r.count,0),volume_m3:totalVolume,outdoorAir_m3_h:totalOA,supply_m3_h:totalSupply,exhaust_m3_h:totalExhaust},
    constraints:{hasPressureControlledRooms:out.some(r=>!['none','neutral'].includes(r.pressureRelationship)),hasDirectExhaustRooms:out.some(r=>r.directExhaust),hasHumidityControlledRooms:out.some(r=>r.rhMin_frac!=null||r.rhMax_frac!=null)},
    note:'Room-specific rules are explicit inputs with ruleRef provenance; no healthcare ventilation rate is inferred from gross building area.'
  };
}

function ventilationRuleFlow(rule, ctx, diagnostics){
  if (!rule) return null;
  if (rule.explicitFlow_m3_h != null) return num(rule.explicitFlow_m3_h,'ventilationRule.explicitFlow_m3_h',{min:0});
  const base=num(rule.base_m3_h ?? 0,'ventilationRule.base_m3_h',{min:0});
  const perArea=num(rule.perArea_m3_h_m2 ?? 0,'ventilationRule.perArea_m3_h_m2',{min:0});
  const perBedroom=num(rule.perBedroom_m3_h ?? 0,'ventilationRule.perBedroom_m3_h',{min:0});
  const perPerson=num(rule.perPerson_m3_h ?? 0,'ventilationRule.perPerson_m3_h',{min:0});
  const bedroomOffset=num(rule.bedroomOffset ?? 0,'ventilationRule.bedroomOffset');
  const bedroomsEff=Math.max(0,ctx.bedrooms + bedroomOffset);
  const q=base + perArea*ctx.floorArea_m2 + perBedroom*bedroomsEff + perPerson*ctx.occupants;
  if (!rule.sourceRef) diagnostics.push({code:'RES_VENT_RULE_PROVENANCE_MISSING',severity:'warning'});
  return q;
}

function residentialProgram(input={}) {
  const dwellings=num(input.dwellings ?? 1,'dwellings',{min:1});
  const units=arr(input.units);
  const diagnostics=[];
  let resolvedUnits=[];
  if (units.length) {
    resolvedUnits=units.map((u,i)=>{
      const id=String(u.id||`dwelling-${i+1}`);
      const floorArea_m2=num(u.floorArea_m2,`${id}.floorArea_m2`,{min:0});
      const bedrooms=num(u.bedrooms,`${id}.bedrooms`,{min:0});
      const occupants=num(u.occupants ?? Math.max(1,bedrooms+1),`${id}.occupants`,{min:0});
      const q=ventilationRuleFlow(u.ventilationRule||input.ventilationRule,{floorArea_m2,bedrooms,occupants},diagnostics);
      if (q==null) diagnostics.push({code:'RES_WHOLE_DWELLING_VENT_UNRESOLVED',severity:'error',dwellingId:id});
      const local=arr(u.localExhaust).map((x,j)=>({id:String(x.id||`${id}-local-${j+1}`),spaceType:x.spaceType||null,designFlow_m3_h:num(x.designFlow_m3_h,`${id}.localExhaust[${j}].designFlow_m3_h`,{min:0}),control:x.control||'intermittent',sourceRef:x.sourceRef||null}));
      if (local.some(x=>!x.sourceRef)) diagnostics.push({code:'RES_LOCAL_EXHAUST_PROVENANCE_MISSING',severity:'warning',dwellingId:id});
      const dhwDaily=optNum(u.dhwDaily_L,`${id}.dhwDaily_L`,{min:0});
      return {id,floorArea_m2,bedrooms,occupants,wholeDwellingVent_m3_h:q,localExhaust:local,dhwDaily_L:dhwDaily,sourceRef:u.sourceRef||null};
    });
  } else {
    const totalArea=num(input.floorArea_m2,'floorArea_m2',{min:0});
    const totalBedrooms=num(input.bedrooms,'bedrooms',{min:0});
    const totalOccupants=num(input.occupants ?? Math.max(dwellings,totalBedrooms+dwellings),'occupants',{min:0});
    const perUnit={floorArea_m2:totalArea/dwellings,bedrooms:totalBedrooms/dwellings,occupants:totalOccupants/dwellings};
    const q=ventilationRuleFlow(input.ventilationRule,perUnit,diagnostics);
    if (q==null) diagnostics.push({code:'RES_WHOLE_DWELLING_VENT_UNRESOLVED',severity:'error'});
    for(let i=0;i<dwellings;i++) resolvedUnits.push({id:`dwelling-${i+1}`,...perUnit,wholeDwellingVent_m3_h:q,localExhaust:[],dhwDaily_L:null,sourceRef:input.sourceRef||null});
    diagnostics.push({code:'RES_AGGREGATE_PROGRAM_DISTRIBUTED_EVENLY',severity:'warning'});
  }
  const totals=resolvedUnits.reduce((a,u)=>{a.floorArea_m2+=u.floorArea_m2;a.bedrooms+=u.bedrooms;a.occupants+=u.occupants;a.wholeDwellingVent_m3_h+=(u.wholeDwellingVent_m3_h||0);a.localExhaustDesign_m3_h+=u.localExhaust.reduce((s,x)=>s+x.designFlow_m3_h,0);a.dhwDaily_L+=(u.dhwDaily_L||0);return a;},{floorArea_m2:0,bedrooms:0,occupants:0,wholeDwellingVent_m3_h:0,localExhaustDesign_m3_h:0,dhwDaily_L:0});
  return {schema:SCHEMA,kind:'residentialProgram',resolved:!diagnostics.some(d=>d.severity==='error'),dwellings:resolvedUnits,totals,diagnostics,note:'Ventilation coefficients/rates are supplied by the selected jurisdiction or standard adapter; gross residential area alone does not create a code claim.'};
}

function toAnnualInputs(program){
  if (!program || program.schema!==SCHEMA) throw new Error('unsupported program schema');
  if (program.kind==='healthcareRoomProgram') {
    return {programKind:program.kind,mandatoryOutdoorAir_m3_h:program.totals.outdoorAir_m3_h,designSupply_m3_h:program.totals.supply_m3_h,designExhaust_m3_h:program.totals.exhaust_m3_h,roomConstraints:clone(program.rooms.map(r=>({id:r.id,pressureRelationship:r.pressureRelationship,directExhaust:r.directExhaust,recircAllowed:r.recircAllowed,temperatureMin_C:r.temperatureMin_C,temperatureMax_C:r.temperatureMax_C,rhMin_frac:r.rhMin_frac,rhMax_frac:r.rhMax_frac,ruleRef:r.ruleRef})))};
  }
  if (program.kind==='residentialProgram') {
    return {programKind:program.kind,mandatoryOutdoorAir_m3_h:program.totals.wholeDwellingVent_m3_h,localExhaustDesign_m3_h:program.totals.localExhaustDesign_m3_h,occupants:program.totals.occupants,dhwDaily_L:program.totals.dhwDaily_L};
  }
  throw new Error(`unsupported program kind ${program.kind}`);
}

module.exports={schema:SCHEMA,healthcareRoomProgram,residentialProgram,toAnnualInputs};

})(programModule);
root.ThermalBuildingInputs=Object.freeze({
  schema:'thermal-optimizer/building-input-browser-bridge/v0.1',
  lazyPresets:lazyV2Module.exports,
  programAdapters:programModule.exports,
  sourceIdentity:Object.freeze({
    lazyBaseSha256:'92c4f66deb95db032961a34730445639854ce5684a434a6c9e9cc6e69d0041e0',
    lazyExtendedSha256:'56f7d210148081be907329bb07dcd79587cb0afda81ac228de52b1879f895e21',
    programAdaptersSha256:'569174b4f405e289fa806469bf25002071ec06164fce25d33cfbbfbf05330dec'
  })
});
})(globalThis);

