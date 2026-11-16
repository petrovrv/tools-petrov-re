/* Thermal System Optimizer dynamic-building / comparison browser bridge v0.1
 * UI/state projection only. Canonical thermal-core-v0.71.js is not modified.
 * Requires ThermalCore, ThermalBuildingInputs and ThermalProgramInputs.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ThermalDynamicBuilding=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SCHEMA='thermal-optimizer/dynamic-building-browser/v0.1';
const clone=x=>JSON.parse(JSON.stringify(x));
const finite=(v,name,{min=null,max=null}={})=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(name+' must be finite');if(min!=null&&x<min)throw new Error(name+' must be >= '+min);if(max!=null&&x>max)throw new Error(name+' must be <= '+max);return x;};
const mwh=J=>Number.isFinite(J)?J/3.6e9:null;
const kwh=J=>Number.isFinite(J)?J/3.6e6:null;

function monthlySeries(v,name){const a=Array.isArray(v)?v:String(v??'').split(/[\s,;]+/).filter(Boolean).map(Number);if(a.length!==12||a.some(x=>!Number.isFinite(x)))throw new Error(name+' must contain 12 monthly values');return a;}
function climateProfile(state={},samples=8760){if(!state?.enabled)return null;const means=monthlySeries(state.monthlyMean_C,'climate monthly means'),swings=monthlySeries(state.dailySwing_K,'climate daily swings'),days=samples===8784?[31,29,31,30,31,30,31,31,30,31,30,31]:[31,28,31,30,31,30,31,31,30,31,30,31],out=new Float64Array(samples);let h=0;for(let m=0;m<12;m++)for(let d=0;d<days[m];d++)for(let hod=0;hod<24;hod++)out[h++]=means[m]+0.5*swings[m]*Math.sin(2*Math.PI*(hod-8)/24);return{values:out,basis:{kind:'monthly-mean-plus-diurnal-screening-profile',monthlyMean_C:means,dailySwing_K:swings,provenance:String(state.provenance??'').trim()||'user input',warning:'Screening weather only; replace with project EPW/TMY before design.'}};}

function normalizeDynamicBuilding(s={},screening){
  const H=finite(screening?.envelope?.totalHeatLoss_W_K,'screening envelope H',{min:1e-9});
  const ram_K_per_kW=finite(s.Ram_K_per_kW,'Ram_K_per_kW',{min:1e-9});
  const Cair_MJ_K=finite(s.Cair_MJ_K,'Cair_MJ_K',{min:1e-9});
  const Cmass_MJ_K=finite(s.Cmass_MJ_K,'Cmass_MJ_K',{min:1e-9});
  const initialAir_C=finite(s.initialAir_C,'initialAir_C');
  const initialMass_C=finite(s.initialMass_C,'initialMass_C');
  const comfortMin_C=finite(s.comfortMin_C,'comfortMin_C');
  const comfortMax_C=finite(s.comfortMax_C,'comfortMax_C');
  if(!(comfortMax_C>comfortMin_C))throw new Error('comfortMax_C must be greater than comfortMin_C');
  return {
    Roa_K_W:1/H,
    Ram_K_W:ram_K_per_kW/1000,
    Cair_J_K:Cair_MJ_K*1e6,
    Cmass_J_K:Cmass_MJ_K*1e6,
    initialAir_C,initialMass_C,comfortMin_C,comfortMax_C,
    basis:{kind:'explicit-project-input',schema:SCHEMA,envelopeHeatLossCoefficient_W_K:H,RoaDerivedFrom:'1 / envelope H',RamInputUnit:'K/kW',capacitanceInputUnit:'MJ/K'}
  };
}

function buildProject(args={},C=globalThis.ThermalCore,B=globalThis.ThermalBuildingInputs,P=globalThis.ThermalProgramInputs){
  if(!P?.buildAnnualProject)throw new Error('ThermalProgramInputs.buildAnnualProject is required');
  const built=P.buildAnnualProject(args,C,B);
  if(!built.resolved)return built;
  const dynamic=normalizeDynamicBuilding(args.dynamicBuildingState||{},args.screening);
  built.project.building={...dynamic}; delete built.project.building.basis;
  built.project.operation={...(built.project.operation||{}),occupiedComfortMin_C:dynamic.comfortMin_C,occupiedComfortMax_C:dynamic.comfortMax_C};
  const area=Math.max(1,Number(args.screening?.envelope?.geometry?.floorArea_m2)||1),height=Math.max(1,Number(args.screening?.envelope?.geometry?.storeyHeight_m)||3),volume=Math.max(1,Number(args.screening?.envelope?.geometry?.volume_m3)||area*height),occupied=built.project.profiles.occupied,people=Math.max(0,Number(args.screening?.preset?.people)||0),oa_m3_s=Math.max(0,Number(args.screening?.preset?.outdoorAir_m3_h)||0)/3600,lighting=Math.max(0,Number(args.screening?.preset?.lighting_W_m2)||0),equipment=Math.max(0,Number(args.screening?.preset?.equipment_W_m2)||0),count=built.project.profiles.outdoor_C.length;
  if(occupied?.length===count){built.project.profiles.internalGains_W=Float64Array.from(occupied,(x)=>area*(x?lighting+equipment:Math.min(2,0.15*(lighting+equipment))));built.project.profiles.ventilationFlow_m3_s=Float64Array.from(occupied,(x)=>x?oa_m3_s:Math.min(oa_m3_s,.05*oa_m3_s));built.project.profiles.internalMoisture_kg_s=Float64Array.from(occupied,(x)=>x?people*.00004:0);}
  built.project.humidity={...(built.project.humidity||{}),zoneVolume_m3:volume};
  const climate=climateProfile(args.climateState||{},built.project.profiles.outdoor_C.length);if(climate)built.project.profiles.outdoor_C=climate.values;
  const es=args.economicsState||{};
  const analysisYears=finite(es.analysisYears??built.project.economics?.analysisYears??25,'analysisYears',{min:1,max:80});
  const discountRate=finite(es.discountRate??built.project.economics?.discountRate??0.04,'discountRate',{min:-0.99,max:1});
  const energyEscalation=finite(es.energyEscalation??built.project.economics?.energyEscalation??0.01,'energyEscalation',{min:-0.99,max:1});
  built.project.economics={...(built.project.economics||{}),analysisYears:Math.trunc(analysisYears),discountRate,energyEscalation};
  const rescalePrice=(a,target,name)=>{target=finite(target,name,{min:0});const mean=Array.from(a||[]).reduce((s,x)=>s+(Number(x)||0),0)/Math.max(1,a?.length||0);return Float64Array.from(a||[],x=>mean>0?Number(x)*target/mean:target);};
  if(es.electricityPrice_per_kWh!=null)built.project.profiles.electricity_per_kWh=rescalePrice(built.project.profiles.electricity_per_kWh,es.electricityPrice_per_kWh,'electricityPrice_per_kWh');
  if(es.gasPrice_per_kWh!=null)built.project.profiles.gas_per_kWh=rescalePrice(built.project.profiles.gas_per_kWh,es.gasPrice_per_kWh,'gasPrice_per_kWh');
  built.project.meta={...(built.project.meta||{}),thermalOptimizerUiBasis:{...(built.project.meta?.thermalOptimizerUiBasis||{}),schema:SCHEMA,envelopeHeatLossCoefficient_W_K:dynamic.basis.envelopeHeatLossCoefficient_W_K,dynamicBuildingBasis:clone(dynamic.basis),thermalMassBasis:'explicit project input; no construction-derived prior applied',annualLoadBasis:{area_m2:area,zoneVolume_m3:volume,people,outdoorAir_m3_s:oa_m3_s,lighting_W_m2:lighting,equipment_W_m2:equipment,schedule:'canonical occupied profile scaled by project screening inputs'},climateBasis:climate?.basis??'canonical demo weather',economicsBasis:{analysisYears:built.project.economics.analysisYears,discountRate:built.project.economics.discountRate,energyEscalation:built.project.economics.energyEscalation,electricityPrice_per_kWh:es.electricityPrice_per_kWh??null,gasPrice_per_kWh:es.gasPrice_per_kWh??null,priceShape:'canonical hourly relative shape rescaled to the user-entered annual mean'}}};
  return {...built,dynamicBuilding:dynamic,climateBasis:climate?.basis??null};
}

function commonDesignDays(project){
  const a=project?.profiles?.outdoor_C;if(!a||a.length<24)throw new Error('annual outdoor temperature profile is required');
  const nd=Math.floor(a.length/24);let cold={day:0,mean_C:Infinity},hot={day:0,mean_C:-Infinity};
  for(let d=0;d<nd;d++){let sum=0;for(let h=0;h<24;h++)sum+=Number(a[d*24+h]);const mean=sum/24;if(mean<cold.mean_C)cold={day:d,mean_C:mean};if(mean>hot.mean_C)hot={day:d,mean_C:mean};}
  return {method:'24 h civil blocks ranked by mean outdoor_C from the common project profile; annual chronology is retained',cold:{...cold,startHour:cold.day*24,endHour:cold.day*24+23},hot:{...hot,startHour:hot.day*24,endHour:hot.day*24+23}};
}
function sumTrace(trace,start,key){let s=0;for(let h=start;h<Math.min(start+24,trace.length);h++)s+=Number(trace[h]?.[key]||0)*3600;return s;}
function extremaTrace(trace,start,key,fn,seed){let x=seed;for(let h=start;h<Math.min(start+24,trace.length);h++){const v=Number(trace[h]?.[key]);if(Number.isFinite(v))x=fn(x,v);}return Number.isFinite(x)?x:null;}
function daySummary(result,day){
  const t=result?.trace;if(!t)return null;const s=day.startHour;
  return {startHour:s,meanOutdoor_C:day.mean_C,grid_kWh:kwh(sumTrace(t,s,'gridImport_W')),gas_kWh:kwh(sumTrace(t,s,'gasInput_W')),deliveredFuel_kWh:kwh(sumTrace(t,s,'deliveredFuelInput_W')),heatDelivered_kWh:kwh(sumTrace(t,s,'deliveredHeat_W')),coolDelivered_kWh:kwh(sumTrace(t,s,'deliveredCool_W')),unserved_kWh:kwh(sumTrace(t,s,'unserved_W')),minAir_C:extremaTrace(t,s,'Tair_C',Math.min,Infinity),maxAir_C:extremaTrace(t,s,'Tair_C',Math.max,-Infinity),minMass_C:extremaTrace(t,s,'Tmass_C',Math.min,Infinity),maxMass_C:extremaTrace(t,s,'Tmass_C',Math.max,-Infinity),maxGrid_kW:(extremaTrace(t,s,'gridImport_W',Math.max,-Infinity)??0)/1000};
}
function resultSummary(result,design,index,days){
  return {index,name:design.name,comparisonOnly:!!design.comparisonOnly,feasible:!!result.feasible,npc:result.npc,annual:{grid_MWh:mwh(result.totals?.gridImport_J),gas_MWh:mwh(result.totals?.gas_J),deliveredFuel_MWh:mwh(result.totals?.deliveredFuel_J),zoneHeat_MWh:mwh(result.totals?.zoneHeat_J),zoneCool_MWh:mwh(result.totals?.zoneCool_J),unserved_kWh:kwh(result.totals?.unserved_J),comfortOccupiedDegreeHours:(result.comfort?.occupiedDegreeHoursBelow||0)+(result.comfort?.occupiedDegreeHoursAbove||0)},coldDay:daySummary(result,days.cold),hotDay:daySummary(result,days.hot)};
}
function compareCandidates(args={},C=globalThis.ThermalCore,B=globalThis.ThermalBuildingInputs,P=globalThis.ThermalProgramInputs){
  if(!C?.simulateCandidate||!C?.demoDesigns)throw new Error('ThermalCore simulation API is required');
  const built=buildProject(args,C,B,P);if(!built.resolved)return {...built,days:null,candidates:[],best:null};
  const days=commonDesignDays(built.project),designs=C.demoDesigns(),candidates=[];
  for(let i=0;i<designs.length;i++){const result=C.simulateCandidate(built.project,designs[i],{retainTrace:true});candidates.push({...resultSummary(result,designs[i],i,days),result});}
  const ranked=candidates.filter(x=>x.feasible&&!x.comparisonOnly&&Number.isFinite(x.npc)).sort((a,b)=>a.npc-b.npc);
  return {...built,days,candidates,best:ranked[0]??null};
}
function runCandidateCase(args={},C=globalThis.ThermalCore,B=globalThis.ThermalBuildingInputs,P=globalThis.ThermalProgramInputs){
  const built=buildProject(args,C,B,P);if(!built.resolved)return {...built,result:null};
  const designs=C.demoDesigns(),idx=Math.max(0,Math.min(designs.length-1,Math.trunc(Number(args.designIndex??0)||0))),design=designs[idx];
  const result=C.simulateCandidate(built.project,design,{retainTrace:!!args.retainTrace});return {...built,designIndex:idx,designName:design.name,result};
}
return {schema:SCHEMA,monthlySeries,climateProfile,normalizeDynamicBuilding,buildProject,commonDesignDays,daySummary,compareCandidates,runCandidateCase};
});
