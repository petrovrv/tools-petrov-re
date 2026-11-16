/* Thermal System Optimizer program-input browser bridge v0.1
 * UI/state projection only. No healthcare/residential ventilation rates are embedded here.
 * Requires global ThermalCore and ThermalBuildingInputs (which exposes programAdapters v0.1).
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ThermalProgramInputs=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SCHEMA='thermal-optimizer/program-input-browser/v0.1';
const clone=x=>JSON.parse(JSON.stringify(x));
const n=(v,name,{min=null}={})=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(name+' must be finite');if(min!=null&&x<min)throw new Error(name+' must be >= '+min);return x;};
const opt=(v,name,o={})=>(v==null||v==='')?null:n(v,name,o);
const bool=v=>v===true||v==='true'||v===1||v==='1'||v==='yes';

function adapters(B){
  const A=B?.programAdapters;
  if(!A?.healthcareRoomProgram||!A?.residentialProgram||!A?.toAnnualInputs)throw new Error('ThermalBuildingInputs.programAdapters v0.1 is required');
  return A;
}

function healthcareInput(s={}){
  return {rooms:[{
    id:String(s.roomId||'room-type-1'),type:String(s.roomType||'generic'),count:n(s.roomCount??1,'roomCount',{min:0}),
    area_m2:n(s.roomArea_m2,'roomArea_m2',{min:0}),height_m:n(s.roomHeight_m,'roomHeight_m',{min:0}),
    outdoorACH:opt(s.outdoorACH,'outdoorACH',{min:0}),totalACH:opt(s.totalACH,'totalACH',{min:0}),
    outdoorAir_m3_h:opt(s.outdoorAir_m3_h,'outdoorAir_m3_h',{min:0}),supply_m3_h:opt(s.supply_m3_h,'supply_m3_h',{min:0}),exhaust_m3_h:opt(s.exhaust_m3_h,'exhaust_m3_h',{min:0}),
    pressureRelationship:s.pressureRelationship||'none',directExhaust:bool(s.directExhaust),recircAllowed:s.recircAllowed===''||s.recircAllowed==null?null:bool(s.recircAllowed),
    temperatureMin_C:opt(s.temperatureMin_C,'temperatureMin_C'),temperatureMax_C:opt(s.temperatureMax_C,'temperatureMax_C'),
    rhMin_frac:s.rhMin_pct==null||s.rhMin_pct===''?null:n(s.rhMin_pct,'rhMin_pct',{min:0})/100,
    rhMax_frac:s.rhMax_pct==null||s.rhMax_pct===''?null:n(s.rhMax_pct,'rhMax_pct',{min:0})/100,
    ruleRef:String(s.ruleRef||'').trim()||null
  }]};
}
function residentialInput(s={}){
  const count=Math.round(n(s.dwellingCount??1,'dwellingCount',{min:1}));
  if(count>1000)throw new Error('dwellingCount must be <= 1000 in the browser editor');
  const area=n(s.floorAreaPerDwelling_m2,'floorAreaPerDwelling_m2',{min:0}), bedrooms=n(s.bedroomsPerDwelling,'bedroomsPerDwelling',{min:0}), occupants=n(s.occupantsPerDwelling,'occupantsPerDwelling',{min:0});
  const q=n(s.ventilationPerDwelling_m3_h,'ventilationPerDwelling_m3_h',{min:0}),ventRef=String(s.ventilationSourceRef||'').trim()||null;
  const local=opt(s.localExhaustPerDwelling_m3_h,'localExhaustPerDwelling_m3_h',{min:0}),localRef=String(s.localExhaustSourceRef||'').trim()||null;
  const dhw=opt(s.dhwPerDwelling_L_day,'dhwPerDwelling_L_day',{min:0});
  const units=[];
  for(let i=0;i<count;i++)units.push({id:'dwelling-'+(i+1),floorArea_m2:area,bedrooms,occupants,ventilationRule:{explicitFlow_m3_h:q,sourceRef:ventRef},localExhaust:local!=null&&local>0?[{id:'dwelling-'+(i+1)+'-local',spaceType:'explicit-editor',designFlow_m3_h:local,control:'project-defined',sourceRef:localRef}]:[],dhwDaily_L:dhw,sourceRef:String(s.dwellingSourceRef||'').trim()||null});
  return {dwellings:count,units};
}
function resolveProgram(useType,s={},B=globalThis.ThermalBuildingInputs){
  const A=adapters(B);let program=null;
  if(useType==='hospital'||useType==='clinic')program=A.healthcareRoomProgram(healthcareInput(s));
  else if(useType==='residential')program=A.residentialProgram(residentialInput(s));
  else return {required:false,resolved:true,program:null,annualInputs:null,diagnostics:[]};
  return {required:true,resolved:!!program.resolved,program,annualInputs:program.resolved?A.toAnnualInputs(program):null,diagnostics:clone(program.diagnostics||[])};
}
function integrationConfig(s={},program){
  const cfg={ventilationSchedule:s.ventilationSchedule||'continuous',includeSensibleOutdoorAir:bool(s.includeSensibleOutdoorAir)};
  const ai=program?.annualInputs;
  const exhaust=+(ai?.designExhaust_m3_h??ai?.localExhaustDesign_m3_h??0);
  if(exhaust>0){cfg.includeExhaustReplacement=bool(s.includeExhaustReplacement);cfg.exhaustSchedule=s.exhaustSchedule||cfg.ventilationSchedule;cfg.exhaustHeatRecoveryEffectiveness=Math.max(0,Math.min(1,n(s.exhaustHeatRecoveryEffectiveness??0,'exhaustHeatRecoveryEffectiveness',{min:0})));}
  if(ai?.roomConstraints?.length){cfg.roomConstraintSchedule=s.roomConstraintSchedule||cfg.ventilationSchedule;cfg.enforceRoomConstraints=bool(s.enforceRoomConstraints);cfg.roomConstraintDegreeHourTolerance=n(s.roomConstraintDegreeHourTolerance??0,'roomConstraintDegreeHourTolerance',{min:0});}
  if((+ai?.dhwDaily_L||0)>0){cfg.dhw={enabled:bool(s.dhwEnabled),coldWater_C:n(s.dhwColdWater_C??10,'dhwColdWater_C'),target_C:n(s.dhwTarget_C??55,'dhwTarget_C'),drawProfile24:s.dhwDrawProfile24||'uniform'};}
  return cfg;
}
function buildAnnualProject({screening,useType,programState={},integrationState={}}={},C=globalThis.ThermalCore,B=globalThis.ThermalBuildingInputs){
  if(!C?.makeDemoProject||!C?.prepareProgramAnnualProject)throw new Error('ThermalCore annual program integration is required');
  if(!screening?.envelope)throw new Error('building screening result is required');
  const program=resolveProgram(useType,programState,B);
  if(program.required&&!program.resolved)return {resolved:false,program,project:null,prepared:null,issues:program.diagnostics};
  const project=C.makeDemoProject();
  const H=n(screening.envelope.totalHeatLoss_W_K,'screening envelope H',{min:1e-9});
  project.building={...project.building,Roa_K_W:1/H};
  project.meta={...(project.meta||{}),thermalOptimizerUiBasis:{schema:SCHEMA,envelopeHeatLossCoefficient_W_K:H,thermalMassBasis:'canonical demo prior; not yet derived from building construction editor'}};
  if(program.annualInputs){project.programAnnualInputs=clone(program.annualInputs);project.programIntegration=integrationConfig(integrationState,program);}
  const prepared=C.prepareProgramAnnualProject(project);
  const issues=[...(program.diagnostics||[]),...(prepared.summary?.issues||[])];
  return {resolved:!issues.some(x=>x.severity==='error'),program,project,prepared,issues};
}
function runAnnualCase(args={},C=globalThis.ThermalCore,B=globalThis.ThermalBuildingInputs){
  if(!C?.simulateCandidate||!C?.demoDesigns)throw new Error('ThermalCore simulation API is required');
  const built=buildAnnualProject(args,C,B);
  if(!built.resolved)return {...built,result:null};
  const designs=C.demoDesigns(),idx=Math.max(0,Math.min(designs.length-1,Math.trunc(Number(args.designIndex??0)||0))),design=designs[idx];
  const result=C.simulateCandidate(built.project,design,{retainTrace:bool(args.retainTrace)});
  return {...built,designIndex:idx,designName:design.name,result};
}
return {schema:SCHEMA,healthcareInput,residentialInput,resolveProgram,integrationConfig,buildAnnualProject,runAnnualCase};
});

