/* GENERATED browser adapter for canonical thermal-core-v0.71.js.
 * Canonical payload follows byte-for-byte between the markers.
 * The adapter supplies only CommonJS globals and publishes module.exports as globalThis.ThermalCore.
 */
(function thermalCoreBrowserAdapter(global) {
'use strict';
const module = { exports: {} };
function require(name) { throw new Error('thermal-core browser adapter: require('+name+') is unavailable'); }
require.main = null;
/* === BEGIN CANONICAL thermal-core-v0.71.js === */
// v0.71: adds explicit hydronic-first series exhaust recovery with non-mutating pre-dispatch cold-storage acceptance planning, actual accepted-duty downstream exhaust transformation, and exact-once same-hour charge accounting.
// v0.68: adds graph-owned exhaust/return-air to hydronic cold-storage conversion with explicit source stream, psychrometric/frost bypass, UA/run-around transfer, exact fan/pump ownership, and residual-after-existing-sensible-recovery accounting.
// v0.61: adds explicit hourly marginal-cost dispatch among multiple physical mechanical-cooling plants using project-supplied tariff/performance inputs; no inferred merit order or identifier tie-break.
// v0.66: adds storage/plant absolute hourly shared-cold-storage reservation profiles with pre-merit physical headroom derating and no unused-reservation redistribution.
 // v0.57: adds plant-local modular availability, chronological staging/cycling state, startup electricity, explicit part-load COP multipliers, and graph-source capacity envelopes derived from current physical plant state rather than static nameplate.
// v0.56: adds explicit multiple physical mechanical-cooling plant states; graph source pools bind to distinct plants with independent capacity, supply temperature, COP/performance options, and compressor/rejection ownership.
 // v0.55: permits multiple graph mechanical-cold source identities on one explicit built-in mechanical plant capacity pool; shared compressor/condenser ownership and source allocation prevent capacity multiplication.
// v0.53: graph-owned direct cold-source allocation and ground-direct integration.
// v0.52: binds endogenous sensible building cooling to graph cold-sink/storage service and exposes unused hydronic free-cooling capacity as graph-owned cold-source availability without latent/dehumidification credit.
// v0.51: integrates graph-owned cold/chilled-water storage into chronological annual dispatch; cold storage charges from named or dynamic-refrigeration cooling sources and discharges before residual mechanical process cooling.
// v0.50: adds explicit multi-storage thermal-source allocation and suppresses legacy primary-buffer charging when graph ownership is authoritative.
// v0.47: scopes legacy/dynamic condenser recovery by system and binds graph storage routes to explicit stateful storage identity.
// v0.45: routes graph-derived dynamic condenser recovery into linked hot-sink/storage paths exactly once.
 // v0.44: dynamically binds graph-derived condenser heat-recovery ownership to resolved annual refrigerant-cycle rejection without pre-solving annual recovered energy.
'use strict';
// v0.41: integrates explicit phase-topology ownership into annual carrier accounting; topology-owned components ignore legacy additive flags.
// v0.40: adds capability-aware Worker phase-provider injection; embeds IF97 synchronously when supplied and refuses missing Worker providers.
// v0.35: couples local/process exhaust moisture transport into the annual psychrometric state; arbitrary contaminant transport remains a standalone process-module state.
// v0.33: integrates TYFOXIT potassium-acetate properties, bounded ASHRAE 50-60 mass% glycol extension, and fixes product/high-mass Worker preamble parity.
// v0.27: adds reference-compatible axial mesh policies and transient BC-III load redistribution with temporal superposition.

/* Thermal System Optimizer — pure-core prototype v0.11
 * Adds psychrometric moisture state, latent cooling and condensate accounting using the site's ASHRAE/Hyland-Wexler moist-air kernel, while retaining occupancy-aware delivery, heat recovery and composable Basis-of-Design reporting.
 * Working-folder prototype only: no DOM, no network, no site integration.
 */

const HOUR_S = 3600;
const YEAR_H = 8760;
const G = 9.80665;
const DT_NOM = 49.83;
const EMITTER_EXPONENT = Object.freeze({
  radiator: 1.30, convector: 1.35, floorConvector: 1.35,
  fanCoil: 1.00, airHeater: 1.00, radiantPanel: 1.25, ceilingPanel: 1.25,
});
const HP_QUALITY = Object.freeze({
  airWater: 0.42, borehole: 0.50, horizontalGround: 0.48,
  waterWater: 0.52, exhaustAir: 0.40, airAir: 0.40, hybrid: 0.42,
});
const AIR_HP = new Set(['airWater','airAir','hybrid']);

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const finite=(name,x)=>{if(!Number.isFinite(x))throw new Error(`${name} must be finite`);return x};
const near=(a,b,rel=1e-9,abs=1e-9)=>Math.abs(a-b)<=Math.max(abs,rel*Math.max(1,Math.abs(a),Math.abs(b)));
const kWh=J=>J/3.6e6;
const JfromkWh=x=>x*3.6e6;


/* ---------- psychrometrics: same Hyland-Wexler/ASHRAE ideal moist-air basis as site mollier/ontvochtiging ---------- */
const RA_DA=287.042, HUM_RATIO=0.621945, CPA_KJ=1.006, CPV_KJ=1.86, HFG_KJ=2501.0, CW_KJ=4.186;
function saturationPressurePa(tC){
  const K=tC+273.15;if(K<=0)return 1e-9;
  if(tC>=0){const C8=-5800.2206,C9=1.3914993,C10=-0.048640239,C11=4.1764768e-5,C12=-1.4452093e-8,C13=6.5459673;return Math.exp(C8/K+C9+C10*K+C11*K*K+C12*K*K*K+C13*Math.log(K));}
  const D1=-5674.5359,D2=6.3925247,D3=-0.009677843,D4=6.2215701e-7,D5=2.0747825e-9,D6=-9.484024e-13,D7=4.1635019;return Math.exp(D1/K+D2+D3*K+D4*K*K+D5*K*K*K+D6*K*K*K*K+D7*Math.log(K));
}
function humidityRatioFromPv(pv,pPa){const q=Math.min(Math.max(pv,0),pPa*0.999999);return HUM_RATIO*q/(pPa-q);}
function vapourPressureFromHumidityRatio(x,pPa){const q=Math.max(x,0);return pPa*q/(HUM_RATIO+q);}
function saturationHumidityRatio(tC,pPa=101325){return humidityRatioFromPv(Math.min(saturationPressurePa(tC),pPa*.999),pPa);}
function humidityRatioFromRH(tC,rh,pPa=101325){return humidityRatioFromPv(clamp(rh,0,1)*saturationPressurePa(tC),pPa);}
function dewPointFromHumidityRatio(x,pPa=101325){const pv=vapourPressureFromHumidityRatio(x,pPa);if(pv<=saturationPressurePa(-100))return-100;if(pv>=saturationPressurePa(100))return 100;let lo=-100,hi=100;for(let i=0;i<80;i++){const mid=.5*(lo+hi);if(saturationPressurePa(mid)<pv)lo=mid;else hi=mid;}return .5*(lo+hi);}
function moistAirEnthalpy_kJ_kgDA(tC,x){return CPA_KJ*tC+x*(HFG_KJ+CPV_KJ*tC);}
function dryAirDensity_kg_m3(tC,x,pPa=101325){return (pPa-vapourPressureFromHumidityRatio(x,pPa))/(RA_DA*(tC+273.15));}
function condensateSpecificCooling_J_kg(tRoomC,tCondensateC){return 1000*(HFG_KJ+CPV_KJ*tRoomC-CW_KJ*Math.max(0,tCondensateC));}
function normalizeHumidity(project={}){const h=project.humidity??{};return{enabled:h.enabled??false,pressure_Pa:h.pressure_Pa??101325,zoneVolume_m3:h.zoneVolume_m3??1000,initialRH:clamp(h.initialRH??0.5,0,1),occupiedMaxDewPoint_C:h.occupiedMaxDewPoint_C??14,unoccupiedMaxDewPoint_C:h.unoccupiedMaxDewPoint_C??18};}
function createHumidityState(project,initialT_C){const s=normalizeHumidity(project),x=humidityRatioFromRH(initialT_C,s.initialRH,s.pressure_Pa);return{spec:s,x_kg_kgDA:x,condensate_kg:0,latentCooling_J:0,dewPointDegreeHoursAbove:0,occupiedDewPointDegreeHoursAbove:0,maxDewPoint_C:dewPointFromHumidityRatio(x,s.pressure_Pa)};}
function coolingTerminalSupportsDehumidification(t={}){return t.dehumidificationEnabled??(t.type==='fanCoil'||t.type==='ventilationAir'||t.type==='airPlusLocalCoils');}
function dehumidificationCapacityKgS(t,roomT_C,xIn,pPa=101325){if(!coolingTerminalSupportsDehumidification(t))return 0;const bf=clamp(t.bypassFactor??0.10,0,.95),adp=t.coilADP_C??8,flow=Math.max(0,t.airFlow_m3_s??0);if(!(flow>0))return 0;const xSurf=Math.min(xIn,saturationHumidityRatio(adp,pPa)),xOut=bf*xIn+(1-bf)*xSurf,mdotDA=flow*dryAirDensity_kg_m3(roomT_C,xIn,pPa);return Math.min(Math.max(0,t.maxCondensate_kg_s??Infinity),mdotDA*Math.max(0,xIn-xOut));}
function humidityHourDemand(state,{roomT_C,outdoorT_C,outdoorRH,ventilation_m3_s,internalMoisture_kg_s,externalMoistureTransfer_kg_s=0,targetDewPoint_C,dt_s=HOUR_S}){
  if(!state.spec.enabled)return{xNoHVAC:state.x_kg_kgDA,targetX:Infinity,requiredCondensate_kg_s:0,outdoorX:0,zoneDryAir_kg:0};
  const p=state.spec.pressure_Pa,x=state.x_kg_kgDA,xOut=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH??.5,0,1),p),rhoRoom=dryAirDensity_kg_m3(roomT_C,x,p),rhoOut=dryAirDensity_kg_m3(outdoorT_C,xOut,p),mZone=Math.max(1e-6,state.spec.zoneVolume_m3*rhoRoom),mVent=Math.max(0,ventilation_m3_s)*rhoOut,source=mVent*(xOut-x)+Math.max(0,internalMoisture_kg_s??0)+(Number.isFinite(+externalMoistureTransfer_kg_s)?+externalMoistureTransfer_kg_s:0),xNo=Math.max(0,x+source*dt_s/mZone),targetX=saturationHumidityRatio(targetDewPoint_C,p),required=Math.max(0,(xNo-targetX)*mZone/dt_s);return{xNoHVAC:xNo,targetX,requiredCondensate_kg_s:required,outdoorX:xOut,zoneDryAir_kg:mZone};
}
function processExhaustMoistureHour(project={},profiles={},hour=0,{roomT_C,zoneHumidityRatio_kg_kgDA,outdoorT_C,outdoorRH,pressure_Pa=101325}={}){
  const raw=project.processExhaust??project.processExhaustPaths??[];const paths=Array.isArray(raw)?raw:(raw&&raw.enabled!==false?[raw]:[]);
  if(!paths.length)return{enabled:false,netZoneMoistureRate_kg_s:0,capturedMoisture_kg_s:0,uncapturedZoneMoistureSource_kg_s:0,airExchangeMoisture_kg_s:0,exhaustDryAir_kg_s:0,paths:[]};
  const xZone=Math.max(0,+zoneHumidityRatio_kg_kgDA||0),xOut=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH??.5,0,1),pressure_Pa),rhoZone=dryAirDensity_kg_m3(roomT_C,xZone,pressure_Pa);
  const getProfile=(ref,fallback)=>{const a=ref&&profiles?.[ref];return a&&Number.isFinite(+a[hour])?+a[hour]:fallback};
  const out=[];let net=0,captured=0,uncaptured=0,exchange=0,mDry=0;
  for(const q of paths){if(q?.enabled===false)continue;const active=clamp(getProfile(q.scheduleProfileRef,q.scheduleFraction??1),0,1),flow=Math.max(0,getProfile(q.exhaustFlowProfileRef,q.exhaustAir_m3_s??0))*active,mdot=flow*rhoZone,makeupFraction=clamp(q.makeupFraction??1,0,1),makeupT=Number.isFinite(+q.makeupAir_C)?+q.makeupAir_C:outdoorT_C;let xMakeup=Number.isFinite(+q.makeupHumidityRatio_kg_kgDA)?Math.max(0,+q.makeupHumidityRatio_kg_kgDA):null;if(xMakeup==null&&Number.isFinite(+q.makeupRH_frac))xMakeup=humidityRatioFromRH(makeupT,clamp(+q.makeupRH_frac,0,1),pressure_Pa);if(xMakeup==null)xMakeup=xOut;const replacementX=makeupFraction*xMakeup+(1-makeupFraction)*xOut,generation=Math.max(0,getProfile(q.moistureProfileRef,q.moistureGeneration_kg_s??0))*active,captureFraction=clamp(q.moistureCaptureFraction??0,0,1),cap=generation*captureFraction,uncap=generation-cap,air=mdot*(replacementX-xZone),n=uncap+air;out.push({id:q.id??null,activeFraction:active,exhaustAir_m3_s:flow,exhaustDryAir_kg_s:mdot,replacementHumidityRatio_kg_kgDA:replacementX,moistureGeneration_kg_s:generation,moistureCaptureFraction:captureFraction,capturedMoisture_kg_s:cap,uncapturedZoneMoistureSource_kg_s:uncap,airExchangeMoisture_kg_s:air,netZoneMoistureRate_kg_s:n});net+=n;captured+=cap;uncaptured+=uncap;exchange+=air;mDry+=mdot;}
  return{enabled:true,netZoneMoistureRate_kg_s:net,capturedMoisture_kg_s:captured,uncapturedZoneMoistureSource_kg_s:uncaptured,airExchangeMoisture_kg_s:exchange,exhaustDryAir_kg_s:mDry,paths:out};
}
function processExhaustAnnualHour(project={},profiles={},hour=0,{roomT_C,zoneHumidityRatio_kg_kgDA,outdoorT_C,outdoorRH,pressure_Pa=101325,zoneContaminants_kg_kgDA={},exhaustRecoveryOwnershipByPath={},hydronicFirstAcceptedByRecovery_W={}}={}){
  const raw=project.processExhaust??project.processExhaustPaths??[];const paths=Array.isArray(raw)?raw:(raw&&raw.enabled!==false?[raw]:[]);
  if(!paths.length)return{enabled:false,netZoneMoistureRate_kg_s:0,capturedMoisture_kg_s:0,uncapturedZoneMoistureSource_kg_s:0,airExchangeMoisture_kg_s:0,exhaustDryAir_kg_s:0,sensibleZoneGain_W:0,contaminants:{},paths:[]};
  const xZone=Math.max(0,+zoneHumidityRatio_kg_kgDA||0),xOut=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH??.5,0,1),pressure_Pa),rhoZone=dryAirDensity_kg_m3(roomT_C,xZone,pressure_Pa);
  const getProfile=(ref,fallback)=>{const a=ref&&profiles?.[ref];return a&&Number.isFinite(+a[hour])?+a[hour]:fallback};
  const out=[];let net=0,captured=0,uncaptured=0,exchange=0,mDry=0,sensible=0;const contaminants={};
  for(const q of paths){if(q?.enabled===false)continue;const active=clamp(getProfile(q.scheduleProfileRef,q.scheduleFraction??1),0,1),flow=Math.max(0,getProfile(q.exhaustFlowProfileRef,q.exhaustAir_m3_s??0))*active,mdot=flow*rhoZone,makeupFraction=clamp(q.makeupFraction??1,0,1),graphRecovery=exhaustRecoveryOwnershipByPath?.[String(q.id??'')]??null,legacyHr=clamp(q.sensibleHeatRecoveryEfficiency??q.airHeatRecoveryEfficiency??0,0,1),hr=graphRecovery?clamp(graphRecovery.makeupAirSensibleEffectiveness??0,0,1):legacyHr,makeupShare=graphRecovery?clamp(graphRecovery.allocation?.makeupAirShare??0,0,1):1,hydronicShare=graphRecovery?clamp(graphRecovery.allocation?.hydronicShare??0,0,1):1,seriesMakeupFirst=graphRecovery?.allocation?.mode==='seriesPriority'&&graphRecovery?.allocation?.priority?.[0]==='makeupAir',seriesHydronicFirst=graphRecovery?.allocation?.mode==='seriesPriority'&&graphRecovery?.allocation?.priority?.[0]==='hydronic',explicitMakeupT=Number.isFinite(+q.makeupAir_C),hydronicAccepted_W=seriesHydronicFirst?Math.max(0,+hydronicFirstAcceptedByRecovery_W?.[graphRecovery?.componentId]||0):0,cpExhaust=1006+1860*xZone,postHydronicExhaustT=seriesHydronicFirst&&mdot>0?roomT_C+hydronicAccepted_W/(mdot*Math.max(cpExhaust,1e-9)):roomT_C,effectiveRecovery=explicitMakeupT?0:makeupFraction*makeupShare*hr,makeupRecoveryInletT=seriesHydronicFirst?postHydronicExhaustT:roomT_C,makeupT=explicitMakeupT?+q.makeupAir_C:(outdoorT_C+makeupShare*hr*(makeupRecoveryInletT-outdoorT_C)),postRecoveryExhaustT=seriesHydronicFirst?(postHydronicExhaustT-effectiveRecovery*(postHydronicExhaustT-outdoorT_C)):((graphRecovery&&!seriesMakeupFirst)?roomT_C:(roomT_C-effectiveRecovery*(roomT_C-outdoorT_C))),hydronicExhaustT=graphRecovery?(seriesMakeupFirst?postRecoveryExhaustT:roomT_C):postRecoveryExhaustT;let xMakeup=Number.isFinite(+q.makeupHumidityRatio_kg_kgDA)?Math.max(0,+q.makeupHumidityRatio_kg_kgDA):null;if(xMakeup==null&&Number.isFinite(+q.makeupRH_frac))xMakeup=humidityRatioFromRH(makeupT,clamp(+q.makeupRH_frac,0,1),pressure_Pa);if(xMakeup==null)xMakeup=xOut;const replacementX=makeupFraction*xMakeup+(1-makeupFraction)*xOut,replacementT=makeupFraction*makeupT+(1-makeupFraction)*outdoorT_C,generation=Math.max(0,getProfile(q.moistureProfileRef,q.moistureGeneration_kg_s??0))*active,captureFraction=clamp(q.moistureCaptureFraction??0,0,1),cap=generation*captureFraction,uncap=generation-cap,air=mdot*(replacementX-xZone),n=uncap+air,cpDA=1006+1860*replacementX,sens=q.excludeSensibleAnnual?0:mdot*cpDA*(replacementT-roomT_C);const species={};
    for(const c of (Array.isArray(q.contaminants)?q.contaminants:[])){if(!c?.id)continue;const id=String(c.id),z=Math.max(0,+zoneContaminants_kg_kgDA[id]||0),gen=Math.max(0,getProfile(c.generationProfileRef,c.generation_kg_s??0))*active,cf=clamp(c.captureFraction??0,0,1),capC=gen*cf,uncapC=gen-capC,makeupC=Math.max(0,getProfile(c.makeupConcentrationProfileRef,c.makeupConcentration_kg_kgDA??c.outdoorConcentration_kg_kgDA??0)),airC=mdot*(makeupC-z),netC=uncapC+airC,limit=Number.isFinite(+c.limit_kg_kgDA)?Math.max(0,+c.limit_kg_kgDA):null;species[id]={id,generation_kg_s:gen,captured_kg_s:capC,uncaptured_kg_s:uncapC,airExchange_kg_s:airC,netZoneRate_kg_s:netC,limit_kg_kgDA:limit};const a=contaminants[id]??(contaminants[id]={id,generation_kg_s:0,captured_kg_s:0,uncaptured_kg_s:0,airExchange_kg_s:0,netZoneRate_kg_s:0,limit_kg_kgDA:null});a.generation_kg_s+=gen;a.captured_kg_s+=capC;a.uncaptured_kg_s+=uncapC;a.airExchange_kg_s+=airC;a.netZoneRate_kg_s+=netC;if(limit!=null)a.limit_kg_kgDA=a.limit_kg_kgDA==null?limit:Math.min(a.limit_kg_kgDA,limit);}
    out.push({id:q.id??null,adapterKind:q.adapterKind??null,activeFraction:active,exhaustAir_m3_s:flow,exhaustDryAir_kg_s:mdot,replacementTemperature_C:replacementT,replacementHumidityRatio_kg_kgDA:replacementX,sensibleHeatRecoveryEfficiency:hr,effectiveSensibleHeatRecoveryFraction:effectiveRecovery,explicitExhaustRecoveryOwnerId:graphRecovery?.componentId??null,exhaustRecoveryAllocationMode:graphRecovery?.allocation?.mode??null,makeupRecoveryExhaustFlow_m3_s:graphRecovery?flow*makeupShare:flow,hydronicRecoveryExhaustFlow_m3_s:graphRecovery?flow*hydronicShare:flow,hydronicRecoveryExhaustTemperature_C:hydronicExhaustT,exhaustRecoverySeriesOrder:seriesMakeupFirst?['makeupAir','hydronic']:(seriesHydronicFirst?['hydronic','makeupAir']:null),hydronicRecoveryAccepted_W:hydronicAccepted_W,postHydronicRecoveryExhaustTemperature_C:seriesHydronicFirst?postHydronicExhaustT:null,postSensibleRecoveryExhaustTemperature_C:postRecoveryExhaustT,postSensibleRecoveryExhaustHumidityRatio_kg_kgDA:xZone,sensibleZoneGain_W:sens,moistureGeneration_kg_s:generation,moistureCaptureFraction:captureFraction,capturedMoisture_kg_s:cap,uncapturedZoneMoistureSource_kg_s:uncap,airExchangeMoisture_kg_s:air,netZoneMoistureRate_kg_s:n,contaminants:species});net+=n;captured+=cap;uncaptured+=uncap;exchange+=air;mDry+=mdot;sensible+=sens;}
  return{enabled:true,netZoneMoistureRate_kg_s:net,capturedMoisture_kg_s:captured,uncapturedZoneMoistureSource_kg_s:uncaptured,airExchangeMoisture_kg_s:exchange,exhaustDryAir_kg_s:mDry,sensibleZoneGain_W:sensible,contaminants,paths:out};
}
function normalizeProcessContaminants(project={}){const c=project.processContaminants??{};return{enabled:c.enabled??false,zoneVolume_m3:Math.max(1e-6,+c.zoneVolume_m3||+project.humidity?.zoneVolume_m3||1000),initialConcentrations_kg_kgDA:{...(c.initialConcentrations_kg_kgDA??{})},degreeHourTolerance:Math.max(0,+c.degreeHourTolerance||0)};}
function createProcessContaminantState(project={}){const spec=normalizeProcessContaminants(project),x={};for(const [id,v] of Object.entries(spec.initialConcentrations_kg_kgDA))x[id]=Math.max(0,+v||0);return{spec,concentrations_kg_kgDA:x,maxConcentrations_kg_kgDA:{...x},degreeHoursAboveLimit:{},violationCount:0};}
function advanceProcessContaminantState(state,transport,{roomT_C,zoneHumidityRatio_kg_kgDA,pressure_Pa=101325,dt_s=HOUR_S}={}){if(!state.spec.enabled)return{enabled:false,concentrations_kg_kgDA:{},violations:[]};const rho=dryAirDensity_kg_m3(roomT_C,Math.max(0,+zoneHumidityRatio_kg_kgDA||0),pressure_Pa),mZone=Math.max(1e-9,state.spec.zoneVolume_m3*rho),violations=[];const ids=new Set([...Object.keys(state.concentrations_kg_kgDA),...Object.keys(transport?.contaminants??{})]);for(const id of ids){const t=transport?.contaminants?.[id],prev=Math.max(0,+state.concentrations_kg_kgDA[id]||0),next=Math.max(0,prev+(+t?.netZoneRate_kg_s||0)*dt_s/mZone);state.concentrations_kg_kgDA[id]=next;state.maxConcentrations_kg_kgDA[id]=Math.max(+state.maxConcentrations_kg_kgDA[id]||0,next);if(t?.limit_kg_kgDA!=null&&next>t.limit_kg_kgDA){const dh=(next-t.limit_kg_kgDA)/Math.max(t.limit_kg_kgDA,1e-30)*dt_s/HOUR_S;state.degreeHoursAboveLimit[id]=(+state.degreeHoursAboveLimit[id]||0)+dh;state.violationCount++;violations.push({id,concentration_kg_kgDA:next,limit_kg_kgDA:t.limit_kg_kgDA});}}return{enabled:true,concentrations_kg_kgDA:{...state.concentrations_kg_kgDA},violations};}
function applyHumidityRemoval(state,demand,{removed_kg_s,roomT_C,targetDewPoint_C,occupied,dt_s=HOUR_S,condensateT_C=8}){
  if(!state.spec.enabled)return{dewPoint_C:null,removed_kg_s:0,latentCooling_W:0};const removed=Math.max(0,removed_kg_s),x=Math.max(0,demand.xNoHVAC-removed*dt_s/Math.max(demand.zoneDryAir_kg,1e-9));state.x_kg_kgDA=x;const dew=dewPointFromHumidityRatio(x,state.spec.pressure_Pa),above=Math.max(0,dew-targetDewPoint_C)*dt_s/HOUR_S,q=removed*condensateSpecificCooling_J_kg(roomT_C,condensateT_C);state.condensate_kg+=removed*dt_s;state.latentCooling_J+=q*dt_s;state.dewPointDegreeHoursAbove+=above;if(occupied)state.occupiedDewPointDegreeHoursAbove+=above;state.maxDewPoint_C=Math.max(state.maxDewPoint_C,dew);return{dewPoint_C:dew,removed_kg_s:removed,latentCooling_W:q};
}

function dtLog(tSupplyC,tReturnC,tRoomC){
  const a=tSupplyC-tRoomC,b=tReturnC-tRoomC;
  if(!(a>0)||!(b>0))return 0;
  if(Math.abs(a-b)<1e-12)return a;
  return (a-b)/Math.log(a/b);
}
function emitterFactor(tSupplyC,tReturnC,tRoomC,type='radiator',exponentOverride=null){
  const dt=dtLog(tSupplyC,tReturnC,tRoomC);if(!(dt>0))return 0;
  const n=exponentOverride??EMITTER_EXPONENT[type]??1.30;
  return Math.pow(dt/DT_NOM,n);
}
function emitterCapacityW(spec,roomC){
  return Math.max(0,spec.nominal_W*emitterFactor(spec.supply_C,spec.return_C,roomC,spec.type,spec.exponent));
}

function surfaceOutputWm2(tSurfaceC,tRoomC){
  const d=tSurfaceC-tRoomC;return d>0?8.92*Math.pow(d,1.1):0;
}
function surfaceExcessK(q_W_m2){return q_W_m2>0?Math.pow(q_W_m2/8.92,1/1.1):0}
const FLOOR_R_SCREED=0.045/1.2;
function floorSeriesResistance(spec={}){
  const spacing=spec.spacing_m??0.15,spacingFactor=Math.max(0.5,1+(spacing-0.15)*1.2);
  return (Math.max(0,spec.coveringR_m2K_W??0.09)+FLOOR_R_SCREED)*spacingFactor;
}
function floorRequiredMeanWaterC(q_W_m2,roomC,spec={}){
  return roomC+surfaceExcessK(q_W_m2)+q_W_m2*floorSeriesResistance(spec);
}
function floorHeatingCapacityW(spec,roomC){
  const area=Math.max(0,spec.area_m2??0),limit=spec.surfaceLimit_C??29,tw=((spec.supply_C??35)+(spec.return_C??30))/2;
  if(!(area>0)||!(limit>roomC)||!(tw>roomC))return{capacity_W:0,q_W_m2:0,surface_C:roomC,meanWater_C:tw};
  const qSurface=surfaceOutputWm2(limit,roomC);let lo=0,hi=qSurface;
  for(let i=0;i<70;i++){const q=(lo+hi)/2;if(floorRequiredMeanWaterC(q,roomC,spec)<=tw)lo=q;else hi=q}
  const q=lo;return{capacity_W:area*q,q_W_m2:q,surface_C:roomC+surfaceExcessK(q),meanWater_C:tw};
}
function floorRequiredMeanWaterCoolingC(q_W_m2,roomC,spec={}){
  return roomC-surfaceExcessK(q_W_m2)-q_W_m2*floorSeriesResistance(spec);
}
function floorCoolingCapacityW(spec,roomC,dewPointC=14){
  const area=Math.max(0,spec.area_m2??0),tw=((spec.supply_C??18)+(spec.return_C??21))/2,margin=spec.dewpointMargin_K??2;
  const surfaceFloor=Math.max(spec.surfaceMin_C??19,dewPointC+margin),maxFlux=Math.max(0,spec.maxFlux_W_m2??35);
  if(!(area>0)||!(roomC>surfaceFloor)||!(tw<roomC))return{capacity_W:0,q_W_m2:0,surface_C:roomC,meanWater_C:tw,dewLimit_C:surfaceFloor};
  // Same EN-1264 basic surface relation is used only as a heat-transfer envelope; maxFlux and dew point remain explicit assumptions.
  const qBySurface=Math.min(maxFlux,8.92*Math.pow(Math.max(0,roomC-surfaceFloor),1.1));let lo=0,hi=qBySurface;
  for(let i=0;i<70;i++){const q=(lo+hi)/2;if(floorRequiredMeanWaterCoolingC(q,roomC,spec)>=tw)lo=q;else hi=q}
  const q=lo;return{capacity_W:area*q,q_W_m2:q,surface_C:roomC-surfaceExcessK(q),meanWater_C:tw,dewLimit_C:surfaceFloor};
}
function heatingTerminalCapacityW(spec,roomC){
  if((spec.type??'radiator')==='floor')return floorHeatingCapacityW(spec,roomC).capacity_W;
  return emitterCapacityW(spec,roomC);
}
function coolingTerminalCapacityW(spec,roomC,dewPointC=14){
  const type=spec.type??'fanCoil';
  if(type==='floor')return floorCoolingCapacityW(spec,roomC,dewPointC).capacity_W;
  if(type==='ceiling'||type==='tabs'){
    const area=Math.max(0,spec.area_m2??0),margin=spec.dewpointMargin_K??2,minSurface=Math.max(spec.surfaceMin_C??(type==='ceiling'?17:18),dewPointC+margin),waterFloor=(spec.supply_C??16)+(spec.waterToSurfaceApproach_K??1.5);
    const surface=Math.max(minSurface,waterFloor),q=Math.min(spec.maxFlux_W_m2??(type==='ceiling'?75:50),8.92*Math.pow(Math.max(0,roomC-surface),1.1));return area*q;
  }
  return Math.max(0,spec.nominal_W??0);
}

function heatPumpCOP(tSourceC,tSinkC,type='airWater',o={}){
  const q=o.quality??HP_QUALITY[type]??0.42,defrost=o.defrostFactor??0.88;
  const hot=tSinkC+273.15,cold=tSourceC+273.15;
  if(!(hot>0&&cold>0))throw new Error('absolute temperature must be positive');
  if(hot<=cold)return o.maxCOP??8;
  let cop=q*hot/(hot-cold);
  if(AIR_HP.has(type)&&tSourceC>-8&&tSourceC<7)cop*=defrost;
  return clamp(cop,o.minCOP??1,o.maxCOP??8);
}
function heatPumpCapacityFactor(tOutdoorC,type='airWater',o={}){
  if(!AIR_HP.has(type))return 1;
  return clamp(1+(tOutdoorC-(o.referenceC??7))*(o.slopePerK??0.022),o.minFactor??0.35,o.maxFactor??1.05);
}

function coolingCOPAtReject(chilledSupplyC,rejectC,o={}){
  const cold=(chilledSupplyC-(o.evapApproach_K??5))+273.15,hot=rejectC+273.15;
  if(!(cold>0&&hot>0))throw new Error('absolute temperature must be positive');
  if(hot<=cold)return o.maxCOP??12;
  const cop=(o.quality??0.45)*cold/(hot-cold);return clamp(cop,o.minCOP??1,o.maxCOP??12);
}
function coolingCOP(chilledSupplyC,outdoorC,o={}){return coolingCOPAtReject(chilledSupplyC,outdoorC+(o.rejectApproach_K??10),o);}
function condenserRecoveryState({cooling_W,chilledSupply_C,outdoor_C,hotSinkTarget_C=55,recoveryApproach_K=3,maxRecovery_W=Infinity,coolingOptions={}}){
  if(!(cooling_W>0))return{COP:0,electric_W:0,rejected_W:0,recoverable_W:0,reject_C:outdoor_C+(coolingOptions.rejectApproach_K??10)};
  const ambientReject=outdoor_C+(coolingOptions.rejectApproach_K??10),reject_C=Math.max(ambientReject,hotSinkTarget_C+recoveryApproach_K),COP=coolingCOPAtReject(chilledSupply_C,reject_C,coolingOptions),electric_W=cooling_W/Math.max(COP,1e-6),rejected_W=cooling_W+electric_W,recoverable_W=Math.min(rejected_W,maxRecovery_W);
  return{COP,electric_W,rejected_W,recoverable_W,reject_C};
}

function effNTUCounterflow(NTU,Cstar){
  if(!(NTU>0))return 0;const C=clamp(Cstar,0,1);
  if(C<1e-12)return 1-Math.exp(-NTU);
  if(Math.abs(C-1)<1e-10)return NTU/(1+NTU);
  const e=Math.exp(-NTU*(1-C));return (1-e)/(1-C*e);
}
function lmtd(dt1,dt2){
  if(!(dt1>0&&dt2>0))return NaN;if(Math.abs(dt1-dt2)<1e-12)return dt1;
  return (dt1-dt2)/Math.log(dt1/dt2);
}
function directHX({UA_W_K,hotCapacity_W_K,coldCapacity_W_K,hotIn_C,coldIn_C}){
  if(!(UA_W_K>=0&&hotCapacity_W_K>0&&coldCapacity_W_K>0))throw new Error('invalid HX inputs');
  if(!(hotIn_C>coldIn_C)||UA_W_K===0)return{Q_W:0,effectiveness:0,NTU:0,Cstar:Math.min(hotCapacity_W_K,coldCapacity_W_K)/Math.max(hotCapacity_W_K,coldCapacity_W_K),hotOut_C:hotIn_C,coldOut_C:coldIn_C};
  const Cmin=Math.min(hotCapacity_W_K,coldCapacity_W_K),Cmax=Math.max(hotCapacity_W_K,coldCapacity_W_K),Cstar=Cmin/Cmax,NTU=UA_W_K/Cmin;
  const effectiveness=effNTUCounterflow(NTU,Cstar),Q_W=effectiveness*Cmin*(hotIn_C-coldIn_C);
  return{Q_W,effectiveness,NTU,Cstar,hotOut_C:hotIn_C-Q_W/hotCapacity_W_K,coldOut_C:coldIn_C+Q_W/coldCapacity_W_K};
}

/* ---------- v0.30 property-coupled direct-HX film / UA screening ---------- */
function prandtlNumber(properties){
  if(!properties?.available||!(properties.cp_J_kgK>0&&properties.mu_Pa_s>0&&properties.k_W_mK>0))return NaN;
  return properties.cp_J_kgK*properties.mu_Pa_s/properties.k_W_mK;
}
function internalTubeNusselt({Re,Pr,frictionFactor:fd=null,relRough=0}={}){
  if(!(Re>0&&Pr>0))return{available:false,reason:'invalid-Re-Pr'};
  if(Re<2300)return{available:true,Nu:3.66,regime:'laminar',correlation:'fully-developed-circular-tube-constant-wall-temperature'};
  const f=fd??colebrookFriction(Math.max(Re,2300),relRough);
  if(!(f>0))return{available:false,reason:'invalid-friction-factor'};
  const gn=(r)=>{const fr=fd??colebrookFriction(Math.max(r,2300),relRough);return (fr/8)*(r-1000)*Pr/(1+12.7*Math.sqrt(fr/8)*(Math.pow(Pr,2/3)-1));};
  if(Pr<0.5||Pr>2000||Re>5e6)return{available:false,reason:'outside-Gnielinski-range',supported:{Re:[2300,5e6],Pr:[0.5,2000]}};
  if(Re>=4000)return{available:true,Nu:gn(Re),regime:'turbulent',correlation:'Gnielinski-1976',frictionFactor:f};
  const t=(Re-2300)/1700,Nu0=3.66,Nu1=gn(4000);
  return{available:true,Nu:Nu0*(1-t)+Nu1*t,regime:'transition',correlation:'project-linear-transition-2300-4000',frictionFactor:f,endpoints:{laminarNu:Nu0,turbulentNuAt4000:Nu1}};
}
function heatExchangerTubeSideFilm({fluidSpec,T_C,mdot_kg_s,hydraulicDiameter_m,flowArea_m2,roughness_m=1.5e-6}={}){
  if(!(mdot_kg_s>0&&hydraulicDiameter_m>0&&flowArea_m2>0))return{available:false,reason:'invalid-side-geometry-or-flow'};
  const properties=resolveFluidProperties(fluidSpec,T_C);if(!properties.available)return{available:false,reason:'fluid-properties-unavailable',properties};
  const velocity_m_s=mdot_kg_s/(properties.rho_kg_m3*flowArea_m2),Re=properties.rho_kg_m3*velocity_m_s*hydraulicDiameter_m/properties.mu_Pa_s,Pr=prandtlNumber(properties),relRough=roughness_m/hydraulicDiameter_m,fd=frictionFactor(Re,relRough),nu=internalTubeNusselt({Re,Pr,frictionFactor:fd,relRough});
  if(!nu.available)return{available:false,reason:'Nusselt-correlation-unavailable',properties,Re,Pr,frictionFactor:fd,nusselt:nu};
  const h_W_m2K=nu.Nu*properties.k_W_mK/hydraulicDiameter_m;
  return{available:true,properties,velocity_m_s,Re,Pr,frictionFactor:fd,Nu:nu.Nu,h_W_m2K,regime:nu.regime,correlation:nu.correlation};
}
function directHXFromGeometry({hotSide,coldSide,heatTransferArea_m2,wallResistance_m2K_W=0,hotFoulingResistance_m2K_W=0,coldFoulingResistance_m2K_W=0,hotIn_C,coldIn_C}={}){
  if(!(heatTransferArea_m2>0&&hotIn_C>coldIn_C))return{available:false,reason:'invalid-HX-geometry-or-temperatures'};
  const hot=heatExchangerTubeSideFilm({...hotSide,T_C:hotSide?.T_C??hotIn_C}),cold=heatExchangerTubeSideFilm({...coldSide,T_C:coldSide?.T_C??coldIn_C});
  if(!hot.available||!cold.available)return{available:false,reason:'HX-side-film-unavailable',hot,cold};
  const RfilmHot=1/hot.h_W_m2K,RfilmCold=1/cold.h_W_m2K,Rtotal_m2K_W=RfilmHot+Math.max(0,wallResistance_m2K_W)+Math.max(0,hotFoulingResistance_m2K_W)+Math.max(0,coldFoulingResistance_m2K_W)+RfilmCold,U_W_m2K=1/Rtotal_m2K_W,UA_W_K=U_W_m2K*heatTransferArea_m2;
  const hotCapacity_W_K=hotSide.mdot_kg_s*hot.properties.cp_J_kgK,coldCapacity_W_K=coldSide.mdot_kg_s*cold.properties.cp_J_kgK,hx=directHX({UA_W_K,hotCapacity_W_K,coldCapacity_W_K,hotIn_C,coldIn_C});
  return{available:true,heatTransferArea_m2,U_W_m2K,UA_W_K,Rtotal_m2K_W,resistances_m2K_W:{hotFilm:RfilmHot,wall:Math.max(0,wallResistance_m2K_W),hotFouling:Math.max(0,hotFoulingResistance_m2K_W),coldFouling:Math.max(0,coldFoulingResistance_m2K_W),coldFilm:RfilmCold},hot,cold,...hx};
}

function colebrookFriction(Re,rel){
  if(!(Re>0)||!(rel>=0)||rel>0.5)return NaN;
  const A=-2*Math.log10(rel/3.7+12/Re);
  const B=-2*Math.log10(rel/3.7+2.51*A/Re);
  const C=-2*Math.log10(rel/3.7+2.51*B/Re);
  let x=A-Math.pow(B-A,2)/(C-2*B+A);
  if(!Number.isFinite(x)||x<=0)x=A;
  for(let i=0;i<40;i++){
    const u=rel/3.7+2.51*x/Re,g=x+2*Math.log10(u),dg=1+(2/Math.LN10)*(2.51/Re)/u,step=g/dg;
    x-=step;if(Math.abs(step)<1e-13)break;
  }
  return 1/(x*x);
}
function frictionFactor(Re,rel){
  if(!(Re>0))return 0;
  if(!(rel>=0)||rel>0.5)return NaN;
  if(Re<2300)return 64/Re;
  const turb=colebrookFriction(Re,rel);
  if(Re>=4000)return turb;
  const t=(Re-2300)/(4000-2300);
  return (64/Re)*(1-t)+turb*t;
}
function pipeHydraulics({Vdot_m3_s,D_m,L_m,roughness_m=4.5e-5,K=0,rho_kg_m3=998,nu_m2_s=1.004e-6}){
  const q=Math.abs(Vdot_m3_s);if(!(D_m>0&&L_m>=0&&rho_kg_m3>0&&nu_m2_s>0))throw new Error('invalid hydraulic inputs');
  const A=Math.PI*D_m*D_m/4,v=q/A,Re=v*D_m/nu_m2_s,f=frictionFactor(Re,roughness_m/D_m);
  const head=(f*L_m/D_m+K)*v*v/(2*G),dp=rho_kg_m3*G*head;
  return{velocity_m_s:v,Re,frictionFactor:f,headLoss_m:head,dp_Pa:dp};
}
function hydronicFlowFromHeat(Q_W,deltaT_K,{rho_kg_m3=998,cp_J_kgK=4180}={}){
  if(!(deltaT_K>0))throw new Error('deltaT must be positive');
  const mdot=Math.abs(Q_W)/(cp_J_kgK*deltaT_K);return{mdot_kg_s:mdot,Vdot_m3_s:mdot/rho_kg_m3};
}

function pv(amount,year,r){return amount/Math.pow(1+r,year)}
function netPresentCost({analysisYears,discountRate,capex0=0,opexAnnual=0,otherAnnual=0,replacements=[],residualValue=0}){
  const N=Math.trunc(analysisYears),r=discountRate;if(!(N>=1&&r>-1))throw new Error('invalid economics');
  let npc=capex0;const annual=[];
  for(let y=1;y<=N;y++){
    const o=typeof opexAnnual==='function'?opexAnnual(y):opexAnnual;
    const x=typeof otherAnnual==='function'?otherAnnual(y):otherAnnual;
    const repl=replacements.filter(z=>z.year===y).reduce((s,z)=>s+z.cost,0),cash=o+x+repl,present=pv(cash,y,r);
    annual.push({year:y,opex:o,other:x,replacements:repl,cash,pv:present});npc+=present;
  }
  const residualPV=pv(residualValue,N,r);npc-=residualPV;return{npc,residualPV,annual};
}
function npvVsReference(candidateNPC,referenceNPC){return referenceNPC-candidateNPC}


/* ---------- expert/lazy defaults: order-of-magnitude CAPEX + envelope priors ---------- */
const EXPERT_DEFAULTS_VERSION='thermal-optimizer/expert-defaults/v0.1';
const EXPERT_DEFAULTS={
  schema:EXPERT_DEFAULTS_VERSION,
  basis:{currency:'EUR_2026_order_of_magnitude',region:'BE_NW_Europe',vatExcluded:true,confidence:'screening_only',
    note:'Engineering priors for lazy mode. Every value is editable; use quotations for investment decisions.'},
  componentCosts:{
    airWaterHeatPump:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:12000,midAtRef:115000,exponent:.82,rangeFactor:[.72,1.45],serviceLife_y:[15,22]},
    waterWaterHeatPump:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:15000,midAtRef:130000,exponent:.82,rangeFactor:[.72,1.45],serviceLife_y:[18,25]},
    airCooledChiller:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:8000,midAtRef:50000,exponent:.82,rangeFactor:[.65,1.55],serviceLife_y:[15,22]},
    condensingGasBoiler:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:5000,midAtRef:25000,exponent:.72,rangeFactor:[.65,1.55],serviceLife_y:[18,25]},
    plateHeatExchanger:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:2500,midAtRef:9000,exponent:.72,rangeFactor:[.60,1.70],serviceLife_y:[20,30]},
    dryCooler:{unit:'EUR',driver:'capacity_kW',ref:100,fixed:5000,midAtRef:25000,exponent:.80,rangeFactor:[.65,1.60],serviceLife_y:[15,22]}
  },
  hydronicPipeInstalled_EUR_m:{20:80,25:95,32:120,40:145,50:180,65:230,80:290,100:380,125:500,150:650},
  buriedSourcePair_EUR_route_m:{softGround:{32:250,50:320,80:430,100:520,150:760,200:980},pavedOrUrban:{32:700,50:900,80:1120,100:1300,150:1650,200:2050}},
  pipeSystemMultipliers:{twoPipe:1,fourPipe:1.65,changeoverTwoPipe:1.08},
  vrf:{twoPipe_EUR_m2:[80,120],heatRecovery_EUR_m2:[120,180],heatRecoveryPremium:[1.15,1.20],centralControlFixed_EUR:[2000,5000],serviceLife_y:[12,18]},
  controls:{
    onOff:{capexFractionMechanical:[.01,.03],comfortScore:2,noiseScore:2,partLoadEfficiencyScore:1,cyclingStressScore:1},
    staged:{capexFractionMechanical:[.02,.05],comfortScore:3,noiseScore:3,partLoadEfficiencyScore:2,cyclingStressScore:3},
    vfd:{capexFractionMechanical:[.04,.08],comfortScore:4,noiseScore:4,partLoadEfficiencyScore:4,cyclingStressScore:4,driveServiceLife_y:[10,15]},
    inverter:{capexFractionMechanical:[.08,.15],comfortScore:5,noiseScore:4,partLoadEfficiencyScore:5,cyclingStressScore:5,electronicsServiceLife_y:[10,16]},
    bmsSupervisory:{capexFractionMechanical:[.08,.15],comfortScore:5,partLoadEfficiencyScore:5,commissioningDependencyScore:5}
  },
  envelopePresets:{
    legacyUninsulated:{wall_U:1.5,roof_U:1.3,floor_U:1.0,effectiveACH:1.0,thermalBridgeFactor:1.15},
    earlyInsulated:{wall_U:.8,roof_U:.6,floor_U:.7,effectiveACH:.7,thermalBridgeFactor:1.12},
    improvedExisting:{wall_U:.45,roof_U:.35,floor_U:.45,effectiveACH:.5,thermalBridgeFactor:1.08},
    modernCode:{wall_U:.24,roof_U:.24,floor_U:.24,effectiveACH:.35,thermalBridgeFactor:1.05},
    highPerformance:{wall_U:.15,roof_U:.15,floor_U:.15,effectiveACH:.20,thermalBridgeFactor:1.03}
  },
  glazingPresets:{
    single:{window_U:5.5,gValue:.78},
    oldDouble:{window_U:2.8,gValue:.72},
    modernDoubleLowE:{window_U:1.4,gValue:.60},
    tripleLowE:{window_U:.8,gValue:.50}
  }
};
function powerLawInstalledCost(spec,x){if(!(x>0))return{mid:0,low:0,high:0};const variable=(spec.midAtRef-spec.fixed)*Math.pow(x/spec.ref,spec.exponent),mid=spec.fixed+variable;return{mid,low:mid*spec.rangeFactor[0],high:mid*spec.rangeFactor[1]};}
function estimateComponentCost(kind,capacity_kW,options={}){const spec=EXPERT_DEFAULTS.componentCosts[kind];if(!spec)throw new Error('unknown expert cost kind');const r=powerLawInstalledCost(spec,capacity_kW),complexity=options.complexityMultiplier??1;return{schema:EXPERT_DEFAULTS_VERSION,kind,capacity_kW,low:r.low*complexity,mid:r.mid*complexity,high:r.high*complexity,currency:'EUR',serviceLife_y:spec.serviceLife_y,basis:'expert-default'};}
function interpolateDN(table,DN){const xs=Object.keys(table).map(Number).sort((a,b)=>a-b);if(DN<=xs[0])return table[xs[0]];if(DN>=xs.at(-1))return table[xs.at(-1)];for(let i=1;i<xs.length;i++)if(DN<=xs[i]){const a=xs[i-1],b=xs[i],t=(DN-a)/(b-a);return table[a]+t*(table[b]-table[a]);}}
function estimateHydronicPipeCost({length_m,DN,system='twoPipe',buried=false,terrain='softGround'}){if(!(length_m>=0&&DN>0))throw new Error('invalid pipe cost input');let eur_m;if(buried){eur_m=interpolateDN(EXPERT_DEFAULTS.buriedSourcePair_EUR_route_m[terrain],DN);}else{eur_m=interpolateDN(EXPERT_DEFAULTS.hydronicPipeInstalled_EUR_m,DN)*(EXPERT_DEFAULTS.pipeSystemMultipliers[system]??1);}const mid=eur_m*length_m;return{schema:EXPERT_DEFAULTS_VERSION,length_m,DN,system,buried,terrain,EUR_per_m:eur_m,low:.7*mid,mid,high:1.5*mid,currency:'EUR'};}
function estimateVRFCost({floorArea_m2,heatRecovery=false,retrofit=false}){if(!(floorArea_m2>0))throw new Error('invalid VRF area');const q=heatRecovery?EXPERT_DEFAULTS.vrf.heatRecovery_EUR_m2:EXPERT_DEFAULTS.vrf.twoPipe_EUR_m2,m=retrofit?1.2:1;return{schema:EXPERT_DEFAULTS_VERSION,heatRecovery,floorArea_m2,low:q[0]*floorArea_m2*m,mid:(q[0]+q[1])/2*floorArea_m2*m,high:q[1]*floorArea_m2*m,currency:'EUR',tradeoffs:{acoustic:'indoor fan + refrigerant flow noise at terminals',comfort:'fast zone response; local air movement; heat-recovery VRF permits simultaneous heating/cooling',resource:'distributed compressors/electronics and many refrigerant joints; service access matters'}};}
function estimateControlsCost(mechanicalCapex,mode='onOff'){const s=EXPERT_DEFAULTS.controls[mode];if(!s)throw new Error('unknown control mode');const f=s.capexFractionMechanical,low=mechanicalCapex*f[0],high=mechanicalCapex*f[1];return{schema:EXPERT_DEFAULTS_VERSION,mode,low,mid:(low+high)/2,high,currency:'EUR',attributes:Object.fromEntries(Object.entries(s).filter(([k])=>!['capexFractionMechanical','driveServiceLife_y','electronicsServiceLife_y'].includes(k))),serviceLife_y:s.driveServiceLife_y??s.electronicsServiceLife_y??null};}
function envelopeGeometry({floorArea_m2,storeys=1,storeyHeight_m=3,aspectRatio=1.5,exposedWallFraction=1,glazingFraction=0.3,wallArea_m2=null,roofArea_m2=null,groundFloorArea_m2=null}){if(!(floorArea_m2>0&&storeys>0&&storeyHeight_m>0&&aspectRatio>0))throw new Error('invalid envelope geometry');const footprint=floorArea_m2/storeys,w=Math.sqrt(footprint*aspectRatio),l=footprint/w,wallGross=wallArea_m2??2*(w+l)*storeyHeight_m*storeys*exposedWallFraction,windows=wallGross*clamp(glazingFraction,0,.95);return{floorArea_m2,footprint_m2:footprint,wallGross_m2:wallGross,windowArea_m2:windows,opaqueWallArea_m2:wallGross-windows,roofArea_m2:roofArea_m2??footprint,groundFloorArea_m2:groundFloorArea_m2??footprint,conditionedVolume_m3:floorArea_m2*storeyHeight_m};}
function estimateEnvelopeHeatLoss(input={}){const ep=EXPERT_DEFAULTS.envelopePresets[input.envelopePreset??'earlyInsulated'],gp=EXPERT_DEFAULTS.glazingPresets[input.glazingPreset??'oldDouble'];if(!ep||!gp)throw new Error('unknown envelope/glazing preset');const g=envelopeGeometry(input),wall_U=input.wall_U??ep.wall_U,roof_U=input.roof_U??ep.roof_U,floor_U=input.floor_U??ep.floor_U,window_U=input.window_U??gp.window_U,ach=input.effectiveACH??ep.effectiveACH,tb=input.thermalBridgeFactor??ep.thermalBridgeFactor;const opaqueUA=(g.opaqueWallArea_m2*wall_U+g.roofArea_m2*roof_U+g.groundFloorArea_m2*floor_U)*tb,windowUA=g.windowArea_m2*window_U,vent_W_K=.33*ach*g.conditionedVolume_m3,total_W_K=opaqueUA+windowUA+vent_W_K;return{schema:'thermal-optimizer/envelope-screening/v0.1',geometry:g,U:{wall_U,roof_U,floor_U,window_U,gValue:input.gValue??gp.gValue},effectiveACH:ach,thermalBridgeFactor:tb,opaqueUA_W_K:opaqueUA,windowUA_W_K:windowUA,ventilationInfiltration_W_K:vent_W_K,totalHeatLoss_W_K:total_W_K,specificHeatLoss_W_m2K:total_W_K/g.floorArea_m2,designHeatLoss_W:input.designDeltaT_K!=null?total_W_K*input.designDeltaT_K:null,questions:['conditioned floor area + storeys/height (or known wall/roof/floor areas)','envelope insulation class','glazing fraction + glazing type','airtightness / ventilation heat-recovery class'],basis:'screening prior; replace with measured/U-value data where available'};}



/* ---------- v0.13 envelope-side options: humidification, automatic shading, PV ---------- */
const ENVELOPE_OPTION_DEFAULTS={
  humidification:{steamElectric:{installed_EUR_per_kg_h:[1800,4200],fixed_EUR:[2500,8000],electric_kWh_per_kg:[0.72,0.82],water_kg_per_kg:[1.0,1.15],serviceLife_y:[10,15]},adiabatic:{installed_EUR_per_kg_h:[2200,5200],fixed_EUR:[5000,15000],electric_kWh_per_kg:[0.02,0.10],water_kg_per_kg:[1.15,1.8],serviceLife_y:[10,15]}},
  automaticShading:{screen:{installed_EUR_m2:[200,500],solarGainMultiplierClosed:[0.18,0.40],serviceLife_y:[12,20]},externalVenetian:{installed_EUR_m2:[450,900],solarGainMultiplierClosed:[0.12,0.32],serviceLife_y:[15,20]}},
  pv:{rooftopCommercial:{installed_EUR_kWp:[750,1400],inverterReplacementFraction:[0.10,0.18],moduleDegradation_per_y:[0.003,0.007],serviceLife_y:[25,35],specificYield_kWh_kWp_y:[850,1100]}}
};
function humidificationRequirement({Tair_C=21,humidityRatio_kg_kgDA,targetRH_frac=.4,dryAirMass_kg,internalMoisture_kg_s=0,ventDryAir_kg_s=0,outdoorHumidityRatio_kg_kgDA=0,dt_s=3600}){if(!(dryAirMass_kg>0&&dt_s>0))throw new Error('invalid humidification state');const target=humidityRatioFromRH(Tair_C,targetRH_frac,101325),afterVent=humidityRatio_kg_kgDA+(internalMoisture_kg_s+ventDryAir_kg_s*(outdoorHumidityRatio_kg_kgDA-humidityRatio_kg_kgDA))*dt_s/dryAirMass_kg,add_kg=Math.max(0,(target-afterVent)*dryAirMass_kg);return{targetHumidityRatio_kg_kgDA:target,preHumidificationRatio_kg_kgDA:afterVent,waterToAir_kg:add_kg,rate_kg_h:add_kg*3600/dt_s};}
function humidifierPerformance(type,waterToAir_kg,options={}){const d=ENVELOPE_OPTION_DEFAULTS.humidification[type];if(!d)throw new Error('unknown humidifier type');const eSpec=options.electric_kWh_per_kg??(d.electric_kWh_per_kg[0]+d.electric_kWh_per_kg[1])/2,waterFactor=options.water_kg_per_kg??(d.water_kg_per_kg[0]+d.water_kg_per_kg[1])/2,electric_kWh=waterToAir_kg*eSpec,evaporativeHeat_J=type==='adiabatic'?waterToAir_kg*2440000:0;return{type,waterToAir_kg,makeupWater_kg:waterToAir_kg*waterFactor,electricity_J:electric_kWh*3.6e6,additionalHeating_J:evaporativeHeat_J};}
function estimateHumidifierCost(type,design_kg_h){const d=ENVELOPE_OPTION_DEFAULTS.humidification[type];if(!d||!(design_kg_h>=0))throw new Error('invalid humidifier cost');const lo=d.fixed_EUR[0]+d.installed_EUR_per_kg_h[0]*design_kg_h,hi=d.fixed_EUR[1]+d.installed_EUR_per_kg_h[1]*design_kg_h;return{type,design_kg_h,low:lo,mid:(lo+hi)/2,high:hi,currency:'EUR',serviceLife_y:d.serviceLife_y,basis:'screening prior'};}
function automaticShadingHour({solarGain_W,windowArea_m2,irradiance_W_m2=null,occupied=true,coolingCall=false,indoor_C=null,coolingSetpoint_C=null,type='externalVenetian',closedMultiplier=null,minIrradiance_W_m2=180}){const d=ENVELOPE_OPTION_DEFAULTS.automaticShading[type];if(!d)throw new Error('unknown shading type');const m=closedMultiplier??(d.solarGainMultiplierClosed[0]+d.solarGainMultiplierClosed[1])/2,trigger=coolingCall||(irradiance_W_m2!=null&&irradiance_W_m2>=minIrradiance_W_m2&&occupied&&indoor_C!=null&&coolingSetpoint_C!=null&&indoor_C>=coolingSetpoint_C-.5);return{active:!!trigger,solarGainBefore_W:Math.max(0,solarGain_W),solarGainAfter_W:Math.max(0,solarGain_W)*(trigger?m:1),avoidedSolarGain_W:Math.max(0,solarGain_W)*(trigger?(1-m):0),windowArea_m2};}
function estimateAutomaticShadingCost({type='externalVenetian',windowArea_m2}){const d=ENVELOPE_OPTION_DEFAULTS.automaticShading[type];if(!d||!(windowArea_m2>=0))throw new Error('invalid shading cost');const low=d.installed_EUR_m2[0]*windowArea_m2,high=d.installed_EUR_m2[1]*windowArea_m2;return{type,windowArea_m2,low,mid:(low+high)/2,high,currency:'EUR',serviceLife_y:d.serviceLife_y,basis:'screening prior'};}
function pvPowerFromIrradiance({capacity_kWp,poaIrradiance_W_m2,cellTemp_C=25,tempCoeff_per_K=-.0038,systemLossFraction=.14,inverterLimit_kW=null}){if(!(capacity_kWp>=0&&poaIrradiance_W_m2>=0))throw new Error('invalid PV input');const dc_kW=capacity_kWp*(poaIrradiance_W_m2/1000)*Math.max(0,1+tempCoeff_per_K*(cellTemp_C-25)),ac_kW=dc_kW*(1-clamp(systemLossFraction,0,.8));return Math.max(0,Math.min(ac_kW,inverterLimit_kW??Infinity))*1000;}
function dispatchPV({generation_W,load_W,exportAllowed=true}){const direct=Math.min(Math.max(0,generation_W),Math.max(0,load_W)),surplus=Math.max(0,generation_W-direct);return{generation_W,directUse_W:direct,export_W:exportAllowed?surplus:0,curtailed_W:exportAllowed?0:surplus,gridImport_W:Math.max(0,load_W-direct)};}
function estimatePVCost({capacity_kWp,type='rooftopCommercial'}){const d=ENVELOPE_OPTION_DEFAULTS.pv[type];if(!d||!(capacity_kWp>=0))throw new Error('invalid PV cost');const low=d.installed_EUR_kWp[0]*capacity_kWp,high=d.installed_EUR_kWp[1]*capacity_kWp;return{type,capacity_kWp,low,mid:(low+high)/2,high,currency:'EUR',serviceLife_y:d.serviceLife_y,inverterReplacementFraction:d.inverterReplacementFraction,moduleDegradation_per_y:d.moduleDegradation_per_y,specificYield_kWh_kWp_y:d.specificYield_kWh_kWp_y,basis:'screening prior'};}

/* ---------- working-fluid properties v0.29 ---------- */

const SOURCES = {
  EG: 'Dow DOWTHERM SR-1 Engineering and Operating Guide, SI Tables 11/15/19/23',
  PG: 'Dow DOWFROST HD Engineering and Operating Guide, SI Tables 12/16/20/24',
  NACL: 'ASHRAE Fundamentals 2025 Ch.31 Tables 2A/2B/2C; density/viscosity temperature grid: Laliberte 2009 correlation as published by ProcessConvert, generated 2026-06-07 and cross-checked to CRC at 20 wt% / 20 C',
  CACL2: 'CoolProp MCA incompressible fit, reference Melinder2010; mass fraction 0-30%, T -100..40 C; coefficients from committed MCA.json; legacy 20 C anchors cross-checked to ASHRAE Fundamentals 2025 Ch.31 Table 1A/1B',
  GLYCOL_BASIS: 'ASHRAE Fundamentals 2025 Ch.31 Tables 4/5; Dow Chemical 2024 inhibited glycol wt%↔vol% mapping',
  KFORMATE_HC30: 'NuGenTec NuTherm HC-30 product technical data, potassium-formate/water inhibited closed-system heat-transfer fluid',
  KFORMATE_HC50: 'NuGenTec NuTherm HC-50 product technical data, potassium-formate/water inhibited closed-system heat-transfer fluid',
  KACETATE_TYFOXIT: 'TYFOROP TYFOXIT 1.15-1.25 Technical Information, potassium-acetate/water inhibited secondary refrigerant, concentration/property tables',
  GLYCOL_HIGH_MASS: 'ASHRAE Fundamentals 2025 Ch.31 Tables 6-9 (inhibited EG) and Tables 10-13 (inhibited PG), Dow Chemical 2024; bounded 50-60 mass% screening extension'
};

function lerp(a,b,f){return a+(b-a)*f;}
function bracket(xs,x){
  if(x < xs[0] || x > xs[xs.length-1]) return null;
  for(let i=0;i<xs.length-1;i++) if(x>=xs[i] && x<=xs[i+1]) return [i,(x-xs[i])/(xs[i+1]-xs[i])];
  return [xs.length-2,1];
}
function bilerp(xs,ys,z,x,y){
  const bx=bracket(xs,x), by=bracket(ys,y); if(!bx||!by) return null;
  const [i,fx]=bx,[j,fy]=by;
  return lerp(lerp(z[j][i],z[j][i+1],fx),lerp(z[j+1][i],z[j+1][i+1],fx),fy);
}

// Temperatures °C, concentration vol%. Values are deliberately a compact supported subset.
const T=[0,20,40], C=[0,20,30,40,50];
const EG={
  rho:[[1019.9,1053.0,1068.0,1082.3,1095.9],[999.4,1030.9,1046.4,1060.9,1074.5],[989.0,1023.0,1037.9,1051.8,1064.9]],
  mu:[[2.08,4.15,5.83,8.09,12.05],[1.00,1.65,2.20,2.96,3.94],[0.65,1.06,1.34,1.77,2.26]],
  k:[[0.512,0.423,0.386,0.352,0.322],[0.599,0.492,0.445,0.404,0.367],[0.630,0.514,0.463,0.419,0.378]],
  cp:[[3.939,3.590,3.403,3.205,2.998],[4.147,3.816,3.647,3.460,3.282],[4.114,3.862,3.704,3.537,3.359]]
};
const PG={
  // 0% at 0°C is omitted in original product table extraction; use same water-side vendor anchor as EG for shared 0% carrier.
  rho:[[1019.9,1022.9,1037.4,1052.7,1067.8],[999.4,1013.2,1027.1,1041.9,1057.2],[989.0,1001.5,1014.8,1029.6,1044.9]],
  // Table 16 compact anchors decoded at 0/20/40°C for 20..50 vol%; 0% shared water-side anchors.
  mu:[[2.08,3.34,5.61,9.32,13.77],[1.00,1.74,2.57,3.75,5.36],[0.65,1.06,1.43,1.93,2.65]],
  k:[[0.572,0.494,0.436,0.380,0.331],[0.599,0.514,0.453,0.396,0.344],[0.630,0.528,0.466,0.408,0.355]],
  cp:[[4.229,3.964,3.800,3.584,3.324],[4.147,4.004,3.857,3.658,3.415],[4.114,4.044,3.914,3.732,3.505]]
};

// ASHRAE F25 Ch.31 / Dow 2024 mass-basis high-concentration screening extension.
// Only 50..60 mass% and 0..40 C are exposed here. This intentionally stops at the
// upper edge of the handbook's normal 25..60 vol% application guidance instead of
// granting normal-design status to the published 70..90 mass% columns.
const GLYCOL_HIGH_MASS_T=[0,20,40], GLYCOL_HIGH_MASS_C=[50,60];
const GLYCOL_HIGH_MASS={
  EG:{
    rho:[[1078.9,1094.7],[1071.3,1087.0],[1061.7,1077.3]],
    cp:[[3.18,2.85],[3.28,2.96],[3.36,3.06]],
    mu:[[7.5,10.9],[3.7,5.0],[2.2,2.7]],
    k:[[0.360,0.328],[0.375,0.340],[0.388,0.350]]
  },
  PG:{
    rho:[[1059.9,1066.3],[1048.0,1053.3],[1034.9,1039.4]],
    cp:[[3.39,3.12],[3.48,3.24],[3.57,3.35]],
    mu:[[18.2,31.3],[6.6,10.0],[3.1,4.3]],
    k:[[0.328,0.291],[0.342,0.302],[0.354,0.311]]
  }
};
function glycolHighMassProps(kind,temperature_C,concentration_mass_pct){
  const g=GLYCOL_HIGH_MASS[kind]; if(!g)return{available:false,reason:'unsupported-glycol'};
  const rho=bilerp(GLYCOL_HIGH_MASS_C,GLYCOL_HIGH_MASS_T,g.rho,concentration_mass_pct,temperature_C);
  const cp=bilerp(GLYCOL_HIGH_MASS_C,GLYCOL_HIGH_MASS_T,g.cp,concentration_mass_pct,temperature_C);
  const mu=bilerp(GLYCOL_HIGH_MASS_C,GLYCOL_HIGH_MASS_T,g.mu,concentration_mass_pct,temperature_C);
  const k=bilerp(GLYCOL_HIGH_MASS_C,GLYCOL_HIGH_MASS_T,g.k,concentration_mass_pct,temperature_C);
  if([rho,cp,mu,k].some(v=>v==null))return{available:false,reason:'outside-supported-high-mass-glycol-grid',supported:{temperature_C:[0,40],concentration_mass_pct:[50,60]}};
  return{available:true,family:'aqueous_glycol',glycolType:kind==='EG'?'ethylene':'propylene',temperature_C,concentration:concentration_mass_pct,concentrationBasis:'mass',rho_kg_m3:rho,cp_J_kgK:cp*1000,mu_Pa_s:mu/1000,k_W_mK:k,provenance:SOURCES.GLYCOL_HIGH_MASS,propertyModelId:'ashrae-f25-high-mass-v0.1',designGuidance:{normalConcentrationCeiling_vol_pct:60,source:'ASHRAE Fundamentals 2025 Ch.31 service considerations'}};
}



// Complete same-basis CaCl2 model from CoolProp MCA (Melinder2010).
const CACL2_MCA={
  Tbase_K:280.6757,xbase:0.187414,supported:{temperature_C:[-44,30],concentration_mass_pct:[9,29.4]},
  density:[[1171,984.7,338.9,1062,2785,-18110],[-.1463,-2.488,-23.02,62.91,642.3,0],[-.001302,-.0553,.3526,1.806,0,0],[-.0001871,.001665,.002788,0,0,0]],
  cp:[[3133,-4480,9511,14720,-134600,-667400],[2.81,3.271,-51.91,161.5,-975.4,0],[-.01563,-.1205,2.282,5.073,0,0],[-1.233e-5,.0009346,-.00929,0,0,0]],
  conductivity:[[.558,-.115,-.1784,-.4415,4.699,29.29],[.00146,-.001008,.003496,-.003462,.06179,0],[3.861e-7,-6.54e-6,-4.84e-5,.0003922,0,0],[1.307e-8,4.728e-8,-2.011e-6,0,0,0]],
  viscosity:[[-6.013855,4.389,9.121,1.963,29.97,343.5],[-.02647,.02102,.03993,-.4892,-3.631,0],[.0001718,-8.688e-5,.003785,1.526e-5,0,0],[-7.918e-7,-4.353e-6,-9.979e-5,0,0,0]],
  freeze:[256.94,-155.5,-549.6,-2624,-17260,-44940]
};
function centeredPoly2D(coeffs,T_K,x,Tbase_K,xbase){const dt=T_K-Tbase_K,dx=x-xbase;let out=0;for(let i=0;i<coeffs.length;i++)for(let j=0;j<coeffs[i].length;j++)out+=coeffs[i][j]*Math.pow(dt,i)*Math.pow(dx,j);return out;}
function centeredPoly1D(coeffs,x,xbase){let out=0,dx=x-xbase;for(let j=0;j<coeffs.length;j++)out+=coeffs[j]*Math.pow(dx,j);return out;}
function calciumChlorideMCAProps(temperature_C,concentration_mass_pct){
 const d=CACL2_MCA.supported;if(temperature_C<d.temperature_C[0]||temperature_C>d.temperature_C[1]||concentration_mass_pct<d.concentration_mass_pct[0]||concentration_mass_pct>d.concentration_mass_pct[1])return{available:false,reason:'outside-supported-CaCl2-Melinder-grid',supported:d,constraints:chlorideBrineConstraints('CaCl2')};
 const T_K=temperature_C+273.15,x=concentration_mass_pct/100,freeze_C=centeredPoly1D(CACL2_MCA.freeze,x,CACL2_MCA.xbase)-273.15,freezeMargin_K=temperature_C-freeze_C;
 if(freezeMargin_K<0)return{available:false,reason:'below-freezing-point-for-single-phase-liquid-model',freezingPoint_C:freeze_C,freezeMargin_K,supported:d,constraints:chlorideBrineConstraints('CaCl2')};
 const rho=centeredPoly2D(CACL2_MCA.density,T_K,x,CACL2_MCA.Tbase_K,CACL2_MCA.xbase),cp=centeredPoly2D(CACL2_MCA.cp,T_K,x,CACL2_MCA.Tbase_K,CACL2_MCA.xbase),k=centeredPoly2D(CACL2_MCA.conductivity,T_K,x,CACL2_MCA.Tbase_K,CACL2_MCA.xbase),mu=Math.exp(centeredPoly2D(CACL2_MCA.viscosity,T_K,x,CACL2_MCA.Tbase_K,CACL2_MCA.xbase));
 if(![rho,cp,k,mu].every(Number.isFinite)||rho<=0||cp<=0||k<=0||mu<=0)return{available:false,reason:'invalid-CaCl2-fit-state',supported:d};
 return{available:true,partial:false,family:'aqueous_brine',solute:'CaCl2',temperature_C,concentration:concentration_mass_pct,concentrationBasis:'mass',rho_kg_m3:rho,cp_J_kgK:cp,mu_Pa_s:mu,k_W_mK:k,freezingPoint_C:freeze_C,freezeMargin_K,liquidAboveFreezing:true,provenance:SOURCES.CACL2,propertyModelId:'coolprop-mca-melinder2010-v0.1',constraints:chlorideBrineConstraints('CaCl2')};
}

const NACL20=[
  [10,1070.7,1.20,-6.56,3.72],
  [15,1108.5,1.35,-10.89,3.56],
  [20,1147.8,1.56,-16.46,3.42],
  [22,1164.0,1.68,-19.18,3.38]
];

// NaCl full single-phase subgrid. rho/mu: Laliberte (2009) electrolyte correlation,
// committed ProcessConvert table generated 2026-06-07; cp/k/freezing: ASHRAE F25 Ch.31 Tables 2A/2B/2C.
// All concentration axes are mass %. The complete shared cp/k rectangle is 11..23.1 wt%, 0..20 C.
const NACL_RHOMU_T=[0,10,20], NACL_RHOMU_C=[2,4,6,8,10,12,14,16,18,20,22,24];
const NACL_RHO=[
 [1014.6,1029.7,1044.9,1060.3,1076.0,1091.8,1107.9,1124.1,1140.5,1157.2,1174.0,1190.9],
 [1014.1,1028.8,1043.6,1058.6,1073.9,1089.3,1104.9,1120.7,1136.7,1152.9,1169.2,1185.8],
 [1012.3,1026.6,1041.1,1055.8,1070.8,1085.8,1101.1,1116.6,1132.3,1148.1,1164.1,1180.3]
];
const NACL_MU=[
 [1.826,1.871,1.925,1.990,2.067,2.158,2.264,2.390,2.538,2.714,2.925,3.178],
 [1.339,1.376,1.421,1.473,1.533,1.603,1.683,1.776,1.885,2.013,2.164,2.343],
 [1.030,1.062,1.099,1.142,1.191,1.246,1.309,1.381,1.464,1.561,1.675,1.808]
];
const NACL_CPK_T=[0,10,20], NACL_CPK_C=[11,13.6,16.2,18.18,21.2,23.1];
const NACL_CP=[
 [3.676,3.588,3.513,3.442,3.375,3.324],
 [3.684,3.601,3.525,3.454,3.383,3.337],
 [3.697,3.609,3.534,3.462,3.395,3.345]
];
const NACL_K=[
 [0.556,0.554,0.552,0.550,0.547,0.544],
 [0.570,0.568,0.569,0.566,0.563,0.555],
 [0.593,0.593,0.573,0.581,0.579,0.565]
];
const NACL_FREEZE=[[11,-7.35],[12,-8.18],[13,-9.04],[14,-9.94],[15,-10.89],[16,-11.89],[17,-12.94],[18,-14.04],[19,-15.22],[20,-16.46],[22,-19.18]];
function interpPairs(rows,x){
  if(x<rows[0][0]||x>rows.at(-1)[0]) return null;
  for(let i=0;i<rows.length-1;i++) if(x>=rows[i][0]&&x<=rows[i+1][0]) return lerp(rows[i][1],rows[i+1][1],(x-rows[i][0])/(rows[i+1][0]-rows[i][0]));
  return rows.at(-1)[1];
}
function brineFreezingPoint_C(solute,concentration_wt_pct){
  if(solute==='NaCl') return interpPairs(NACL_FREEZE,concentration_wt_pct);
  const rows=solute==='CaCl2'?CACL220:null; return rows?interpRows(rows,concentration_wt_pct,3):null;
}
function assessFreezeMargin(fluidSpec,exposureTemperature_C,requiredMargin_K=0){
  if(!fluidSpec||!Number.isFinite(exposureTemperature_C)) return {available:false,reason:'missing-freeze-assessment-input'};
  let freeze=Number.isFinite(fluidSpec.freezingPoint_C)?fluidSpec.freezingPoint_C:Number.isFinite(fluidSpec.freezePoint_C)?fluidSpec.freezePoint_C:null;
  if(freeze==null&&fluidSpec.family==='water') freeze=0;
  if(freeze==null&&fluidSpec.family==='aqueous_brine'&&['potassium_formate','potassiumFormate'].includes(fluidSpec.solute)&&fluidSpec.productPreset&&KFORMATE_PRODUCTS[fluidSpec.productPreset]) freeze=KFORMATE_PRODUCTS[fluidSpec.productPreset].freezingPoint_C;
  if(freeze==null&&fluidSpec.family==='aqueous_brine'&&['potassium_acetate','potassiumAcetate'].includes(fluidSpec.solute)&&fluidSpec.productPreset&&KACETATE_PRODUCTS[fluidSpec.productPreset]) freeze=KACETATE_PRODUCTS[fluidSpec.productPreset].freezingPoint_C;
  if(freeze==null&&fluidSpec.family==='aqueous_brine'&&fluidSpec.concentrationBasis==='mass') freeze=brineFreezingPoint_C(fluidSpec.solute,fluidSpec.concentration);
  if(freeze==null&&Number.isFinite(fluidSpec.composition?.freezingPoint_C)) freeze=fluidSpec.composition.freezingPoint_C;
  if(freeze==null&&Number.isFinite(fluidSpec.selection?.freezingPoint_C)) freeze=fluidSpec.selection.freezingPoint_C;
  if(freeze==null&&fluidSpec.sourceFluidSpec&&Number.isFinite(fluidSpec.sourceFluidSpec.freezingPoint_C)) freeze=fluidSpec.sourceFluidSpec.freezingPoint_C;
  if(freeze==null) return {available:false,reason:'freezing-point-unavailable'};
  const margin_K=exposureTemperature_C-freeze;
  return {available:true,freezingPoint_C:freeze,exposureTemperature_C,margin_K,requiredMargin_K,meetsRequiredMargin:margin_K>=requiredMargin_K};
}
function chlorideBrineConstraints(solute){
  return {requiresCorrosionInhibitor:true,requiresProjectMaterialReview:true,chlorideBrineCorrosionRisk:true,
    inhibitorGuidance:solute==='NaCl'?'sodium-nitrite inhibitor historically about 4000 mg/kg; proprietary organic inhibitors also used':'sodium-nitrite inhibitor historically about 3000 mg/kg; proprietary organic inhibitors also used',
    provenance:'ASHRAE Fundamentals 2025 Ch.31 Corrosion Inhibition'};
}

// Formulation-specific inhibited potassium-formate fluids.
// Source tables publish the finished product formulation, not a generic concentration axis.
// Rows: [temperature_C, viscosity_mPa_s, conductivity_W_mK, cp_kJ_kgK, density_kg_m3].
// Property credit is deliberately bounded to the tabulated liquid range used by this screening model.
const KFORMATE_PRODUCTS={
  NuTherm_HC30:{
    solute:'potassium_formate',freezingPoint_C:-40,lowestOperating_C:-30,highestScreening_C:50,
    source:SOURCES.KFORMATE_HC30,
    rows:[
      [-30,7.00,.469,2.961,1300],[-20,5.50,.479,2.984,1295],[-10,4.50,.489,3.007,1290],
      [0,3.70,.499,3.031,1285],[10,3.00,.509,3.054,1280],[20,2.50,.519,3.077,1275],
      [30,2.20,.529,3.100,1270],[40,1.90,.539,3.123,1265],[50,1.60,.549,3.146,1260]
    ]
  },
  NuTherm_HC50:{
    solute:'potassium_formate',freezingPoint_C:-55,lowestOperating_C:-51,highestScreening_C:100,
    source:SOURCES.KFORMATE_HC50,
    rows:[
      [-50,38.40,.435,2.563,1378],[-40,20.40,.445,2.583,1373],[-30,12.50,.455,2.602,1367],
      [-20,8.40,.465,2.622,1362],[-10,5.99,.475,2.642,1356],[0,4.70,.485,2.661,1351],
      [10,3.80,.495,2.681,1345],[20,3.20,.505,2.701,1340],[30,2.70,.515,2.720,1334],
      [40,2.40,.525,2.740,1328],[50,2.10,.535,2.760,1323],[60,1.80,.545,2.780,1317],
      [70,1.60,.555,2.799,1312],[80,1.50,.565,2.819,1306],[90,1.30,.575,2.839,1301],
      [100,1.20,.585,2.858,1295]
    ]
  }
};
function potassiumFormateConstraints(productPreset){
  return {
    inhibitedProduct:true,closedSystemRequired:true,requiresProjectMaterialReview:true,
    incompatibleMetals:['zinc','zinc-plated','galvanized','magnesium'],
    aluminiumAndCastIronCondition:'manufacturer recommends closed airtight inert-gas-purged headspace',
    provenance:'NuGenTec NuTherm closed-system product material-compatibility guidance',
    productPreset
  };
}
function productTableProps(productPreset,temperature_C){
  const product=KFORMATE_PRODUCTS[productPreset];
  if(!product)return {available:false,reason:'unsupported-potassium-formate-product-preset'};
  const rows=product.rows;
  if(temperature_C<rows[0][0]||temperature_C>rows.at(-1)[0])
    return {available:false,reason:'outside-supported-product-property-grid',supportedTemperature_C:[rows[0][0],rows.at(-1)[0]],productPreset,constraints:potassiumFormateConstraints(productPreset)};
  let a=rows[0],b=rows[0],f=0;
  if(temperature_C>=rows.at(-1)[0]){a=rows.at(-1);b=a;}
  else for(let i=0;i<rows.length-1;i++)if(temperature_C>=rows[i][0]&&temperature_C<=rows[i+1][0]){a=rows[i];b=rows[i+1];f=(temperature_C-a[0])/(b[0]-a[0]);break;}
  const mu=lerp(a[1],b[1],f),k=lerp(a[2],b[2],f),cp=lerp(a[3],b[3],f),rho=lerp(a[4],b[4],f);
  const freezeMargin_K=temperature_C-product.freezingPoint_C;
  if(freezeMargin_K<0)return {available:false,reason:'below-freezing-point-for-single-phase-liquid-model',freezingPoint_C:product.freezingPoint_C,freezeMargin_K,productPreset,constraints:potassiumFormateConstraints(productPreset)};
  return {available:true,partial:false,family:'aqueous_brine',solute:'potassium_formate',productPreset,temperature_C,
    concentration:null,concentrationBasis:'product-formulation',rho_kg_m3:rho,cp_J_kgK:cp*1000,mu_Pa_s:mu/1000,k_W_mK:k,
    freezingPoint_C:product.freezingPoint_C,freezeMargin_K,liquidAboveFreezing:true,provenance:product.source,
    constraints:potassiumFormateConstraints(productPreset)};
}


// TYFOROP TYFOXIT potassium-acetate/water inhibited secondary refrigerant grades.
// The manufacturer publishes each dilution as a named density grade (Tx 1.15..1.24)
// with a volume-% mapping and tabulated rho/cp/k/dynamic viscosity. Rows use
// [temperature_C, viscosity_mPa_s, conductivity_W_mK, cp_kJ_kgK, density_kg_m3].
// Only the cells present in the manufacturer's table are credited.
const KACETATE_PRODUCTS={
  'TYFOXIT_1.15':{solute:'potassium_acetate',concentration_vol_pct:60,freezingPoint_C:-20,source:SOURCES.KACETATE_TYFOXIT,rows:[[-20,9.82,0.471,3.21,1166],[-10,6.36,0.478,3.23,1162],[0,4.22,0.485,3.25,1158],[10,3.17,0.492,3.27,1154],[20,2.42,0.499,3.3,1150],[30,1.85,0.506,3.32,1146],[40,1.6,0.513,3.34,1142]]},
  'TYFOXIT_1.16':{solute:'potassium_acetate',concentration_vol_pct:64,freezingPoint_C:-26,source:SOURCES.KACETATE_TYFOXIT,rows:[[-20,10.96,0.465,3.16,1176],[-10,6.91,0.472,3.19,1172],[0,4.69,0.479,3.21,1168],[10,3.38,0.486,3.23,1164],[20,2.57,0.493,3.25,1160],[30,2.03,0.5,3.27,1156],[40,1.67,0.507,3.3,1152]]},
  'TYFOXIT_1.17':{solute:'potassium_acetate',concentration_vol_pct:68,freezingPoint_C:-29,source:SOURCES.KACETATE_TYFOXIT,rows:[[-20,12.09,0.459,3.12,1186],[-10,7.51,0.466,3.14,1182],[0,5.06,0.473,3.16,1178],[10,3.64,0.48,3.19,1174],[20,2.75,0.487,3.21,1170],[30,2.17,0.494,3.23,1166],[40,1.75,0.501,3.25,1162]]},
  'TYFOXIT_1.18':{solute:'potassium_acetate',concentration_vol_pct:72,freezingPoint_C:-34,source:SOURCES.KACETATE_TYFOXIT,rows:[[-30,24.26,0.446,3.05,1200],[-20,13.23,0.453,3.08,1196],[-10,8.1,0.46,3.1,1192],[0,5.48,0.467,3.12,1188],[10,3.9,0.474,3.14,1184],[20,2.94,0.481,3.16,1180],[30,2.3,0.488,3.19,1176],[40,1.84,0.495,3.21,1172]]},
  'TYFOXIT_1.19':{solute:'potassium_acetate',concentration_vol_pct:76,freezingPoint_C:-37,source:SOURCES.KACETATE_TYFOXIT,rows:[[-30,26.9,0.44,3.01,1210],[-20,14.36,0.447,3.03,1206],[-10,8.7,0.454,3.05,1202],[0,5.8,0.461,3.08,1198],[10,4.15,0.468,3.1,1194],[20,3.13,0.475,3.12,1190],[30,2.43,0.482,3.14,1186],[40,1.92,0.489,3.16,1182]]},
  'TYFOXIT_1.20':{solute:'potassium_acetate',concentration_vol_pct:80,freezingPoint_C:-40,source:SOURCES.KACETATE_TYFOXIT,rows:[[-40,67.28,0.428,2.94,1224],[-30,29.19,0.435,2.96,1220],[-20,15.5,0.441,2.99,1216],[-10,9.24,0.448,3.01,1212],[0,6.26,0.455,3.03,1208],[10,4.41,0.461,3.05,1204],[20,3.39,0.468,3.08,1200],[30,2.45,0.474,3.1,1196],[40,2.05,0.481,3.12,1192]]},
  'TYFOXIT_1.21':{solute:'potassium_acetate',concentration_vol_pct:84,freezingPoint_C:-45,source:SOURCES.KACETATE_TYFOXIT,rows:[[-40,72.07,0.422,2.9,1234],[-30,32.76,0.428,2.93,1230],[-20,17.39,0.435,2.95,1226],[-10,10.43,0.442,2.97,1222],[0,6.87,0.449,3,1218],[10,4.85,0.455,3.02,1214],[20,3.6,0.462,3.04,1210],[30,2.76,0.469,3.07,1206],[40,2.15,0.476,3.09,1202]]},
  'TYFOXIT_1.22':{solute:'potassium_acetate',concentration_vol_pct:88,freezingPoint_C:-50,source:SOURCES.KACETATE_TYFOXIT,rows:[[-50,199.1,0.41,2.83,1246],[-40,77.35,0.416,2.86,1242],[-30,35.97,0.423,2.88,1240],[-20,19.28,0.429,2.91,1236],[-10,11.56,0.436,2.94,1232],[0,7.56,0.442,2.96,1228],[10,5.29,0.449,2.99,1224],[20,3.89,0.455,3.01,1220],[30,2.95,0.462,3.04,1216],[40,2.29,0.468,3.06,1212]]},
  'TYFOXIT_1.23':{solute:'potassium_acetate',concentration_vol_pct:92,freezingPoint_C:-52,source:SOURCES.KACETATE_TYFOXIT,rows:[[-50,204.9,0.404,2.79,1258],[-40,82.62,0.411,2.82,1254],[-30,39.19,0.417,2.84,1250],[-20,21.17,0.423,2.87,1246],[-10,12.69,0.429,2.9,1242],[0,8.26,0.436,2.93,1238],[10,5.73,0.442,2.95,1234],[20,4.17,0.448,2.98,1230],[30,3.15,0.454,3.01,1226],[40,2.43,0.461,3.03,1222]]},
  'TYFOXIT_1.24':{solute:'potassium_acetate',concentration_vol_pct:96,freezingPoint_C:-55,source:SOURCES.KACETATE_TYFOXIT,rows:[[-55,349.9,0.395,2.73,1270],[-50,215.4,0.398,2.74,1268],[-40,80.83,0.404,2.77,1264],[-30,45.06,0.411,2.8,1260],[-20,23.32,0.417,2.83,1256],[-10,13.55,0.423,2.86,1252],[0,9.05,0.429,2.9,1248],[10,6.12,0.435,2.92,1244],[20,4.53,0.442,2.95,1240],[30,3.23,0.448,2.98,1236],[40,2.61,0.455,3,1232]]}
};
function potassiumAcetateConstraints(productPreset){
  return {
    inhibitedProduct:true,minimumConcentration_vol_pct:60,closedCircuitRecommended:true,
    requiresProjectMaterialReview:true,doNotMixWith:['chloride-brines','glycol-water-mixtures','other-traditional-brines'],
    galvanizedInternalSurfacesProhibited:true,
    compatibleMetals:['steel','stainless-steel','cast-iron','brass','copper','red-brass','bronze','aluminium'],
    temperatureGuidance:'Tx 1.15-1.19 / mixed-material systems <=50 C; Tx 1.20-1.24 in stainless systems may allow short-term up to 80 C; manufacturer consultation required for application-specific elevated-temperature use',
    provenance:SOURCES.KACETATE_TYFOXIT,productPreset
  };
}
function potassiumAcetateProductProps(productPreset,temperature_C){
  const product=KACETATE_PRODUCTS[productPreset];
  if(!product)return {available:false,reason:'unsupported-potassium-acetate-product-preset'};
  const rows=product.rows;
  if(temperature_C<rows[0][0]||temperature_C>rows.at(-1)[0])
    return {available:false,reason:'outside-supported-product-property-grid',supportedTemperature_C:[rows[0][0],rows.at(-1)[0]],productPreset,constraints:potassiumAcetateConstraints(productPreset)};
  let a=rows[0],b=rows[0],f=0;
  if(temperature_C>=rows.at(-1)[0]){a=rows.at(-1);b=a;}
  else for(let i=0;i<rows.length-1;i++)if(temperature_C>=rows[i][0]&&temperature_C<=rows[i+1][0]){a=rows[i];b=rows[i+1];f=(temperature_C-a[0])/(b[0]-a[0]);break;}
  const mu=lerp(a[1],b[1],f),kk=lerp(a[2],b[2],f),cpv=lerp(a[3],b[3],f),rhov=lerp(a[4],b[4],f);
  const freezeMargin_K=temperature_C-product.freezingPoint_C;
  if(freezeMargin_K<0)return {available:false,reason:'below-freezing-point-for-single-phase-liquid-model',freezingPoint_C:product.freezingPoint_C,freezeMargin_K,productPreset,constraints:potassiumAcetateConstraints(productPreset)};
  return {available:true,partial:false,family:'aqueous_brine',solute:'potassium_acetate',productPreset,temperature_C,
    concentration:product.concentration_vol_pct,concentrationBasis:'volume',rho_kg_m3:rhov,cp_J_kgK:cpv*1000,mu_Pa_s:mu/1000,k_W_mK:kk,
    freezingPoint_C:product.freezingPoint_C,freezeMargin_K,liquidAboveFreezing:true,provenance:product.source,
    constraints:potassiumAcetateConstraints(productPreset)};
}

const CACL220=[
  [10,1083.5,1.32,-5.86,3.58],
  [15,1129.2,1.57,-11.01,3.35],
  [20,1177.5,1.93,-18.30,3.10],
  [22,1197.6,2.13,-21.70,3.03],
  [24,1218.0,2.36,-25.30,2.96],
  [26,1238.8,2.65,-29.70,2.89],
  [28,1260.0,3.01,-34.70,2.81]
];
function interpRows(rows,c,idx){
  if(c<rows[0][0]||c>rows.at(-1)[0]) return null;
  for(let i=0;i<rows.length-1;i++) if(c>=rows[i][0]&&c<=rows[i+1][0]) return lerp(rows[i][idx],rows[i+1][idx],(c-rows[i][0])/(rows[i+1][0]-rows[i][0]));
  return rows.at(-1)[idx];
}



// Formulation-specific concentration-basis mapping for inhibited aqueous glycol.
// These are paired weight% / volume% values from ASHRAE F25 Ch.31 Tables 4/5
// (source: Dow Chemical 2024). Do not replace with ideal additive-volume mixing.
const GLYCOL_BASIS_MAP = {
  EG: {
    mass_pct:   [0,5,10,15,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,65,70,75,80,85,90],
    volume_pct: [0,4.5,9.1,13.8,18.5,19.5,20.4,21.4,22.3,23.3,24.3,25.2,26.2,27.2,28.2,29.1,30.1,31.1,32.1,33.1,34.1,35.1,36.1,37.1,38.1,39.1,40.1,41.1,42.1,43.1,44.2,45.2,46.2,47.2,48.3,49.3,50.3,51.4,52.4,53.4,54.5,55.5,56.6,57.6,58.7,63.9,69.2,74.6,79.9,85.3,90.7]
  },
  PG: {
    mass_pct:   [0,5,10,15,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,65,70,75,80,85,90],
    volume_pct: [0,4.8,9.7,14.7,19.7,20.7,21.7,22.7,23.7,24.8,25.8,26.8,27.8,28.8,29.9,30.9,31.9,33.0,34.0,35.0,36.1,37.1,38.1,39.2,40.2,41.2,42.3,43.3,44.4,45.4,46.5,47.5,48.6,49.6,50.7,51.7,52.7,53.8,54.8,55.9,56.9,58.0,59.0,60.1,61.1,66.3,71.5,76.7,81.8,86.9,91.9]
  }
};

function interpPaired(xs,ys,x){
  const b=bracket(xs,x); if(!b) return null; const [i,f]=b; return lerp(ys[i],ys[i+1],f);
}
function convertGlycolConcentration(kind,value,fromBasis,toBasis){
  const map=GLYCOL_BASIS_MAP[kind];
  if(!map) return {available:false,reason:'unsupported-glycol'};
  const norm=b=>({mass:'mass',massPercent:'mass',weight:'mass',weightPercent:'mass',volume:'volume',volumePercent:'volume'}[b]||b);
  const from=norm(fromBasis), to=norm(toBasis);
  if(!['mass','volume'].includes(from)||!['mass','volume'].includes(to)) return {available:false,reason:'unsupported-concentration-basis'};
  if(from===to) return {available:true,value,fromBasis:from,toBasis:to,provenance:SOURCES.GLYCOL_BASIS};
  const xs=from==='mass'?map.mass_pct:map.volume_pct;
  const ys=to==='mass'?map.mass_pct:map.volume_pct;
  const out=interpPaired(xs,ys,value);
  if(out==null) return {available:false,reason:'outside-supported-conversion-grid',supported:{mass_pct:[map.mass_pct[0],map.mass_pct.at(-1)],volume_pct:[map.volume_pct[0],map.volume_pct.at(-1)]}};
  return {available:true,value:out,fromBasis:from,toBasis:to,provenance:SOURCES.GLYCOL_BASIS,formulationSpecific:true};
}

function normalizeGlycolFluidSpec(fluidSpec){
  if(!fluidSpec) return null;
  // Native property-layer shape.
  if(fluidSpec.family==='aqueous_glycol') return fluidSpec;
  // Fluid-selection v0.1 shape.
  if(fluidSpec.family==='ethyleneGlycol'||fluidSpec.family==='propyleneGlycol'){
    const c=fluidSpec.composition&&fluidSpec.composition.concentration;
    return {
      family:'aqueous_glycol', phase:fluidSpec.phase||'liquid',
      glycolType:fluidSpec.family==='ethyleneGlycol'?'ethylene':'propylene',
      concentration:c?c.value:fluidSpec.concentration,
      concentrationBasis:c?(c.basis==='massPercent'?'mass':c.basis==='volumePercent'?'volume':c.basis):fluidSpec.concentrationBasis,
      inhibited:fluidSpec.inhibited!==false, grade:fluidSpec.grade,
      sourceFluidSpec:fluidSpec
    };
  }
  return fluidSpec;
}

function glycolProps(kind,temperature_C,concentration_vol_pct){
  const g=kind==='EG'?EG:kind==='PG'?PG:null; if(!g) return {available:false,reason:'unsupported-glycol'};
  const rho=bilerp(C,T,g.rho,concentration_vol_pct,temperature_C);
  const mu_mPa_s=bilerp(C,T,g.mu,concentration_vol_pct,temperature_C);
  const k=bilerp(C,T,g.k,concentration_vol_pct,temperature_C);
  const cp_kJ=bilerp(C,T,g.cp,concentration_vol_pct,temperature_C);
  if([rho,mu_mPa_s,k,cp_kJ].some(v=>v==null)) return {available:false,reason:'outside-supported-grid',supported:{temperature_C:[0,40],concentration_vol_pct:[0,50]}};
  return {available:true,family:'aqueous_glycol',glycolType:kind==='EG'?'ethylene':'propylene',temperature_C,concentration:concentration_vol_pct,concentrationBasis:'volume',rho_kg_m3:rho,cp_J_kgK:cp_kJ*1000,mu_Pa_s:mu_mPa_s/1000,k_W_mK:k,provenance:SOURCES[kind]};
}
function brineProps(solute,temperature_C,concentration_wt_pct){
  if(solute==='NaCl'){
    const rho=bilerp(NACL_RHOMU_C,NACL_RHOMU_T,NACL_RHO,concentration_wt_pct,temperature_C);
    const mu=bilerp(NACL_RHOMU_C,NACL_RHOMU_T,NACL_MU,concentration_wt_pct,temperature_C);
    const cp=bilerp(NACL_CPK_C,NACL_CPK_T,NACL_CP,concentration_wt_pct,temperature_C);
    const k=bilerp(NACL_CPK_C,NACL_CPK_T,NACL_K,concentration_wt_pct,temperature_C);
    const freeze=brineFreezingPoint_C('NaCl',concentration_wt_pct);
    if([rho,mu,cp,k,freeze].some(v=>v==null)) return {available:false,reason:'outside-supported-NaCl-complete-grid',supported:{temperature_C:[0,20],concentration_wt_pct:[11,22]}};
    const freezeMargin_K=temperature_C-freeze;
    if(freezeMargin_K<0) return {available:false,reason:'below-freezing-point-for-single-phase-liquid-model',freezingPoint_C:freeze,freezeMargin_K,supported:{temperature_C:[0,20],concentration_wt_pct:[11,22]},constraints:chlorideBrineConstraints(solute)};
    return {available:true,partial:false,family:'aqueous_brine',solute,temperature_C,concentration:concentration_wt_pct,concentrationBasis:'mass',rho_kg_m3:rho,cp_J_kgK:cp*1000,mu_Pa_s:mu/1000,k_W_mK:k,freezingPoint_C:freeze,freezeMargin_K,liquidAboveFreezing:true,provenance:SOURCES.NACL,constraints:chlorideBrineConstraints(solute)};
  }
  if(solute==='CaCl2') return calciumChlorideMCAProps(temperature_C,concentration_wt_pct);
  return {available:false,reason:'unsupported-brine'};
}
function resolveFluidProperties(fluidSpec,T_C){
  if(!fluidSpec) return {available:false,reason:'missing-fluid-spec'};
  fluidSpec=normalizeGlycolFluidSpec(fluidSpec);
  if(fluidSpec.family==='water'){
    const wt=[0,20,40], rho=[999.84,998.21,992.22], cp=[4217.6,4182.0,4179.6], mu=[1.792e-3,1.002e-3,0.653e-3], k=[0.561,0.598,0.628];
    const b=bracket(wt,T_C); if(!b) return {available:false,reason:'outside-supported-water-grid',supportedTemperature_C:[0,40]}; const [i,f]=b;
    return {available:true,family:'water',temperature_C:T_C,rho_kg_m3:lerp(rho[i],rho[i+1],f),cp_J_kgK:lerp(cp[i],cp[i+1],f),mu_Pa_s:lerp(mu[i],mu[i+1],f),k_W_mK:lerp(k[i],k[i+1],f),provenance:'NIST/IAPWS liquid-water near-atmospheric reference correlation anchors'};
  }
  if(fluidSpec.family==='aqueous_glycol'){
    const kind=fluidSpec.glycolType==='ethylene'?'EG':fluidSpec.glycolType==='propylene'?'PG':null;
    if(!kind) return {available:false,reason:'unsupported-glycol'};
    // Prefer the same-basis ASHRAE high-concentration model when mass concentration is in its supported 50..60% domain.
    if(fluidSpec.concentrationBasis==='mass' && fluidSpec.concentration>=50 && fluidSpec.concentration<=60){
      const p=glycolHighMassProps(kind,T_C,fluidSpec.concentration);
      if(p.available){p.inputConcentration={value:fluidSpec.concentration,basis:'mass'};p.propertyGridConcentration={value:fluidSpec.concentration,basis:'mass'};}
      return p;
    }
    let vol=fluidSpec.concentration;
    let conversion=null;
    if(fluidSpec.concentrationBasis!=='volume'){
      conversion=convertGlycolConcentration(kind,fluidSpec.concentration,fluidSpec.concentrationBasis,'volume');
      if(!conversion.available) return {available:false,reason:'concentration-basis-conversion-unavailable',conversion};
      vol=conversion.value;
    }
    let p=glycolProps(kind,T_C,vol);
    if(!p.available && fluidSpec.concentrationBasis==='volume'){
      const toMass=convertGlycolConcentration(kind,fluidSpec.concentration,'volume','mass');
      if(toMass.available && toMass.value>=50 && toMass.value<=60){p=glycolHighMassProps(kind,T_C,toMass.value); if(p.available)p.concentrationConversion=toMass;}
    }
    if(p.available){
      p.inputConcentration={value:fluidSpec.concentration,basis:fluidSpec.concentrationBasis};
      if(!p.propertyGridConcentration)p.propertyGridConcentration={value:p.concentration,basis:p.concentrationBasis};
      if(conversion) p.concentrationConversion=conversion;
    }
    return p;
  }
  if(fluidSpec.family==='aqueous_brine'){
    if(['potassium_formate','potassiumFormate'].includes(fluidSpec.solute)){
      if(!fluidSpec.productPreset)return {available:false,reason:'potassium-formate-requires-supported-product-preset'};
      return productTableProps(fluidSpec.productPreset,T_C);
    }
    if(['potassium_acetate','potassiumAcetate'].includes(fluidSpec.solute)){
      if(!fluidSpec.productPreset)return {available:false,reason:'potassium-acetate-requires-supported-product-preset'};
      return potassiumAcetateProductProps(fluidSpec.productPreset,T_C);
    }
    if(fluidSpec.concentrationBasis!=='mass') return {available:false,reason:'brine-grid-requires-mass-basis'};
    return brineProps(fluidSpec.solute,T_C,fluidSpec.concentration);
  }
  return {available:false,reason:'unsupported-fluid-family'};
}



/* ---------- v0.38 two-phase / p-h state interfaces ---------- */


const PHASES = new Set(['liquid','vapor','two_phase','supercritical','unknown']);
const PHASE_PROPERTY_PROVIDER_CONTRACT = Object.freeze({
  schema:'thermal-optimizer/phase-property-provider/v0.1',
  requiredRequestFields:['fluidId','inputPair'],
  supportedInputPairs:['PT','PH','PQ','TQ'],
  requiredResolvedFields:['fluidId','pressure_Pa','enthalpy_J_kg','phase'],
  optionalResolvedFields:['temperature_C','entropy_J_kgK','density_kg_m3','quality'],
  note:'Two independent intensive properties must define the state. Enthalpy differences, not absolute enthalpy reference values, drive energy balances.'
});

function finiteNumber(v){ return Number.isFinite(+v) ? +v : null; }

function normalizeThermoState(state={}, defaults={}){
  const family=state.family??defaults.family??null;
  const fluidId=state.fluidId??state.refrigerantId??defaults.fluidId??defaults.refrigerantId??null;
  const pressure_Pa=finiteNumber(state.pressure_Pa??state.p_Pa);
  const enthalpy_J_kg=finiteNumber(state.enthalpy_J_kg??state.h_J_kg);
  const temperature_C=finiteNumber(state.temperature_C??state.T_C);
  const entropy_J_kgK=finiteNumber(state.entropy_J_kgK??state.s_J_kgK);
  const density_kg_m3=finiteNumber(state.density_kg_m3??state.rho_kg_m3);
  const quality=state.quality==null?null:finiteNumber(state.quality);
  const phase=state.phase??'unknown';
  const propertyModelId=state.propertyModelId??state.propertySource??defaults.propertyModelId??null;
  const issues=[];
  if(!family)issues.push('missing-family');
  if(!fluidId)issues.push('missing-fluid-id');
  if(!(pressure_Pa>0))issues.push('invalid-pressure');
  if(enthalpy_J_kg==null)issues.push('missing-enthalpy');
  if(!PHASES.has(phase))issues.push('invalid-phase');
  if(quality!=null && !(quality>=0&&quality<=1))issues.push('invalid-quality');
  if(quality!=null && !['two_phase','liquid','vapor'].includes(phase))issues.push('quality-phase-inconsistent');
  return {available:issues.length===0,issues,family,fluidId,pressure_Pa,enthalpy_J_kg,temperature_C,entropy_J_kgK,density_kg_m3,quality,phase,propertyModelId};
}

function sameThermoFluid(a,b){
  return !!a?.available&&!!b?.available&&a.family===b.family&&a.fluidId===b.fluidId;
}

function steamCondensateExchange(spec={}){
  const inlet=normalizeThermoState(spec.inletState,{family:'water_steam',fluidId:'Water'});
  const outlet=normalizeThermoState(spec.outletState,{family:'water_steam',fluidId:'Water'});
  const mdot_kg_s=finiteNumber(spec.mdot_kg_s);
  const issues=[...inlet.issues.map(x=>'inlet:'+x),...outlet.issues.map(x=>'outlet:'+x)];
  if(!sameThermoFluid(inlet,outlet))issues.push('fluid-identity-mismatch');
  if(!(mdot_kg_s>0))issues.push('invalid-mass-flow');
  if(inlet.family!=='water_steam'||inlet.fluidId!=='Water')issues.push('steam-interface-requires-water');
  const requireCondensing=spec.requireCondensing!==false;
  if(requireCondensing){
    if(!['vapor','two_phase'].includes(inlet.phase))issues.push('inlet-not-steam-or-two-phase');
    if(outlet.phase!=='liquid')issues.push('outlet-not-liquid-condensate');
  }
  const deltaH_J_kg=(inlet.enthalpy_J_kg??NaN)-(outlet.enthalpy_J_kg??NaN);
  if(!(deltaH_J_kg>0))issues.push('non-positive-enthalpy-drop');
  const pressureDrop_Pa=(inlet.pressure_Pa??NaN)-(outlet.pressure_Pa??NaN);
  if(Number.isFinite(pressureDrop_Pa)&&pressureDrop_Pa<0&&!spec.allowPressureRise)issues.push('outlet-pressure-above-inlet');
  const heatReleased_W=mdot_kg_s>0&&Number.isFinite(deltaH_J_kg)?mdot_kg_s*deltaH_J_kg:null;
  return {available:issues.length===0,issues,kind:'steamCondensate',inlet,outlet,mdot_kg_s,deltaH_J_kg,heatReleased_W,pressureDrop_Pa,propertyModelIds:[inlet.propertyModelId,outlet.propertyModelId].filter(Boolean)};
}

function vaporCompressionPHCycle(spec={}){
  const refrigerantId=spec.refrigerantId??spec.fluidId??null;
  const base={family:'refrigerant',fluidId:refrigerantId};
  const s1=normalizeThermoState(spec.state1??spec.evaporatorOutlet??{},base);
  const s2=normalizeThermoState(spec.state2??spec.compressorOutlet??{},base);
  const s3=normalizeThermoState(spec.state3??spec.condenserOutlet??{},base);
  const s4=normalizeThermoState(spec.state4??spec.expansionOutlet??{},base);
  const states=[s1,s2,s3,s4],issues=[];
  states.forEach((s,i)=>issues.push(...s.issues.map(x=>`state${i+1}:${x}`)));
  if(!refrigerantId)issues.push('missing-refrigerant-id');
  if(states.some(s=>s.family!=='refrigerant'||s.fluidId!==refrigerantId))issues.push('refrigerant-identity-mismatch');
  const mdot_kg_s=finiteNumber(spec.mdot_kg_s); if(!(mdot_kg_s>0))issues.push('invalid-mass-flow');
  const pLow=(s1.pressure_Pa+s4.pressure_Pa)/2,pHigh=(s2.pressure_Pa+s3.pressure_Pa)/2;
  const pressureToleranceFrac=Math.max(0,finiteNumber(spec.pressureToleranceFrac)??0.03);
  if(Number.isFinite(pLow)&&Number.isFinite(pHigh)&&!(pHigh>pLow))issues.push('high-side-pressure-not-above-low-side');
  if(Number.isFinite(s1.pressure_Pa)&&Number.isFinite(s4.pressure_Pa)&&Math.abs(s1.pressure_Pa-s4.pressure_Pa)>pressureToleranceFrac*Math.max(s1.pressure_Pa,s4.pressure_Pa))issues.push('low-side-pressure-mismatch');
  if(Number.isFinite(s2.pressure_Pa)&&Number.isFinite(s3.pressure_Pa)&&Math.abs(s2.pressure_Pa-s3.pressure_Pa)>pressureToleranceFrac*Math.max(s2.pressure_Pa,s3.pressure_Pa))issues.push('high-side-pressure-mismatch');
  const h1=s1.enthalpy_J_kg,h2=s2.enthalpy_J_kg,h3=s3.enthalpy_J_kg,h4=s4.enthalpy_J_kg;
  const compressorSpecificWork_J_kg=h2-h1, evaporatorSpecific_J_kg=h1-h4, condenserSpecific_J_kg=h2-h3, throttleDeltaH_J_kg=h4-h3;
  if(!(compressorSpecificWork_J_kg>0))issues.push('compressor-enthalpy-rise-not-positive');
  if(!(evaporatorSpecific_J_kg>0))issues.push('evaporator-enthalpy-rise-not-positive');
  if(!(condenserSpecific_J_kg>0))issues.push('condenser-enthalpy-drop-not-positive');
  const throttleTolerance_J_kg=Math.max(0,finiteNumber(spec.throttleTolerance_J_kg)??2000);
  if(Math.abs(throttleDeltaH_J_kg)>throttleTolerance_J_kg)issues.push('expansion-not-near-isenthalpic');
  const compressor_W=mdot_kg_s>0?mdot_kg_s*compressorSpecificWork_J_kg:null;
  const evaporator_W=mdot_kg_s>0?mdot_kg_s*evaporatorSpecific_J_kg:null;
  const condenser_W=mdot_kg_s>0?mdot_kg_s*condenserSpecific_J_kg:null;
  const energyClosure_W=(condenser_W??NaN)-(evaporator_W??NaN)-(compressor_W??NaN);
  const copCooling=compressor_W>0?evaporator_W/compressor_W:null,copHeating=compressor_W>0?condenser_W/compressor_W:null;
  return {available:issues.length===0,issues,kind:'vaporCompressionPH',refrigerantId,mdot_kg_s,states:{state1:s1,state2:s2,state3:s3,state4:s4},pLow_Pa:pLow,pHigh_Pa:pHigh,compressorSpecificWork_J_kg,evaporatorSpecific_J_kg,condenserSpecific_J_kg,throttleDeltaH_J_kg,compressor_W,evaporator_W,condenser_W,energyClosure_W,copCooling,copHeating};
}

function evaluatePhaseInterfaces(spec={}){
  const steam=(Array.isArray(spec.steamCondensing)?spec.steamCondensing:[]).map(steamCondensateExchange);
  const refrigerant=(Array.isArray(spec.refrigerantCycles)?spec.refrigerantCycles:[]).map(vaporCompressionPHCycle);
  const issues=[];
  steam.forEach((r,i)=>{if(!r.available)issues.push({kind:'steamCondensing',index:i,issues:r.issues});});
  refrigerant.forEach((r,i)=>{if(!r.available)issues.push({kind:'refrigerantCycle',index:i,issues:r.issues});});
  return {schema:'thermal-optimizer/phase-interfaces/v0.1',available:issues.length===0,issues,steamCondensing:steam,refrigerantCycles:refrigerant};
}

function phaseProviderResolve(provider,request){if(!provider||typeof provider.resolve!=='function')throw new Error('phase property provider with resolve(request) is required');const st=provider.resolve(request);if(!st||!Number.isFinite(st.pressure_Pa)||!Number.isFinite(st.enthalpy_J_kg))throw new Error('phase provider returned incomplete state');return st;}
function stateRequestingVaporCompression(provider,spec={}){
  const refrigerantId=String(spec.refrigerantId||'');if(!refrigerantId)throw new Error('refrigerantId required');const eta=finiteNumber(spec.compressorIsentropicEfficiency??0.75);if(!(eta>0&&eta<=1))throw new Error('compressorIsentropicEfficiency must be in (0,1]');
  let pLow=Number.isFinite(+spec.lowPressure_Pa)?+spec.lowPressure_Pa:null,pHigh=Number.isFinite(+spec.highPressure_Pa)?+spec.highPressure_Pa:null;
  if(pLow==null){const T=+spec.evaporatingTemperature_K;if(!(T>0))throw new Error('lowPressure_Pa or evaporatingTemperature_K required');pLow=phaseProviderResolve(provider,{refrigerantId,pair:'TQ',temperature_K:T,quality:1}).pressure_Pa;}
  if(pHigh==null){const T=+spec.condensingTemperature_K;if(!(T>0))throw new Error('highPressure_Pa or condensingTemperature_K required');pHigh=phaseProviderResolve(provider,{refrigerantId,pair:'TQ',temperature_K:T,quality:0}).pressure_Pa;}
  if(!(pLow>0&&pHigh>pLow))throw new Error('invalid refrigerant pressure levels');
  const satV=phaseProviderResolve(provider,{refrigerantId,pair:'PQ',pressure_Pa:pLow,quality:1}),sh=Math.max(0,+spec.superheat_K||0),state1=sh>0?phaseProviderResolve(provider,{refrigerantId,pair:'PT',pressure_Pa:pLow,temperature_K:satV.temperature_K+sh}):satV;
  if(!Number.isFinite(state1.entropy_J_kgK))throw new Error('suction entropy required');if(typeof provider.isentropicDischarge!=='function')throw new Error('refrigerant provider lacks internal isentropicDischarge');
  const comp=provider.isentropicDischarge({suctionState:state1,dischargePressure_Pa:pHigh,isentropeEfficiency:eta}),state2=comp.actualState;
  const satL=phaseProviderResolve(provider,{refrigerantId,pair:'PQ',pressure_Pa:pHigh,quality:0}),sc=Math.max(0,+spec.subcooling_K||0),state3=sc>0?phaseProviderResolve(provider,{refrigerantId,pair:'PT',pressure_Pa:pHigh,temperature_K:satL.temperature_K-sc}):satL,state4=phaseProviderResolve(provider,{refrigerantId,pair:'PH',pressure_Pa:pLow,enthalpy_J_kg:state3.enthalpy_J_kg});
  const w=state2.enthalpy_J_kg-state1.enthalpy_J_kg,qe=state1.enthalpy_J_kg-state4.enthalpy_J_kg,qc=state2.enthalpy_J_kg-state3.enthalpy_J_kg;if(!(w>0&&qe>0&&qc>0))throw new Error('non-physical vapor-compression enthalpy ordering');
  const mode=spec.mode==='heating'?'heating':'cooling',requested=Math.max(0,+spec.requestedDuty_W||0),mdot=spec.mdot_kg_s>0?+spec.mdot_kg_s:(requested>0?requested/(mode==='heating'?qc:qe):null);
  return{available:true,kind:'stateRequestingVaporCompression',refrigerantId,mode,pLow_Pa:pLow,pHigh_Pa:pHigh,states:{state1,state2s:comp.isentropicState,state2,state3,state4},compressorIsentropicEfficiency:eta,specific:{compressor_J_kg:w,evaporator_J_kg:qe,condenser_J_kg:qc,energyClosure_J_kg:qc-qe-w},copCooling:qe/w,copHeating:qc/w,mdot_kg_s:mdot,compressor_W:mdot==null?null:mdot*w,evaporator_W:mdot==null?null:mdot*qe,condenser_W:mdot==null?null:mdot*qc,requestedDuty_W:requested||null,condensingSaturationTemperature_K:satL.temperature_K,providerProvenance:state1.provenance??null};
}
function steamControlCondensing(provider,spec={}){
  const pSupply=+spec.supplyPressure_Pa,pCond=+(spec.condensingPressure_Pa??pSupply);if(!(pSupply>0&&pCond>0&&pCond<=pSupply))throw new Error('invalid steam pressure levels');const q=spec.supplyQuality==null?1:+spec.supplyQuality;if(!(q>=0&&q<=1))throw new Error('supplyQuality must be in [0,1]');
  let source=phaseProviderResolve(provider,{pair:'PQ',pressure_Pa:pSupply,quality:q});const superheat=Math.max(0,+spec.supplySuperheat_K||0);if(superheat>0){const sv=phaseProviderResolve(provider,{pair:'PQ',pressure_Pa:pSupply,quality:1});source=phaseProviderResolve(provider,{pair:'PT',pressure_Pa:pSupply,temperature_K:sv.temperature_K+superheat});}
  const valveOutlet=pCond===pSupply?source:phaseProviderResolve(provider,{pair:'PH',pressure_Pa:pCond,enthalpy_J_kg:source.enthalpy_J_kg}),satL=phaseProviderResolve(provider,{pair:'PQ',pressure_Pa:pCond,quality:0}),subcool=Math.max(0,+spec.condensateSubcooling_K||0),condensate=subcool>0?phaseProviderResolve(provider,{pair:'PT',pressure_Pa:pCond,temperature_K:satL.temperature_K-subcool}):satL,dh=valveOutlet.enthalpy_J_kg-condensate.enthalpy_J_kg;if(!(dh>0))throw new Error('non-positive steam enthalpy drop');const requested=Math.max(0,+spec.requestedDuty_W||0),mdot=spec.mdot_kg_s>0?+spec.mdot_kg_s:(requested>0?requested/dh:null);
  return{available:true,kind:'steamControlCondensing',states:{source,valveOutlet,condensate},supplyPressure_Pa:pSupply,condensingPressure_Pa:pCond,valvePressureDrop_Pa:pSupply-pCond,valveIsenthalpicError_J_kg:valveOutlet.enthalpy_J_kg-source.enthalpy_J_kg,specificHeatReleased_J_kg:dh,mdot_kg_s:mdot,requestedDuty_W:requested||null,heatReleased_W:mdot==null?null:mdot*dh,providerProvenance:source.provenance??null};
}
function dynamicPhaseLoadProfile(project,ref,n){if(Array.isArray(ref)||ArrayBuffer.isView(ref)){if(ref.length!==n)throw new Error('dynamic phase load profile length mismatch');return ref;}if(typeof ref==='string'){const a=project?.profiles?.[ref];if(!a||a.length!==n)throw new Error('missing dynamic phase load profile: '+ref);return a;}if(Number.isFinite(+ref))return new Float64Array(n).fill(+ref);throw new Error('dynamic phase load profile required');}
function evaluateDynamicPhaseComponentsAnnual(project,spec={},providers={}){
  const n=project?.profiles?.outdoor_C?.length??0;if(!(n>0))throw new Error('annual profile length unavailable');const hourlyCompressor_W=new Float64Array(n),hourlySteamMassFlow_kg_s=new Float64Array(n),hourlyByComponent={refrigeration:{},steamCondensing:{}},refrigeration=[],steamCondensing=[];let compressorElectricity_J=0,steamHeat_J=0,steamMass_kg=0,steamUtilityCost=0;
  for(const c of(Array.isArray(spec.refrigeration)?spec.refrigeration:[])){if(!providers.refrigerant)throw new Error('refrigerant phase provider unavailable');const load=dynamicPhaseLoadProfile(project,c.loadProfileRef??c.requestedDuty_W,n),rep=[],componentCompressor_W=new Float64Array(n),componentEvaporator_W=new Float64Array(n),componentCondenser_W=new Float64Array(n),componentCondensingSaturationTemperature_K=new Float64Array(n);let eJ=0,evJ=0,coJ=0,maxW=0;for(let h=0;h<n;h++){const duty=Math.max(0,+load[h]||0);if(!duty)continue;const r=stateRequestingVaporCompression(providers.refrigerant,{...c,requestedDuty_W:duty});componentCompressor_W[h]=r.compressor_W;componentEvaporator_W[h]=r.evaporator_W;componentCondenser_W[h]=r.condenser_W;componentCondensingSaturationTemperature_K[h]=r.condensingSaturationTemperature_K;eJ+=r.compressor_W*HOUR_S;evJ+=r.evaporator_W*HOUR_S;coJ+=r.condenser_W*HOUR_S;maxW=Math.max(maxW,r.compressor_W);if(c.accountingMode==='additive')hourlyCompressor_W[h]+=r.compressor_W;if(rep.length<3)rep.push({hour:h,requestedDuty_W:duty,compressor_W:r.compressor_W,copCooling:r.copCooling,copHeating:r.copHeating,states:r.states});}const id=c.id??null;if(id!=null){if(hourlyByComponent.refrigeration[id])throw new Error('duplicate dynamic refrigeration component id: '+id);hourlyByComponent.refrigeration[id]={compressor_W:componentCompressor_W,evaporator_W:componentEvaporator_W,condenser_W:componentCondenser_W,condensingSaturationTemperature_K:componentCondensingSaturationTemperature_K};}refrigeration.push({id,refrigerantId:c.refrigerantId,mode:c.mode==='heating'?'heating':'cooling',accountingMode:c.accountingMode??'diagnostic',compressorElectricity_J:eJ,evaporator_J:evJ,condenser_J:coJ,peakCompressor_W:maxW,representative:rep});compressorElectricity_J+=eJ;}
  for(const c of(Array.isArray(spec.steamCondensing)?spec.steamCondensing:[])){if(!providers.steam)throw new Error('steam phase provider unavailable');const load=dynamicPhaseLoadProfile(project,c.loadProfileRef??c.requestedDuty_W,n),rep=[],componentHeat_W=new Float64Array(n),componentMassFlow_kg_s=new Float64Array(n);let heatJ=0,mass=0,maxM=0,cost=0;for(let h=0;h<n;h++){const duty=Math.max(0,+load[h]||0);if(!duty)continue;const r=steamControlCondensing(providers.steam,{...c,requestedDuty_W:duty});componentHeat_W[h]=r.heatReleased_W;componentMassFlow_kg_s[h]=r.mdot_kg_s;heatJ+=r.heatReleased_W*HOUR_S;mass+=r.mdot_kg_s*HOUR_S;maxM=Math.max(maxM,r.mdot_kg_s);hourlySteamMassFlow_kg_s[h]+=r.mdot_kg_s;const unit=Number.isFinite(+c.steamCost_per_kg)?+c.steamCost_per_kg:0;cost+=r.mdot_kg_s*HOUR_S*unit;if(rep.length<3)rep.push({hour:h,requestedDuty_W:duty,mdot_kg_s:r.mdot_kg_s,specificHeatReleased_J_kg:r.specificHeatReleased_J_kg,states:r.states});}const id=c.id??null;if(id!=null){if(hourlyByComponent.steamCondensing[id])throw new Error('duplicate dynamic steam component id: '+id);hourlyByComponent.steamCondensing[id]={heat_W:componentHeat_W,massFlow_kg_s:componentMassFlow_kg_s};}steamCondensing.push({id,heatReleased_J:heatJ,steamMass_kg:mass,peakMassFlow_kg_s:maxM,steamUtilityCost:cost,representative:rep});steamHeat_J+=heatJ;steamMass_kg+=mass;steamUtilityCost+=cost;}
  return{schema:'thermal-optimizer/dynamic-phase-components-annual/v0.2',available:true,refrigeration,steamCondensing,totals:{compressorElectricity_J,steamHeat_J,steamMass_kg,steamUtilityCost},hourly:{compressor_W:hourlyCompressor_W,steamMassFlow_kg_s:hourlySteamMassFlow_kg_s},hourlyByComponent,providerProvenance:{refrigerant:providers.refrigerant?.modelId??null,steam:providers.steam?.modelId??null}};
}

const PHASE_TOPOLOGY_OWNERSHIP_SCHEMA='thermal-optimizer/phase-topology-ownership/v0.1';
function phaseOwnershipIssue(code,severity,message,refs={}){return{code,severity,message,refs};}
function phaseOwnershipFinite(name,v,{min=null,max=null}={}){const x=Number(v);if(!Number.isFinite(x))throw new Error(`${name} must be finite`);if(min!=null&&x<min)throw new Error(`${name} must be >= ${min}`);if(max!=null&&x>max)throw new Error(`${name} must be <= ${max}`);return x;}
function phaseOwnershipString(name,v){if(typeof v!=='string'||!v.trim())throw new Error(`${name} must be a non-empty string`);return v.trim();}
function validateCarrierOwnership(components){const owners=new Map(),issues=[];for(const c of(Array.isArray(components)?components:[])){const id=phaseOwnershipString('component.id',c.id);for(const ch of(Array.isArray(c.owns)?c.owns:[])){const channel=phaseOwnershipString('component.owns[]',ch);if(!owners.has(channel))owners.set(channel,[]);owners.get(channel).push(id);}}for(const[channel,ids]of owners.entries())if(ids.length>1)issues.push(phaseOwnershipIssue('DUPLICATE_ACCOUNTING_OWNER','error',`Accounting channel ${channel} has multiple owners: ${ids.join(', ')}`,{channel,componentIds:ids}));return{schema:'thermal-optimizer/phase-topology-ownership/v0.1',ok:!issues.some(x=>x.severity==='error'),owners:Object.fromEntries([...owners.entries()].map(([k,v])=>[k,v[0]])),issues};}
function evaluateSteamTopology(spec={}){const issues=[],load=spec.steamLoad||{},loadId=phaseOwnershipString('steamLoad.id',load.id),usefulHeat_J=phaseOwnershipFinite('steamLoad.usefulHeat_J',load.usefulHeat_J,{min:0}),steamMass_kg=phaseOwnershipFinite('steamLoad.steamMass_kg',load.steamMass_kg,{min:0});let distributionLoss_J=null,steamSideGeneratorOutput_J=usefulHeat_J;if(spec.distribution){const d=spec.distribution;phaseOwnershipString('distribution.id',d.id);const hasFrac=d.lossFraction!=null,hasAbs=d.loss_J!=null;if(hasFrac&&hasAbs)throw new Error('distribution must specify lossFraction or loss_J, not both');if(hasFrac){const f=phaseOwnershipFinite('distribution.lossFraction',d.lossFraction,{min:0,max:.999999});steamSideGeneratorOutput_J=usefulHeat_J/(1-f);distributionLoss_J=steamSideGeneratorOutput_J-usefulHeat_J;}else if(hasAbs){distributionLoss_J=phaseOwnershipFinite('distribution.loss_J',d.loss_J,{min:0});steamSideGeneratorOutput_J=usefulHeat_J+distributionLoss_J;}else issues.push(phaseOwnershipIssue('STEAM_DISTRIBUTION_LOSS_UNRESOLVED','warning','Steam distribution exists but no loss fraction or loss energy was supplied.',{componentId:d.id}));}let generator=null;if(spec.generator){const g=spec.generator,id=phaseOwnershipString('generator.id',g.id),carrier=g.carrier==null?null:phaseOwnershipString('generator.carrier',g.carrier),eta=g.efficiency==null?null:phaseOwnershipFinite('generator.efficiency',g.efficiency,{min:1e-12,max:1}),aux=g.auxiliaryElectricity_J==null?0:phaseOwnershipFinite('generator.auxiliaryElectricity_J',g.auxiliaryElectricity_J,{min:0}),upstreamCarrierInput_J=(eta==null||carrier==null)?null:steamSideGeneratorOutput_J/eta;if(upstreamCarrierInput_J==null)issues.push(phaseOwnershipIssue('STEAM_UPSTREAM_CARRIER_UNRESOLVED','warning','Steam generator exists but carrier and efficiency are required before upstream carrier energy can be owned.',{componentId:id}));generator={id,carrier,efficiency:eta,steamSideOutput_J:steamSideGeneratorOutput_J,upstreamCarrierInput_J,auxiliaryElectricity_J:aux};}else issues.push(phaseOwnershipIssue('STEAM_GENERATOR_NOT_MODELED','warning','Steam load is resolved, but no upstream steam generator is modeled; no fuel/electricity credit is assigned.',{loadId}));let condensate=null;if(spec.condensateReturn){const c=spec.condensateReturn,id=phaseOwnershipString('condensateReturn.id',c.id),rf=phaseOwnershipFinite('condensateReturn.returnFraction',c.returnFraction,{min:0,max:1}),returnedMass_kg=steamMass_kg*rf,makeupMass_kg=steamMass_kg-returnedMass_kg;const hr=c.returnedEnthalpy_J_kg==null?null:phaseOwnershipFinite('condensateReturn.returnedEnthalpy_J_kg',c.returnedEnthalpy_J_kg),hm=c.makeupEnthalpy_J_kg==null?null:phaseOwnershipFinite('condensateReturn.makeupEnthalpy_J_kg',c.makeupEnthalpy_J_kg),er=c.recoveryEfficiency==null?null:phaseOwnershipFinite('condensateReturn.recoveryEfficiency',c.recoveryEfficiency,{min:0,max:1});condensate={id,returnFraction:rf,returnedMass_kg,makeupMass_kg,recoveredEnthalpy_J:(hr!=null&&hm!=null&&er!=null)?Math.max(0,returnedMass_kg*(hr-hm)*er):null};}const components=[{id:loadId,owns:['steamUsefulHeat_J','steamMass_kg']}];if(spec.distribution)components.push({id:spec.distribution.id,owns:['steamDistributionLoss_J']});if(generator){const owns=['steamGeneratorOutput_J'];if(generator.upstreamCarrierInput_J!=null)owns.push(`carrier:${generator.carrier}:steamGeneratorInput_J`);if(generator.auxiliaryElectricity_J>0)owns.push('electricity:steamGeneratorAux_J');components.push({id:generator.id,owns});}if(condensate)components.push({id:condensate.id,owns:['condensateReturnedMass_kg','condensateMakeupMass_kg']});const ownership=validateCarrierOwnership(components);issues.push(...ownership.issues);return{schema:'thermal-optimizer/phase-topology-ownership/v0.1',type:'steamTopology',steamLoad:{id:loadId,usefulHeat_J,steamMass_kg},distribution:{modeled:!!spec.distribution,loss_J:distributionLoss_J,generatorSteamSideOutput_J:steamSideGeneratorOutput_J},generator,condensateReturn:condensate,ownership,issues,feasible:!issues.some(x=>x.severity==='error')};}
function evaluateRefrigerantTopology(spec={}){const cycle=spec.cycle||{},qEvap=phaseOwnershipFinite('cycle.evaporatorHeat_J',cycle.evaporatorHeat_J,{min:0}),wComp=phaseOwnershipFinite('cycle.compressorElectricity_J',cycle.compressorElectricity_J,{min:0}),qCond=phaseOwnershipFinite('cycle.condenserHeat_J',cycle.condenserHeat_J,{min:0}),closure=qEvap+wComp-qCond,closureTol=Math.max(1,qCond*1e-8),issues=[];if(Math.abs(closure)>closureTol)issues.push(phaseOwnershipIssue('REFRIGERANT_ENERGY_CLOSURE','error',`Cycle energy closure residual ${closure} J exceeds tolerance ${closureTol} J.`,{qEvap,wComp,qCond}));const loadOwnerId=phaseOwnershipString('loadOwnerId',spec.loadOwnerId),compressorOwnerId=phaseOwnershipString('compressorOwnerId',spec.compressorOwnerId),rejectionOwnerId=phaseOwnershipString('rejectionOwnerId',spec.rejectionOwnerId);let recoveredHeat_J=0,heatRecovery=null;if(spec.heatRecovery){const h=spec.heatRecovery,id=phaseOwnershipString('heatRecovery.id',h.id);recoveredHeat_J=phaseOwnershipFinite('heatRecovery.recoveredHeat_J',h.recoveredHeat_J,{min:0});if(recoveredHeat_J>qCond+closureTol)issues.push(phaseOwnershipIssue('CONDENSER_RECOVERY_EXCEEDS_REJECTION','error','Recovered condenser heat exceeds resolved condenser rejection.',{componentId:id}));heatRecovery={id,recoveredHeat_J};}const components=[{id:loadOwnerId,owns:['cooling:evaporatorUseful_J']},{id:compressorOwnerId,owns:['electricity:refrigerantCompressor_J']},{id:rejectionOwnerId,owns:['heatRejection:condenserAmbient_J']}];if(heatRecovery)components.push({id:heatRecovery.id,owns:['heatRecovery:condenserUseful_J']});for(const legacy of(Array.isArray(spec.legacyCarrierOwners)?spec.legacyCarrierOwners:[]))components.push({id:phaseOwnershipString('legacyCarrierOwner.id',legacy.id),owns:Array.isArray(legacy.owns)?legacy.owns:[]});const ownership=validateCarrierOwnership(components);issues.push(...ownership.issues);return{schema:'thermal-optimizer/phase-topology-ownership/v0.1',type:'refrigerantTopology',cycle:{evaporatorHeat_J:qEvap,compressorElectricity_J:wComp,condenserHeat_J:qCond,energyClosureResidual_J:closure},heatRecovery,ambientRejection_J:Math.max(0,qCond-recoveredHeat_J),ownership,issues,feasible:!issues.some(x=>x.severity==='error')};}

/* ---------- v0.43 typed-graph phase ownership derivation ---------- */
const PHASE_GRAPH_SCHEMA='thermal-optimizer/phase-ownership-graph-derivation/v0.7';
const PHASE_GRAPH_STEAM_ROLES=new Set(['steamLoad','steamDistribution','steamGenerator','condensateReturn']);
const PHASE_GRAPH_REFRIG_ROLES=new Set(['refrigerantLoad','refrigerantCompressor','refrigerantCondenser','condenserHeatRecovery']);

const phaseGraphArr=v=>Array.isArray(v)?v:[];
const phaseGraphIssue=(code,severity,message,refs={})=>({code,severity,message,refs});
const phaseGraphStr=(v)=>typeof v==='string'&&v.trim()?v.trim():null;
function rolesOf(c){
  const p=c?.parameters??{};
  const vals=[];
  if(phaseGraphStr(p.phaseAccountingRole)) vals.push(p.phaseAccountingRole.trim());
  for(const x of phaseGraphArr(p.phaseAccountingRoles)) if(phaseGraphStr(x)) vals.push(x.trim());
  if(phaseGraphStr(c?.phaseAccountingRole)) vals.push(c.phaseAccountingRole.trim());
  return [...new Set(vals)];
}
function roleGroup(c){return phaseGraphStr(c?.parameters?.dynamicPhaseComponentId)||phaseGraphStr(c?.parameters?.phaseGroupId)||null;}
function portMap(c){return new Map(phaseGraphArr(c?.ports).map(p=>[p.id,p]));}
function componentMap(graph){return new Map(phaseGraphArr(graph?.components).map(c=>[c.id,c]));}
function nodeMap(graph){return new Map(phaseGraphArr(graph?.nodes).map(n=>[n.id,n]));}
function endpoint(ep,nodes){
  if(ep&&typeof ep==='object') return {componentId:ep.componentId??ep.node?.componentId??null,portId:ep.portId??ep.node?.portId??null};
  if(typeof ep==='string'){
    const n=nodes.get(ep); if(n) return {componentId:n.componentId,portId:n.portId};
    const k=ep.lastIndexOf('.'); if(k>0) return {componentId:ep.slice(0,k),portId:ep.slice(k+1)};
  }
  return {componentId:null,portId:null};
}
function phasePortClass(port){
  if(!port) return null;
  const f=port.fluidSpec??{};
  if(port.carrierKind==='refrigerant'||f.family==='refrigerant') return {kind:'refrigerant',fluidId:phaseGraphStr(f.refrigerantId??f.fluidId)};
  if(['water_steam','steam_condensate','steam'].includes(f.family)||f.phase==='steam'||f.phase==='vapor'&&f.fluidId==='Water') return {kind:'steam',fluidId:'Water'};
  return null;
}
function graphPhaseEdges(graph,issues){
  const comps=componentMap(graph),nodes=nodeMap(graph),out=[];
  for(const e of phaseGraphArr(graph?.edges)){
    const a=endpoint(e.from,nodes),b=endpoint(e.into,nodes),ca=comps.get(a.componentId),cb=comps.get(b.componentId);
    if(!ca||!cb){issues.push(phaseGraphIssue('GRAPH_EDGE_ENDPOINT_MISSING','error',`Edge ${e.id??'(unnamed)'} references a missing component.`,{edgeId:e.id,from:a,into:b}));continue;}
    const pa=portMap(ca).get(a.portId),pb=portMap(cb).get(b.portId),fa=phasePortClass(pa),fb=phasePortClass(pb);
    if(!fa&&!fb) continue;
    if(!fa||!fb||fa.kind!==fb.kind){issues.push(phaseGraphIssue('PHASE_EDGE_TYPE_MISMATCH','error',`Phase edge ${e.id??'(unnamed)'} connects incompatible phase carriers.`,{edgeId:e.id,from:a,into:b}));continue;}
    if(fa.kind==='refrigerant'&&fa.fluidId&&fb.fluidId&&fa.fluidId!==fb.fluidId){issues.push(phaseGraphIssue('REFRIGERANT_IDENTITY_MISMATCH','error',`Edge ${e.id??'(unnamed)'} connects ${fa.fluidId} to ${fb.fluidId}.`,{edgeId:e.id,from:a,into:b,fromFluidId:fa.fluidId,intoFluidId:fb.fluidId}));continue;}
    out.push({id:e.id??null,kind:fa.kind,fluidId:fa.fluidId??fb.fluidId??null,a:a.componentId,b:b.componentId});
  }
  return out;
}
function componentsWithRoles(graph,issues){
  const out=[];
  for(const c of phaseGraphArr(graph?.components)) for(const role of rolesOf(c)){
    if(!PHASE_GRAPH_STEAM_ROLES.has(role)&&!PHASE_GRAPH_REFRIG_ROLES.has(role)){issues.push(phaseGraphIssue('UNKNOWN_PHASE_ACCOUNTING_ROLE','error',`Unknown phase accounting role ${role}.`,{componentId:c.id,role}));continue;}
    const wants=PHASE_GRAPH_STEAM_ROLES.has(role)?'steam':'refrigerant';
    const phasePorts=phaseGraphArr(c.ports).map(phasePortClass).filter(Boolean);
    if(!phasePorts.some(x=>x.kind===wants)) issues.push(phaseGraphIssue('PHASE_ROLE_PORT_MISSING','error',`Component ${c.id} declares ${role} but has no ${wants} port.`,{componentId:c.id,role}));
    out.push({component:c,role,kind:wants,explicitGroup:roleGroup(c)});
  }
  return out;
}
function connectedSets(graph,edges,kind){
  const adj=new Map();
  for(const e of edges.filter(x=>x.kind===kind)){if(!adj.has(e.a))adj.set(e.a,new Set());if(!adj.has(e.b))adj.set(e.b,new Set());adj.get(e.a).add(e.b);adj.get(e.b).add(e.a);}
  const all=new Set(edges.filter(x=>x.kind===kind).flatMap(x=>[x.a,x.b]));
  const sets=[];const seen=new Set();
  for(const root of [...all].sort()) if(!seen.has(root)){const q=[root],s=[];seen.add(root);while(q.length){const x=q.shift();s.push(x);for(const y of [...(adj.get(x)??[])].sort())if(!seen.has(y)){seen.add(y);q.push(y);}}sets.push(s.sort());}
  return sets;
}
function groupsForKind(graph,roleRows,edges,kind,issues){
  const rows=roleRows.filter(r=>r.kind===kind),byExplicit=new Map(),ungrouped=[];
  for(const r of rows){if(r.explicitGroup){if(!byExplicit.has(r.explicitGroup))byExplicit.set(r.explicitGroup,[]);byExplicit.get(r.explicitGroup).push(r);}else ungrouped.push(r);}
  const groups=[];
  const sets=connectedSets(graph,edges,kind);
  for(const [id,rs] of [...byExplicit.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    const roleIds=rs.map(r=>r.component.id),cover=sets.find(set=>roleIds.every(x=>set.includes(x)));
    if(roleIds.length>1&&!cover) issues.push(phaseGraphIssue('PHASE_GROUP_DISCONNECTED','error',`Explicit phase group ${id} is not one connected ${kind} material network.`,{groupId:id,componentIds:roleIds}));
    groups.push({id,rows:rs,source:'explicit',members:cover??[]});
  }
  for(const set of sets){const rs=ungrouped.filter(r=>set.includes(r.component.id));if(rs.length){const anchor=(kind==='steam'?rs.find(r=>r.role==='steamLoad'):rs.find(r=>r.role==='refrigerantCompressor'))?.component.id??rs.map(r=>r.component.id).sort()[0];groups.push({id:anchor,rows:rs,source:'connectivity',members:set});}}
  for(const r of ungrouped){if(!groups.some(g=>g.rows.includes(r))){issues.push(phaseGraphIssue('PHASE_ROLE_DISCONNECTED','error',`Phase-owned component ${r.component.id} is not connected to a ${kind} material network.`,{componentId:r.component.id,role:r.role}));}}
  return groups.sort((a,b)=>a.id.localeCompare(b.id));
}
function oneRole(group,role,required,issues){
  const xs=group.rows.filter(r=>r.role===role);
  if(xs.length>1) issues.push(phaseGraphIssue('DUPLICATE_GRAPH_PHASE_OWNER','error',`Phase group ${group.id} has multiple ${role} owners.`,{groupId:group.id,role,componentIds:xs.map(x=>x.component.id)}));
  if(required&&xs.length===0) issues.push(phaseGraphIssue('MISSING_GRAPH_PHASE_OWNER','error',`Phase group ${group.id} has no ${role} owner.`,{groupId:group.id,role}));
  return xs[0]?.component??null;
}
function copyDefined(src,keys){const o={};for(const k of keys)if(src?.[k]!=null)o[k]=src[k];return o;}
function phaseRecoveryDestinationRole(c){
  const v=phaseGraphStr(c?.parameters?.heatRecoveryDestinationRole??c?.heatRecoveryDestinationRole);
  return v==='hotSink'||v==='storage'?v:null;
}
function phaseGraphNeighbours(graph,componentId){
  const nodes=nodeMap(graph),out=[];
  for(const e of phaseGraphArr(graph?.edges)){
    const a=endpoint(e.from,nodes),b=endpoint(e.into,nodes);
    if(a.componentId===componentId&&b.componentId)out.push({componentId:b.componentId,edgeId:e.id??null});
    else if(b.componentId===componentId&&a.componentId)out.push({componentId:a.componentId,edgeId:e.id??null});
  }
  return out;
}
function phaseStorageServiceRole(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.storageServiceRole??c?.storageServiceRole??p.heatRecoveryDestinationRole??c?.heatRecoveryDestinationRole);
  return v==='storage'||v==='hotSink'||v==='coldSink'||v==='bus'?v:null;
}
function phaseStorageThermalMode(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.storageThermalMode??c?.storageThermalMode??p.thermalMode??c?.thermalMode);
  return v==='cooling'||v==='heating'?v:'heating';
}
function phaseThermalSourceMode(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.thermalSourceMode??c?.thermalSourceMode??p.thermalMode??c?.thermalMode);
  return v==='cooling'||v==='heating'?v:'heating';
}
function phaseThermalSinkMode(c,role=null){
  const p=c?.parameters??{},v=phaseGraphStr(p.thermalSinkMode??c?.thermalSinkMode??p.thermalMode??c?.thermalMode);
  if(v==='cooling'||v==='heating')return v;
  return role==='coldSink'?'cooling':'heating';
}
function phaseThermalBusMode(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.thermalBusMode??c?.thermalBusMode??p.thermalMode??c?.thermalMode);
  return v==='cooling'||v==='bidirectional'||v==='heating'?v:'heating';
}
function phaseBusAllowsMode(c,mode){const b=phaseThermalBusMode(c);return b==='bidirectional'||b===mode;}
function phaseStorageChargeRole(c){
  const p=c?.parameters??{},explicit=phaseGraphStr(p.storageChargeRole??c?.storageChargeRole);
  if(explicit==='source'||explicit==='storage'||explicit==='bus')return explicit;
  const service=phaseStorageServiceRole(c);
  return service==='storage'||service==='bus'?service:null;
}
function phaseThermalServiceEdges(graph,issues){
  const comps=componentMap(graph),nodes=nodeMap(graph),out=[];
  for(const e of phaseGraphArr(graph?.edges)){
    const a=endpoint(e.from,nodes),b=endpoint(e.into,nodes),ca=comps.get(a.componentId),cb=comps.get(b.componentId);if(!ca||!cb)continue;
    const pa=portMap(ca).get(a.portId),pb=portMap(cb).get(b.portId),ta=pa?.carrierKind==='thermal',tb=pb?.carrierKind==='thermal';if(!ta&&!tb)continue;
    if(!ta||!tb){issues.push(phaseGraphIssue('THERMAL_SERVICE_EDGE_TYPE_MISMATCH','error',`Thermal service edge ${e.id??'(unnamed)'} must connect thermal ports at both ends.`,{edgeId:e.id,from:a,into:b}));continue;}
    out.push({id:e.id??null,a:a.componentId,b:b.componentId});
  }
  return out;
}
function derivePhaseStorageServices(graph,issues){
  const comps=componentMap(graph),edges=phaseThermalServiceEdges(graph,issues),adj=new Map();
  for(const e of edges){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push({componentId:e.b,edgeId:e.id});adj.get(e.b).push({componentId:e.a,edgeId:e.id});}
  const storages=[...comps.values()].filter(c=>phaseStorageServiceRole(c)==='storage').sort((a,b)=>String(a.id).localeCompare(String(b.id))),services=[],sinkOwners=new Map();
  for(const st of storages){
    const mode=phaseStorageThermalMode(st),found=new Set(),seen=new Set([st.id]),q=[st.id];
    while(q.length){
      const x=q.shift();
      for(const n of(adj.get(x)??[])){
        if(seen.has(n.componentId))continue;
        const c=comps.get(n.componentId),role=phaseStorageServiceRole(c);
        if(role==='hotSink'||role==='coldSink'){
          const sinkMode=phaseThermalSinkMode(c,role);
          if(sinkMode!==mode){issues.push(phaseGraphIssue('STORAGE_SERVICE_THERMAL_MODE_MISMATCH','error',`Storage ${st.id} (${mode}) cannot serve ${c.id} (${sinkMode}).`,{storageComponentId:st.id,sinkComponentId:c.id,storageMode:mode,sinkMode}));continue;}
          found.add(c.id);continue;
        }
        if(role==='bus'){
          if(!phaseBusAllowsMode(c,mode)){issues.push(phaseGraphIssue('THERMAL_BUS_MODE_MISMATCH','error',`Thermal bus ${c.id} does not allow ${mode} service from storage ${st.id}.`,{busComponentId:c.id,storageComponentId:st.id,requiredMode:mode,busMode:phaseThermalBusMode(c)}));continue;}
          seen.add(c.id);q.push(c.id);continue;
        }
        if(role==='storage')continue;
      }
    }
    const sinkComponentIds=[...found].sort(),hotSinkComponentIds=mode==='heating'?sinkComponentIds:[],coldSinkComponentIds=mode==='cooling'?sinkComponentIds:[];
    if(sinkComponentIds.length)services.push(mode==='heating'?{storageComponentId:st.id,hotSinkComponentIds}:{storageComponentId:st.id,serviceMode:'cooling',sinkComponentIds,coldSinkComponentIds});
    for(const sid of sinkComponentIds){if(!sinkOwners.has(sid))sinkOwners.set(sid,[]);sinkOwners.get(sid).push(st.id);}
  }
  for(const [sid,owners] of sinkOwners)if(owners.length>1)issues.push(phaseGraphIssue('DUPLICATE_STORAGE_SERVICE_OWNER','error',`Thermal sink ${sid} is service-linked to multiple storage owners.`,{sinkComponentId:sid,storageComponentIds:owners.sort()}));
  return services;
}
function derivePhaseStorageCharging(graph,issues){
  const comps=componentMap(graph),edges=phaseThermalServiceEdges(graph,issues),adj=new Map();
  for(const e of edges){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
  const storages=[...comps.values()].filter(c=>phaseStorageChargeRole(c)==='storage').sort((a,b)=>String(a.id).localeCompare(String(b.id))),rows=[],sourceTargets=new Map();
  for(const st of storages){
    const mode=phaseStorageThermalMode(st),found=new Set(),seen=new Set([st.id]),q=[st.id];
    while(q.length){
      const x=q.shift();
      for(const nid of(adj.get(x)??[])){
        if(seen.has(nid))continue;
        const c=comps.get(nid),role=phaseStorageChargeRole(c);
        if(role==='source'){
          const sourceMode=phaseThermalSourceMode(c);
          if(sourceMode!==mode){issues.push(phaseGraphIssue('STORAGE_CHARGE_THERMAL_MODE_MISMATCH','error',`Thermal source ${c.id} (${sourceMode}) cannot charge storage ${st.id} (${mode}).`,{sourceComponentId:c.id,storageComponentId:st.id,sourceMode,storageMode:mode}));continue;}
          found.add(c.id);continue;
        }
        if(role==='bus'){
          if(!phaseBusAllowsMode(c,mode)){issues.push(phaseGraphIssue('THERMAL_BUS_MODE_MISMATCH','error',`Thermal bus ${c.id} does not allow ${mode} charging of storage ${st.id}.`,{busComponentId:c.id,storageComponentId:st.id,requiredMode:mode,busMode:phaseThermalBusMode(c)}));continue;}
          seen.add(c.id);q.push(c.id);continue;
        }
        if(role==='storage')continue;
      }
    }
    const sourceIds=[...found].sort();
    if(sourceIds.length>1)issues.push(phaseGraphIssue('DUPLICATE_STORAGE_CHARGE_OWNER','error',`Storage ${st.id} is charge-linked to multiple thermal-source owners.`,{storageComponentId:st.id,sourceComponentIds:sourceIds}));
    if(sourceIds.length===0){const explicit=phaseGraphStr(st?.parameters?.storageChargeRole??st?.storageChargeRole)==='storage';if(explicit)issues.push(phaseGraphIssue('MISSING_STORAGE_CHARGE_OWNER','error',`Storage ${st.id} explicitly requests graph charging but no compatible thermal-source owner is reachable through thermal buses.`,{storageComponentId:st.id,storageMode:mode}));continue;}
    const sourceComponentId=sourceIds[0];rows.push(mode==='heating'?{storageComponentId:st.id,sourceComponentId}:{storageComponentId:st.id,sourceComponentId,serviceMode:'cooling'});if(!sourceTargets.has(sourceComponentId))sourceTargets.set(sourceComponentId,[]);sourceTargets.get(sourceComponentId).push(st.id);
  }
  for(const [sourceComponentId,targetIds0] of sourceTargets){
    const storageComponentIds=[...targetIds0].sort(),src=comps.get(sourceComponentId),raw=src?.parameters?.storageAllocation??src?.storageAllocation??null;
    if(storageComponentIds.length===1)continue;
    if(!raw||typeof raw!=='object'){issues.push(phaseGraphIssue('THERMAL_SOURCE_ALLOCATION_AMBIGUOUS','error',`Thermal source ${sourceComponentId} is charge-linked to multiple storages without an allocation rule.`,{sourceComponentId,storageComponentIds}));continue;}
    const mode=phaseGraphStr(raw.mode);
    if(mode==='priority'){
      const priority=phaseGraphArr(raw.priority).map(phaseGraphStr).filter(Boolean),unique=[...new Set(priority)],exact=unique.length===storageComponentIds.length&&storageComponentIds.every(x=>unique.includes(x));
      if(!exact){issues.push(phaseGraphIssue('THERMAL_SOURCE_PRIORITY_INVALID','error',`Thermal source ${sourceComponentId} priority must list every reachable storage exactly once.`,{sourceComponentId,storageComponentIds,priority}));continue;}
      for(const row of rows.filter(r=>r.sourceComponentId===sourceComponentId))row.allocation={mode:'priority',rank:unique.indexOf(row.storageComponentId)};
    }else if(mode==='fixedShares'){
      const shares=raw.shares??{},vals=storageComponentIds.map(id=>+shares[id]),sum=vals.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
      if(vals.some(x=>!(x>0))||Math.abs(sum-1)>1e-9){issues.push(phaseGraphIssue('THERMAL_SOURCE_FIXED_SHARES_INVALID','error',`Thermal source ${sourceComponentId} fixedShares must assign positive shares summing to 1 across every reachable storage.`,{sourceComponentId,storageComponentIds,shares}));continue;}
      for(const row of rows.filter(r=>r.sourceComponentId===sourceComponentId))row.allocation={mode:'fixedShares',share:+shares[row.storageComponentId]};
    }else issues.push(phaseGraphIssue('THERMAL_SOURCE_ALLOCATION_MODE_INVALID','error',`Thermal source ${sourceComponentId} has unsupported storageAllocation mode ${mode}.`,{sourceComponentId,mode,storageComponentIds}));
  }
  return rows.sort((a,b)=>a.sourceComponentId.localeCompare(b.sourceComponentId)||((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.storageComponentId.localeCompare(b.storageComponentId));
}
function derivePhaseHeatRecoveryRouting(graph,hr,issues){
  if(!hr)return null;
  const comps=componentMap(graph),routes={};
  for(const n of phaseGraphNeighbours(graph,hr.id)){
    const cc=comps.get(n.componentId),role=phaseRecoveryDestinationRole(cc);
    if(!role)continue;
    const key=role==='hotSink'?'hotSinkComponentId':'storageComponentId';
    if(routes[key]&&routes[key]!==cc.id)issues.push(phaseGraphIssue('DUPLICATE_HEAT_RECOVERY_DESTINATION','error',`Heat-recovery component ${hr.id} has multiple linked ${role} destinations.`,{componentId:hr.id,role,componentIds:[routes[key],cc.id]}));
    else{routes[key]=cc.id;(routes.edges??=[]).push({edgeId:n.edgeId,componentId:cc.id,role});}
  }
  if(!routes.hotSinkComponentId&&!routes.storageComponentId)return null;
  const priority=phaseGraphStr(hr.parameters?.routingPriority)??'hotSinkFirst';
  if(!['hotSinkFirst','storageFirst'].includes(priority))issues.push(phaseGraphIssue('INVALID_HEAT_RECOVERY_ROUTING_PRIORITY','error',`Heat-recovery component ${hr.id} has unsupported routingPriority ${priority}.`,{componentId:hr.id,priority}));
  routes.priority=priority;
  return routes;
}
function deriveSteam(group,issues){
  const load=oneRole(group,'steamLoad',true,issues),dist=oneRole(group,'steamDistribution',false,issues),gen=oneRole(group,'steamGenerator',false,issues),ret=oneRole(group,'condensateReturn',false,issues);
  if(!load) return null;
  const gp=gen?.parameters??{},dp=dist?.parameters??{},rp=ret?.parameters??{};
  const rec={dynamicComponentId:group.id,steamLoadOwnerId:load.id};
  if(dist) rec.distribution={id:dist.id,...copyDefined(dp,['lossFraction','loss_J'])};
  if(gen) rec.generator={id:gen.id,...copyDefined(gp,['efficiency','carrier','auxiliaryPower_W','auxiliaryProfileRef','auxiliaryElectricity_J'])};
  if(ret) rec.condensateReturn={id:ret.id,...copyDefined(rp,['returnFraction','returnedEnthalpy_J_kg','makeupEnthalpy_J_kg','recoveryEfficiency'])};
  return rec;
}
function deriveRefrigerant(graph,group,issues){
  const load=oneRole(group,'refrigerantLoad',true,issues),comp=oneRole(group,'refrigerantCompressor',true,issues),cond=oneRole(group,'refrigerantCondenser',true,issues),hr=oneRole(group,'condenserHeatRecovery',false,issues);
  if(!load||!comp||!cond) return null;
  const rec={dynamicComponentId:group.id,loadOwnerId:load.id,compressorOwnerId:comp.id,rejectionOwnerId:cond.id};
  if(hr){const hp=hr.parameters??{};rec.heatRecovery={id:hr.id,systemId:group.id,...copyDefined(hp,['maxRecovery_W','recoverableFraction','sinkDemandProfileRef','sinkDemand_W','targetTemperatureProfileRef','targetTemperature_C','approach_K'])};const routing=derivePhaseHeatRecoveryRouting(graph,hr,issues);if(routing){routing.systemId=group.id;rec.heatRecovery.routing=routing;}}
  return rec;
}
function phaseColdDirectRole(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.coldDirectRole??c?.coldDirectRole);
  if(v==='source'||v==='coldSink'||v==='storage'||v==='bus')return v;
  const sr=phaseStorageServiceRole(c),cr=phaseStorageChargeRole(c);
  if(sr==='coldSink')return 'coldSink';
  if(sr==='bus'&&phaseBusAllowsMode(c,'cooling'))return 'bus';
  if((sr==='storage'||cr==='storage')&&phaseStorageThermalMode(c)==='cooling')return 'storage';
  if(cr==='source'&&phaseThermalSourceMode(c)==='cooling')return 'source';
  return null;
}
function derivePhaseColdSourceDeliveries(graph,issues){
  const comps=componentMap(graph),edges=phaseThermalServiceEdges(graph,issues),adj=new Map();
  for(const e of edges){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
  const sources=[...comps.values()].filter(c=>phaseColdDirectRole(c)==='source').sort((a,b)=>String(a.id).localeCompare(String(b.id))),rows=[],owners=new Map();
  for(const src of sources){const found=new Map(),seen=new Set([src.id]),q=[src.id];while(q.length){const x=q.shift();for(const nid of(adj.get(x)??[])){if(seen.has(nid))continue;const c=comps.get(nid),role=phaseColdDirectRole(c);if(!c||!role)continue;if(role==='bus'){if(!phaseBusAllowsMode(c,'cooling')){issues.push(phaseGraphIssue('THERMAL_BUS_MODE_MISMATCH','error',`Thermal bus ${c.id} does not allow cooling delivery from source ${src.id}.`,{busComponentId:c.id,sourceComponentId:src.id}));continue;}seen.add(c.id);q.push(c.id);continue;}if(role==='coldSink'||role==='storage'){found.set(c.id,role);continue;}}}
    const dests=[...found].sort((a,b)=>a[0].localeCompare(b[0]));if(!dests.length)continue;const raw=src?.parameters?.coldAllocation??src?.coldAllocation??null,alloc=new Map();
    if(dests.length>1){const ids=dests.map(x=>x[0]);if(!raw||typeof raw!=='object')issues.push(phaseGraphIssue('COLD_SOURCE_ALLOCATION_AMBIGUOUS','error',`Cooling source ${src.id} reaches multiple direct destinations without coldAllocation.`,{sourceComponentId:src.id,destinationComponentIds:ids}));else if(phaseGraphStr(raw.mode)==='priority'){const pr=phaseGraphArr(raw.priority).map(phaseGraphStr).filter(Boolean),u=[...new Set(pr)];if(u.length!==ids.length||!ids.every(x=>u.includes(x)))issues.push(phaseGraphIssue('COLD_SOURCE_PRIORITY_INVALID','error',`Cooling source ${src.id} priority must list every reachable direct destination exactly once.`,{sourceComponentId:src.id,destinationComponentIds:ids,priority:pr}));else u.forEach((id,rank)=>alloc.set(id,{mode:'priority',rank}));}else if(phaseGraphStr(raw.mode)==='fixedShares'){const sh=raw.shares??{},vals=ids.map(id=>+sh[id]),sum=vals.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);if(vals.some(x=>!(x>0))||Math.abs(sum-1)>1e-9)issues.push(phaseGraphIssue('COLD_SOURCE_FIXED_SHARES_INVALID','error',`Cooling source ${src.id} fixedShares must assign positive shares summing to 1.`,{sourceComponentId:src.id,destinationComponentIds:ids,shares:sh}));else ids.forEach(id=>alloc.set(id,{mode:'fixedShares',share:+sh[id]}));}else issues.push(phaseGraphIssue('COLD_SOURCE_ALLOCATION_MODE_INVALID','error',`Cooling source ${src.id} coldAllocation mode must be priority or fixedShares.`,{sourceComponentId:src.id,mode:raw?.mode}));}
    for(const [id,role] of dests){const row={sourceComponentId:src.id,destinationComponentId:id,destinationType:role};if(alloc.has(id))row.allocation=alloc.get(id);rows.push(row);const key=`${role}:${id}`;if(!owners.has(key))owners.set(key,[]);owners.get(key).push(src.id);}
  }
  for(const [key,x] of owners)if(x.length>1){const [destinationType,destinationComponentId]=key.split(':');issues.push(phaseGraphIssue('DUPLICATE_COLD_DIRECT_DESTINATION_OWNER','error',`Cold ${destinationType} ${destinationComponentId} is directly owned by multiple cooling sources.`,{destinationType,destinationComponentId,sourceComponentIds:x.sort()}));}
  return rows.sort((a,b)=>a.sourceComponentId.localeCompare(b.sourceComponentId)||((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.destinationComponentId.localeCompare(b.destinationComponentId));
}
function phaseExhaustRecoveryRole(c){
  const p=c?.parameters??{},v=phaseGraphStr(p.exhaustRecoveryRole??c?.exhaustRecoveryRole);
  return v==='recovery'||v==='makeupAir'?v:null;
}
function deriveExhaustRecoveryOwnership(graph,coldSourceDeliveries,issues){
  const comps=componentMap(graph),rows=[],pathOwners=new Map();
  const recoveries=[...comps.values()].filter(c=>phaseExhaustRecoveryRole(c)==='recovery').sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  for(const rec of recoveries){
    const p=rec.parameters??{},processExhaustPathId=phaseGraphStr(p.processExhaustPathId??rec.processExhaustPathId),makeupNeighbours=phaseGraphNeighbours(graph,rec.id).map(x=>comps.get(x.componentId)).filter(c=>phaseExhaustRecoveryRole(c)==='makeupAir'),hasHydronic=(coldSourceDeliveries??[]).some(x=>x.sourceComponentId===rec.id&&x.destinationType==='storage');
    if(!processExhaustPathId){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_PROCESS_PATH_REQUIRED','error',`Exhaust-recovery component ${rec.id} requires processExhaustPathId.`,{componentId:rec.id}));continue;}
    if(makeupNeighbours.length>1){issues.push(phaseGraphIssue('DUPLICATE_EXHAUST_RECOVERY_MAKEUP_DESTINATION','error',`Exhaust-recovery component ${rec.id} has multiple makeup-air destinations.`,{componentId:rec.id,destinationComponentIds:makeupNeighbours.map(x=>x.id).sort()}));continue;}
    const hasMakeup=makeupNeighbours.length===1;if(!hasMakeup&&!hasHydronic){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_DESTINATION_REQUIRED','error',`Exhaust-recovery component ${rec.id} has neither makeup-air nor hydronic-storage destination.`,{componentId:rec.id,processExhaustPathId}));continue;}
    let makeupAirShare=hasMakeup?1:0,hydronicShare=hasHydronic?1:0,allocationMode='singleDestination',priority=null;
    if(hasMakeup&&hasHydronic){
      const a=p.exhaustRecoveryAllocation??rec.exhaustRecoveryAllocation??null,mode=phaseGraphStr(a?.mode);
      if(mode==='fixedShares'){
        const sh=a.shares??{},m=+sh.makeupAir,h=+sh.hydronic;
        if(!(m>0&&h>0)||Math.abs(m+h-1)>1e-9){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_FIXED_SHARES_INVALID','error',`Exhaust-recovery component ${rec.id} fixedShares must assign positive makeupAir and hydronic shares summing to 1.`,{componentId:rec.id,shares:sh}));continue;}
        makeupAirShare=m;hydronicShare=h;allocationMode='fixedShares';
      }else if(mode==='seriesPriority'){
        priority=Array.isArray(a?.priority)?a.priority.map(phaseGraphStr):[];
        const makeupFirst=priority.length===2&&priority[0]==='makeupAir'&&priority[1]==='hydronic',hydronicFirst=priority.length===2&&priority[0]==='hydronic'&&priority[1]==='makeupAir';
        if(!(makeupFirst||hydronicFirst)){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_SERIES_PRIORITY_INVALID','error',`Exhaust-recovery component ${rec.id} seriesPriority must be exactly ['makeupAir','hydronic'] or ['hydronic','makeupAir'].`,{componentId:rec.id,processExhaustPathId,priority}));continue;}
        if(hydronicFirst&&a?.hydronicFirstReservation_W==null){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_HYDRONIC_FIRST_RESERVATION_REQUIRED','error',`Exhaust-recovery component ${rec.id} hydronic-first series recovery requires explicit hydronicFirstReservation_W before downstream makeup-air state is solved.`,{componentId:rec.id,processExhaustPathId,priority}));continue;}
        makeupAirShare=1;hydronicShare=1;allocationMode='seriesPriority';
      }else{
        issues.push(phaseGraphIssue('EXHAUST_RECOVERY_ALLOCATION_REQUIRED','error',`Exhaust-recovery component ${rec.id} feeds makeup air and hydronic storage; explicit fixedShares or makeup-air-first seriesPriority allocation is required.`,{componentId:rec.id,processExhaustPathId,supportedModes:['fixedShares','seriesPriority']}));
        continue;
      }
    }
    const eff=hasMakeup?Number(p.makeupAirSensibleEffectiveness??p.sensibleEffectiveness):0;if(hasMakeup&&!(eff>=0&&eff<=1)){issues.push(phaseGraphIssue('EXHAUST_RECOVERY_SENSIBLE_EFFECTIVENESS_REQUIRED','error',`Exhaust-recovery component ${rec.id} with makeup-air service requires makeupAirSensibleEffectiveness in [0,1].`,{componentId:rec.id,value:p.makeupAirSensibleEffectiveness??p.sensibleEffectiveness}));continue;}
    if(pathOwners.has(processExhaustPathId)){issues.push(phaseGraphIssue('DUPLICATE_EXHAUST_STREAM_RECOVERY_OWNER','error',`Process-exhaust path ${processExhaustPathId} is owned by multiple exhaust-recovery components.`,{processExhaustPathId,componentIds:[pathOwners.get(processExhaustPathId),rec.id].sort()}));continue;}pathOwners.set(processExhaustPathId,rec.id);
    const alloc={mode:allocationMode,makeupAirShare,hydronicShare,...(priority?{priority}: {})};if(allocationMode==='seriesPriority'&&priority?.[0]==='hydronic')alloc.hydronicFirstReservation_W=(p.exhaustRecoveryAllocation??rec.exhaustRecoveryAllocation)?.hydronicFirstReservation_W;
    rows.push({componentId:rec.id,processExhaustPathId,makeupAirComponentId:makeupNeighbours[0]?.id??null,hasMakeupAir:hasMakeup,hasHydronicStorage:hasHydronic,makeupAirSensibleEffectiveness:hasMakeup?eff:0,allocation:alloc});
  }
  return rows;
}
function validateExhaustRecoveryBindings(ownership={},project={},coldSourceProfiles={}){
  const issues=[],byPath={};const raw=project.processExhaust??project.processExhaustPaths??[],paths=Array.isArray(raw)?raw:(raw&&raw.enabled!==false?[raw]:[]),pathMap=new Map(paths.filter(Boolean).map(x=>[String(x.id??''),x]));
  for(const r of(ownership.exhaustRecovery??[])){const q=pathMap.get(String(r.processExhaustPathId));if(!q){issues.push(phaseOwnershipIssue('GRAPH_EXHAUST_RECOVERY_PROCESS_PATH_UNBOUND','error',`Graph exhaust-recovery component ${r.componentId} references missing process-exhaust path ${r.processExhaustPathId}.`,{componentId:r.componentId,processExhaustPathId:r.processExhaustPathId}));continue;}if(q.sensibleHeatRecoveryEfficiency!=null||q.airHeatRecoveryEfficiency!=null)issues.push(phaseOwnershipIssue('LEGACY_EXHAUST_RECOVERY_CONFLICT','error',`Process-exhaust path ${r.processExhaustPathId} retains legacy scalar sensible heat recovery while graph-owned component ${r.componentId} owns recovery.`,{componentId:r.componentId,processExhaustPathId:r.processExhaustPathId}));if(r.hasHydronicStorage){const src=coldSourceProfiles?.[r.componentId],c=src?.exhaustHydronicConverter;if(src?.availableMode!=='exhaustAirToHydronicConverter'||c?.airStreamMode!=='processExhaust'||String(c?.processExhaustPathId??'')!==String(r.processExhaustPathId))issues.push(phaseOwnershipIssue('GRAPH_EXHAUST_RECOVERY_HYDRONIC_BINDING_MISMATCH','error',`Graph exhaust-recovery component ${r.componentId} hydronic branch must bind an exhaustAirToHydronicConverter cold source to the same process-exhaust path.`,{componentId:r.componentId,processExhaustPathId:r.processExhaustPathId,availableMode:src?.availableMode,airStreamMode:c?.airStreamMode,boundProcessExhaustPathId:c?.processExhaustPathId}));}if(r.allocation?.mode==='seriesPriority'&&r.allocation?.priority?.[0]==='hydronic'){const v=r.allocation.hydronicFirstReservation_W,arr=typeof v==='string'?project?.profiles?.[v]:v,bad=Number.isFinite(+arr)?+arr<0:!(Array.isArray(arr)||ArrayBuffer.isView(arr))||Array.from(arr).some(x=>!(Number.isFinite(+x)&&+x>=0));if(bad)issues.push(phaseOwnershipIssue('EXHAUST_RECOVERY_HYDRONIC_FIRST_RESERVATION_INVALID','error',`Hydronic-first exhaust recovery ${r.componentId} requires a finite non-negative scalar/profile reservation.`,{componentId:r.componentId,processExhaustPathId:r.processExhaustPathId,reservation:v}));}byPath[String(r.processExhaustPathId)]=r;}
  return{issues,feasible:!issues.some(x=>x.severity==='error'),byPath};
}
function derivePhaseTopologyOwnership(graph={}){
  const issues=[],edges=graphPhaseEdges(graph,issues),rows=componentsWithRoles(graph,issues),steamGroups=groupsForKind(graph,rows,edges,'steam',issues),refGroups=groupsForKind(graph,rows,edges,'refrigerant',issues);
  const steamCondensing=steamGroups.map(g=>deriveSteam(g,issues)).filter(Boolean),refrigeration=refGroups.map(g=>deriveRefrigerant(graph,g,issues)).filter(Boolean),storageServices=derivePhaseStorageServices(graph,issues),storageCharging=derivePhaseStorageCharging(graph,issues),coldSourceDeliveries=derivePhaseColdSourceDeliveries(graph,issues),exhaustRecovery=deriveExhaustRecoveryOwnership(graph,coldSourceDeliveries,issues);
  // Shared network with >1 ungrouped loads/cycles is ambiguous without explicit dynamicPhaseComponentId allocation.
  for(const g of steamGroups.filter(x=>x.source==='connectivity')){const n=g.rows.filter(r=>r.role==='steamLoad').length;if(n>1)issues.push(phaseGraphIssue('STEAM_LOAD_ALLOCATION_AMBIGUOUS','error',`Connected steam network ${g.id} has ${n} steam loads without explicit dynamicPhaseComponentId grouping.`,{groupId:g.id}));}
  const result={schema:PHASE_GRAPH_SCHEMA,steamCondensing,refrigeration,storageServices,storageCharging,coldSourceDeliveries,exhaustRecovery,derivationIssues:issues,feasible:!issues.some(x=>x.severity==='error')};
  return result;
}


function evaluateDynamicCondenserHeatRecovery(project,spec,componentHourly,n){
  if(!spec)return{enabled:false,issues:[],recoveredHeat_J:0,ambientRejection_J:null,hourlyRecovered_W:new Float64Array(n)};
  const issues=[],id=phaseOwnershipString('heatRecovery.id',spec.id),maxRecovery_W=Number(spec.maxRecovery_W),recoverableFraction=Number(spec.recoverableFraction),approach_K=Number(spec.approach_K);
  if(!(maxRecovery_W>0))issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_CAPACITY_REQUIRED','error','Graph-derived condenser heat recovery requires maxRecovery_W > 0.',{componentId:id}));
  if(!(recoverableFraction>=0&&recoverableFraction<=1))issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_FRACTION_REQUIRED','error','Graph-derived condenser heat recovery requires recoverableFraction in [0,1].',{componentId:id}));
  if(!(approach_K>=0))issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_APPROACH_REQUIRED','error','Graph-derived condenser heat recovery requires approach_K >= 0.',{componentId:id}));
  let demand=null,targetC=null;const routedSinkId=spec.routing?.hotSinkComponentId??null;
  if(routedSinkId){const named=resolveNamedHotSinkProfiles(project,n);issues.push(...named.issues);const b=named.profiles[routedSinkId];if(b){demand=b.demand_W;targetC=b.targetTemperature_C;}else issues.push(phaseOwnershipIssue('GRAPH_HOT_SINK_DESTINATION_UNBOUND','error',`Graph hot-sink destination ${routedSinkId} has no named project.hotSinkProfiles binding.`,{componentId:id,hotSinkComponentId:routedSinkId}));}
  else if(spec.routing?.storageComponentId){demand=new Float64Array(n);targetC=new Float64Array(n);}
  else{try{demand=dynamicPhaseLoadProfile(project,spec.sinkDemandProfileRef??spec.sinkDemand_W,n);}catch(e){issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_SINK_DEMAND_REQUIRED','error','Graph-derived condenser heat recovery requires an explicit sinkDemandProfileRef or sinkDemand_W.',{componentId:id,reason:e.message}));}try{targetC=dynamicPhaseLoadProfile(project,spec.targetTemperatureProfileRef??spec.targetTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_TARGET_TEMPERATURE_REQUIRED','error','Graph-derived condenser heat recovery requires an explicit targetTemperatureProfileRef or targetTemperature_C.',{componentId:id,reason:e.message}));}}
  const condenser=componentHourly?.condenser_W,condensingK=componentHourly?.condensingSaturationTemperature_K;
  if(!condenser||condenser.length!==n||!condensingK||condensingK.length!==n)issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_DYNAMIC_STATE_MISSING','error','Resolved hourly condenser duty and condensing saturation temperature are required for dynamic heat-recovery binding.',{componentId:id}));
  const hourlyRecovered_W=new Float64Array(n),hourlyCapacityLimited_W=new Float64Array(n),hourlyCondensingTemperature_K=new Float64Array(n),hourlyEligible=new Uint8Array(n);let recoveredHeat_J=0,sinkDemand_J=0,eligibleCondenserHeat_J=0;
  if(!issues.some(x=>x.severity==='error'))for(let h=0;h<n;h++){
    const qCond=Math.max(0,+condenser[h]||0),qSink=Math.max(0,+demand[h]||0),tCondK=+condensingK[h]||0,tTargetC=+targetC[h];sinkDemand_J+=qSink*HOUR_S;hourlyCondensingTemperature_K[h]=tCondK;
    const qCapacity=Math.min(qCond*recoverableFraction,maxRecovery_W);hourlyCapacityLimited_W[h]=qCapacity;
    const storageOnly=!!spec.routing?.storageComponentId&&!spec.routing?.hotSinkComponentId;const eligible=storageOnly?qCond>0:(qCond>0&&Number.isFinite(tTargetC)&&tCondK>=(tTargetC+273.15+approach_K));hourlyEligible[h]=eligible?1:0;if(!eligible)continue;
    eligibleCondenserHeat_J+=qCond*HOUR_S;const q=storageOnly?0:Math.min(qCapacity,qSink);hourlyRecovered_W[h]=q;recoveredHeat_J+=q*HOUR_S;
  }
  const condenserHeat_J=condenser?Array.from(condenser).reduce((a,b)=>a+Math.max(0,+b||0)*HOUR_S,0):0;
  return{enabled:true,id,issues,feasible:!issues.some(x=>x.severity==='error'),maxRecovery_W:Number.isFinite(maxRecovery_W)?maxRecovery_W:null,recoverableFraction:Number.isFinite(recoverableFraction)?recoverableFraction:null,approach_K:Number.isFinite(approach_K)?approach_K:null,routing:spec.routing??null,recoveredHeat_J,sinkDemand_J,eligibleCondenserHeat_J,ambientRejection_J:Math.max(0,condenserHeat_J-recoveredHeat_J),hourlyRecovered_W,hourlyCapacityLimited_W,hourlyCondensingTemperature_K,hourlyEligible};
}


function evaluatePhaseTopologyOwnershipAnnual(project,dynamicPhase,dynamicSpec={},ownershipSpec={}){const n=project?.profiles?.outdoor_C?.length??0,issues=[...(ownershipSpec?.derivationIssues??[])],hourly={electricity_W:new Float64Array(n),refrigerantCompressor_W:new Float64Array(n),gas_W:new Float64Array(n),deliveredFuel_W:new Float64Array(n)},steam=[],refrigeration=[],carrierEnergy_J={electricity:0,naturalGas:0,deliveredFuel:0};const storageServices=ownershipSpec?.storageServices??[],storageCharging=ownershipSpec?.storageCharging??[],coldSourceDeliveries=ownershipSpec?.coldSourceDeliveries??[],exhaustRecovery=ownershipSpec?.exhaustRecovery??[],enabled=!!ownershipSpec&&((ownershipSpec.refrigeration?.length??0)||(ownershipSpec.steamCondensing?.length??0)||(storageServices.length??0)||(storageCharging.length??0)||(coldSourceDeliveries.length??0)||(exhaustRecovery.length??0)||(ownershipSpec.derivationIssues?.length??0));if(!enabled)return{schema:'thermal-optimizer/phase-topology-ownership-annual/v0.1',enabled:false,issues,feasible:true,hourly,carrierEnergy_J,steam,refrigeration,storageServices,storageCharging,coldSourceDeliveries,exhaustRecovery};const dynRef=(kind,id)=>{const rows=kind==='refrigeration'?dynamicPhase.refrigeration:dynamicPhase.steamCondensing;const matches=rows.filter(x=>x.id===id);if(matches.length!==1)throw new Error(`${kind} ownership references missing or non-unique dynamic component id: ${id}`);return matches[0];};
  for(const o of(ownershipSpec.refrigeration??[])){try{const id=phaseOwnershipString('refrigeration.dynamicComponentId',o.dynamicComponentId),r=dynRef('refrigeration',id),componentHourly=dynamicPhase.hourlyByComponent?.refrigeration?.[id],cfg=(dynamicSpec.refrigeration??[]).find(x=>x.id===id)??{},dynamicRecovery=o.heatRecovery?evaluateDynamicCondenserHeatRecovery(project,o.heatRecovery,componentHourly,n):null;if(dynamicRecovery)issues.push(...dynamicRecovery.issues.map(x=>({...x,dynamicComponentId:id})));if(dynamicRecovery&&r.mode!=='cooling')issues.push(phaseOwnershipIssue('REFRIGERANT_HEAT_RECOVERY_REQUIRES_COOLING_MODE','error','Condenser heat-recovery ownership is separate only for a cooling-mode refrigeration cycle; heating-mode condenser duty is already the primary useful load.',{dynamicComponentId:id,componentId:o.heatRecovery?.id}));const top=evaluateRefrigerantTopology({cycle:{evaporatorHeat_J:r.evaporator_J,compressorElectricity_J:r.compressorElectricity_J,condenserHeat_J:r.condenser_J},loadOwnerId:o.loadOwnerId,compressorOwnerId:o.compressorOwnerId,rejectionOwnerId:o.rejectionOwnerId,heatRecovery:dynamicRecovery&&!dynamicRecovery.issues.some(x=>x.severity==='error')?{id:o.heatRecovery.id,recoveredHeat_J:dynamicRecovery.recoveredHeat_J}:null,legacyCarrierOwners:o.legacyCarrierOwners??[]});issues.push(...top.issues.map(x=>({...x,dynamicComponentId:id})));const arr=componentHourly?.compressor_W;if(!arr)throw new Error(`missing hourly refrigeration result for ${id}`);if(top.feasible)for(let h=0;h<n;h++){hourly.electricity_W[h]+=arr[h];hourly.refrigerantCompressor_W[h]+=arr[h];}carrierEnergy_J.electricity+=r.compressorElectricity_J;if(cfg?.accountingMode==='additive')issues.push(phaseOwnershipIssue('LEGACY_ADDITIVE_IGNORED_BY_OWNERSHIP_MAP','warning','accountingMode:additive is ignored because explicit topology ownership is authoritative.',{dynamicComponentId:id}));refrigeration.push({dynamicComponentId:id,...top,dynamicHeatRecovery:dynamicRecovery});}catch(e){issues.push(phaseOwnershipIssue('REFRIGERANT_OWNERSHIP_EVALUATION_FAILED','error',e.message));}}
  for(const o of(ownershipSpec.steamCondensing??[])){try{const id=phaseOwnershipString('steam.dynamicComponentId',o.dynamicComponentId),r=dynRef('steamCondensing',id),cfg=(dynamicSpec.steamCondensing??[]).find(x=>x.id===id)??{},heatArr=dynamicPhase.hourlyByComponent?.steamCondensing?.[id]?.heat_W;if(!heatArr)throw new Error(`missing hourly steam result for ${id}`);let auxProfile=null,auxJ=0;if(o.generator?.auxiliaryProfileRef!=null){auxProfile=dynamicPhaseLoadProfile(project,o.generator.auxiliaryProfileRef,n);auxJ=Array.from(auxProfile).reduce((a,b)=>a+Math.max(0,+b||0)*HOUR_S,0);}else if(Number.isFinite(+o.generator?.auxiliaryPower_W)){auxProfile=new Float64Array(n).fill(Math.max(0,+o.generator.auxiliaryPower_W));auxJ=Math.max(0,+o.generator.auxiliaryPower_W)*n*HOUR_S;}else if((+o.generator?.auxiliaryElectricity_J||0)>0)issues.push(phaseOwnershipIssue('STEAM_AUXILIARY_TIME_PROFILE_REQUIRED','error','Annual steam-generator auxiliary electricity needs an hourly power/profile input before site tariff and peak accounting.',{dynamicComponentId:id,componentId:o.generator?.id}));const generator=o.generator?{...o.generator,auxiliaryElectricity_J:auxJ||(+o.generator.auxiliaryElectricity_J||0)}:null,top=evaluateSteamTopology({steamLoad:{id:o.steamLoadOwnerId??id,usefulHeat_J:r.heatReleased_J,steamMass_kg:r.steamMass_kg},distribution:o.distribution??null,generator,condensateReturn:o.condensateReturn??null});issues.push(...top.issues.map(x=>({...x,dynamicComponentId:id})));if(top.generator?.upstreamCarrierInput_J!=null&&r.heatReleased_J>0){const factor=top.generator.upstreamCarrierInput_J/r.heatReleased_J,carrier=top.generator.carrier;for(let h=0;h<n;h++){const w=heatArr[h]*factor;if(carrier==='electricity')hourly.electricity_W[h]+=w;else if(carrier==='naturalGas'||carrier==='gas')hourly.gas_W[h]+=w;else if(carrier==='deliveredFuel')hourly.deliveredFuel_W[h]+=w;}if(carrier==='electricity')carrierEnergy_J.electricity+=top.generator.upstreamCarrierInput_J;else if(carrier==='naturalGas'||carrier==='gas')carrierEnergy_J.naturalGas+=top.generator.upstreamCarrierInput_J;else if(carrier==='deliveredFuel')carrierEnergy_J.deliveredFuel+=top.generator.upstreamCarrierInput_J;else issues.push(phaseOwnershipIssue('PHASE_CARRIER_SITE_ACCOUNTING_UNBOUND','error',`Steam carrier ${carrier} has no site-accounting binding in v0.41.`,{dynamicComponentId:id,componentId:top.generator.id,carrier}));}if(auxProfile)for(let h=0;h<n;h++)hourly.electricity_W[h]+=Math.max(0,+auxProfile[h]||0);carrierEnergy_J.electricity+=auxJ;steam.push({dynamicComponentId:id,legacySteamUtilityCost:r.steamUtilityCost,...top});if(Number.isFinite(+cfg.steamCost_per_kg)&&+cfg.steamCost_per_kg!==0)issues.push(phaseOwnershipIssue('LEGACY_STEAM_UNIT_COST_IGNORED_BY_OWNERSHIP_MAP','warning','steamCost_per_kg is diagnostic only when explicit upstream carrier ownership is present.',{dynamicComponentId:id}));}catch(e){issues.push(phaseOwnershipIssue('STEAM_OWNERSHIP_EVALUATION_FAILED','error',e.message));}}
  return{schema:'thermal-optimizer/phase-topology-ownership-annual/v0.1',enabled:true,issues,feasible:!issues.some(x=>x.severity==='error'),hourly,carrierEnergy_J,steam,refrigeration,storageServices,storageCharging,coldSourceDeliveries,exhaustRecovery};
}

function colebrookFriction(Re,relRough){
  if(Re<=0) return 0; if(Re<2300) return 64/Re;
  const turbulent=()=>{let f=0.025; for(let i=0;i<30;i++) f=1/Math.pow(-2*Math.log10(relRough/3.7+2.51/(Re*Math.sqrt(f))),2); return f;};
  if(Re>=4000) return turbulent();
  const fl=64/2300, ft=(()=>{const r=4000;let f=0.025;for(let i=0;i<30;i++) f=1/Math.pow(-2*Math.log10(relRough/3.7+2.51/(r*Math.sqrt(f))),2);return f;})();
  return lerp(fl,ft,(Re-2300)/1700);
}
function hydronicScreen({Q_W,deltaT_K,D_m,L_m,roughness_m=1.5e-6,K=0,pumpEfficiency=0.7,fluidSpec,meanTemperature_C}){
  const p=resolveFluidProperties(fluidSpec,meanTemperature_C); if(!p.available) return {available:false,properties:p};
  const mdot=Q_W/(p.cp_J_kgK*deltaT_K), vdot=mdot/p.rho_kg_m3, area=Math.PI*D_m*D_m/4, v=vdot/area;
  const Re=p.rho_kg_m3*v*D_m/p.mu_Pa_s, f=colebrookFriction(Re,roughness_m/D_m), dp=(f*L_m/D_m+K)*p.rho_kg_m3*v*v/2;
  return {available:true,properties:p,mdot_kg_s:mdot,Vdot_m3_s:vdot,velocity_m_s:v,Re,frictionFactor:f,dp_Pa:dp,pumpPower_W:dp*vdot/pumpEfficiency};
}
function heatExchangerCapacityRates({hotFluid,hotT_C,hotMdot_kg_s,coldFluid,coldT_C,coldMdot_kg_s}){
  const h=resolveFluidProperties(hotFluid,hotT_C), c=resolveFluidProperties(coldFluid,coldT_C); if(!h.available||!c.available) return {available:false,hot:h,cold:c};
  const Ch=hotMdot_kg_s*h.cp_J_kgK,Cc=coldMdot_kg_s*c.cp_J_kgK;
  return {available:true,C_hot_W_K:Ch,C_cold_W_K:Cc,Cmin_W_K:Math.min(Ch,Cc),Cmax_W_K:Math.max(Ch,Cc),Cr:Math.min(Ch,Cc)/Math.max(Ch,Cc)};
}
function storageSensibleCapacity({fluidSpec,meanTemperature_C,volume_m3,deltaT_K}){
  const p=resolveFluidProperties(fluidSpec,meanTemperature_C); if(!p.available) return {available:false,properties:p};
  return {available:true,properties:p,capacity_J:p.rho_kg_m3*volume_m3*p.cp_J_kgK*deltaT_K,volumetricHeatCapacity_J_m3K:p.rho_kg_m3*p.cp_J_kgK};
}

/* ---------- thermal storage ---------- */
function normalizeTankSpec(spec={}){
  const model=spec.model??'mixed';if(!['mixed','finiteStratified','idealStratified'].includes(model))throw new Error('unknown tank model');
  const volume_m3=spec.volume_m3??0,rho=spec.rho_kg_m3??998,cp=spec.cp_J_kgK??4180,Tcold=spec.Tcold_C??30,Thot=spec.Thot_C??45;
  if(volume_m3<0||!(rho>0&&cp>0&&Thot>Tcold))throw new Error('invalid tank spec');
  const capacity_J=volume_m3*rho*cp*(Thot-Tcold),nodes=Math.max(2,Math.trunc(spec.nodes??8)),aspectRatio=spec.aspectRatio??2.5;
  if(!(aspectRatio>0))throw new Error('invalid tank aspect ratio');
  const diameter_m=volume_m3>0?Math.cbrt(4*volume_m3/(Math.PI*aspectRatio)):0,height_m=aspectRatio*diameter_m,
        crossSection_m2=diameter_m>0?Math.PI*diameter_m*diameter_m/4:0,dz_m=nodes>0?height_m/nodes:0;
  const molecularAxial_W_K=(volume_m3>0&&dz_m>0)?(spec.axialConductivity_W_mK??0.6)*crossSection_m2/dz_m:0;
  return{model,componentId:spec.componentId??spec.storageId??null,storageId:spec.storageId??spec.componentId??null,volume_m3,rho_kg_m3:rho,cp_J_kgK:cp,Tcold_C:Tcold,Thot_C:Thot,capacity_J,nodes,aspectRatio,diameter_m,height_m,
    axialConductance_W_K:spec.axialConductance_W_K??molecularAxial_W_K,
    UA_W_K:spec.UA_W_K??Math.max(0,2.2*Math.pow(Math.max(volume_m3,0.001),2/3)),
    maxCharge_W:spec.maxCharge_W??Infinity,maxDischarge_W:spec.maxDischarge_W??Infinity,
    chargeEfficiency:spec.chargeEfficiency??0.98,dischargeEfficiency:spec.dischargeEfficiency??0.98,
    initialSOC:clamp(spec.initialSOC??0.5,0,1),capexFixed:spec.capexFixed??0,capexPerM3:spec.capexPerM3??0,
    stratificationPremium:spec.stratificationPremium??1.12};
}
function initFiniteStratifiedNodes(s){
  const T=new Float64Array(s.nodes);if(s.capacity_J<=0){T.fill(s.Tcold_C);return T;}
  let hotEquivalent=s.initialSOC*s.nodes;
  for(let i=0;i<s.nodes;i++){
    const frac=clamp(hotEquivalent-i,0,1);T[i]=s.Tcold_C+frac*(s.Thot_C-s.Tcold_C);
  }
  return T;
}
function createTankState(spec){
  const s=normalizeTankSpec(spec),st={spec:s,E_J:s.capacity_J*s.initialSOC,loss_J:0,chargeInput_J:0,dischargeOutput_J:0};
  if(s.model==='finiteStratified')st.nodeTemps_C=initFiniteStratifiedNodes(s);
  return st;
}
function finiteTankEnergyJ(st){
  const s=st.spec;if(!st.nodeTemps_C||s.volume_m3<=0)return 0;
  const mNode=s.volume_m3*s.rho_kg_m3/s.nodes;
  let e=0;for(const T of st.nodeTemps_C)e+=mNode*s.cp_J_kgK*Math.max(0,T-s.Tcold_C);
  return clamp(e,0,s.capacity_J);
}
function syncTankEnergy(st){if(st.spec.model==='finiteStratified')st.E_J=finiteTankEnergyJ(st);return st.E_J}
function sortFiniteTank(st){
  if(st.spec.model!=='finiteStratified'||!st.nodeTemps_C)return;
  const a=Array.from(st.nodeTemps_C).sort((x,y)=>y-x);st.nodeTemps_C.set(a);syncTankEnergy(st);
}
function tankSOC(st){syncTankEnergy(st);return st.spec.capacity_J>0?clamp(st.E_J/st.spec.capacity_J,0,1):0}
function tankTopTemperatureC(st){
  const s=st.spec;
  if(s.model==='finiteStratified')return st.nodeTemps_C?.[0]??s.Tcold_C;
  const soc=tankSOC(st);if(s.model==='idealStratified')return soc>1e-9?s.Thot_C:s.Tcold_C;
  return s.Tcold_C+soc*(s.Thot_C-s.Tcold_C);
}
function tankMeanTemperatureC(st){
  const s=st.spec;
  if(s.model==='finiteStratified'&&st.nodeTemps_C?.length)return Array.from(st.nodeTemps_C).reduce((a,b)=>a+b,0)/st.nodeTemps_C.length;
  const soc=tankSOC(st);return s.Tcold_C+soc*(s.Thot_C-s.Tcold_C);
}
function finiteTankAxialConduction(st,dt_s){
  const s=st.spec,T=st.nodeTemps_C;if(!T||T.length<2||!(s.axialConductance_W_K>0)||!(s.volume_m3>0))return;
  const mNode=s.volume_m3*s.rho_kg_m3/s.nodes,Cnode=mNode*s.cp_J_kgK,dE=new Float64Array(T.length);
  for(let i=0;i<T.length-1;i++){
    const q=s.axialConductance_W_K*(T[i]-T[i+1]),e=q*dt_s;
    dE[i]-=e;dE[i+1]+=e;
  }
  for(let i=0;i<T.length;i++)T[i]=clamp(T[i]+dE[i]/Cnode,s.Tcold_C,s.Thot_C);
  sortFiniteTank(st);
}
function tankStandingLoss(st,ambientC,dt_s=HOUR_S){
  const s=st.spec;if(s.capacity_J<=0)return 0;
  if(s.model==='finiteStratified'){
    const T=st.nodeTemps_C,mNode=s.volume_m3*s.rho_kg_m3/s.nodes,Cnode=mNode*s.cp_J_kgK,ua=s.UA_W_K/s.nodes;
    let loss=0;
    for(let i=0;i<T.length;i++){
      const q=Math.max(0,ua*(T[i]-ambientC)),maxE=Cnode*Math.max(0,T[i]-s.Tcold_C),e=Math.min(maxE,q*dt_s);
      T[i]-=e/Cnode;loss+=e;
    }
    st.loss_J+=loss;finiteTankAxialConduction(st,dt_s);syncTankEnergy(st);return loss;
  }
  const q=Math.max(0,s.UA_W_K*(tankMeanTemperatureC(st)-ambientC));
  const loss=Math.min(st.E_J,q*dt_s);st.E_J-=loss;st.loss_J+=loss;return loss;
}
function tankCharge(st,input_W,inputTempC,dt_s=HOUR_S){
  const s=st.spec;if(!(input_W>0)||s.capacity_J<=0)return 0;
  if(inputTempC<s.Thot_C-1e-9)return 0;
  if(s.model==='finiteStratified'){
    syncTankEnergy(st);
    const room=Math.max(0,s.capacity_J-st.E_J),accepted=Math.min(input_W,s.maxCharge_W,room/(dt_s*s.chargeEfficiency));
    let e=accepted*dt_s*s.chargeEfficiency,mNode=s.volume_m3*s.rho_kg_m3/s.nodes,Cnode=mNode*s.cp_J_kgK,T=st.nodeTemps_C;
    for(let i=0;i<T.length&&e>0;i++){
      const cap=Cnode*Math.max(0,s.Thot_C-T[i]),add=Math.min(e,cap);T[i]+=add/Cnode;e-=add;
    }
    sortFiniteTank(st);st.chargeInput_J+=accepted*dt_s;return accepted;
  }
  const room=Math.max(0,s.capacity_J-st.E_J),maxInputByRoom=room/(dt_s*s.chargeEfficiency);
  const accepted=Math.min(input_W,s.maxCharge_W,maxInputByRoom);st.E_J+=accepted*dt_s*s.chargeEfficiency;st.chargeInput_J+=accepted*dt_s;return accepted;
}
function tankDischarge(st,request_W,minDeliveryTempC,dt_s=HOUR_S){
  const s=st.spec;if(!(request_W>0)||s.capacity_J<=0)return 0;
  if(tankTopTemperatureC(st)<minDeliveryTempC-1e-9)return 0;
  if(s.model==='finiteStratified'){
    syncTankEnergy(st);
    const usableNodeEnergy=()=>{
      const mNode=s.volume_m3*s.rho_kg_m3/s.nodes,Cnode=mNode*s.cp_J_kgK;
      return Array.from(st.nodeTemps_C).reduce((e,T)=>e+Cnode*Math.max(0,T-Math.max(s.Tcold_C,minDeliveryTempC)),0);
    };
    const usable=usableNodeEnergy(),delivered=Math.min(request_W,s.maxDischarge_W,usable*s.dischargeEfficiency/dt_s);
    let e=delivered*dt_s/s.dischargeEfficiency,mNode=s.volume_m3*s.rho_kg_m3/s.nodes,Cnode=mNode*s.cp_J_kgK,T=st.nodeTemps_C;
    for(let i=0;i<T.length&&e>0;i++){
      const floor=Math.max(s.Tcold_C,minDeliveryTempC),cap=Cnode*Math.max(0,T[i]-floor),take=Math.min(e,cap);T[i]-=take/Cnode;e-=take;
    }
    sortFiniteTank(st);st.dischargeOutput_J+=delivered*dt_s;return delivered;
  }
  let usable_J=st.E_J;
  if(s.model==='mixed'){
    const mean=tankMeanTemperatureC(st);
    usable_J=s.volume_m3*s.rho_kg_m3*s.cp_J_kgK*Math.max(0,mean-Math.max(s.Tcold_C,minDeliveryTempC));
  }
  const maxOutByEnergy=Math.min(st.E_J,usable_J)*s.dischargeEfficiency/dt_s;
  const delivered=Math.min(request_W,s.maxDischarge_W,maxOutByEnergy);st.E_J-=delivered*dt_s/s.dischargeEfficiency;st.dischargeOutput_J+=delivered*dt_s;return delivered;
}
function tankCapex(stOrSpec){
  const s=stOrSpec.spec??normalizeTankSpec(stOrSpec),premium=(s.model==='idealStratified'||s.model==='finiteStratified')?s.stratificationPremium:1;
  return s.capexFixed+s.capexPerM3*s.volume_m3*premium;
}
function tankSnapshot(st){
  const out={model:st.spec.model,volume_m3:st.spec.volume_m3,SOC:tankSOC(st),E_kWh:kWh(st.E_J),top_C:tankTopTemperatureC(st),mean_C:tankMeanTemperatureC(st),loss_kWh:kWh(st.loss_J),charge_kWh:kWh(st.chargeInput_J),discharge_kWh:kWh(st.dischargeOutput_J)};
  if(st.spec.model==='finiteStratified')out.nodeTemperatures_C=Array.from(st.nodeTemps_C);
  return out;
}

/* ---------- 2R2C building ---------- */
function normalizeBuildingSpec(s={}){
  const x={Roa_K_W:s.Roa_K_W??0.00018,Ram_K_W:s.Ram_K_W??0.00008,Cair_J_K:s.Cair_J_K??8e7,Cmass_J_K:s.Cmass_J_K??1.4e9,
    initialAir_C:s.initialAir_C??21,initialMass_C:s.initialMass_C??21,comfortMin_C:s.comfortMin_C??20,comfortMax_C:s.comfortMax_C??23};
  if(!(x.Roa_K_W>0&&x.Ram_K_W>0&&x.Cair_J_K>0&&x.Cmass_J_K>0&&x.comfortMax_C>x.comfortMin_C))throw new Error('invalid building spec');return x;
}
function createBuildingState(spec){const s=normalizeBuildingSpec(spec);return{spec:s,Tair_C:s.initialAir_C,Tmass_C:s.initialMass_C,degreeHoursBelow:0,degreeHoursAbove:0,occupiedDegreeHoursBelow:0,occupiedDegreeHoursAbove:0}}
function building2R2CStep(state,{Tout_C,gains_W=0,Qhvac_W=0,Qair_W=null,Qmass_W=0,dt_s=HOUR_S,comfortMin_C=null,comfortMax_C=null,occupied=true}={}){
  const s=state.spec,qa=Qair_W==null?Qhvac_W:Qair_W,qm=Qmass_W??0,ao=dt_s/(s.Cair_J_K*s.Roa_K_W),am=dt_s/(s.Cair_J_K*s.Ram_K_W),ma=dt_s/(s.Cmass_J_K*s.Ram_K_W);
  const A11=1+ao+am,A12=-am,A21=-ma,A22=1+ma;
  const b1=state.Tair_C+ao*Tout_C+dt_s*(gains_W+qa)/s.Cair_J_K,b2=state.Tmass_C+dt_s*qm/s.Cmass_J_K;
  const det=A11*A22-A12*A21;
  const Tair=(b1*A22-A12*b2)/det,Tmass=(A11*b2-b1*A21)/det;
  state.Tair_C=Tair;state.Tmass_C=Tmass;
  const lo=comfortMin_C??s.comfortMin_C,hi=comfortMax_C??s.comfortMax_C;
  const below=Math.max(0,lo-Tair)*dt_s/HOUR_S,above=Math.max(0,Tair-hi)*dt_s/HOUR_S;
  state.degreeHoursBelow+=below;state.degreeHoursAbove+=above;if(occupied){state.occupiedDegreeHoursBelow+=below;state.occupiedDegreeHoursAbove+=above;}
  return{Tair_C:Tair,Tmass_C:Tmass};
}
function hvacPowerForTarget(state,{Tout_C,gains_W=0,targetAir_C,dt_s=HOUR_S,min_W=-Infinity,max_W=Infinity,deliveryToMassFraction=0}){
  const f=clamp(deliveryToMassFraction,0,1);
  const clone=q=>{const z={spec:state.spec,Tair_C:state.Tair_C,Tmass_C:state.Tmass_C,degreeHoursBelow:0,degreeHoursAbove:0,occupiedDegreeHoursBelow:0,occupiedDegreeHoursAbove:0};return building2R2CStep(z,{Tout_C,gains_W,Qair_W:q*(1-f),Qmass_W:q*f,dt_s,occupied:false}).Tair_C};
  const t0=clone(0),t1=clone(1000),sens=(t1-t0)/1000;if(Math.abs(sens)<1e-15)return 0;
  return clamp((targetAir_C-t0)/sens,min_W,max_W);
}

/* ---------- profiles ---------- */
function syntheticProfiles(o={}){
  const n=o.hours??YEAR_H,mean=o.meanOutdoorC??10,seasonAmp=o.seasonalAmplitudeK??9,dayAmp=o.diurnalAmplitudeK??2;
  const out=new Float64Array(n),gains=new Float64Array(n),elec=new Float64Array(n),gas=new Float64Array(n),wasteT=new Float64Array(n),wasteQ=new Float64Array(n),dew=new Float64Array(n),outRH=new Float64Array(n),moisture=new Float64Array(n),occupiedProfile=new Uint8Array(n),ventFlow=new Float64Array(n),hotSink=new Float64Array(n),hotTarget=new Float64Array(n);
  for(let h=0;h<n;h++){
    const day=h/24,hr=h%24;out[h]=mean+seasonAmp*Math.cos(2*Math.PI*(day-205)/365)+dayAmp*Math.cos(2*Math.PI*(hr-15)/24);
    const start=o.occupiedStartHour??7,end=o.occupiedEndHour??19,occupied=hr>=start&&hr<end;occupiedProfile[h]=occupied?1:0;gains[h]=occupied?(o.occupiedGains_W??30000):(o.unoccupiedGains_W??12000);ventFlow[h]=occupied?(o.occupiedVentilation_m3_s??6):(o.unoccupiedVentilation_m3_s??0.5);hotSink[h]=occupied?(o.occupiedHotSink_W??18000):(o.unoccupiedHotSink_W??5000);hotTarget[h]=o.hotSinkTarget_C??55;
    elec[h]=(hr>=1&&hr<6)?(o.nightElec??0.12):((hr>=17&&hr<21)?(o.peakElec??0.34):(o.dayElec??0.22));
    gas[h]=o.gasPrice??0.075;
    wasteT[h]=o.wasteTemp_C??50;wasteQ[h]=occupied?(o.wasteAvailable_W??35000):(o.wasteOff_W??8000);dew[h]=o.indoorDewPoint_C??14;outRH[h]=clamp((o.outdoorRH??0.72)+0.10*Math.cos(2*Math.PI*(hr-5)/24),0.25,0.98);moisture[h]=occupied?(o.occupiedMoistureGain_kg_s??0.003):(o.unoccupiedMoistureGain_kg_s??0.00025);
  }
  return{outdoor_C:out,internalGains_W:gains,electricity_per_kWh:elec,gas_per_kWh:gas,wasteTemp_C:wasteT,wasteAvailable_W:wasteQ,indoorDewPoint_C:dew,outdoorRH:outRH,internalMoisture_kg_s:moisture,occupied:occupiedProfile,ventilationFlow_m3_s:ventFlow,hotSinkDemand_W:hotSink,hotSinkTarget_C:hotTarget};
}
function percentile(a,p){const x=Array.from(a).sort((u,v)=>u-v),q=clamp(p,0,1)*(x.length-1),lo=Math.floor(q),hi=Math.ceil(q);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(q-lo)}

/* ---------- operation and delivery semantics ---------- */
function normalizeOperation(project={}){
  const o=project.operation??{};
  return{occupiedComfortMin_C:o.occupiedComfortMin_C??project.building?.comfortMin_C??20,occupiedComfortMax_C:o.occupiedComfortMax_C??project.building?.comfortMax_C??23,
    unoccupiedHeatSetback_C:o.unoccupiedHeatSetback_C??15,unoccupiedCoolSetback_C:o.unoccupiedCoolSetback_C??30,prestartHours:Math.max(0,o.prestartHours??1),
    allowUnoccupiedShutdown:o.allowUnoccupiedShutdown??true,airHeatingMaxSupply_C:o.airHeatingMaxSupply_C??35,airCoolingMinSupply_C:o.airCoolingMinSupply_C??14,
    airDensity_kg_m3:o.airDensity_kg_m3??1.2,airCp_J_kgK:o.airCp_J_kgK??1006};
}
function deliveryToMassFraction(terminal={}){
  if(Number.isFinite(terminal.deliveryToMassFraction))return clamp(terminal.deliveryToMassFraction,0,1);
  const t=terminal.type??'radiator';if(t==='floor'||t==='tabs')return .9;if(t==='ceiling')return .65;if(t==='radiantPanel')return .45;return 0;
}
function ventilationAirHeatingCapacityW(flow_m3_s,roomC,op){return Math.max(0,flow_m3_s*op.airDensity_kg_m3*op.airCp_J_kgK*(op.airHeatingMaxSupply_C-roomC));}
function ventilationAirCoolingCapacityW(flow_m3_s,roomC,op){return Math.max(0,flow_m3_s*op.airDensity_kg_m3*op.airCp_J_kgK*(roomC-op.airCoolingMinSupply_C));}
function heatingDeliverySplit(terminal,total_W,flow_m3_s,roomC,op){const q=Math.max(0,total_W);if(terminal.type==='ventilationAir'){const air=Math.min(q,ventilationAirHeatingCapacityW(flow_m3_s,roomC,op));return{air_W:air,localCoil_W:0,hydronic_W:0,other_W:Math.max(0,q-air)};}if(terminal.type==='airPlusLocalCoils'){const air=Math.min(q,ventilationAirHeatingCapacityW(flow_m3_s,roomC,op)),local=Math.min(Math.max(0,q-air),terminal.localCoil_W??0);return{air_W:air,localCoil_W:local,hydronic_W:local,other_W:Math.max(0,q-air-local)};}return{air_W:0,localCoil_W:0,hydronic_W:q,other_W:0};}
function operationBounds(project,p,h){
  const o=normalizeOperation(project),occ=!!(p.occupied?.[h]??1),n=p.outdoor_C.length;
  let prestart=false;if(!occ&&o.prestartHours>0&&p.occupied){for(let k=1;k<=Math.ceil(o.prestartHours);k++){if(p.occupied[(h+k)%n]){prestart=true;break}}}
  return{occupied:occ,prestart,comfortMin_C:occ?o.occupiedComfortMin_C:(prestart?o.occupiedComfortMin_C:o.unoccupiedHeatSetback_C),comfortMax_C:occ?o.occupiedComfortMax_C:o.unoccupiedCoolSetback_C,operation:o};
}


/* ---------- v0.14 free-cooling ---------- */
function normalizeDirectHXGeometry(g=null){
  if(!g)return null;
  const side=s=>({fluidSpec:s?.fluidSpec??null,mdot_kg_s:Math.max(0,s?.mdot_kg_s??0),hydraulicDiameter_m:Math.max(0,s?.hydraulicDiameter_m??0),flowArea_m2:Math.max(0,s?.flowArea_m2??0),roughness_m:Math.max(0,s?.roughness_m??1e-5),T_C:Number.isFinite(s?.T_C)?s.T_C:null});
  return{hotSide:side(g.hotSide),coldSide:side(g.coldSide),heatTransferArea_m2:Math.max(0,g.heatTransferArea_m2??0),wallResistance_m2K_W:Math.max(0,g.wallResistance_m2K_W??0),hotFoulingResistance_m2K_W:Math.max(0,g.hotFoulingResistance_m2K_W??0),coldFoulingResistance_m2K_W:Math.max(0,g.coldFoulingResistance_m2K_W??0)};
}
function sourceWaterDirectHXLimit(src,{sourceWater_C,chilledSupply_C,chilledReturn_C}){
  const g=src.directHXGeometry;if(!g)return{available:false,reason:'no-direct-HX-geometry'};
  if(!Number.isFinite(sourceWater_C)||!Number.isFinite(chilledSupply_C)||!Number.isFinite(chilledReturn_C)||!(chilledReturn_C>chilledSupply_C))return{available:false,reason:'invalid-source-or-chilled-water-temperature'};
  if(!(g.heatTransferArea_m2>0&&g.hotSide.mdot_kg_s>0&&g.coldSide.mdot_kg_s>0))return{available:false,reason:'invalid-direct-HX-geometry-or-flow'};
  const hotMean=(chilledReturn_C+chilledSupply_C)/2,coldMean=sourceWater_C;
  const hx=directHXFromGeometry({...g,hotSide:{...g.hotSide,T_C:Number.isFinite(g.hotSide.T_C)?g.hotSide.T_C:hotMean},coldSide:{...g.coldSide,T_C:Number.isFinite(g.coldSide.T_C)?g.coldSide.T_C:coldMean},hotIn_C:chilledReturn_C,coldIn_C:sourceWater_C});
  if(!hx.available)return{available:false,reason:hx.reason??'direct-HX-unavailable',hx};
  const requiredAtDesignFlow_W=g.hotSide.mdot_kg_s*hx.hot.properties.cp_J_kgK*(chilledReturn_C-chilledSupply_C);
  const supplyTargetReached=hx.hotOut_C<=chilledSupply_C+1e-9;
  const nameplateCap_W=src.maxCapacity_W>0?src.maxCapacity_W:Infinity;
  return{available:true,eligible:supplyTargetReached,reason:supplyTargetReached?null:'chilled-supply-target-not-reached',capacity_W:supplyTargetReached?Math.min(hx.Q_W,requiredAtDesignFlow_W,nameplateCap_W):0,requiredAtDesignFlow_W,supplyTargetReached,hx};
}
function normalizeFreeCooling(fc={}){
  const air=fc.airside??{},amb=fc.ambientLoop??{},src=fc.sourceWater??{};
  return{
    airside:{enabled:air.enabled??false,maxAirFlow_m3_s:Math.max(0,air.maxAirFlow_m3_s??0),minRoomOutdoorDelta_K:air.minRoomOutdoorDelta_K??1,maxOutdoorDewPoint_C:air.maxOutdoorDewPoint_C??16,useEnthalpyHighLimit:air.useEnthalpyHighLimit??true,extraStaticPressure_Pa:Math.max(0,air.extraStaticPressure_Pa??80),fanEfficiency:clamp(air.fanEfficiency??.65,.05,1),capex:Math.max(0,air.capex??0)},
    ambientLoop:{enabled:amb.enabled??false,basis:amb.basis??'dryBulb',approach_K:Math.max(0,amb.approach_K??4),maxCapacity_W:Math.max(0,amb.maxCapacity_W??0),pump_W_per_kW:Math.max(0,amb.pump_W_per_kW??12),fan_W_per_kW:Math.max(0,amb.fan_W_per_kW??18),capex:Math.max(0,amb.capex??0)},
    sourceWater:{enabled:src.enabled??false,approach_K:Math.max(0,src.approach_K??2),maxCapacity_W:Math.max(0,src.maxCapacity_W??0),pump_W_per_kW:Math.max(0,src.pump_W_per_kW??18),capex:Math.max(0,src.capex??0),directHXGeometry:normalizeDirectHXGeometry(src.directHXGeometry??src.geometry??null)}
  };
}
function freeCoolingHour(fc,{coolRequest_W,roomT_C,outdoorT_C,outdoorRH=.5,outdoorWetBulb_C=null,sourceWater_C=null,chilledSupply_C=16,chilledReturn_C=20,pressure_Pa=101325}){
  let remaining=Math.max(0,coolRequest_W),delivered=0,electric_W=0;const modes=[];
  const take=(mode,availableCapacity_W,{electricity_W_perCooling_W=0,source_C=null,supplyTemperature_C=null,storageEligible=false,extra={}}={})=>{
    const cap=Math.max(0,+availableCapacity_W||0),q=Math.min(remaining,cap),e=q*Math.max(0,+electricity_W_perCooling_W||0);remaining-=q;delivered+=q;electric_W+=e;
    const row={mode,cooling_W:q,electric_W:e,availableCapacity_W:cap,unusedEligible_W:Math.max(0,cap-q),source_C,supplyTemperature_C,storageEligible,...extra};modes.push(row);return row;
  };
  const air=fc.airside;if(air.enabled&&air.maxAirFlow_m3_s>0){
    const xOut=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH,0,1),pressure_Pa),dewOut=dewPointFromHumidityRatio(xOut,pressure_Pa),hOut=moistAirEnthalpy_kJ_kgDA(outdoorT_C,xOut),xRoom=humidityRatioFromRH(roomT_C,.5,pressure_Pa),hRoom=moistAirEnthalpy_kJ_kgDA(roomT_C,xRoom);
    const eligible=roomT_C-outdoorT_C>=air.minRoomOutdoorDelta_K&&dewOut<=air.maxOutdoorDewPoint_C&&(!air.useEnthalpyHighLimit||hOut<hRoom);
    if(eligible){const rho=dryAirDensity_kg_m3(outdoorT_C,xOut,pressure_Pa),cap=air.maxAirFlow_m3_s*rho*1006*Math.max(0,roomT_C-outdoorT_C),fanRatio=cap>0?(air.maxAirFlow_m3_s*air.extraStaticPressure_Pa/Math.max(air.fanEfficiency,1e-6))/cap:0;take('airside',cap,{electricity_W_perCooling_W:fanRatio,source_C:outdoorT_C,supplyTemperature_C:null,storageEligible:false,extra:{eligible:true}});}
    else modes.push({mode:'airside',cooling_W:0,electric_W:0,availableCapacity_W:0,unusedEligible_W:0,source_C:outdoorT_C,supplyTemperature_C:null,storageEligible:false,eligible:false});
  }
  const amb=fc.ambientLoop;if(amb.enabled&&amb.maxCapacity_W>0){const source=(amb.basis==='wetBulb'&&Number.isFinite(outdoorWetBulb_C))?outdoorWetBulb_C:outdoorT_C,eligible=source+amb.approach_K<=chilledSupply_C;if(eligible)take('ambientLoop',amb.maxCapacity_W,{electricity_W_perCooling_W:(amb.pump_W_per_kW+amb.fan_W_per_kW)/1000,source_C:source,supplyTemperature_C:chilledSupply_C,storageEligible:true,extra:{eligible:true}});else modes.push({mode:'ambientLoop',cooling_W:0,electric_W:0,availableCapacity_W:0,unusedEligible_W:0,source_C:source,supplyTemperature_C:chilledSupply_C,storageEligible:true,eligible:false});}
  const sw=fc.sourceWater;if(sw.enabled&&Number.isFinite(sourceWater_C)){
    if(sw.directHXGeometry){const lim=sourceWaterDirectHXLimit(sw,{sourceWater_C,chilledSupply_C,chilledReturn_C});if(lim.available&&lim.eligible&&lim.capacity_W>0)take('sourceWater',lim.capacity_W,{electricity_W_perCooling_W:sw.pump_W_per_kW/1000,source_C:sourceWater_C,supplyTemperature_C:chilledSupply_C,storageEligible:true,extra:{model:'geometryPropertyUA',eligible:true,UA_W_K:lim.hx.UA_W_K,U_W_m2K:lim.hx.U_W_m2K,hxPotential_W:lim.hx.Q_W,requiredAtDesignFlow_W:lim.requiredAtDesignFlow_W,supplyTargetReached:true,hotOut_C:lim.hx.hotOut_C,coldOut_C:lim.hx.coldOut_C}});else modes.push({mode:'sourceWater',model:'geometryPropertyUA',cooling_W:0,electric_W:0,availableCapacity_W:0,unusedEligible_W:0,source_C:sourceWater_C,supplyTemperature_C:chilledSupply_C,storageEligible:true,eligible:false,reason:lim.reason,UA_W_K:lim.hx?.UA_W_K??null,hxPotential_W:lim.hx?.Q_W??null,supplyTargetReached:lim.supplyTargetReached??false});}
    else if(sw.maxCapacity_W>0){const eligible=sourceWater_C+sw.approach_K<=chilledSupply_C;if(eligible)take('sourceWater',sw.maxCapacity_W,{electricity_W_perCooling_W:sw.pump_W_per_kW/1000,source_C:sourceWater_C,supplyTemperature_C:chilledSupply_C,storageEligible:true,extra:{model:'legacyApproachCapacity',eligible:true}});else modes.push({mode:'sourceWater',model:'legacyApproachCapacity',cooling_W:0,electric_W:0,availableCapacity_W:0,unusedEligible_W:0,source_C:sourceWater_C,supplyTemperature_C:chilledSupply_C,storageEligible:true,eligible:false});}
  }
  return{requested_W:Math.max(0,coolRequest_W),delivered_W:delivered,remaining_W:remaining,electric_W,modes};
}
function freeCoolingResidualColdSourceProfilesHour(boundProfiles,fcResult){
  const out={},byMode=new Map((fcResult?.modes??[]).map(x=>[x.mode,x]));
  for(const [id,src] of Object.entries(boundProfiles??{})){
    if(src?.availableMode!=='freeCoolingResidual')continue;const m=byMode.get(src.freeCoolingMode),eligible=!!m?.storageEligible&&Math.max(0,+m.unusedEligible_W||0)>0;
    out[id]={...src,available_W:eligible?Math.max(0,+m.unusedEligible_W||0):0,supplyTemperature_C:eligible?+m.supplyTemperature_C:NaN,electricity_W_perCooling_W:eligible?Math.max(0,+m.electricity_W_perCooling_W||src.electricity_W_perCooling_W||0):Math.max(0,+src.electricity_W_perCooling_W||0),freeCoolingModeResult:m??null};
  }
  return out;
}
function airsideHydronicConverterColdSourceProfilesHour(boundProfiles,fcResult,{hour=0,outdoorT_C,outdoorRH=.5,pressure_Pa=101325,design=null}={}){
  const out={},airMode=(fcResult?.modes??[]).find(x=>x.mode==='airside'),air=design?.freeCooling?.airside??{};
  for(const [sid,src] of Object.entries(boundProfiles??{})){
    if(src?.availableMode!=='airsideToHydronicConverter')continue;const c=src.airsideHydronicConverter??{},ret=+c.hydronicReturnTemperature_C?.[hour],airCap=Math.max(0,+airMode?.availableCapacity_W||0),airUsed=Math.max(0,+airMode?.cooling_W||0),airFraction=airCap>0?clamp(1-airUsed/airCap,0,1):0,airFlow=Math.max(0,+air.maxAirFlow_m3_s||0)*airFraction;
    let available_W=0,supplyTemperature_C=NaN,electric_W=0,fan_W=0,pump_W=0,hx=null,eligible=false,reason=null,outdoorEnthalpy_kJ_kgDA=null;
    try{
      const x=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH,0,1),pressure_Pa);outdoorEnthalpy_kJ_kgDA=moistAirEnthalpy_kJ_kgDA(outdoorT_C,x);
      if(!airMode?.eligible)reason='airside-economizer-ineligible';else if(!(airFlow>0))reason='no-residual-airflow';else if(!(Number.isFinite(ret)&&ret>outdoorT_C))reason='no-positive-air-to-hydronic-temperature-potential';else{
        const rhoAir=dryAirDensity_kg_m3(outdoorT_C,x,pressure_Pa),airCapacity_W_K=airFlow*rhoAir*1006,fp=resolveFluidProperties(c.hydronicFluidSpec,(ret+outdoorT_C)/2),hydCapacity_W_K=c.hydronicVolumeFlow_m3_s*fp.rho_kg_m3*fp.cp_J_kgK;
        hx=directHX({UA_W_K:c.UA_W_K,hotCapacity_W_K:hydCapacity_W_K,coldCapacity_W_K:airCapacity_W_K,hotIn_C:ret,coldIn_C:outdoorT_C});available_W=Math.min(Math.max(0,hx.Q_W),Math.max(0,c.maxTransfer_W??Infinity));supplyTemperature_C=ret-available_W/Math.max(hydCapacity_W_K,1e-12);eligible=available_W>0;
        if(eligible){fan_W=airFlow*Math.max(0,c.airPressureDrop_Pa)/Math.max(c.fanEfficiency,1e-6);pump_W=c.hydronicVolumeFlow_m3_s*Math.max(0,c.hydronicPressureDrop_Pa)/Math.max(c.pumpEfficiency,1e-6);electric_W=fan_W+pump_W;}
      }
    }catch(e){reason=e.message;available_W=0;}
    out[sid]={...src,available_W,supplyTemperature_C,electricity_W_perCooling_W:available_W>0?electric_W/available_W:0,converterResult:{eligible,reason,airFlow_m3_s:airFlow,residualAirFraction:airFraction,outdoorT_C,outdoorEnthalpy_kJ_kgDA,hydronicReturnTemperature_C:Number.isFinite(ret)?ret:null,supplyTemperature_C:Number.isFinite(supplyTemperature_C)?supplyTemperature_C:null,available_W,fan_W,pump_W,electric_W,latentCredit_W:0,UA_W_K:c.UA_W_K,hx}};
  }
  return out;
}

function exhaustAirHydronicConverterColdSourceProfilesHour(boundProfiles,processExhaust,{hour=0,roomT_C,zoneHumidityRatio_kg_kgDA,outdoorT_C,outdoorRH=.5,pressure_Pa=101325}={}){
  const out={},xOut=humidityRatioFromRH(outdoorT_C,clamp(outdoorRH,0,1),pressure_Pa),hOut=moistAirEnthalpy_kJ_kgDA(outdoorT_C,xOut),xZone=Math.max(0,+zoneHumidityRatio_kg_kgDA||0),hZone=moistAirEnthalpy_kJ_kgDA(roomT_C,xZone);
  for(const [sid,src] of Object.entries(boundProfiles??{})){
    if(src?.availableMode!=='exhaustAirToHydronicConverter')continue;const c=src.exhaustHydronicConverter??{},ret=+c.hydronicReturnTemperature_C?.[hour];let airFlow=0,streamId=null,streamFound=true;
    let exhaustT_C=roomT_C,exhaustX=xZone;
    if(c.airStreamMode==='zoneReturn')airFlow=Math.max(0,coldProfileValue(c.airFlow_m3_s,hour));
    else if(c.airStreamMode==='explicitExhaust'){airFlow=Math.max(0,coldProfileValue(c.airFlow_m3_s,hour));exhaustT_C=coldProfileValue(c.exhaustTemperature_C,hour);const rh=coldProfileValue(c.exhaustRH_frac,hour);if(!(Number.isFinite(exhaustT_C)&&Number.isFinite(rh)&&rh>=0&&rh<=1))streamFound=false;else exhaustX=humidityRatioFromRH(exhaustT_C,rh,pressure_Pa);}
    else{streamId=c.processExhaustPathId;const path=(processExhaust?.paths??[]).find(x=>String(x.id??'')===String(streamId));if(path){airFlow=Math.max(0,Number.isFinite(+path.hydronicRecoveryExhaustFlow_m3_s)?+path.hydronicRecoveryExhaustFlow_m3_s:(+path.exhaustAir_m3_s||0));if(Number.isFinite(+path.hydronicRecoveryExhaustTemperature_C))exhaustT_C=+path.hydronicRecoveryExhaustTemperature_C;else if(Number.isFinite(+path.postSensibleRecoveryExhaustTemperature_C))exhaustT_C=+path.postSensibleRecoveryExhaustTemperature_C;if(Number.isFinite(+path.postSensibleRecoveryExhaustHumidityRatio_kg_kgDA))exhaustX=Math.max(0,+path.postSensibleRecoveryExhaustHumidityRatio_kg_kgDA);}else streamFound=false;}
    const exhaustH=moistAirEnthalpy_kJ_kgDA(exhaustT_C,exhaustX),exhaustDewPoint_C=dewPointFromHumidityRatio(exhaustX,pressure_Pa);
    let available_W=0,supplyTemperature_C=NaN,electric_W=0,fan_W=0,pump_W=0,hx=null,eligible=false,reason=null,bypass=false,frostBypass=false;
    try{
      if(!streamFound)reason='process-exhaust-path-not-found';
      else if(!(airFlow>0))reason='no-exhaust-return-airflow';
      else if(exhaustT_C<c.frostBypassBelow_C){reason='frost-bypass';bypass=true;frostBypass=true;}
      else if(c.bypassControlMode==='outdoorEnthalpyAdvantage'&&!(hOut>=exhaustH+c.minimumOutdoorExhaustEnthalpyDifference_kJ_kgDA)){reason='enthalpy-bypass';bypass=true;}
      else if(!(Number.isFinite(ret)&&ret>exhaustT_C)){reason='no-positive-exhaust-to-hydronic-cold-potential';}
      else{
        const rhoAir=dryAirDensity_kg_m3(exhaustT_C,exhaustX,pressure_Pa),airCapacity_W_K=airFlow*rhoAir*1006,fp=resolveFluidProperties(c.hydronicFluidSpec,(ret+exhaustT_C)/2),hydCapacity_W_K=c.hydronicVolumeFlow_m3_s*fp.rho_kg_m3*fp.cp_J_kgK;
        hx=directHX({UA_W_K:c.UA_W_K,hotCapacity_W_K:hydCapacity_W_K,coldCapacity_W_K:airCapacity_W_K,hotIn_C:ret,coldIn_C:exhaustT_C});
        const rawQ=Math.max(0,hx.Q_W)*c.runAroundEffectiveness;available_W=Math.min(rawQ,Math.max(0,c.maxTransfer_W??Infinity));supplyTemperature_C=ret-available_W/Math.max(hydCapacity_W_K,1e-12);eligible=available_W>0;
        if(eligible){fan_W=airFlow*Math.max(0,c.airPressureDrop_Pa)/Math.max(c.fanEfficiency,1e-6);pump_W=c.hydronicVolumeFlow_m3_s*Math.max(0,c.hydronicPressureDrop_Pa)/Math.max(c.pumpEfficiency,1e-6);electric_W=fan_W+pump_W;}
      }
    }catch(e){reason=e.message;available_W=0;}
    out[sid]={...src,available_W,supplyTemperature_C,electricity_W_perCooling_W:available_W>0?electric_W/available_W:0,converterResult:{eligible,reason,bypass,frostBypass,airStreamMode:c.airStreamMode,airStreamId:streamId,airFlow_m3_s:airFlow,usesPostSensibleRecoveryExhaust:c.airStreamMode==='processExhaust'&&!((processExhaust?.paths??[]).find(x=>String(x.id??'')===String(streamId))?.explicitExhaustRecoveryOwnerId),usesAllocatedGraphExhaustBranch:c.airStreamMode==='processExhaust'&&!!((processExhaust?.paths??[]).find(x=>String(x.id??'')===String(streamId))?.explicitExhaustRecoveryOwnerId),exhaustTemperature_C:exhaustT_C,exhaustHumidityRatio_kg_kgDA:exhaustX,exhaustDewPoint_C,exhaustEnthalpy_kJ_kgDA:exhaustH,outdoorTemperature_C:outdoorT_C,outdoorHumidityRatio_kg_kgDA:xOut,outdoorEnthalpy_kJ_kgDA:hOut,hydronicReturnTemperature_C:Number.isFinite(ret)?ret:null,supplyTemperature_C:Number.isFinite(supplyTemperature_C)?supplyTemperature_C:null,available_W,fan_W,pump_W,electric_W,latentCredit_W:0,UA_W_K:c.UA_W_K,transferMode:c.transferMode,runAroundEffectiveness:c.runAroundEffectiveness,hx}};
  }
  return out;
}
function dispatchAirsideHydronicConvertersToColdStorageHour(phaseTopologyOwnership,coldStorageStates,sourceProfiles,{hour=0,alreadyChargedByStorage_W={},sourceAcceptanceCaps_W={}}={}){
  const rows=(phaseTopologyOwnership?.coldSourceDeliveries??[]).filter(r=>['airsideToHydronicConverter','exhaustAirToHydronicConverter'].includes(sourceProfiles?.[r.sourceComponentId]?.availableMode)),groups=new Map();for(const r of rows){if(!groups.has(r.sourceComponentId))groups.set(r.sourceComponentId,[]);groups.get(r.sourceComponentId).push(r);}let available_W=0,charged_W=0,electric_W=0;const byStorage_W={},bySource_W={},unusedBySource_W={},details=[],used={...alreadyChargedByStorage_W};
  for(const [sid,rs0] of [...groups].sort()){
    const src=sourceProfiles[sid],qPhysical=Math.max(0,coldProfileValue(src.available_W,hour)),cap=Number.isFinite(+sourceAcceptanceCaps_W?.[sid])?Math.max(0,+sourceAcceptanceCaps_W[sid]):Infinity,q0=Math.min(qPhysical,cap),ts=coldProfileValue(src.supplyTemperature_C,hour),fixed=rs0.some(r=>r.allocation?.mode==='fixedShares'),rs=[...rs0].sort((a,b)=>((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.destinationComponentId.localeCompare(b.destinationComponentId));let rem=q0,acc=0;available_W+=q0;
    for(const r of rs){if(r.destinationType!=='storage')continue;const st=coldStorageStates?.get?.(r.destinationComponentId);if(!st)continue;const raw=fixed?q0*Math.max(0,+r.allocation?.share||0):rem,remainingPower=Math.max(0,st.spec.maxCharge_W-(used[r.destinationComponentId]??0)),allocation=Math.min(raw,remainingPower),x=coldStorageCharge(st,allocation,ts,HOUR_S);used[r.destinationComponentId]=(used[r.destinationComponentId]??0)+x;byStorage_W[r.destinationComponentId]=(byStorage_W[r.destinationComponentId]??0)+x;acc+=x;charged_W+=x;if(!fixed)rem=Math.max(0,rem-x);details.push({sourceComponentId:sid,storageComponentId:r.destinationComponentId,availableAllocation_W:allocation,accepted_W:x,supplyTemperature_C:ts,converterResult:src.converterResult??null});
    }
    bySource_W[sid]=acc;unusedBySource_W[sid]=Math.max(0,q0-acc);electric_W+=acc*Math.max(0,+src.electricity_W_perCooling_W||0);
  }
  return{available_W,charged_W,unused_W:Math.max(0,available_W-charged_W),electric_W,byStorage_W,bySource_W,unusedBySource_W,details};
}
function exhaustRecoveryHydronicFirstReservationW(row,project,hour){
  const v=row?.allocation?.hydronicFirstReservation_W;if(typeof v==='string')return Math.max(0,+project?.profiles?.[v]?.[hour]||0);return Math.max(0,coldProfileValue(v,hour)||0);
}
function planHydronicFirstExhaustRecoveryHour(project={},profiles={},hour=0,{roomT_C,zoneHumidityRatio_kg_kgDA,outdoorT_C,outdoorRH,pressure_Pa=101325,phaseTopologyOwnership={},coldStorageStates,coldSourceProfiles={}}={}){
  const rows=(phaseTopologyOwnership?.exhaustRecovery??[]).filter(r=>r.allocation?.mode==='seriesPriority'&&r.allocation?.priority?.[0]==='hydronic');if(!rows.length)return null;
  const raw=project.processExhaust??project.processExhaustPaths??[],paths=Array.isArray(raw)?raw:(raw&&raw.enabled!==false?[raw]:[]),pathMap=new Map(paths.filter(Boolean).map(x=>[String(x.id??''),x])),rhoZone=dryAirDensity_kg_m3(roomT_C,Math.max(0,+zoneHumidityRatio_kg_kgDA||0),pressure_Pa),stub=[];
  const getProfile=(ref,fallback)=>{const a=ref&&profiles?.[ref];return a&&Number.isFinite(+a[hour])?+a[hour]:fallback};
  for(const r of rows){const q=pathMap.get(String(r.processExhaustPathId));if(!q||q.enabled===false)continue;const active=clamp(getProfile(q.scheduleProfileRef,q.scheduleFraction??1),0,1),flow=Math.max(0,getProfile(q.exhaustFlowProfileRef,q.exhaustAir_m3_s??0))*active;stub.push({id:q.id??null,exhaustAir_m3_s:flow,exhaustDryAir_kg_s:flow*rhoZone,hydronicRecoveryExhaustFlow_m3_s:flow,hydronicRecoveryExhaustTemperature_C:roomT_C,postSensibleRecoveryExhaustHumidityRatio_kg_kgDA:Math.max(0,+zoneHumidityRatio_kg_kgDA||0)});}
  const sourceProfiles=exhaustAirHydronicConverterColdSourceProfilesHour(coldSourceProfiles,{paths:stub},{hour,roomT_C,zoneHumidityRatio_kg_kgDA,outdoorT_C,outdoorRH,pressure_Pa}),requestedBySource_W={};for(const r of rows)requestedBySource_W[r.componentId]=exhaustRecoveryHydronicFirstReservationW(r,project,hour);
  const clones=new Map();for(const [id,st] of(coldStorageStates??new Map()))clones.set(id,cloneColdStorageState(st));const preview=dispatchAirsideHydronicConvertersToColdStorageHour(phaseTopologyOwnership,clones,sourceProfiles,{hour,sourceAcceptanceCaps_W:requestedBySource_W});
  return{sourceProfiles,requestedBySource_W,preview,sourceIds:rows.map(r=>r.componentId)};
}
function mergeColdStorageChargeDispatch(...parts){
  const rows=parts.filter(Boolean),out={available_W:0,charged_W:0,unused_W:0,byStorage_W:{},bySource_W:{},unusedBySource_W:{},details:[]};
  for(const r of rows){out.available_W+=r.available_W??0;out.charged_W+=r.charged_W??0;out.unused_W+=r.unused_W??0;out.details.push(...(r.details??[]));for(const k of ['byStorage_W','bySource_W','unusedBySource_W'])for(const [id,q] of Object.entries(r[k]??{}))out[k][id]=(out[k][id]??0)+(+q||0);}return out;
}
function freeCoolingCapex(fc){return fc.airside.capex+fc.ambientLoop.capex+fc.sourceWater.capex;}
function normalizePV(pvSpec={}){return{enabled:pvSpec.enabled??false,capacity_kWp:Math.max(0,pvSpec.capacity_kWp??0),systemLossFraction:clamp(pvSpec.systemLossFraction??.14,0,.8),tempCoeff_per_K:pvSpec.tempCoeff_per_K??-.0038,inverterLimit_kW:pvSpec.inverterLimit_kW??null,exportAllowed:pvSpec.exportAllowed??true,exportPrice_per_kWh:Math.max(0,pvSpec.exportPrice_per_kWh??0),capex:pvSpec.capex??null,inverterReplacementYear:pvSpec.inverterReplacementYear??15};}
function normalizeHumidifier(h={}){return{enabled:h.enabled??false,type:h.type??'steamElectric',design_kg_h:Math.max(0,h.design_kg_h??0),electric_kWh_per_kg:h.electric_kWh_per_kg,water_kg_per_kg:h.water_kg_per_kg,capex:h.capex??null,replacementYear:h.replacementYear??12};}
function normalizeShading(sh={}){return{enabled:sh.enabled??false,type:sh.type??'externalVenetian',windowArea_m2:Math.max(0,sh.windowArea_m2??0),closedMultiplier:sh.closedMultiplier??null,minIrradiance_W_m2:sh.minIrradiance_W_m2??180,capex:sh.capex??null};}


/* ---------- v0.19 ground / borefield seasonal coupling ---------- */
function normalizeGroundCoupling(g={}){
  const enabled=g.enabled??false,undisturbedTemp_C=g.undisturbedTemp_C??11,initialTemp_C=g.initialTemp_C??undisturbedTemp_C;
  return{enabled,kind:g.kind??'borefield',undisturbedTemp_C,initialTemp_C,
    effectiveHeatCapacity_J_K:Math.max(1,g.effectiveHeatCapacity_J_K??3.6e10),
    recoveryTimeConstant_days:Math.max(0.01,g.recoveryTimeConstant_days??180),
    minTemp_C:g.minTemp_C??0,maxTemp_C:g.maxTemp_C??28,approach_K:Math.max(0,g.approach_K??2),
    directHeatingEnabled:g.directHeatingEnabled??true,directCoolingEnabled:g.directCoolingEnabled??true,
    maxDirectHeating_W:Math.max(0,g.maxDirectHeating_W??Infinity),maxDirectCooling_W:Math.max(0,g.maxDirectCooling_W??Infinity),maxExtraction_W:Math.max(0,g.maxExtraction_W??Infinity),maxInjection_W:Math.max(0,g.maxInjection_W??Infinity),
    pump_W_per_kW:Math.max(0,g.pump_W_per_kW??12),useAsHeatPumpSource:g.useAsHeatPumpSource??true,
    hpTypeOverride:g.hpTypeOverride??'borehole',mechanicalCoolingRejectionToGround:g.mechanicalCoolingRejectionToGround??false,
    allowAmbientRejectionBackup:g.allowAmbientRejectionBackup??true,capex:Math.max(0,g.capex??0),longTerm:normalizeGroundLongTerm(g.longTerm??{})};
}
function createGroundState(spec={}){const g=spec.enabled===undefined?normalizeGroundCoupling(spec):spec;return{T_C:clamp(g.initialTemp_C,g.minTemp_C,g.maxTemp_C),injected_J:0,extracted_J:0,recovery_J:0,minT_C:clamp(g.initialTemp_C,g.minTemp_C,g.maxTemp_C),maxT_C:clamp(g.initialTemp_C,g.minTemp_C,g.maxTemp_C)};}
function groundRecoveryStep(state,spec,dt_s=HOUR_S){if(!spec.enabled)return 0;const tau=spec.recoveryTimeConstant_days*86400,f=1-Math.exp(-Math.max(0,dt_s)/tau),dE=(spec.undisturbedTemp_C-state.T_C)*spec.effectiveHeatCapacity_J_K*f;state.T_C+=dE/spec.effectiveHeatCapacity_J_K;state.recovery_J+=dE;state.minT_C=Math.min(state.minT_C,state.T_C);state.maxT_C=Math.max(state.maxT_C,state.T_C);return dE;}
function groundExchangeCapacityW(state,spec,direction,dt_s=HOUR_S){if(!spec.enabled)return 0;const C=spec.effectiveHeatCapacity_J_K;if(direction==='extract')return Math.min(spec.maxExtraction_W,Math.max(0,(state.T_C-spec.minTemp_C)*C/Math.max(dt_s,1)));if(direction==='inject')return Math.min(spec.maxInjection_W,Math.max(0,(spec.maxTemp_C-state.T_C)*C/Math.max(dt_s,1)));throw new Error('unknown ground exchange direction');}
function groundExchange(state,spec,qToGround_W,dt_s=HOUR_S){if(!spec.enabled||!Number.isFinite(qToGround_W)||Math.abs(qToGround_W)<1e-12)return 0;const dir=qToGround_W>=0?'inject':'extract',cap=groundExchangeCapacityW(state,spec,dir,dt_s),accepted=Math.sign(qToGround_W)*Math.min(Math.abs(qToGround_W),cap),dE=accepted*dt_s;state.T_C+=dE/spec.effectiveHeatCapacity_J_K;if(dE>=0)state.injected_J+=dE;else state.extracted_J+=-dE;state.T_C=clamp(state.T_C,spec.minTemp_C,spec.maxTemp_C);state.minT_C=Math.min(state.minT_C,state.T_C);state.maxT_C=Math.max(state.maxT_C,state.T_C);return accepted;}
function groundDirectHeatingHour(state,spec,{request_W,supply_C,dt_s=HOUR_S}){if(!spec.enabled||!spec.directHeatingEnabled||!(request_W>0)||state.T_C-spec.approach_K<supply_C)return{delivered_W:0,electric_W:0};const sourceCap=groundExchangeCapacityW(state,spec,'extract',dt_s),q=Math.min(request_W,spec.maxDirectHeating_W,sourceCap),accepted=-groundExchange(state,spec,-q,dt_s),e=accepted/1000*spec.pump_W_per_kW;return{delivered_W:accepted,electric_W:e,source_C:state.T_C};}
function groundDirectCoolingHour(state,spec,{request_W,chilledSupply_C,dt_s=HOUR_S}){if(!spec.enabled||!spec.directCoolingEnabled||!(request_W>0)||state.T_C+spec.approach_K>chilledSupply_C)return{delivered_W:0,electric_W:0};const sinkCap=groundExchangeCapacityW(state,spec,'inject',dt_s),q=Math.min(request_W,spec.maxDirectCooling_W,sinkCap),accepted=groundExchange(state,spec,q,dt_s),e=accepted/1000*spec.pump_W_per_kW;return{delivered_W:accepted,electric_W:e,source_C:state.T_C};}
function groundSnapshot(state,spec){const net_J=state.injected_J-state.extracted_J,balanceDen=Math.max(state.injected_J,state.extracted_J,1);return{enabled:spec.enabled,T_C:state.T_C,minT_C:state.minT_C,maxT_C:state.maxT_C,undisturbedTemp_C:spec.undisturbedTemp_C,injected_J:state.injected_J,extracted_J:state.extracted_J,recovery_J:state.recovery_J,netInjection_J:net_J,seasonalImbalanceFraction:Math.abs(net_J)/balanceDen};}

const ASHRAE_RB_LIBRARY={
  schema:'thermal-optimizer/borehole-rb-library/v0.1',
  source:{title:'ASHRAE Handbook 2023, Chapter 35, Table 5',url:'https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch35/a23_ch35_si.aspx'},
  presets:{
    '25mm_DR11_HDPE_singleU_B_100mm':{tube:'25 mm DR 11 HDPE single U-tube',tubeLocation:'B',boreDiameter_mm:100,reynolds:[2000,4000,10000],groutConductivity_W_mK:[.70,1.40,2.10],Rb_mK_W:[[.26,.17,.14],[.24,.14,.11],[.23,.14,.11]]}
  }
};
function interpBracket(xs,x){if(x<xs[0]||x>xs.at(-1))return null;let i=1;while(i<xs.length&&x>xs[i])i++;if(i===xs.length)return[xs.length-1,xs.length-1,0];if(x===xs[i])return[i,i,0];const j=i-1;return[j,i,(x-xs[j])/(xs[i]-xs[j])];}
function lookupAshraeBoreholeResistance({preset='25mm_DR11_HDPE_singleU_B_100mm',reynolds,groutConductivity_W_mK}){
  const d=ASHRAE_RB_LIBRARY.presets[preset];if(!d)return{available:false,reason:'unsupportedPreset',preset};
  const br=interpBracket(d.reynolds,Number(reynolds)),bk=interpBracket(d.groutConductivity_W_mK,Number(groutConductivity_W_mK));if(!br||!bk)return{available:false,reason:'outsideLibraryBounds',preset,reynolds,groutConductivity_W_mK};
  const [r0,r1,fr]=br,[k0,k1,fk]=bk,row0=d.Rb_mK_W[r0],row1=d.Rb_mK_W[r1],a=row0[k0]+fk*(row0[k1]-row0[k0]),b=row1[k0]+fk*(row1[k1]-row1[k0]),value=a+fr*(b-a);
  return{available:true,value_mK_W:value,preset,reynolds:Number(reynolds),groutConductivity_W_mK:Number(groutConductivity_W_mK),interpolated:!(r0===r1&&k0===k1),provenance:ASHRAE_RB_LIBRARY.source,configuration:{tube:d.tube,tubeLocation:d.tubeLocation,boreDiameter_mm:d.boreDiameter_mm}};
}
function resolveEffectiveBoreholeResistance(x={}){if(x.effectiveBoreholeResistance_mK_W!=null)return{available:true,value_mK_W:Math.max(0,Number(x.effectiveBoreholeResistance_mK_W)),method:'explicit',provenance:x.rbProvenance??null};const m=x.rbModel??{};if(m.type==='ashraeTable5SingleU')return{...lookupAshraeBoreholeResistance(m),method:'ashraeTable5SingleU'};return{available:false,reason:'rbNotSpecified'};}
function normalizeGroundLongTerm(x={}){
  const gf=x.gFunction??{},lnTts=Array.from(gf.lnTts??[]).map(Number),g=Array.from(gf.g??[]).map(Number),rb=resolveEffectiveBoreholeResistance(x);
  const rows=Math.max(1,Math.round(x.rows??1)),cols=Math.max(1,Math.round(x.cols??Math.ceil((x.boreholes??6)/rows))),boreholes=Math.max(1,Math.round(x.boreholes??rows*cols));
  const st=x.shortTermPeak??{};
  return{enabled:x.enabled??false,years:Math.max(1,Math.round(x.years??25)),boreholes,rows,cols,boreholeLength_m:Math.max(1,x.boreholeLength_m??100),buriedDepth_m:Math.max(0,x.buriedDepth_m??4),boreholeRadius_m:Math.max(1e-4,x.boreholeRadius_m??0.05),spacing_m:Math.max(0.1,x.spacing_m??5),groundConductivity_W_mK:Math.max(0.05,x.groundConductivity_W_mK??1.5),groundDiffusivity_m2_s:Math.max(1e-9,x.groundDiffusivity_m2_s??1.12e-6),effectiveBoreholeResistance_mK_W:rb.available?rb.value_mK_W:null,rbSelection:rb,minWallTemp_C:x.minWallTemp_C??0,maxWallTemp_C:x.maxWallTemp_C??30,minMeanFluidTemp_C:x.minMeanFluidTemp_C??null,maxMeanFluidTemp_C:x.maxMeanFluidTemp_C??null,shortTermPeak:{enabled:st.enabled??false,duration_s:Math.max(1,st.duration_s??6*3600),incrementalExtraction_W:Math.max(0,st.incrementalExtraction_W??0),incrementalInjection_W:Math.max(0,st.incrementalInjection_W??0),quadratureN:Math.max(128,Math.round(st.quadratureN??512)),responseMode:st.responseMode??'auto',axialSegments:Math.max(1,Math.round(st.axialSegments??gf.nSegments??12))},gFunction:{lnTts,g,source:gf.source??null,generatorKind:gf.generatorKind??null,boundaryCondition:gf.boundaryCondition??null,nSegments:gf.nSegments??null,segmentPolicy:gf.segmentPolicy??null,segmentRatios:gf.segmentRatios?Array.from(gf.segmentRatios,Number):null,endLengthRatio:gf.endLengthRatio??null}};
}

// Vertical finite-line-source (FLS) response. The 1/s^2 factor is required by the one-integral form and is verified below against pygfunction.
function erfApprox(x){const sign=x<0?-1:1,z=Math.abs(x),t=1/(1+.5*z),tau=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(.37409196+t*(.09678418+t*(-.18628806+t*(.27886807+t*(-1.13520398+t*(1.48851587+t*(-.82215223+t*.17087277)))))))));return sign*(1-tau);}
function erfIntegral(x){return x*erfApprox(x)-1/Math.sqrt(Math.PI)*(1-Math.exp(-x*x));}
function simpsonIntegral(f,a,b,n=1024){if(!(b>a))return 0;n=Math.max(32,Math.round(n));if(n%2)n++;const h=(b-a)/n;let sum=f(a)+f(b);for(let i=1;i<n;i++)sum+=(i%2?4:2)*f(a+i*h);return sum*h/3;}
function convergedSimpsonIntegral(f,a,b,{initialN=128,maxN=8192,absTol=1e-9,relTol=1e-7}={}){let n=Math.max(32,Math.round(initialN));if(n%2)n++;let prev=simpsonIntegral(f,a,b,n),lastErr=Infinity;for(;;){const nextN=Math.min(maxN,n*2);if(nextN===n)return{value:prev,n,converged:false,errorEstimate:lastErr};const cur=simpsonIntegral(f,a,b,nextN),err=Math.abs(cur-prev);lastErr=err;if(err<=absTol+relTol*Math.max(Math.abs(cur),Math.abs(prev),1e-30))return{value:cur,n:nextN,converged:true,errorEstimate:err};prev=cur;n=nextN;}}
function finiteLineSourceResponse({time_s,alpha_m2_s,distance_m,H1_m,D1_m=4,H2_m=H1_m,D2_m=D1_m,quadratureN=1024}){
  finite('time_s',time_s);finite('alpha_m2_s',alpha_m2_s);finite('distance_m',distance_m);if(!(time_s>0&&alpha_m2_s>0&&distance_m>0&&H1_m>0&&H2_m>0))throw new Error('FLS requires positive time, diffusivity, distance and borehole lengths');
  const lo=1/Math.sqrt(4*alpha_m2_s*time_s),hi=Math.max(lo*(1+1e-9),Math.sqrt(-Math.log(1e-15))/distance_m);
  const I=s=>{const r=erfIntegral((D2_m-D1_m+H2_m)*s)-erfIntegral((D2_m-D1_m)*s)+erfIntegral((D2_m-D1_m-H1_m)*s)-erfIntegral((D2_m-D1_m+H2_m-H1_m)*s),im=erfIntegral((D2_m+D1_m+H2_m)*s)-erfIntegral((D2_m+D1_m)*s)+erfIntegral((D2_m+D1_m+H1_m)*s)-erfIntegral((D2_m+D1_m+H2_m+H1_m)*s);return Math.exp(-distance_m*distance_m*s*s)*(r+im)/(s*s);};
  return simpsonIntegral(I,lo,hi,quadratureN)/(2*H2_m);
}
function finiteLineSourceResponseConverged({quadratureInitialN=128,quadratureMaxN=8192,quadratureAbsTol=1e-10,quadratureRelTol=1e-7,...args}){
  const {time_s,alpha_m2_s,distance_m,H1_m,D1_m=4,H2_m=H1_m,D2_m=D1_m}=args;finite('time_s',time_s);finite('alpha_m2_s',alpha_m2_s);finite('distance_m',distance_m);if(!(time_s>0&&alpha_m2_s>0&&distance_m>0&&H1_m>0&&H2_m>0))throw new Error('FLS requires positive time, diffusivity, distance and borehole lengths');
  const lo=1/Math.sqrt(4*alpha_m2_s*time_s),hi=Math.max(lo*(1+1e-9),Math.sqrt(-Math.log(1e-15))/distance_m);
  const I=s=>{const r=erfIntegral((D2_m-D1_m+H2_m)*s)-erfIntegral((D2_m-D1_m)*s)+erfIntegral((D2_m-D1_m-H1_m)*s)-erfIntegral((D2_m-D1_m+H2_m-H1_m)*s),im=erfIntegral((D2_m+D1_m+H2_m)*s)-erfIntegral((D2_m+D1_m)*s)+erfIntegral((D2_m+D1_m+H1_m)*s)-erfIntegral((D2_m+D1_m+H2_m+H1_m)*s);return Math.exp(-distance_m*distance_m*s*s)*(r+im)/(s*s);};
  const ulo=Math.log(lo),uhi=Math.log(hi),J=u=>{const z=Math.exp(u);return I(z)*z;},q=convergedSimpsonIntegral(J,ulo,uhi,{initialN:quadratureInitialN,maxN:quadratureMaxN,absTol:quadratureAbsTol*2*H2_m,relTol:quadratureRelTol});return{value:q.value/(2*H2_m),quadratureN:q.n,converged:q.converged,errorEstimate:q.errorEstimate/(2*H2_m),integrationCoordinate:'log-s'};
}
function rectangularBorefieldPositions(rows,cols,spacing_m){rows=Math.max(1,Math.round(rows));cols=Math.max(1,Math.round(cols));const out=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)out.push({x:c*spacing_m,y:r*spacing_m});return out;}
function borefieldDistanceHistogram({rows,cols,spacing_m,boreholeRadius_m}){const pts=rectangularBorefieldPositions(rows,cols,spacing_m),m=new Map;for(const a of pts)for(const b of pts){const d=Math.max(boreholeRadius_m,Math.hypot(a.x-b.x,a.y-b.y)),key=d.toPrecision(12);const e=m.get(key)??{distance_m:d,count:0};e.count++;m.set(key,e);}return{boreholes:pts.length,distances:[...m.values()].sort((a,b)=>a.distance_m-b.distance_m)};}
function generateUniformHeatExtractionFLSGFunction({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,groundDiffusivity_m2_s=1e-6,lnTts=[-12,-10,-8,-6,-4,-2,0],quadratureN=768}){
  const hist=borefieldDistanceHistogram({rows,cols,spacing_m,boreholeRadius_m}),ts=boreholeLength_m*boreholeLength_m/(9*groundDiffusivity_m2_s),g=[];for(const lnt of lnTts){const time=ts*Math.exp(lnt);let sum=0;for(const d of hist.distances)sum+=d.count*finiteLineSourceResponse({time_s:time,alpha_m2_s:groundDiffusivity_m2_s,distance_m:d.distance_m,H1_m:boreholeLength_m,D1_m:buriedDepth_m,H2_m:boreholeLength_m,D2_m:buriedDepth_m,quadratureN});g.push(sum/hist.boreholes);}return{lnTts:Array.from(lnTts),g,source:'generated from vertical finite-line-source pair superposition',generatorKind:'uniformHeatExtractionFLS',boreholes:hist.boreholes};
}

function solveLinearSystem(A,b){
  const n=A.length,M=A.map((row,i)=>[...row,b[i]]);
  for(let k=0;k<n;k++){let piv=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[piv][k]))piv=i;if(Math.abs(M[piv][k])<1e-12)throw new Error('singular linear system');if(piv!==k)[M[k],M[piv]]=[M[piv],M[k]];const d=M[k][k];for(let j=k;j<=n;j++)M[k][j]/=d;for(let i=0;i<n;i++){if(i===k)continue;const f=M[i][k];if(Math.abs(f)<1e-18)continue;for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}}return M.map(r=>r[n]);
}
function borefieldFLSInteractionMatrix({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,groundDiffusivity_m2_s=1e-6,time_s,quadratureN=768}){
  const pts=rectangularBorefieldPositions(rows,cols,spacing_m),n=pts.length,H=Array.from({length:n},()=>Array(n));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const d=Math.max(boreholeRadius_m,Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y));H[i][j]=finiteLineSourceResponse({time_s,alpha_m2_s:groundDiffusivity_m2_s,distance_m:d,H1_m:boreholeLength_m,D1_m:buriedDepth_m,H2_m:boreholeLength_m,D2_m:buriedDepth_m,quadratureN});}
  return H;
}
function solveBoreholeLevelUBWT(H){
  const n=H.length;if(!n||H.some(r=>r.length!==n))throw new Error('UBWT matrix must be square');
  const A=Array.from({length:n+1},()=>Array(n+1).fill(0)),b=Array(n+1).fill(0);
  for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]=H[i][j];A[i][n]=-1;}
  for(let j=0;j<n;j++)A[n][j]=1;b[n]=n;
  const x=solveLinearSystem(A,b),q=x.slice(0,n),g=x[n],res=H.map(row=>row.reduce((a,v,j)=>a+v*q[j],0)-g);
  return{g,relativeBoreholeLoads:q,maxWallResidual:Math.max(...res.map(Math.abs)),minRelativeLoad:Math.min(...q),maxRelativeLoad:Math.max(...q)};
}
function generateBoreholeLevelUBWTFLSGFunction({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,groundDiffusivity_m2_s=1e-6,lnTts=[-12,-10,-8,-6,-4,-2,0],quadratureN=768}){
  const ts=boreholeLength_m*boreholeLength_m/(9*groundDiffusivity_m2_s),g=[],loadProfiles=[];
  for(const lnt of lnTts){const time_s=ts*Math.exp(lnt),H=borefieldFLSInteractionMatrix({rows,cols,spacing_m,boreholeRadius_m,boreholeLength_m,buriedDepth_m,groundDiffusivity_m2_s,time_s,quadratureN}),sol=solveBoreholeLevelUBWT(H);g.push(sol.g);loadProfiles.push(sol.relativeBoreholeLoads);}
  return{lnTts:Array.from(lnTts),g,source:'generated from borehole-level FLS interaction matrix with equal borehole-wall temperature constraint',generatorKind:'boreholeLevelUBWTFLS',boundaryCondition:'UBWT-borehole-level',boreholes:Math.max(1,Math.round(rows))*Math.max(1,Math.round(cols)),loadProfiles,limitations:['one segment per borehole; no axial segmentation','screening approximation to BC-III, not segmented pygfunction UBWT']};
}

function eskilsonSegmentRatios(nSegments,{endLengthRatio=.02}={}){
  const n=Math.max(1,Math.round(nSegments));if(n===1)return[1];const e=Number(endLengthRatio);if(!(e>0&&e<.5))throw new Error('endLengthRatio must be between 0 and 0.5');
  const m=Math.floor(n/2),sumFor=r=>{let a=0,p=1;for(let k=0;k<m;k++){a+=p;p*=r;}return n%2===0?2*e*a:2*e*a+e*p;};
  if(sumFor(1)>1+1e-14)throw new Error('endLengthRatio too large for segment count');let lo=1,hi=2;while(sumFor(hi)<1)hi*=2;for(let it=0;it<100;it++){const mid=.5*(lo+hi);if(sumFor(mid)<1)lo=mid;else hi=mid;}const r=.5*(lo+hi),left=[];let q=e;for(let k=0;k<m;k++){left.push(q);q*=r;}const ratios=n%2===0?[...left,...left.slice().reverse()]:[...left,q,...left.slice().reverse()],sum=ratios.reduce((a,b)=>a+b,0);return ratios.map(x=>x/sum);
}
function normalizeAxialSegmentRatios(nSegments,{segmentRatios=null,segmentPolicy='equal',endLengthRatio=.02}={}){
  const n=Math.max(1,Math.round(nSegments));let ratios;if(segmentRatios){ratios=Array.from(segmentRatios,Number);if(ratios.length!==n||ratios.some(x=>!(x>0)))throw new Error('segmentRatios must contain nSegments positive values');const sum=ratios.reduce((a,b)=>a+b,0);ratios=ratios.map(x=>x/sum);}else if(segmentPolicy==='eskilson')ratios=eskilsonSegmentRatios(n,{endLengthRatio});else if(segmentPolicy==='equal')ratios=Array(n).fill(1/n);else throw new Error('unknown axial segment policy');return ratios;
}
function borefieldSegmentGeometry({rows,cols,spacing_m,boreholeLength_m=100,buriedDepth_m=4,nSegments=12,segmentRatios=null,segmentPolicy='equal',endLengthRatio=.02}){
  const pts=rectangularBorefieldPositions(rows,cols,spacing_m),ns=Math.max(1,Math.round(nSegments)),ratios=normalizeAxialSegmentRatios(ns,{segmentRatios,segmentPolicy,endLengthRatio}),lengths=ratios.map(r=>r*boreholeLength_m),out=[];
  for(let b=0;b<pts.length;b++){let z=0;for(let s=0;s<ns;s++){const L=lengths[s];out.push({boreholeIndex:b,segmentIndex:s,x:pts[b].x,y:pts[b].y,H_m:L,D_m:buriedDepth_m+z,ratio:ratios[s]});z+=L;}}
  return{segments:out,boreholes:pts.length,nSegments:ns,segmentLength_m:Math.min(...lengths),segmentLengths_m:lengths,segmentRatios:ratios,segmentPolicy:segmentRatios?'explicit':segmentPolicy,endLengthRatio:segmentRatios?null:endLengthRatio,totalSegments:out.length};
}
function borefieldSegmentFLSInteractionMatrix({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,nSegments=12,segmentRatios=null,segmentPolicy='equal',endLengthRatio=.02,groundDiffusivity_m2_s=1e-6,time_s,quadratureN=768,quadratureConvergence=null}){
  const geo=borefieldSegmentGeometry({rows,cols,spacing_m,boreholeLength_m,buriedDepth_m,nSegments,segmentRatios,segmentPolicy,endLengthRatio}),n=geo.totalSegments,H=Array.from({length:n},()=>Array(n));let maxQuadratureN=0,maxQuadratureError=0,allQuadratureConverged=true;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const recv=geo.segments[i],src=geo.segments[j],d=Math.max(boreholeRadius_m,Math.hypot(recv.x-src.x,recv.y-src.y)),args={time_s,alpha_m2_s:groundDiffusivity_m2_s,distance_m:d,H1_m:src.H_m,D1_m:src.D_m,H2_m:recv.H_m,D2_m:recv.D_m};if(quadratureConvergence){const q=finiteLineSourceResponseConverged({...args,...quadratureConvergence});H[i][j]=q.value;maxQuadratureN=Math.max(maxQuadratureN,q.quadratureN);maxQuadratureError=Math.max(maxQuadratureError,q.errorEstimate);allQuadratureConverged=allQuadratureConverged&&q.converged;}else H[i][j]=finiteLineSourceResponse({...args,quadratureN});}
  return{matrix:H,...geo,quadratureDiagnostics:quadratureConvergence?{enabled:true,allConverged:allQuadratureConverged,maxQuadratureN,maxEstimatedAbsError:maxQuadratureError}:null};
}
function solveSegmentedUBWT(H,{segmentLengths_m=null}={}){
  const n=H.length;if(!n||H.some(r=>r.length!==n))throw new Error('segmented UBWT matrix must be square');
  const lengths=segmentLengths_m?Array.from(segmentLengths_m,Number):Array(n).fill(1);if(lengths.length!==n||lengths.some(x=>!(x>0)))throw new Error('segment lengths must be positive and aligned');
  const totalLength=lengths.reduce((a,b)=>a+b,0),A=Array.from({length:n+1},()=>Array(n+1).fill(0)),b=Array(n+1).fill(0);
  for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]=H[i][j];A[i][n]=-1;}
  for(let j=0;j<n;j++)A[n][j]=lengths[j];b[n]=totalLength;
  const x=solveLinearSystem(A,b),q=x.slice(0,n),g=x[n],res=H.map(row=>row.reduce((a,v,j)=>a+v*q[j],0)-g),weightedMean=q.reduce((a,v,j)=>a+v*lengths[j],0)/totalLength;
  return{g,relativeSegmentLoads:q,maxWallResidual:Math.max(...res.map(Math.abs)),minRelativeLoad:Math.min(...q),maxRelativeLoad:Math.max(...q),weightedMeanRelativeLoad:weightedMean};
}
function generateSegmentedUBWTSnapshotFLSResponse({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,nSegments=12,segmentRatios=null,segmentPolicy='equal',endLengthRatio=.02,groundDiffusivity_m2_s=1e-6,lnTts=[-12,-10,-8,-6,-4,-2,0],quadratureN=768,quadratureConvergence=null}){
  const ts=boreholeLength_m*boreholeLength_m/(9*groundDiffusivity_m2_s),g=[],loadProfiles=[],quadratureDiagnostics=[];let geometry=null;
  for(const lnt of lnTts){const time_s=ts*Math.exp(lnt),m=borefieldSegmentFLSInteractionMatrix({rows,cols,spacing_m,boreholeRadius_m,boreholeLength_m,buriedDepth_m,nSegments,segmentRatios,segmentPolicy,endLengthRatio,groundDiffusivity_m2_s,time_s,quadratureN,quadratureConvergence});geometry=m;const sol=solveSegmentedUBWT(m.matrix,{segmentLengths_m:m.segments.map(x=>x.H_m)});g.push(sol.g);loadProfiles.push(sol.relativeSegmentLoads);quadratureDiagnostics.push(m.quadratureDiagnostics);}
  return{lnTts:Array.from(lnTts),g,source:'generated from axially segmented vertical-FLS interaction matrix with uniform/equal borehole-wall-temperature constraint',generatorKind:'segmentedUBWTFLS',boundaryCondition:'UBWT-segmented-BCIII-screen',boreholes:geometry?.boreholes??Math.max(1,Math.round(rows))*Math.max(1,Math.round(cols)),nSegments:geometry?.nSegments??Math.max(1,Math.round(nSegments)),segmentLength_m:geometry?.segmentLength_m??boreholeLength_m/Math.max(1,Math.round(nSegments)),segmentLengths_m:geometry?.segmentLengths_m??null,segmentRatios:geometry?.segmentRatios??null,segmentPolicy:geometry?.segmentPolicy??segmentPolicy,endLengthRatio:geometry?.endLengthRatio??null,loadProfiles,quadratureDiagnostics:quadratureConvergence?quadratureDiagnostics:null,limitations:['axial mesh policy is explicit; current pygfunction-compatible default mesh uses end-refined segment ratios rather than equal segments','direct dense solve intended for screening-scale fields; no similarity/equivalent-borehole acceleration']};
}
function assessSegmentedUBWTConvergence({segmentCounts=[4,8,12,16],absTol=1e-4,relTol=2e-5,stablePasses=2,...args}){
  const counts=[...new Set(segmentCounts.map(x=>Math.max(1,Math.round(x))))].sort((a,b)=>a-b);if(counts.length<2)throw new Error('at least two segment counts required');stablePasses=Math.max(1,Math.round(stablePasses));const trials=[];let accepted=null,passStreak=0;for(const nSegments of counts){const gf=generateSegmentedUBWTFLSGFunction({...args,nSegments}),trial={nSegments,g:Array.from(gf.g)};if(trials.length){const prev=trials.at(-1),delta=trial.g.map((v,i)=>Math.abs(v-prev.g[i])),rel=delta.map((d,i)=>d/Math.max(Math.abs(trial.g[i]),Math.abs(prev.g[i]),1e-12));trial.maxAbsDelta=Math.max(...delta);trial.maxRelDelta=Math.max(...rel);trial.pairPass=trial.maxAbsDelta<=absTol&&trial.maxRelDelta<=relTol;passStreak=trial.pairPass?passStreak+1:0;trial.stablePassStreak=passStreak;if(passStreak>=stablePasses&&!accepted)accepted={nSegments,previousSegments:prev.nSegments,maxAbsDelta:trial.maxAbsDelta,maxRelDelta:trial.maxRelDelta,stablePasses};}trials.push(trial);if(accepted)break;}return{converged:!!accepted,accepted,absTol,relTol,stablePasses,trials,reason:accepted?null:'segment-count drift exceeds convergence policy over tested counts'};
}

function linearInterp1D(xs,ys,x){if(x<=xs[0])return ys[0];if(x>=xs.at(-1))return ys.at(-1);let i=1;while(i<xs.length&&x>xs[i])i++;const f=(x-xs[i-1])/(xs[i]-xs[i-1]);return ys[i-1]+f*(ys[i]-ys[i-1]);}
function reconstructUBWTLoadHistory(times,Qcols){
  const p=times.length-1,n=Qcols[0].length,dt=times.map((t,i)=>i?t-times[i-1]:t),tGrid=[0,...times,times.at(-1)+times[0]],cum=Array.from({length:n},()=>Array(times.length+2).fill(0));
  for(let j=0;j<n;j++){for(let k=0;k<times.length;k++)cum[j][k+1]=cum[j][k]+Qcols[k][j]*dt[k];cum[j][times.length+1]=cum[j][times.length];}
  const dtr=dt.slice().reverse(),tr=[0];for(const d of dtr)tr.push(tr.at(-1)+d);const out=Array.from({length:n},()=>Array(times.length).fill(0));
  for(let j=0;j<n;j++)for(let k=0;k<times.length;k++){const f0=linearInterp1D(tGrid,cum[j],tr[k]),f1=linearInterp1D(tGrid,cum[j],tr[k+1]);out[j][k]=(f1-f0)/dtr[k];}
  return out;
}
function interpResponseMatrix(sampleTimes,sampleMatrices,t){
  const n=sampleMatrices[0].length;if(t<=0)return Array.from({length:n},()=>Array(n).fill(0));if(t<=sampleTimes[0]){const f=t/sampleTimes[0];return sampleMatrices[0].map(r=>r.map(v=>v*f));}if(t>=sampleTimes.at(-1))return sampleMatrices.at(-1).map(r=>r.slice());let k=1;while(k<sampleTimes.length&&t>sampleTimes[k])k++;const f=(t-sampleTimes[k-1])/(sampleTimes[k]-sampleTimes[k-1]);return sampleMatrices[k-1].map((r,i)=>r.map((v,j)=>v+f*(sampleMatrices[k][i][j]-v)));}
function generateTransientSegmentedUBWTFLSGFunction({rows,cols,spacing_m,boreholeRadius_m=.075,boreholeLength_m=100,buriedDepth_m=4,nSegments=8,segmentRatios=null,segmentPolicy='eskilson',endLengthRatio=.02,groundDiffusivity_m2_s=1e-6,times_s=null,lnTts=null,quadratureN=768,quadratureConvergence=null}){
  const ts=boreholeLength_m*boreholeLength_m/(9*groundDiffusivity_m2_s),times=times_s?Array.from(times_s,Number):Array.from(lnTts??[-12,-10,-8,-6,-4,-2,0],x=>ts*Math.exp(x));if(!times.length||times.some((t,i)=>!(t>0)||(i&&t<=times[i-1])))throw new Error('times_s must be strictly increasing positive values');
  const sample=times.map(t=>borefieldSegmentFLSInteractionMatrix({rows,cols,spacing_m,boreholeRadius_m,boreholeLength_m,buriedDepth_m,nSegments,segmentRatios,segmentPolicy,endLengthRatio,groundDiffusivity_m2_s,time_s:t,quadratureN,quadratureConvergence})),matrices=sample.map(x=>x.matrix),geometry=sample[0],n=geometry.totalSegments,lengths=geometry.segments.map(x=>x.H_m),totalLength=lengths.reduce((a,b)=>a+b,0),g=[],loadProfiles=[],maxWallResidual=[];
  for(let p=0;p<times.length;p++){
    const dt=p?times[p]-times[p-1]:times[p],Hdt=interpResponseMatrix(times,matrices,dt),Qcols=[...loadProfiles,Array(n).fill(0)],Qrec=reconstructUBWTLoadHistory(times.slice(0,p+1),Qcols),T0=Array(n).fill(0);
    if(p>0){const dQ=Array.from({length:n},()=>Array(p+1).fill(0));for(let j=0;j<n;j++){dQ[j][0]=Qrec[j][0];for(let k=1;k<=p;k++)dQ[j][k]=Qrec[j][k]-Qrec[j][k-1];dQ[j].reverse();}for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<=p;k++)T0[i]+=matrices[k][i][j]*dQ[j][k];}
    const A=Array.from({length:n+1},()=>Array(n+1).fill(0)),B=Array(n+1).fill(0);for(let i=0;i<n;i++){for(let j=0;j<n;j++)A[i][j]=Hdt[i][j];A[i][n]=-1;B[i]=-T0[i];}for(let j=0;j<n;j++)A[n][j]=lengths[j];B[n]=totalLength;const x=solveLinearSystem(A,B),q=x.slice(0,n),gp=x[n],res=Hdt.map((row,i)=>T0[i]+row.reduce((a,v,j)=>a+v*q[j],0)-gp);g.push(gp);loadProfiles.push(q);maxWallResidual.push(Math.max(...res.map(Math.abs)));
  }
  return{times_s:times,lnTts:times.map(t=>Math.log(t/ts)),g,source:'transient segmented vertical-FLS BC-III using pygfunction-compatible load-history reconstruction and temporal superposition',generatorKind:'transientSegmentedUBWTFLS',boundaryCondition:'UBWT-segmented-BCIII-transient',boreholes:geometry.boreholes,nSegments:geometry.nSegments,segmentRatios:geometry.segmentRatios,segmentPolicy:geometry.segmentPolicy,endLengthRatio:geometry.endLengthRatio,loadProfiles,maxWallResidual,quadratureDiagnostics:quadratureConvergence?sample.map(x=>x.quadratureDiagnostics):null,limitations:['linear response-factor interpolation matching the reference solver convention','direct dense solve intended for reference/screening scale before similarity acceleration']};
}


function generateSegmentedUBWTFLSGFunction(args={}){
  const H=args.boreholeLength_m??100,alpha=args.groundDiffusivity_m2_s??1e-6,ts=H*H/(9*alpha),times=args.times_s?Array.from(args.times_s):Array.from(args.lnTts??[-12,-10,-8,-6,-4,-2,0],x=>ts*Math.exp(x));
  return generateTransientSegmentedUBWTFLSGFunction({...args,times_s:times,segmentPolicy:args.segmentPolicy??'eskilson',nSegments:args.nSegments??8});
}

function meanFluidTemperatureFromWall({wallTemp_C,qToGround_W_per_m,effectiveBoreholeResistance_mK_W}){return wallTemp_C+qToGround_W_per_m*Math.max(0,effectiveBoreholeResistance_mK_W??0);}
function borefieldShortTermPeakOverlay({baselineMinWallTemp_C,baselineMaxWallTemp_C,longTerm}){const s=longTerm,pk=s.shortTermPeak;if(!pk?.enabled)return{enabled:false};const totalLength=s.boreholes*s.boreholeLength_m,ts=s.boreholeLength_m*s.boreholeLength_m/(9*s.groundDiffusivity_m2_s),ln=Math.log(pk.duration_s/ts),useSegmented=pk.responseMode==='UBWT-segmented'||(pk.responseMode==='auto'&&(['segmentedUBWTFLS','transientSegmentedUBWTFLS'].includes(s.gFunction?.generatorKind)||['UBWT-segmented-BCIII-screen','UBWT-segmented-BCIII-transient'].includes(s.gFunction?.boundaryCondition))),gf=useSegmented?generateSegmentedUBWTFLSGFunction({rows:s.rows,cols:s.cols,spacing_m:s.spacing_m,boreholeRadius_m:s.boreholeRadius_m,boreholeLength_m:s.boreholeLength_m,buriedDepth_m:s.buriedDepth_m,nSegments:pk.axialSegments,segmentPolicy:s.gFunction?.segmentPolicy??'eskilson',segmentRatios:(s.gFunction?.segmentRatios?.length===pk.axialSegments?s.gFunction.segmentRatios:null),endLengthRatio:s.gFunction?.endLengthRatio??.02,groundDiffusivity_m2_s:s.groundDiffusivity_m2_s,lnTts:[ln],quadratureN:pk.quadratureN}):generateUniformHeatExtractionFLSGFunction({rows:s.rows,cols:s.cols,spacing_m:s.spacing_m,boreholeRadius_m:s.boreholeRadius_m,boreholeLength_m:s.boreholeLength_m,buriedDepth_m:s.buriedDepth_m,groundDiffusivity_m2_s:s.groundDiffusivity_m2_s,lnTts:[ln],quadratureN:pk.quadratureN}),g=gf.g[0],qExt=-pk.incrementalExtraction_W/totalLength,qInj=pk.incrementalInjection_W/totalLength,dTExt=qExt*g/(2*Math.PI*s.groundConductivity_W_mK),dTInj=qInj*g/(2*Math.PI*s.groundConductivity_W_mK),minWall=baselineMinWallTemp_C+dTExt,maxWall=baselineMaxWallTemp_C+dTInj,rb=s.effectiveBoreholeResistance_mK_W,minFluid=rb==null?null:minWall+qExt*rb,maxFluid=rb==null?null:maxWall+qInj*rb;return{enabled:true,duration_s:pk.duration_s,g,incrementalExtraction_W:pk.incrementalExtraction_W,incrementalInjection_W:pk.incrementalInjection_W,minWallTemp_C:minWall,maxWallTemp_C:maxWall,minMeanFluidTemp_C:minFluid,maxMeanFluidTemp_C:maxFluid,method:useSegmented?'incremental segmented UBWT FLS pulse overlay':'incremental uniform-heat-extraction FLS pulse overlay',responseGeneratorKind:gf.generatorKind,axialSegments:useSegmented?gf.nSegments:null};}
function generateBorefieldGeometryCandidates({rowsChoices=[2],colsChoices=[3],lengthChoices_m=[100],spacingChoices_m=[5],boreholeRadius_m=.075,buriedDepth_m=4,groundDiffusivity_m2_s=1e-6,lnTts=[-12,-10,-8,-6,-4,-2,0],effectiveBoreholeResistance_mK_W=null,rbModel=null,responseBoundaryCondition='UHE',axialSegments=12,quadratureConvergence=null}){const out=[];for(const rows of rowsChoices)for(const cols of colsChoices)for(const H of lengthChoices_m)for(const B of spacingChoices_m){const args={rows,cols,spacing_m:B,boreholeRadius_m,boreholeLength_m:H,buriedDepth_m,groundDiffusivity_m2_s,lnTts},gf=responseBoundaryCondition==='UBWT-segmented'?generateSegmentedUBWTFLSGFunction({...args,nSegments:axialSegments,quadratureConvergence}):responseBoundaryCondition==='UBWT-borehole-level'?generateBoreholeLevelUBWTFLSGFunction(args):generateUniformHeatExtractionFLSGFunction(args),rb=resolveEffectiveBoreholeResistance({effectiveBoreholeResistance_mK_W,rbModel});out.push({rows,cols,boreholes:rows*cols,boreholeLength_m:H,spacing_m:B,boreholeRadius_m,buriedDepth_m,groundDiffusivity_m2_s,effectiveBoreholeResistance_mK_W:rb.available?rb.value_mK_W:null,rbSelection:rb,gFunction:gf});}return out;}
function gFunctionInterpolate(table,lnTau){const x=table?.lnTts??[],y=table?.g??[];if(x.length!==y.length||x.length<2)throw new Error('g-function table requires >=2 aligned points');if(lnTau<=x[0])return Math.max(0,y[0]*Math.exp(lnTau-x[0]));if(lnTau>=x[x.length-1]){const n=x.length,m=(y[n-1]-y[n-2])/(x[n-1]-x[n-2]);return y[n-1]+m*(lnTau-x[n-1]);}let i=1;while(i<x.length&&lnTau>x[i])i++;const f=(lnTau-x[i-1])/(x[i]-x[i-1]);return y[i-1]+f*(y[i]-y[i-1]);}
function borefieldWallTemperatureFromG({undisturbedTemp_C,qToGround_W_per_m,groundConductivity_W_mK,g}){return undisturbedTemp_C+qToGround_W_per_m*g/(2*Math.PI*groundConductivity_W_mK);}
function borefieldGFunctionSuperposition({undisturbedTemp_C,loads_W,step_s,totalLength_m,boreholeLength_m,groundConductivity_W_mK,groundDiffusivity_m2_s,gFunction}){
  const H=boreholeLength_m,ts=H*H/(9*groundDiffusivity_m2_s),q=Array.from(loads_W,v=>v/totalLength_m),out=[];
  for(let i=0;i<q.length;i++){let dT=0,prev=0;for(let j=0;j<=i;j++){const dq=q[j]-prev;prev=q[j];if(Math.abs(dq)<1e-15)continue;const age=(i-j+1)*step_s,lnTau=Math.log(age/ts),gv=gFunctionInterpolate(gFunction,lnTau);dT+=dq*gv/(2*Math.PI*groundConductivity_W_mK);}out.push(undisturbedTemp_C+dT);}return out;
}
function borefieldLongTermScreen({undisturbedTemp_C,monthlyNetToGround_J,longTerm}){
  const s=longTerm?.enabled===undefined?normalizeGroundLongTerm(longTerm):longTerm;if(!s.enabled)return{enabled:false};if(s.gFunction.lnTts.length<2)return{enabled:true,available:false,reason:'gFunctionTableMissing'};
  const month_s=365.25/12*86400,base=Array.from({length:12},(_,m)=>(monthlyNetToGround_J?.[m]??0)/month_s),loads=[];for(let y=0;y<s.years;y++)loads.push(...base);
  const totalLength=s.boreholes*s.boreholeLength_m,wall=borefieldGFunctionSuperposition({undisturbedTemp_C,loads_W:loads,step_s:month_s,totalLength_m:totalLength,boreholeLength_m:s.boreholeLength_m,groundConductivity_W_mK:s.groundConductivity_W_mK,groundDiffusivity_m2_s:s.groundDiffusivity_m2_s,gFunction:s.gFunction}),qPerM=loads.map(v=>v/totalLength),fluid=s.effectiveBoreholeResistance_mK_W==null?null:wall.map((T,i)=>meanFluidTemperatureFromWall({wallTemp_C:T,qToGround_W_per_m:qPerM[i],effectiveBoreholeResistance_mK_W:s.effectiveBoreholeResistance_mK_W}));
  const min=Math.min(...wall),max=Math.max(...wall),peak=borefieldShortTermPeakOverlay({baselineMinWallTemp_C:min,baselineMaxWallTemp_C:max,longTerm:s}),minPeak=peak.enabled?Math.min(min,peak.minWallTemp_C):min,maxPeak=peak.enabled?Math.max(max,peak.maxWallTemp_C):max,wallOK=minPeak>=s.minWallTemp_C&&maxPeak<=s.maxWallTemp_C,minF0=fluid?Math.min(...fluid):null,maxF0=fluid?Math.max(...fluid):null,minF=peak.enabled&&peak.minMeanFluidTemp_C!=null?(minF0==null?peak.minMeanFluidTemp_C:Math.min(minF0,peak.minMeanFluidTemp_C)):minF0,maxF=peak.enabled&&peak.maxMeanFluidTemp_C!=null?(maxF0==null?peak.maxMeanFluidTemp_C:Math.max(maxF0,peak.maxMeanFluidTemp_C)):maxF0,fluidOK=minF==null||((s.minMeanFluidTemp_C==null||minF>=s.minMeanFluidTemp_C)&&(s.maxMeanFluidTemp_C==null||maxF<=s.maxMeanFluidTemp_C));return{enabled:true,available:true,years:s.years,totalLength_m:totalLength,minWallTemp_C:minPeak,maxWallTemp_C:maxPeak,longTermMinWallTemp_C:min,longTermMaxWallTemp_C:max,finalWallTemp_C:wall.at(-1),withinWallTemperatureLimits:wallOK,minMeanFluidTemp_C:minF,maxMeanFluidTemp_C:maxF,longTermMinMeanFluidTemp_C:minF0,longTermMaxMeanFluidTemp_C:maxF0,finalMeanFluidTemp_C:fluid?fluid.at(-1):null,withinMeanFluidTemperatureLimits:fluidOK,withinTemperatureLimits:wallOK&&fluidOK,rbSelection:s.rbSelection,shortTermPeak:peak,monthlyWallTemp_C:wall,monthlyMeanFluidTemp_C:fluid};
}

/* ---------- stateful candidate ---------- */
function normalizeHydronicPipe(p={},fallback={}){
  return{D_m:p.D_m??fallback.D_m??0.08,L_m:p.L_m??fallback.L_m??80,roughness_m:p.roughness_m??fallback.roughness_m??4.5e-5,K:p.K??fallback.K??12,pumpEfficiency:p.pumpEfficiency??fallback.pumpEfficiency??0.55};
}
function normalizeAirside(a={}){
  const enabled=a.enabled??false,designFlow_m3_s=Math.max(0,a.designFlow_m3_s??0),duct=a.duct??{};
  return{enabled,designFlow_m3_s,D_m:duct.D_m??a.D_m??1.4,L_m:duct.L_m??a.L_m??120,roughness_m:duct.roughness_m??a.roughness_m??0.00015,K:duct.K??a.K??12,
    fixedPressure_Pa:Math.max(0,a.fixedPressure_Pa??450),fanEfficiency:clamp(a.fanEfficiency??0.68,0.05,1),motorEfficiency:clamp(a.motorEfficiency??0.90,0.05,1),
    rho_kg_m3:a.rho_kg_m3??1.2,mu_Pa_s:a.mu_Pa_s??1.81e-5,ductCapex_per_m2:a.ductCapex_per_m2??70,ductFittingMultiplier:a.ductFittingMultiplier??1.25,
    fanCapex_per_kW:a.fanCapex_per_kW??350,fixedCapex:a.fixedCapex??0};
}
function airsidePerformance(spec,flow_m3_s){const a=spec?.enabled===undefined?normalizeAirside(spec):spec,q=Math.max(0,flow_m3_s);if(!a.enabled||q<=0)return{flow_m3_s:q,velocity_m_s:0,Re:0,frictionFactor:0,ductDp_Pa:0,fixedDp_Pa:0,totalDp_Pa:0,fan_W:0};
  const nu=a.mu_Pa_s/a.rho_kg_m3,h=pipeHydraulics({Vdot_m3_s:q,D_m:a.D_m,L_m:a.L_m,roughness_m:a.roughness_m,K:a.K,rho_kg_m3:a.rho_kg_m3,nu_m2_s:nu});
  const ratio=a.designFlow_m3_s>0?q/a.designFlow_m3_s:1,fixed=a.fixedPressure_Pa*ratio*ratio,total=h.dp_Pa+fixed,fan=q*total/Math.max(a.fanEfficiency*a.motorEfficiency,1e-6);
  return{flow_m3_s:q,velocity_m_s:h.velocity_m_s,Re:h.Re,frictionFactor:h.frictionFactor,ductDp_Pa:h.dp_Pa,fixedDp_Pa:fixed,totalDp_Pa:total,fan_W:fan};}
function airsideCapex(spec){const a=spec?.enabled===undefined?normalizeAirside(spec):spec;if(!a.enabled)return 0;const area=Math.PI*a.D_m*a.L_m*a.ductFittingMultiplier,design=airsidePerformance(a,a.designFlow_m3_s);return a.fixedCapex+area*a.ductCapex_per_m2+(design.fan_W/1000)*a.fanCapex_per_kW;}
function normalizeHeatingTerminal(d,busSupply,busReturn){
  const e=d.heatingTerminal??d.emitter??{};
  if((e.type??'radiator')==='floor')return{type:'floor',area_m2:e.area_m2??2500,supply_C:e.supply_C??busSupply,return_C:e.return_C??busReturn,coveringR_m2K_W:e.coveringR_m2K_W??0.09,spacing_m:e.spacing_m??0.15,surfaceLimit_C:e.surfaceLimit_C??29};
  if((e.type??'radiator')==='ventilationAir')return{type:'ventilationAir',nominal_W:e.nominal_W??Infinity,supplyAirMax_C:e.supplyAirMax_C};
  if((e.type??'radiator')==='airPlusLocalCoils')return{type:'airPlusLocalCoils',nominal_W:e.nominal_W??250000,airFraction:e.airFraction??1,localCoil_W:e.localCoil_W??150000,supplyAirMax_C:e.supplyAirMax_C};
  return{type:e.type??'radiator',nominal_W:e.nominal_W??250000,supply_C:e.supply_C??busSupply,return_C:e.return_C??busReturn,exponent:e.exponent,deliveryToMassFraction:e.deliveryToMassFraction};
}
function normalizeCoolingTerminal(d,coolSupply,coolReturn){
  const e=d.coolingTerminal??{};
  if((e.type??'fanCoil')==='floor')return{type:'floor',area_m2:e.area_m2??2500,supply_C:e.supply_C??coolSupply,return_C:e.return_C??coolReturn,coveringR_m2K_W:e.coveringR_m2K_W??0.09,spacing_m:e.spacing_m??0.15,surfaceMin_C:e.surfaceMin_C??19,dewpointMargin_K:e.dewpointMargin_K??2,maxFlux_W_m2:e.maxFlux_W_m2??35};
  if(['ceiling','tabs'].includes(e.type))return{type:e.type,area_m2:e.area_m2??2500,supply_C:e.supply_C??coolSupply,return_C:e.return_C??coolReturn,surfaceMin_C:e.surfaceMin_C,dewpointMargin_K:e.dewpointMargin_K??2,maxFlux_W_m2:e.maxFlux_W_m2,waterToSurfaceApproach_K:e.waterToSurfaceApproach_K??1.5};
  return{type:e.type??'fanCoil',nominal_W:e.nominal_W??d.coolingCapacity_W??0,supply_C:e.supply_C??coolSupply,return_C:e.return_C??coolReturn,dehumidificationEnabled:e.dehumidificationEnabled??true,airFlow_m3_s:e.airFlow_m3_s??Math.max(0,(e.nominal_W??d.coolingCapacity_W??0)/12000),coilADP_C:e.coilADP_C??8,bypassFactor:e.bypassFactor??0.10,maxCondensate_kg_s:e.maxCondensate_kg_s??Infinity};
}
function normalizeLatentTerminal(d={}){
  const e=d.latentTerminal??d.dehumidificationTerminal??{};
  const enabled=e.enabled??false;
  return{enabled,type:e.type??'dedicatedAirside',dehumidificationEnabled:enabled&&(e.dehumidificationEnabled??true),airFlow_m3_s:Math.max(0,e.airFlow_m3_s??0),coilADP_C:e.coilADP_C??8,bypassFactor:clamp(e.bypassFactor??0.10,0,.95),maxCondensate_kg_s:Math.max(0,e.maxCondensate_kg_s??Infinity),coolingCapacity_W:Math.max(0,e.coolingCapacity_W??0),chilledSupply_C:e.chilledSupply_C??6,coolingOptions:e.coolingOptions??{},fanPower_W:Math.max(0,e.fanPower_W??0),capex:Math.max(0,e.capex??0),fixedOpex_per_year:Math.max(0,e.fixedOpex_per_year??0)};
}

/* ---------- modular plant / redundancy screening ---------- */
function normalizeHeatPumpPlant(d={}){
  const hp=d.heatPumpPlant??{},rawModules=Array.isArray(hp.modules)?hp.modules:null,rawCaps=Array.isArray(hp.moduleCapacities_W)?hp.moduleCapacities_W:null;
  let modules=[];
  if(rawModules&&rawModules.length){
    modules=rawModules.map((m,i)=>({id:m.id??`HP${i+1}`,capacity_W:Math.max(0,m.capacity_W??m.moduleCapacity_W??0),minModulationFraction:clamp(m.minModulationFraction??hp.minModulationFraction??d.hpMinModulationFraction??0.20,0,1),fixedCapex:Math.max(0,m.fixedCapex??hp.moduleFixedCapex??d.hpModuleFixedCapex??2500)})).filter(m=>m.capacity_W>0);
  }else if(rawCaps&&rawCaps.length){
    modules=rawCaps.map((x,i)=>({id:`HP${i+1}`,capacity_W:Math.max(0,x),minModulationFraction:clamp((hp.moduleMinModulationFractions??[])[i]??hp.minModulationFraction??d.hpMinModulationFraction??0.20,0,1),fixedCapex:Math.max(0,(hp.moduleFixedCapexes??[])[i]??hp.moduleFixedCapex??d.hpModuleFixedCapex??2500)})).filter(m=>m.capacity_W>0);
  }else{
    const count=Math.max(1,Math.trunc(hp.moduleCount??d.hpModuleCount??1)),total=Math.max(0,d.hpCapacity_W??0),cap=Math.max(0,hp.moduleCapacity_W??d.hpModuleCapacity_W??((count>0)?total/count:0));
    const mod=clamp(hp.minModulationFraction??d.hpMinModulationFraction??(count>1?0.20:0.25),0,1),fixed=Math.max(0,hp.moduleFixedCapex??d.hpModuleFixedCapex??2500);
    modules=Array.from({length:count},(_,i)=>({id:`HP${i+1}`,capacity_W:cap,minModulationFraction:mod,fixedCapex:fixed}));
  }
  if(!modules.length)modules=[{id:'HP1',capacity_W:0,minModulationFraction:.25,fixedCapex:2500}];
  const installed_W=modules.reduce((s,m)=>s+m.capacity_W,0),moduleCount=modules.length,first=modules[0],equalModules=modules.every(m=>Math.abs(m.capacity_W-first.capacity_W)<=1e-9&&Math.abs(m.minModulationFraction-first.minModulationFraction)<=1e-12),stagingControlsCapex=Math.max(0,hp.stagingControlsCapex??d.hpStagingControlsCapex??(moduleCount>1?4000:0));
  return{moduleCount,moduleCapacity_W:equalModules?first.capacity_W:installed_W/moduleCount,installed_W,minModulationFraction:equalModules?first.minModulationFraction:Math.min(...modules.map(m=>m.minModulationFraction)),moduleFixedCapex:equalModules?first.fixedCapex:modules.reduce((s,m)=>s+m.fixedCapex,0)/moduleCount,stagingControlsCapex,equalModules,modules};
}

/* ---------- v0.42 annual modular-plant cycling state ---------- */
function normalizePlantCycling(c={},plant=null){
  const enabled=!!c.enabled;
  const minRuntime_s=Math.max(0,+c.minRuntime_s||(+c.minimumRuntime_min||0)*60);
  const minOffTime_s=Math.max(0,+c.minOffTime_s||(+c.minimumOffTime_min||0)*60);
  const startupElectricity_J_perStart=Math.max(0,+c.startupElectricity_J_perStart||0);
  return{enabled,minRuntime_s,minOffTime_s,startupElectricity_J_perStart,forcedExcessToTank:c.forcedExcessToTank!==false,allowForcedExcessRejection:c.allowForcedExcessRejection!==false,discretionaryChargeWithinActiveStage:c.discretionaryChargeWithinActiveStage!==false,plantInstalled_W:plant?.installed_W??0};
}
function plantCyclingMaskIndexes(mask,n){const a=[];for(let i=0;i<n;i++)if(mask&(1<<i))a.push(i);return a;}
function createPlantCyclingState(plant,cycling={}){
  const modules=(plant?.modules??[]).map(m=>({id:String(m.id),capacity_W:Math.max(0,+m.capacity_W||0),minModulationFraction:clamp(+m.minModulationFraction||0,0,1)}));
  if(modules.length>20)throw new Error('plant cycling module count > 20 is outside exhaustive staging screen');
  return{spec:normalizePlantCycling(cycling,plant),modules,moduleStates:modules.map(()=>({on:false,runLock:0,offLock:0,starts:0,onSteps:0})),prevMask:0,totalStarts:0,forcedExcessEnergy_J:0,forcedExcessToTank_J:0,forcedExcessRejected_J:0,restartBlockedUnmet_J:0,startupElectricity_J:0,rejectionViolation_J:0,last:null};
}
function plantCyclingBand(mask,mods,scale){let min=0,max=0;for(let i=0;i<mods.length;i++)if(mask&(1<<i)){max+=mods[i].capacity_W*scale;min+=mods[i].capacity_W*mods[i].minModulationFraction*scale;}return{minOutput_W:min,maxOutput_W:max};}
function advancePlantCyclingState(st,target_W,{capacityScale=1,dt_s=HOUR_S}={}){
  const target=Math.max(0,+target_W||0),scale=Math.max(0,+capacityScale||0),mods=st.modules,n=mods.length,s=st.spec,runLockSteps=Math.max(0,Math.ceil(s.minRuntime_s/dt_s)-1),offLockSteps=Math.max(0,Math.ceil(s.minOffTime_s/dt_s)-1);let lockedOn=0,lockedOff=0;
  for(let i=0;i<n;i++){const q=st.moduleStates[i];if(q.on&&q.runLock>0)lockedOn|=(1<<i);if(!q.on&&q.offLock>0)lockedOff|=(1<<i);}
  let best=null;for(let mask=0;mask<(1<<n);mask++){if((mask&lockedOn)!==lockedOn||(mask&lockedOff)!==0)continue;const b=plantCyclingBand(mask,mods,scale);let output_W=0,unmet_W=0,forcedExcess_W=0;if(mask===0)unmet_W=target;else if(target<b.minOutput_W){output_W=b.minOutput_W;forcedExcess_W=b.minOutput_W-target;}else if(target>b.maxOutput_W){output_W=b.maxOutput_W;unmet_W=target-b.maxOutput_W;}else output_W=target;const starts=plantCyclingMaskIndexes(mask&~st.prevMask,n).length,cand={mask,output_W,unmet_W,forcedExcess_W,starts,activeMaxOutput_W:b.maxOutput_W,activeMinOutput_W:b.minOutput_W};const fields=['unmet_W','forcedExcess_W','starts','activeMaxOutput_W'];let better=!best;if(best)for(const f of fields){if(Math.abs(cand[f]-best[f])>1e-9){better=cand[f]<best[f];break;}}if(better)best=cand;}
  if(!best)throw new Error('no feasible plant cycling state');
  const startIdx=plantCyclingMaskIndexes(best.mask&~st.prevMask,n),stopIdx=plantCyclingMaskIndexes(st.prevMask&~best.mask,n);for(let i=0;i<n;i++){const now=!!(best.mask&(1<<i)),was=st.moduleStates[i].on,q=st.moduleStates[i];if(now&&!was){q.on=true;q.starts++;q.runLock=runLockSteps;q.offLock=0;}else if(!now&&was){q.on=false;q.offLock=offLockSteps;q.runLock=0;}else if(now){if(q.runLock>0)q.runLock--;}else if(q.offLock>0)q.offLock--;if(now)q.onSteps++;}
  const startupElectricity_J=startIdx.length*s.startupElectricity_J_perStart,restartBlockedUnmet_W=lockedOff&&best.unmet_W>0?best.unmet_W:0;st.totalStarts+=startIdx.length;st.forcedExcessEnergy_J+=best.forcedExcess_W*dt_s;st.restartBlockedUnmet_J+=restartBlockedUnmet_W*dt_s;st.startupElectricity_J+=startupElectricity_J;st.prevMask=best.mask;st.last={...best,target_W:target,capacityScale:scale,usefulServed_W:Math.min(target,best.output_W),startupElectricity_J,restartBlockedUnmet_W,activeModuleIds:plantCyclingMaskIndexes(best.mask,n).map(i=>mods[i].id),startedModuleIds:startIdx.map(i=>mods[i].id),stoppedModuleIds:stopIdx.map(i=>mods[i].id)};return st.last;
}
function plantCyclingSnapshot(st){return{enabled:!!st.spec.enabled,totalStarts:st.totalStarts,forcedExcessEnergy_J:st.forcedExcessEnergy_J,forcedExcessToTank_J:st.forcedExcessToTank_J,forcedExcessRejected_J:st.forcedExcessRejected_J,rejectionViolation_J:st.rejectionViolation_J,restartBlockedUnmet_J:st.restartBlockedUnmet_J,startupElectricity_J:st.startupElectricity_J,rejectionViolation_J:st.rejectionViolation_J,modules:st.modules.map((m,i)=>({...m,starts:st.moduleStates[i].starts,onTime_h:st.moduleStates[i].onSteps})),last:st.last};}
function normalizeReliability(r={}){
  const mode=r.mode??'none';
  if(!['none','partialNPlus1','N+1','2N','mobileReady'].includes(mode))throw new Error('unknown reliability mode');
  return{mode,criticalFraction:clamp(r.criticalFraction??(mode==='partialNPlus1'?0.60:1),0,1),
    oneFailureCount:Math.max(1,Math.trunc(r.oneFailureCount??1)),
    mobileCapacity_W:Math.max(0,r.mobileCapacity_W??0),mobileMobilization_h:Math.max(0,r.mobileMobilization_h??24),
    mobileConnectionCapex:Math.max(0,r.mobileConnectionCapex??0),mobileRental_per_event:Math.max(0,r.mobileRental_per_event??0),
    expectedMobileEvents_per_year:Math.max(0,r.expectedMobileEvents_per_year??0)};
}
function enumerateIndexCombinations(n,k){const out=[];function rec(start,left,a){if(left===0){out.push(a.slice());return;}for(let i=start;i<=n-left;i++){a.push(i);rec(i+1,left-1,a);a.pop();}}if(k>=0&&k<=n)rec(0,k,[]);return out;}
function enumerateHeatPumpPlantStages(plant,{includeOff=false}={}){
  const ms=plant.modules??[],n=ms.length,out=[];
  if(includeOff)out.push({moduleIndexes:[],nominal_W:0,minOutput_W:0,maxOutput_W:0});
  for(let mask=1;mask<(1<<n);mask++){
    const idx=[];let nominal=0,min=0;for(let i=0;i<n;i++)if(mask&(1<<i)){idx.push(i);nominal+=ms[i].capacity_W;min+=ms[i].capacity_W*ms[i].minModulationFraction;}
    out.push({moduleIndexes:idx,nominal_W:nominal,minOutput_W:min,maxOutput_W:nominal});
  }
  out.sort((a,b)=>a.nominal_W-b.nominal_W||a.minOutput_W-b.minOutput_W||a.moduleIndexes.length-b.moduleIndexes.length);
  return out;
}
function hpPlantFailureStates(plant,failedCount=1){
  const ms=plant.modules??[],k=Math.max(0,Math.min(ms.length,Math.trunc(failedCount))),states=[];
  for(const failed of enumerateIndexCombinations(ms.length,k)){
    const fs=new Set(failed),remaining=ms.reduce((s,m,i)=>s+(fs.has(i)?0:m.capacity_W),0);
    states.push({failedModuleIndexes:failed,failedModuleIds:failed.map(i=>ms[i].id),remainingCapacity_W:remaining});
  }
  return states;
}
function hpPlantCapacityAfterFailures(plant,failedCount=1){const states=hpPlantFailureStates(plant,failedCount);return states.length?Math.min(...states.map(s=>s.remainingCapacity_W)):plant.installed_W;}
function assessHeatPlantReliability({plant,reliability,designLoad_W,otherFirmCapacity_W=0}){
  const load=Math.max(0,designLoad_W),other=Math.max(0,otherFirmCapacity_W),failureStates=hpPlantFailureStates(plant,reliability.oneFailureCount),immediateHP=failureStates.length?Math.min(...failureStates.map(s=>s.remainingCapacity_W)):plant.installed_W,immediate=immediateHP+other;
  const restored=immediate+((reliability.mode==='mobileReady')?reliability.mobileCapacity_W:0),criticalTarget=load*reliability.criticalFraction,fullTarget=reliability.mode==='2N'?2*load:load;
  let criterionTarget=0;if(reliability.mode==='partialNPlus1')criterionTarget=criticalTarget;else if(reliability.mode==='N+1')criterionTarget=load;else if(reliability.mode==='2N')criterionTarget=fullTarget;else if(reliability.mode==='mobileReady')criterionTarget=criticalTarget;
  const installedFirm=plant.installed_W+other,meetsInstalled=(reliability.mode==='2N')?installedFirm+1e-9>=2*load:true,meetsImmediate=(reliability.mode==='none')?true:immediate+1e-9>=criterionTarget,meetsRestored=(reliability.mode==='mobileReady')?restored+1e-9>=load:true;
  return{mode:reliability.mode,designLoad_W:load,criticalTarget_W:criticalTarget,criterionTarget_W:criterionTarget,installedCapacity_W:plant.installed_W,otherFirmCapacity_W:other,capacityAfterFailure_W:immediate,restoredWithMobile_W:restored,meetsInstalled,meetsImmediate,meetsRestored,mobileMobilization_h:reliability.mobileMobilization_h,failureStates:failureStates.map(s=>({...s,totalFirmCapacity_W:s.remainingCapacity_W+other}))};
}
function minimumBufferForCycling({plant,minimumRunTime_min=10,deltaT_K=5,rho_kg_m3=998,cp_J_kgK=4180}){
  if(!(deltaT_K>0&&rho_kg_m3>0&&cp_J_kgK>0))throw new Error('invalid cycling buffer inputs');
  const stages=enumerateHeatPumpPlantStages(plant),minModuleOutput_W=stages.length?Math.min(...stages.map(s=>s.minOutput_W).filter(x=>x>0)):0,energy_J=minModuleOutput_W*Math.max(0,minimumRunTime_min)*60;
  return{minModuleOutput_W,energy_J,volume_m3:energy_J/(rho_kg_m3*cp_J_kgK*deltaT_K),stages};
}
function generateHeatPumpPlantVariants({designLoad_W,moduleCounts=[1,2,3],moduleFractions=[1,0.6,0.5,0.4,1/3],moduleFractionSets=null,reliabilityModes=['none','partialNPlus1','N+1'],criticalFraction=0.6}={}){
  const load=Math.max(0,designLoad_W),out=[],sets=[];
  if(Array.isArray(moduleFractionSets))for(const s of moduleFractionSets)if(Array.isArray(s)&&s.length)sets.push(s);
  for(const n0 of moduleCounts){const n=Math.max(1,Math.trunc(n0));for(const f0 of moduleFractions)sets.push(Array(n).fill(Math.max(0,f0)));}
  const seen=new Set();
  for(const fs0 of sets){const fs=fs0.map(x=>Math.max(0,x)).filter(x=>x>0),key=fs.map(x=>x.toFixed(9)).join(',');if(!fs.length||seen.has(key))continue;seen.add(key);const caps=fs.map(f=>load*f),total=caps.reduce((a,b)=>a+b,0);
    for(const mode of reliabilityModes){const plant=normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:caps}}),reliability=normalizeReliability({mode,criticalFraction}),assessment=assessHeatPlantReliability({plant,reliability,designLoad_W:load}),stages=enumerateHeatPumpPlantStages(plant);
      out.push({moduleCount:plant.moduleCount,moduleFractionsOfDesign:fs,moduleCapacities_W:caps,totalCapacity_W:total,reliabilityMode:mode,reliability,assessment,stages});
    }}
  return out;
}

function normalizeSiteEnergyAvailability(x={}){
  const norm=(v,def='unknown')=>v==null?def:(v===true?'available':v===false?'unavailable':v);
  const el=x.electricity??{},gas=x.naturalGas??x.gas??{},fuel=x.deliveredFuel??{};
  return{
    electricity:{status:norm(el.status??el.available,'unknown'),firmImport_W:el.firmImport_W==null?null:Math.max(0,el.firmImport_W),upgradeAvailable:!!(el.upgradeAvailable??false),upgradeFirmImport_W:el.upgradeFirmImport_W==null?null:Math.max(0,el.upgradeFirmImport_W),upgradeCapex:Math.max(0,el.upgradeCapex??0),upgradeLeadTime_months:Math.max(0,el.upgradeLeadTime_months??0)},
    naturalGas:{status:norm(gas.status??gas.available,'unknown'),firmInput_W:gas.firmInput_W==null?null:Math.max(0,gas.firmInput_W)},
    deliveredFuel:{status:norm(fuel.status??fuel.available,'unknown'),firmInput_W:fuel.firmInput_W==null?null:Math.max(0,fuel.firmInput_W),price_per_kWh:fuel.price_per_kWh==null?null:Math.max(0,fuel.price_per_kWh),storageCapacity_kWh:fuel.storageCapacity_kWh==null?null:Math.max(0,fuel.storageCapacity_kWh),minimumDeliveryInterval_h:fuel.minimumDeliveryInterval_h==null?null:Math.max(0,fuel.minimumDeliveryInterval_h)}
  };
}
function assessSiteEnergyFeasibility(project,result){
  const a=normalizeSiteEnergyAvailability(project.siteEnergyAvailability??{}),d=result.design,strategy=d.siteEnergyStrategy??{},issues=[],warnings=[];
  const electricLimit=strategy.electricUpgrade&&a.electricity.upgradeAvailable?(a.electricity.upgradeFirmImport_W??a.electricity.firmImport_W):a.electricity.firmImport_W;
  if(a.electricity.status==='unavailable'&&result.peaks.gridImport_W>1e-6)issues.push({code:'ELECTRICITY_UNAVAILABLE',demand_W:result.peaks.gridImport_W});
  else if(electricLimit!=null&&result.peaks.gridImport_W>electricLimit+1e-6)issues.push({code:'ELECTRIC_IMPORT_CAPACITY_EXCEEDED',demand_W:result.peaks.gridImport_W,limit_W:electricLimit});
  else if(a.electricity.status==='unknown'&&result.peaks.gridImport_W>1e-6)warnings.push({code:'ELECTRICITY_CAPACITY_UNKNOWN',demand_W:result.peaks.gridImport_W});
  const carrier=d.boilerFuelCarrier??'gas',fuelPeak=result.peaks.boilerFuelInput_W??result.peaks.gas_W??0;
  if(fuelPeak>1e-6&&carrier==='gas'){if(a.naturalGas.status==='unavailable')issues.push({code:'NATURAL_GAS_UNAVAILABLE',demand_W:fuelPeak});else if(a.naturalGas.firmInput_W!=null&&fuelPeak>a.naturalGas.firmInput_W+1e-6)issues.push({code:'GAS_CAPACITY_EXCEEDED',demand_W:fuelPeak,limit_W:a.naturalGas.firmInput_W});else if(a.naturalGas.status==='unknown')warnings.push({code:'GAS_CAPACITY_UNKNOWN',demand_W:fuelPeak});}
  if(fuelPeak>1e-6&&carrier==='deliveredFuel'){if(a.deliveredFuel.status==='unavailable')issues.push({code:'DELIVERED_FUEL_UNAVAILABLE',demand_W:fuelPeak});else if(a.deliveredFuel.firmInput_W!=null&&fuelPeak>a.deliveredFuel.firmInput_W+1e-6)issues.push({code:'DELIVERED_FUEL_RATE_EXCEEDED',demand_W:fuelPeak,limit_W:a.deliveredFuel.firmInput_W});else if(a.deliveredFuel.status==='unknown')warnings.push({code:'DELIVERED_FUEL_AVAILABILITY_UNKNOWN',demand_W:fuelPeak});}
  return{feasible:issues.length===0,issues,warnings,electricLimit_W:electricLimit,boilerFuelCarrier:carrier};
}
function generateJointTopologyCandidates(project,{baseDesign={},designHeatLoad_W=250000,moduleFractionSets=[[1],[.5,.5],[1/3,2/3]],boilerFractions=[0,.4,.7,1],bufferVolumes_m3=[0,10,30],reliabilityModes=['none','partialNPlus1'],freeCoolingModes=['none'],heatRecoveryModes=[false],boilerFuelCarriers=null,electricUpgradeModes=null,maxCandidates=5000}={}){
  const site=normalizeSiteEnergyAvailability(project.siteEnergyAvailability??{}),fuels=boilerFuelCarriers??(['gas','deliveredFuel'].filter(f=>(f==='gas'?site.naturalGas.status:site.deliveredFuel.status)!=='unavailable')),upgrades=electricUpgradeModes??(site.electricity.upgradeAvailable?[false,true]:[false]),out=[],seen=new Set();
  for(const fs of moduleFractionSets)for(const bf of boilerFractions)for(const bv of bufferVolumes_m3)for(const rm of reliabilityModes)for(const fcMode of freeCoolingModes)for(const hr of heatRecoveryModes)for(const fuel of (bf>0?fuels:['gas']))for(const upgrade of upgrades){
    const caps=fs.map(f=>Math.max(0,f)*designHeatLoad_W),name=`HP[${fs.map(x=>x.toFixed(3)).join('+')}] B${bf.toFixed(2)} ${fuel} V${bv} ${rm} FC:${fcMode} HR:${hr?'Y':'N'} EU:${upgrade?'Y':'N'}`;
    const key=name;if(seen.has(key))continue;seen.add(key);
    const d={...baseDesign,name,heatPumpPlant:{...(baseDesign.heatPumpPlant??{}),moduleCapacities_W:caps},boilerCapacity_W:bf*designHeatLoad_W,boilerFuelCarrier:fuel,reliability:{...(baseDesign.reliability??{}),mode:rm},tank:{...(baseDesign.tank??{}),volume_m3:bv},siteEnergyStrategy:{electricUpgrade:upgrade},heatRecovery:{...(baseDesign.heatRecovery??{}),enabled:!!hr}};
    if(fcMode==='sourceWater')d.freeCooling={...(baseDesign.freeCooling??{}),sourceWater:{...((baseDesign.freeCooling??{}).sourceWater??{}),enabled:true}};
    else if(fcMode==='ambientLoop')d.freeCooling={...(baseDesign.freeCooling??{}),ambientLoop:{...((baseDesign.freeCooling??{}).ambientLoop??{}),enabled:true}};
    else if(fcMode==='airside')d.freeCooling={...(baseDesign.freeCooling??{}),airside:{...((baseDesign.freeCooling??{}).airside??{}),enabled:true}};
    else d.freeCooling={airside:{enabled:false},ambientLoop:{enabled:false},sourceWater:{enabled:false}};
    out.push(d);if(out.length>=maxCandidates)return out;
  }
  return out;
}


function jointDesignSignature(design,designHeatLoad_W=1){
  const d=normalizeCandidate(design),load=Math.max(1e-9,designHeatLoad_W),mods=d.heatPumpPlant.modules.map(m=>m.capacity_W/load);
  const fc=d.freeCooling.sourceWater.enabled?'sourceWater':(d.freeCooling.ambientLoop.enabled?'ambientLoop':(d.freeCooling.airside.enabled?'airside':'none'));
  return JSON.stringify({mods:mods.map(x=>+x.toFixed(6)),boiler:+(d.boilerCapacity_W/load).toFixed(6),fuel:d.boilerFuelCarrier,buffer:+d.tank.volume_m3.toFixed(4),rel:d.reliability.mode,fc,hr:!!d.heatRecovery.enabled,eu:!!d.siteEnergyStrategy.electricUpgrade});
}
function refineJointTopologyCandidates(project,{seedDesigns=[],designHeatLoad_W=250000,moduleFractionStep=0.05,boilerFractionStep=0.10,bufferStep_m3=5,includeSeed=true,maxCandidates=1000}={}){
  const load=Math.max(1e-9,designHeatLoad_W),out=[],seen=new Set();
  const add=x=>{const k=jointDesignSignature(x,load);if(seen.has(k)||out.length>=maxCandidates)return;seen.add(k);out.push(x)};
  for(const seed0 of seedDesigns){
    const seed=normalizeCandidate(seed0),base={...seed0};if(includeSeed)add(base);
    const caps=seed.heatPumpPlant.modules.map(m=>m.capacity_W),fractions=caps.map(x=>x/load);
    for(let i=0;i<fractions.length;i++)for(const sign of [-1,1]){
      const fs=fractions.slice();fs[i]=Math.max(0.05,fs[i]+sign*Math.max(0,moduleFractionStep));
      add({...base,name:`${seed.name} · refine HP${i+1}${sign>0?'+':'-'}`,heatPumpPlant:{...(base.heatPumpPlant??{}),moduleCapacities_W:fs.map(f=>f*load)}});
    }
    for(const sign of [-1,1]){
      const bf=Math.max(0,seed.boilerCapacity_W/load+sign*Math.max(0,boilerFractionStep));
      add({...base,name:`${seed.name} · refine boiler${sign>0?'+':'-'}`,boilerCapacity_W:bf*load});
      const bv=Math.max(0,seed.tank.volume_m3+sign*Math.max(0,bufferStep_m3));
      add({...base,name:`${seed.name} · refine buffer${sign>0?'+':'-'}`,tank:{...(base.tank??{}),volume_m3:bv}});
    }
  }
  return out;
}
function coarseToFineJointSearch(project,{coarseOptions={},retainTop=5,withinNPCFraction=0.10,refinementOptions={},evaluateOptions={retainTrace:false}}={}){
  const load=coarseOptions.designHeatLoad_W??refinementOptions.designHeatLoad_W??250000;
  const coarseDesigns=generateJointTopologyCandidates(project,coarseOptions),coarseResults=coarseDesigns.map(d=>simulateCandidate(project,d,evaluateOptions));
  const feasible=coarseResults.filter(r=>r.feasible&&!r.design.comparisonOnly).sort((a,b)=>a.npc-b.npc),best=feasible[0]??null,threshold=best?best.npc*(1+Math.max(0,withinNPCFraction)):Infinity;
  const retained=feasible.filter((r,i)=>i<Math.max(1,retainTop)||r.npc<=threshold),seedDesigns=retained.map(r=>r.design);
  const refinedDesigns=refineJointTopologyCandidates(project,{...refinementOptions,designHeatLoad_W:load,seedDesigns}),refinedResults=refinedDesigns.map(d=>simulateCandidate(project,d,evaluateOptions));
  const all=[...coarseResults,...refinedResults],uniq=new Map();for(const r of all){const k=jointDesignSignature(r.design,load),old=uniq.get(k);if(!old||r.npc<old.npc)uniq.set(k,r)}
  const ranked=Array.from(uniq.values()),rankedFeasible=ranked.filter(r=>r.feasible&&!r.design.comparisonOnly).sort((a,b)=>a.npc-b.npc),rankedInfeasible=ranked.filter(r=>!r.feasible&&!r.design.comparisonOnly).sort((a,b)=>a.npc-b.npc);
  return{schema:'thermal-optimizer/coarse-to-fine-search/v0.1',designHeatLoad_W:load,coarse:{candidateCount:coarseDesigns.length,feasibleCount:feasible.length,bestNPC:best?.npc??null},retention:{retainTop,withinNPCFraction,retainedCount:retained.length,retainedNames:retained.map(r=>r.design.name)},refinement:{candidateCount:refinedDesigns.length},best:rankedFeasible[0]??null,feasible:rankedFeasible,infeasible:rankedInfeasible,all:ranked};
}

function normalizeMechanicalCoolingPlant(spec={},fallback={}){
  const id=String(spec.id??spec.mechanicalPlantId??'').trim();if(!id)throw new Error('mechanical cooling plant id required');
  const capacity_W=Math.max(0,+(spec.capacity_W??spec.coolingCapacity_W??0)),supplyTemperature_C=+(spec.supplyTemperature_C??spec.coolingSupply_C??fallback.coolingSupply_C??16);
  if(!(capacity_W>0))throw new Error(`mechanical cooling plant ${id} capacity_W must be positive`);if(!Number.isFinite(supplyTemperature_C))throw new Error(`mechanical cooling plant ${id} supplyTemperature_C must be finite`);
  const electricityOwnerId=String(spec.electricityOwnerId??'').trim(),rejectionOwnerId=String(spec.rejectionOwnerId??'').trim();if(!electricityOwnerId)throw new Error(`mechanical cooling plant ${id} electricityOwnerId required`);if(!rejectionOwnerId)throw new Error(`mechanical cooling plant ${id} rejectionOwnerId required`);
  const performanceOptions={...(fallback.coolingOptions??{}),...(spec.performanceOptions??spec.coolingOptions??{})},rawModules=Array.isArray(spec.modules)?spec.modules:[];
  const modules=(rawModules.length?rawModules:[{id:`${id}:M1`,capacity_W}]).map((m,i)=>{const mid=String(m.id??`${id}:M${i+1}`).trim(),cap=Math.max(0,+m.capacity_W||0);if(!mid)throw new Error(`mechanical cooling plant ${id} module id required`);if(!(cap>0))throw new Error(`mechanical cooling plant ${id} module ${mid} capacity_W must be positive`);return{id:mid,capacity_W:cap,minModulationFraction:clamp(+(m.minModulationFraction??spec.minModulationFraction??0.20),0,1),availabilityFraction:clamp(+(m.availabilityFraction??1),0,1),availabilityProfileRef:m.availabilityProfileRef??null};});
  if(new Set(modules.map(m=>m.id)).size!==modules.length)throw new Error(`mechanical cooling plant ${id} module ids must be unique`);const moduleCapacity_W=modules.reduce((a,m)=>a+m.capacity_W,0);if(rawModules.length&&Math.abs(moduleCapacity_W-capacity_W)>Math.max(1,capacity_W*1e-6))throw new Error(`mechanical cooling plant ${id} module capacities must sum to capacity_W`);
  const st0=spec.staging??spec.cycling??{},staging={enabled:!!st0.enabled,minRuntime_s:Math.max(0,+st0.minRuntime_s||(+st0.minimumRuntime_min||0)*60),minOffTime_s:Math.max(0,+st0.minOffTime_s||(+st0.minimumOffTime_min||0)*60),startupElectricity_J_perStart:Math.max(0,+st0.startupElectricity_J_perStart||0),allowForcedExcessRejection:st0.allowForcedExcessRejection!==false};
  let partLoadCOPCurve=spec.partLoadCOPCurve??performanceOptions.partLoadCOPCurve??null;if(partLoadCOPCurve!=null){if(!Array.isArray(partLoadCOPCurve)||partLoadCOPCurve.length<2)throw new Error(`mechanical cooling plant ${id} partLoadCOPCurve requires at least two points`);partLoadCOPCurve=partLoadCOPCurve.map(x=>({loadFraction:+(x.loadFraction??x.x),copMultiplier:+(x.copMultiplier??x.multiplier??x.y)})).sort((a,b)=>a.loadFraction-b.loadFraction);if(partLoadCOPCurve.some((x,i)=>!(x.loadFraction>0&&x.loadFraction<=1&&x.copMultiplier>0)||(i&&x.loadFraction<=partLoadCOPCurve[i-1].loadFraction)))throw new Error(`mechanical cooling plant ${id} invalid partLoadCOPCurve`);}
  return{id,capacity_W,supplyTemperature_C,performanceOptions,electricityOwnerId,rejectionOwnerId,rejectionMode:spec.rejectionMode??'ambient',rejectApproach_K:Math.max(0,+(spec.rejectApproach_K??performanceOptions.rejectApproach_K??10)),modules,staging,partLoadCOPCurve,forcedExcessStorageDispatch:spec.forcedExcessStorageDispatch??st0.forcedExcessStorageDispatch??null,capex:Math.max(0,+(spec.capex??0)),fixedOpex_per_year:Math.max(0,+(spec.fixedOpex_per_year??0))};
}
function normalizeMechanicalCoolingPlants(d={},fallback={}){const raw=Array.isArray(d.mechanicalCoolingPlants)?d.mechanicalCoolingPlants:[],out=[],ids=new Set(),issues=[];for(let i=0;i<raw.length;i++)try{const p=normalizeMechanicalCoolingPlant(raw[i],fallback);if(ids.has(p.id))throw new Error(`duplicate mechanical cooling plant id ${p.id}`);ids.add(p.id);out.push(p);}catch(e){issues.push({circuit:'mechanicalCoolingPlant',index:i,reason:e.message});}return{plants:out,issues};}
function mechanicalCoolingPlantMap(design){return new Map((design?.mechanicalCoolingPlants??[]).map(p=>[p.id,p]));}
function mechanicalPlantCOPMultiplier(curve,loadFraction){if(!curve?.length)return 1;const x=clamp(+loadFraction||0,curve[0].loadFraction,curve.at(-1).loadFraction);if(x<=curve[0].loadFraction)return curve[0].copMultiplier;for(let i=1;i<curve.length;i++)if(x<=curve[i].loadFraction){const a=curve[i-1],b=curve[i],f=(x-a.loadFraction)/(b.loadFraction-a.loadFraction);return a.copMultiplier+f*(b.copMultiplier-a.copMultiplier);}return curve.at(-1).copMultiplier;}
function createMechanicalCoolingPlantState(plant,project,n){const modules=plant.modules.map(m=>({...m,availabilityProfile:m.availabilityProfileRef!=null?dynamicPhaseLoadProfile(project,m.availabilityProfileRef,n):null}));if(modules.length>20)throw new Error(`mechanical cooling plant ${plant.id} module count > 20 is outside exhaustive staging screen`);return{plantId:plant.id,modules,moduleStates:modules.map(()=>({on:false,runLock:0,offLock:0,starts:0,onSteps:0})),prevMask:0,totalStarts:0,startupElectricity_J:0,forcedExcessEnergy_J:0,forcedExcessToStorage_J:0,forcedExcessRejected_J:0,rejectionViolation_J:0,restartBlockedUnmet_J:0,last:null};}
function createMechanicalCoolingPlantStateMap(design,project,n){return new Map((design?.mechanicalCoolingPlants??[]).map(p=>[p.id,createMechanicalCoolingPlantState(p,project,n)]));}
function mechanicalPlantAvailabilityFractions(st,h){return st.modules.map(m=>clamp(m.availabilityProfile?+(m.availabilityProfile[h]??0):m.availabilityFraction,0,1));}
function mechanicalPlantAvailableCapacityW(st,h,plant){const a=mechanicalPlantAvailabilityFractions(st,h);if(!plant.staging.enabled)return st.modules.reduce((s,m,i)=>s+m.capacity_W*a[i],0);let q=0;for(let i=0;i<st.modules.length;i++){const ms=st.moduleStates[i];if(a[i]>0&&(ms.on||ms.offLock<=0))q+=st.modules[i].capacity_W*a[i];}return q;}
function advanceMechanicalCoolingPlantState(st,plant,target_W,h,{dt_s=HOUR_S}={}){const target=Math.max(0,+target_W||0),a=mechanicalPlantAvailabilityFractions(st,h),n=st.modules.length,s=plant.staging,preAvailable=mechanicalPlantAvailableCapacityW(st,h,plant);if(!s.enabled){const available=st.modules.reduce((x,m,i)=>x+m.capacity_W*a[i],0),output_W=Math.min(target,available),unmet_W=Math.max(0,target-output_W),plr=available>0?output_W/available:0,copMultiplier=mechanicalPlantCOPMultiplier(plant.partLoadCOPCurve,plr);st.prevMask=0;st.last={mask:0,target_W:target,output_W,unmet_W,forcedExcess_W:0,usefulServed_W:output_W,startupElectricity_J:0,restartBlockedUnmet_W:0,availabilityFractions:a,availableCapacity_W:available,activeMinOutput_W:0,activeMaxOutput_W:available,loadFraction:plr,copMultiplier,activeModuleIds:output_W>0?st.modules.filter((m,i)=>a[i]>0).map(m=>m.id):[],startedModuleIds:[],stoppedModuleIds:[]};return st.last;}const runLockSteps=Math.max(0,Math.ceil(s.minRuntime_s/dt_s)-1),offLockSteps=Math.max(0,Math.ceil(s.minOffTime_s/dt_s)-1);let lockedOn=0,lockedOff=0;for(let i=0;i<n;i++){const q=st.moduleStates[i];if(a[i]<=0)continue;if(q.on&&q.runLock>0)lockedOn|=(1<<i);if(!q.on&&q.offLock>0)lockedOff|=(1<<i);}let best=null;for(let mask=0;mask<(1<<n);mask++){let unavailable=false;for(let i=0;i<n;i++)if((mask&(1<<i))&&a[i]<=0){unavailable=true;break;}if(unavailable||(mask&lockedOn)!==lockedOn||(mask&lockedOff)!==0)continue;let min=0,max=0;for(let i=0;i<n;i++)if(mask&(1<<i)){max+=st.modules[i].capacity_W*a[i];min+=st.modules[i].capacity_W*a[i]*st.modules[i].minModulationFraction;}let output_W=0,unmet_W=0,forcedExcess_W=0;if(mask===0)unmet_W=target;else if(target<min){output_W=min;forcedExcess_W=min-target;}else if(target>max){output_W=max;unmet_W=target-max;}else output_W=target;const starts=plantCyclingMaskIndexes(mask&~st.prevMask,n).length,c={mask,output_W,unmet_W,forcedExcess_W,starts,activeMinOutput_W:min,activeMaxOutput_W:max};const fields=['unmet_W','forcedExcess_W','starts','activeMaxOutput_W'];let better=!best;if(best)for(const f of fields){if(Math.abs(c[f]-best[f])>1e-9){better=c[f]<best[f];break;}}if(better)best=c;}if(!best)throw new Error(`no feasible staging state for mechanical cooling plant ${plant.id}`);const starts=plantCyclingMaskIndexes(best.mask&~st.prevMask,n),stops=plantCyclingMaskIndexes(st.prevMask&~best.mask,n);for(let i=0;i<n;i++){const now=!!(best.mask&(1<<i)),was=st.moduleStates[i].on,q=st.moduleStates[i];if(a[i]<=0&&was){q.on=false;q.runLock=0;q.offLock=offLockSteps;}else if(now&&!was){q.on=true;q.starts++;q.runLock=runLockSteps;q.offLock=0;}else if(!now&&was){q.on=false;q.offLock=offLockSteps;q.runLock=0;}else if(now){if(q.runLock>0)q.runLock--;}else if(q.offLock>0)q.offLock--;if(now)q.onSteps++;}const startupElectricity_J=starts.length*s.startupElectricity_J_perStart,restartBlockedUnmet_W=lockedOff&&best.unmet_W>0?best.unmet_W:0,plr=best.activeMaxOutput_W>0?best.output_W/best.activeMaxOutput_W:0,copMultiplier=mechanicalPlantCOPMultiplier(plant.partLoadCOPCurve,plr);st.totalStarts+=starts.length;st.startupElectricity_J+=startupElectricity_J;st.forcedExcessEnergy_J+=best.forcedExcess_W*dt_s;st.restartBlockedUnmet_J+=restartBlockedUnmet_W*dt_s;st.prevMask=best.mask;st.last={...best,target_W:target,usefulServed_W:Math.min(target,best.output_W),startupElectricity_J,restartBlockedUnmet_W,availabilityFractions:a,availableCapacity_W:preAvailable,loadFraction:plr,copMultiplier,activeModuleIds:plantCyclingMaskIndexes(best.mask,n).map(i=>st.modules[i].id),startedModuleIds:starts.map(i=>st.modules[i].id),stoppedModuleIds:stops.map(i=>st.modules[i].id)};return st.last;}
function cloneMechanicalCoolingPlantState(st){return{...st,modules:st.modules,moduleStates:st.moduleStates.map(x=>({...x})),last:st.last?{...st.last}:null};}
function predictMechanicalCoolingPlantMarginalPerformance(st,plant,target_W,h,{dt_s=HOUR_S,baseElectricity_kWh_per_kWhCooling}={}){
  const base=+baseElectricity_kWh_per_kWhCooling;if(!(Number.isFinite(base)&&base>0))throw new Error(`mechanical cooling plant ${plant?.id??''} state-aware marginal predictor requires positive explicit base electricity intensity`);
  if(!st||!plant)throw new Error('mechanical cooling plant state and plant are required');
  const probe=cloneMechanicalCoolingPlantState(st),step=advanceMechanicalCoolingPlantState(probe,plant,Math.max(0,+target_W||0),h,{dt_s}),useful_W=Math.max(0,+step.usefulServed_W||0),generated_W=Math.max(0,+step.output_W||0),startup_J=Math.max(0,+step.startupElectricity_J||0),mult=Math.max(1e-12,+step.copMultiplier||1);
  if(!(useful_W>0))return{available:false,target_W:Math.max(0,+target_W||0),useful_W:0,generated_W,startupElectricity_J:startup_J,electricity_kWh_per_kWhCooling:Infinity,compressorElectricity_kWh_per_kWhCooling:Infinity,startupElectricity_kWh_per_kWhCooling:Infinity,forcedExcess_W:Math.max(0,+step.forcedExcess_W||0),restartBlockedUnmet_W:Math.max(0,+step.restartBlockedUnmet_W||0),loadFraction:+step.loadFraction||0,copMultiplier:mult,activeModuleIds:[...(step.activeModuleIds??[])],startedModuleIds:[...(step.startedModuleIds??[])]};
  const compressorIntensity=base*(generated_W/useful_W)/mult,startupIntensity=startup_J/(useful_W*dt_s),total=compressorIntensity+startupIntensity;
  return{available:true,target_W:Math.max(0,+target_W||0),useful_W,generated_W,startupElectricity_J:startup_J,electricity_kWh_per_kWhCooling:total,compressorElectricity_kWh_per_kWhCooling:compressorIntensity,startupElectricity_kWh_per_kWhCooling:startupIntensity,forcedExcess_W:Math.max(0,+step.forcedExcess_W||0),restartBlockedUnmet_W:Math.max(0,+step.restartBlockedUnmet_W||0),loadFraction:+step.loadFraction||0,copMultiplier:mult,activeModuleIds:[...(step.activeModuleIds??[])],startedModuleIds:[...(step.startedModuleIds??[])]};
}
function cloneColdStorageState(st){return{...st,spec:{...st.spec}};}
function predictMechanicalForcedExcessStorageAcceptance(plantId,forcedExcess_W,plant,coldStorageStates,policy,{alreadyChargedByStorage_W={},storageAcceptanceCapByComponent_W=null}={}){
  const forced=Math.max(0,+forcedExcess_W||0),ids=[...(policy?.storageIds??[])],details=[];if(!(forced>0)||!plant||!policy?.enabled||!ids.length)return{forcedExcess_W:forced,accepted_W:0,rejected_W:forced,byStorage_W:{},details};
  const clones=new Map(ids.map(id=>[id,coldStorageStates?.get?.(id)?cloneColdStorageState(coldStorageStates.get(id)):null])),used={...alreadyChargedByStorage_W},byStorage_W={};
  const capUsed={};const charge=(id,q)=>{const st=clones.get(id);if(!st||!(q>0))return 0;const remPower=Math.max(0,st.spec.maxCharge_W-(used[id]??0)),reservationCap=storageAcceptanceCapByComponent_W&&Number.isFinite(storageAcceptanceCapByComponent_W[id])?Math.max(0,storageAcceptanceCapByComponent_W[id]-(capUsed[id]??0)):Infinity,x=coldStorageCharge(st,Math.min(q,remPower,reservationCap),plant.supplyTemperature_C,HOUR_S);used[id]=(used[id]??0)+x;capUsed[id]=(capUsed[id]??0)+x;byStorage_W[id]=(byStorage_W[id]??0)+x;return x;};
  let accepted=0;if(policy.mode==='fixedShares'){for(const id of ids){const allocation=forced*Math.max(0,+policy.shares?.[id]||0),x=charge(id,allocation);accepted+=x;details.push({mechanicalPlantId:plantId,storageComponentId:id,mode:'fixedShares',availableAllocation_W:allocation,accepted_W:x});}}else{let rem=forced;for(const id of(policy.priority?.length?policy.priority:ids)){const allocation=rem,x=charge(id,allocation);accepted+=x;rem=Math.max(0,rem-x);details.push({mechanicalPlantId:plantId,storageComponentId:id,mode:policy.mode,availableAllocation_W:allocation,accepted_W:x});if(rem<=1e-12)break;}}
  return{forcedExcess_W:forced,accepted_W:accepted,rejected_W:Math.max(0,forced-accepted),byStorage_W,details};
}
function mechanicalCoolingPlantStateSnapshots(states){const out={};for(const [id,st] of(states??new Map()))out[id]={plantId:id,totalStarts:st.totalStarts,startupElectricity_J:st.startupElectricity_J,forcedExcessEnergy_J:st.forcedExcessEnergy_J,forcedExcessToStorage_J:st.forcedExcessToStorage_J,forcedExcessRejected_J:st.forcedExcessRejected_J,rejectionViolation_J:st.rejectionViolation_J,restartBlockedUnmet_J:st.restartBlockedUnmet_J,modules:st.modules.map((m,i)=>({id:m.id,capacity_W:m.capacity_W,minModulationFraction:m.minModulationFraction,starts:st.moduleStates[i].starts,onTime_h:st.moduleStates[i].onSteps})),last:st.last};return out;}
function evaluateExplicitMechanicalPlantsHour(design,directDispatch,sourceProfiles,{outdoor_C,groundTemperature_C=null,plantSteps=null}={}){
  const plantMap=mechanicalCoolingPlantMap(design),byPlant={},bySourceElectric_W={},bySourceRejected_W={},sourceUsefulByPlant={};let cooling_W=0,electric_W=0,rejected_W=0,startupElectric_W=0,forcedExcess_W=0;
  for(const [sid,q0] of Object.entries(directDispatch?.bySource_W??{})){const src=sourceProfiles?.[sid];if(src?.availableMode!=='mechanicalCoolingDirect')continue;const q=Math.max(0,+q0||0),pid=src.mechanicalPlantId;if(!sourceUsefulByPlant[pid])sourceUsefulByPlant[pid]=[];sourceUsefulByPlant[pid].push([sid,q]);cooling_W+=q;}
  for(const [pid,plant] of plantMap){const rows=sourceUsefulByPlant[pid]??[],useful=rows.reduce((a,x)=>a+x[1],0),step=plantSteps?.get?.(pid)??null,generated=step?Math.max(0,step.output_W):useful;if(!(generated>0)&&!(step?.startupElectricity_J>0)){byPlant[pid]={plantId:pid,cooling_W:useful,generatedCooling_W:0,electric_W:0,rejected_W:0,COP:null,supplyTemperature_C:plant.supplyTemperature_C,reject_C:null,electricityOwnerId:plant.electricityOwnerId,rejectionOwnerId:plant.rejectionOwnerId,activeModuleIds:step?.activeModuleIds??[],availableCapacity_W:step?.availableCapacity_W??plant.capacity_W,loadFraction:step?.loadFraction??0,copMultiplier:step?.copMultiplier??1,forcedExcess_W:step?.forcedExcess_W??0,startupElectric_W:(step?.startupElectricity_J??0)/HOUR_S};continue;}const rejectBase=plant.rejectionMode==='ground'&&Number.isFinite(+groundTemperature_C)?+groundTemperature_C:+outdoor_C,reject_C=rejectBase+plant.rejectApproach_K,baseCOP=coolingCOPAtReject(plant.supplyTemperature_C,reject_C,plant.performanceOptions),copMultiplier=step?.copMultiplier??1,COP=Math.max(1e-6,baseCOP*copMultiplier),compressor=generated/COP,startup=(step?.startupElectricity_J??0)/HOUR_S,e=compressor+startup,r=generated+compressor;electric_W+=e;startupElectric_W+=startup;rejected_W+=r;forcedExcess_W+=step?.forcedExcess_W??0;const usefulShareDen=Math.max(useful,1e-12);for(const [sid,q] of rows){const f=q/usefulShareDen;bySourceElectric_W[sid]=(bySourceElectric_W[sid]??0)+compressor*f;bySourceRejected_W[sid]=(bySourceRejected_W[sid]??0)+r*f;}byPlant[pid]={plantId:pid,cooling_W:useful,generatedCooling_W:generated,electric_W:e,compressorElectric_W:compressor,startupElectric_W:startup,rejected_W:r,COP,supplyTemperature_C:plant.supplyTemperature_C,reject_C,electricityOwnerId:plant.electricityOwnerId,rejectionOwnerId:plant.rejectionOwnerId,activeModuleIds:step?.activeModuleIds??[],availableCapacity_W:step?.availableCapacity_W??plant.capacity_W,loadFraction:step?.loadFraction??(plant.capacity_W>0?generated/plant.capacity_W:0),copMultiplier,forcedExcess_W:step?.forcedExcess_W??0,restartBlockedUnmet_W:step?.restartBlockedUnmet_W??0};}
  return{cooling_W,electric_W,rejected_W,startupElectric_W,forcedExcess_W,COP:electric_W>0?cooling_W/electric_W:null,byPlant,bySourceElectric_W,bySourceRejected_W};
}

function normalizeCandidate(d={}){
  const phaseInterfaces=evaluatePhaseInterfaces(d.phaseInterfaces??{});
  const phaseInterfaceIssues=phaseInterfaces.issues.map(x=>({circuit:'phaseInterface',...x}));
  const busSupply=d.busSupply_C??45,busReturn=d.busReturn_C??35,coolSupply=d.coolingSupply_C??16,coolReturn=d.coolingReturn_C??20;
  const heatingFluidSpec=d.heatingFluidSpec??{family:'water'},coolingFluidSpec=d.coolingFluidSpec??{family:'water'};
  const heatingFluidProperties=resolveFluidProperties(heatingFluidSpec,(busSupply+busReturn)/2),coolingFluidProperties=resolveFluidProperties(coolingFluidSpec,(coolSupply+coolReturn)/2);
  const fluidPropertyIssues=[]; if(!heatingFluidProperties.available)fluidPropertyIssues.push({circuit:'heating',reason:heatingFluidProperties.reason}); if(!coolingFluidProperties.available)fluidPropertyIssues.push({circuit:'cooling',reason:coolingFluidProperties.reason});
  const heatingExposure_C=Math.min(busSupply,busReturn,Number.isFinite(heatingFluidSpec.minimumExposure_C)?heatingFluidSpec.minimumExposure_C:Infinity),coolingExposure_C=Math.min(coolSupply,coolReturn,Number.isFinite(coolingFluidSpec.minimumExposure_C)?coolingFluidSpec.minimumExposure_C:Infinity);
  const heatingFreezeAssessment=assessFreezeMargin(heatingFluidSpec,heatingExposure_C,3),coolingFreezeAssessment=assessFreezeMargin(coolingFluidSpec,coolingExposure_C,3),fluidFreezeWarnings=[];
  for(const [circuit,a] of [['heating',heatingFreezeAssessment],['cooling',coolingFreezeAssessment]]) if(a.available){if(a.margin_K<0)fluidPropertyIssues.push({circuit,reason:'working-fluid-below-freezing-point',freezeAssessment:a});else if(!a.meetsRequiredMargin)fluidFreezeWarnings.push({circuit,reason:'freeze-margin-below-3K',freezeAssessment:a});}
  const rawStorageInputs=Array.isArray(d.storages)&&d.storages.length?d.storages:[(d.tank??{volume_m3:0})],storageIds=new Set(),storages=[];let primaryStorageId=d.primaryStorageId??null;
  for(let i=0;i<rawStorageInputs.length;i++){const raw=rawStorageInputs[i]??{},id=raw.componentId??raw.storageId??((rawStorageInputs.length===1)?'legacy-tank':null);if(!id){fluidPropertyIssues.push({circuit:'storage',reason:'stateful-storage-id-required',index:i});continue;}if(storageIds.has(id)){fluidPropertyIssues.push({circuit:'storage',reason:'duplicate-stateful-storage-id',componentId:id});continue;}storageIds.add(id);const fs=raw.fluidSpec??heatingFluidSpec,mean=((raw.Tcold_C??30)+(raw.Thot_C??45))/2,fp=resolveFluidProperties(fs,mean);if((raw.volume_m3??0)>0&&!fp.available)fluidPropertyIssues.push({circuit:'storage',componentId:id,reason:fp.reason});const spec=normalizeTankSpec({...raw,componentId:id,storageId:id,...(fp.available?{rho_kg_m3:fp.rho_kg_m3,cp_J_kgK:fp.cp_J_kgK}:{}),fluidSpec:fs});storages.push(spec);if(raw.primaryHeatingStore===true){if(primaryStorageId&&primaryStorageId!==id)fluidPropertyIssues.push({circuit:'storage',reason:'multiple-primary-heating-stores',componentIds:[primaryStorageId,id]});primaryStorageId=id;}}
  if(!primaryStorageId)primaryStorageId=storages[0]?.componentId??'legacy-tank';const tank=storages.find(x=>x.componentId===primaryStorageId)??normalizeTankSpec({componentId:primaryStorageId,volume_m3:0});const tankFluidSpec=tank.fluidSpec??heatingFluidSpec,tankFluidProperties=resolveFluidProperties(tankFluidSpec,(tank.Tcold_C+tank.Thot_C)/2);
  const rawColdStorageInputs=Array.isArray(d.coldStorages)?d.coldStorages:[],coldStorages=[],coldStorageIds=new Set();
  for(let i=0;i<rawColdStorageInputs.length;i++){
    const raw=rawColdStorageInputs[i]??{},id=raw.componentId??raw.storageId??null;
    if(!id){fluidPropertyIssues.push({circuit:'coldStorage',reason:'stateful-cold-storage-id-required',index:i});continue;}
    if(storageIds.has(id)||coldStorageIds.has(id)){fluidPropertyIssues.push({circuit:'coldStorage',reason:'duplicate-thermal-storage-id',componentId:id});continue;}
    coldStorageIds.add(id);
    const fs=raw.fluidSpec??coolingFluidSpec,mean=((raw.Tcharged_C??raw.Tcold_C??6)+(raw.Tdischarged_C??raw.Thot_C??12))/2,fp=resolveFluidProperties(fs,mean);
    if((raw.volume_m3??0)>0&&!fp.available)fluidPropertyIssues.push({circuit:'coldStorage',componentId:id,reason:fp.reason});
    try{coldStorages.push(normalizeColdStorageSpec({...raw,componentId:id,storageId:id,...(fp.available?{rho_kg_m3:fp.rho_kg_m3,cp_J_kgK:fp.cp_J_kgK}:{}),fluidSpec:fs}));}
    catch(e){fluidPropertyIssues.push({circuit:'coldStorage',componentId:id,reason:e.message});}
  }
  const mechanicalPlantNorm=normalizeMechanicalCoolingPlants(d,{coolingSupply_C:coolSupply,coolingOptions:d.coolingOptions??{}});fluidPropertyIssues.push(...mechanicalPlantNorm.issues);const pipe=normalizeHydronicPipe(d.pipe??{}),heatPumpPlant=normalizeHeatPumpPlant(d),plantCycling=normalizePlantCycling(d.heatPumpPlant?.cycling??d.plantCycling??{},heatPumpPlant),reliability=normalizeReliability(d.reliability??{});
  const graphHasTopologyRoles=phaseGraphArr(d.components).some(c=>rolesOf(c).length>0||phaseStorageServiceRole(c)!=null||phaseStorageChargeRole(c)!=null||phaseColdDirectRole(c)!=null);
  const phaseTopologyOwnership=d.phaseTopologyOwnership??(graphHasTopologyRoles?derivePhaseTopologyOwnership({components:d.components,edges:d.edges,nodes:d.nodes}):null);
  return{
    name:d.name??'candidate',comparisonOnly:d.comparisonOnly??false,siteEnergyStrategy:{electricUpgrade:!!(d.siteEnergyStrategy?.electricUpgrade)},boilerFuelCarrier:d.boilerFuelCarrier??'gas',hpType:d.hpType??'airWater',hpCapacity_W:heatPumpPlant.installed_W,hpSink_C:d.hpSink_C??45,hpOptions:d.hpOptions??{},heatPumpSource:{enabled:!!d.heatPumpSource?.enabled,kind:d.heatPumpSource?.kind??null,temperatureProfileRef:String(d.heatPumpSource?.temperatureProfileRef??'sourceWater_C'),hpTypeOverride:d.heatPumpSource?.hpTypeOverride??'waterWater',maxExtraction_W:Math.max(0,Number(d.heatPumpSource?.maxExtraction_W)||0),pump_W_per_kW:Math.max(0,Number(d.heatPumpSource?.pump_W_per_kW)||0),capex:Math.max(0,Number(d.heatPumpSource?.capex)||0),minOutlet_C:Number.isFinite(Number(d.heatPumpSource?.minOutlet_C))?Number(d.heatPumpSource.minOutlet_C):-Infinity,sourceMdot_kg_s:Math.max(0,Number(d.heatPumpSource?.sourceMdot_kg_s)||0),sourceCp_J_kgK:Math.max(0,Number(d.heatPumpSource?.sourceCp_J_kgK)||4180),name:d.heatPumpSource?.name??null,provenance:d.heatPumpSource?.provenance??null,externality:d.heatPumpSource?.externality??null},heatPumpPlant,plantCycling,reliability,
    boilerCapacity_W:d.boilerCapacity_W??0,boilerEfficiency:d.boilerEfficiency??0.93,
    hotSinkBackupCarrier:d.hotSinkBackupCarrier??d.boilerFuelCarrier??'gas',
    hotSinkBackupEfficiency:d.hotSinkBackupEfficiency??(d.hotSinkBackupCarrier==='electricity'?0.98:(d.boilerEfficiency??0.93)),
    hotSinkBackupCapex:d.hotSinkBackupCapex??0,
    wasteHXApproach_K:d.wasteHXApproach_K??3,wasteDirectMax_W:d.wasteDirectMax_W??Infinity,
    busSupply_C:busSupply,busReturn_C:busReturn,heatingTerminal:normalizeHeatingTerminal(d,busSupply,busReturn),
    coolingCapacity_W:d.coolingCapacity_W??0,coolingSupply_C:coolSupply,coolingReturn_C:coolReturn,coolingOptions:d.coolingOptions??{},heatRecovery:{enabled:d.heatRecovery?.enabled??false,systemId:d.heatRecovery?.systemId??null,maxRecovery_W:d.heatRecovery?.maxRecovery_W??Infinity,approach_K:d.heatRecovery?.approach_K??3,allowTankCharge:d.heatRecovery?.allowTankCharge??true,capex:d.heatRecovery?.capex??0},coolingTerminal:normalizeCoolingTerminal(d,coolSupply,coolReturn),latentTerminal:normalizeLatentTerminal(d),
    heatingFluidSpec,coolingFluidSpec,heatingFluidProperties,coolingFluidProperties,heatingFreezeAssessment,coolingFreezeAssessment,fluidFreezeWarnings,tankFluidSpec,tankFluidProperties,fluidPropertyIssues,phaseInterfaces,phaseInterfaceIssues,dynamicPhaseComponents:d.dynamicPhaseComponents??null,phaseTopologyOwnership,storages,coldStorages,primaryStorageId,mechanicalCoolingPlants:mechanicalPlantNorm.plants,mechanicalCoolingPlantDispatch:d.mechanicalCoolingPlantDispatch??null,
    pipe,coolingPipe:normalizeHydronicPipe(d.coolingPipe??{},pipe),airside:normalizeAirside(d.airside??{}),freeCooling:normalizeFreeCooling(d.freeCooling??{}),groundCoupling:normalizeGroundCoupling(d.groundCoupling??{}),pv:normalizePV(d.pv??{}),shading:normalizeShading(d.shading??{}),humidifier:normalizeHumidifier(d.humidifier??{}),tank,
    preheatOnCheap:d.preheatOnCheap??true,precoolOnCheap:d.precoolOnCheap??true,cheapQuantile:d.cheapQuantile??0.25,dischargeOnExpensive:d.dischargeOnExpensive??true,expensiveQuantile:d.expensiveQuantile??0.70,
    hpChargeReserveFactor:d.hpChargeReserveFactor??0.35,
    hpCapex_per_kW:d.hpCapex_per_kW??850,boilerCapex_per_kW:d.boilerCapex_per_kW??180,coolingCapex_per_kW:d.coolingCapex_per_kW??0,coolingFixedCapex:d.coolingFixedCapex??0,
    emitterCapex:d.emitterCapex??0,coolingTerminalCapex:d.coolingTerminalCapex??0,pipeCapex:d.pipeCapex??0,coolingPipeCapex:d.coolingPipeCapex??0,
    bodNotes:Array.isArray(d.bodNotes)?d.bodNotes:[],fixedOpex_per_year:d.fixedOpex_per_year??1200,hpReplacementYear:d.hpReplacementYear??18,hpReplacementFraction:d.hpReplacementFraction??0.55,residualValue:d.residualValue??0,
  };
}

function legacyHeatRecoveryCapex(d){
  if(!d?.heatRecovery?.enabled)return 0;
  const systems=(d.phaseTopologyOwnership?.refrigeration??[]).filter(r=>r?.dynamicHeatRecovery?.routing||r?.heatRecovery?.routing).map(r=>r.dynamicHeatRecovery?.systemId??r.heatRecovery?.systemId??r.dynamicComponentId).filter(Boolean);
  const uniq=[...new Set(systems)];
  const id=d.heatRecovery.systemId??null;
  if(id&&uniq.includes(id))return 0;
  if(!id&&uniq.length===1)return 0;
  return d.heatRecovery.capex??0;
}

function candidateCapex(d,project=null){const site=normalizeSiteEnergyAvailability(project?.siteEnergyAvailability??{}),gridUpgradeCap=d.siteEnergyStrategy?.electricUpgrade?site.electricity.upgradeCapex:0,pvCap=d.pv.enabled?(d.pv.capex??estimatePVCost({capacity_kWp:d.pv.capacity_kWp}).mid):0,shadeCap=d.shading.enabled?(d.shading.capex??estimateAutomaticShadingCost({type:d.shading.type,windowArea_m2:d.shading.windowArea_m2}).mid):0,humCap=d.humidifier.enabled?(d.humidifier.capex??estimateHumidifierCost(d.humidifier.type,d.humidifier.design_kg_h).mid):0,hpPlantCap=d.hpCapacity_W/1000*d.hpCapex_per_kW+d.heatPumpPlant.modules.reduce((s,m)=>s+m.fixedCapex,0)+d.heatPumpPlant.stagingControlsCapex,explicitMechanicalPlantCap=(d.mechanicalCoolingPlants??[]).reduce((a,p)=>a+(p.capex??0),0),mobileCap=d.reliability.mode==='mobileReady'?d.reliability.mobileConnectionCapex:0;return gridUpgradeCap+hpPlantCap+explicitMechanicalPlantCap+mobileCap+d.hotSinkBackupCapex+d.boilerCapacity_W/1000*d.boilerCapex_per_kW+d.coolingCapacity_W/1000*d.coolingCapex_per_kW+d.coolingFixedCapex+legacyHeatRecoveryCapex(d)+d.latentTerminal.capex+d.emitterCapex+d.coolingTerminalCapex+d.pipeCapex+d.coolingPipeCapex+airsideCapex(d.airside)+freeCoolingCapex(d.freeCooling)+d.groundCoupling.capex+(d.heatPumpSource.enabled?d.heatPumpSource.capex:0)+pvCap+shadeCap+humCap+(Array.isArray(d.storages)&&d.storages.length?d.storages.reduce((a,x)=>a+tankCapex(x),0):tankCapex(d.tank))+(Array.isArray(d.coldStorages)?d.coldStorages.reduce((a,x)=>a+(x.capexFixed??0)+(x.capexPerM3??0)*(x.volume_m3??0),0):0)}



/* ---------- v0.36 explicit program-adapter annual integration ---------- */
function programScheduleFractions(value,n,{occupied=null,name='program schedule'}={}){
  if(value==null)return null;
  if(typeof value==='string'){
    if(value==='continuous')return new Float64Array(n).fill(1);
    if(value==='occupied'){
      if(!occupied||occupied.length!==n)throw new Error(`${name}: occupied profile required`);
      return Float64Array.from(occupied,x=>x?1:0);
    }
    throw new Error(`${name}: unsupported schedule mode ${value}`);
  }
  if(Number.isFinite(+value))return new Float64Array(n).fill(clamp(+value,0,1));
  if(value&&Number.isFinite(value.length)){
    if(value.length===n)return Float64Array.from(value,x=>clamp(+x||0,0,1));
    if(value.length===24){const out=new Float64Array(n);for(let h=0;h<n;h++)out[h]=clamp(+value[h%24]||0,0,1);return out;}
    throw new Error(`${name}: schedule length must be 24 or ${n}`);
  }
  throw new Error(`${name}: invalid schedule`);
}
function normalizeDHWDraw24(v){
  if(v==='uniform'||v==null)return v==='uniform'?new Float64Array(24).fill(1/24):null;
  if(!v||v.length!==24)throw new Error('programIntegration.dhw.drawProfile24 must contain 24 weights or "uniform"');
  const a=Float64Array.from(v,x=>Math.max(0,+x||0)),sum=a.reduce((s,x)=>s+x,0);if(!(sum>0))throw new Error('programIntegration.dhw.drawProfile24 must have positive weight');for(let i=0;i<24;i++)a[i]/=sum;return a;
}
function prepareProgramAnnualProject(inputProject={}){
  const ai=inputProject.programAnnualInputs;if(!ai)return{project:inputProject,summary:{enabled:false,issues:[],programKind:null}};
  const p0=inputProject.profiles??{},n=p0.outdoor_C?.length??0;if(!(n>0))throw new Error('program annual integration requires outdoor_C profile');
  const cfg=inputProject.programIntegration??{},issues=[],p={...p0};
  const baseVent=p0.ventilationFlow_m3_s&&p0.ventilationFlow_m3_s.length===n?Float64Array.from(p0.ventilationFlow_m3_s):new Float64Array(n);
  const requiredVent=new Float64Array(n),programVentAdded=new Float64Array(n),programExhaust=new Float64Array(n),programDHW=new Float64Array(n);
  const qVent=Math.max(0,+ai.mandatoryOutdoorAir_m3_h||0)/3600;
  let ventSched=null;if(qVent>0){ventSched=programScheduleFractions(cfg.ventilationSchedule,n,{occupied:p0.occupied,name:'program ventilation schedule'});if(!ventSched)issues.push({code:'PROGRAM_VENTILATION_SCHEDULE_UNRESOLVED',severity:'error'});}
  if(ventSched){for(let h=0;h<n;h++){requiredVent[h]=qVent*ventSched[h];const v=Math.max(baseVent[h],requiredVent[h]);programVentAdded[h]=Math.max(0,v-baseVent[h]);baseVent[h]=v;}p.ventilationFlow_m3_s=baseVent;}
  const qExhaust=Math.max(0,+((ai.designExhaust_m3_h??ai.localExhaustDesign_m3_h)??0))/3600;
  let exhaustSched=null;if(qExhaust>0&&cfg.includeExhaustReplacement===true){exhaustSched=programScheduleFractions(cfg.exhaustSchedule,n,{occupied:p0.occupied,name:'program exhaust schedule'});if(!exhaustSched)issues.push({code:'PROGRAM_EXHAUST_SCHEDULE_UNRESOLVED',severity:'error'});else for(let h=0;h<n;h++)programExhaust[h]=qExhaust*exhaustSched[h];}
  if(qExhaust>0&&cfg.includeExhaustReplacement!==true)issues.push({code:'PROGRAM_EXHAUST_REPLACEMENT_NOT_COUPLED',severity:'warning'});
  let dhwEnergy_J_day=0,dhwTarget_C=null;
  const dhwL=Math.max(0,+ai.dhwDaily_L||0),dhwCfg=cfg.dhw??{};
  if(dhwL>0&&dhwCfg.enabled===true){
    const cold=Number.isFinite(+dhwCfg.coldWater_C)?+dhwCfg.coldWater_C:null,target=Number.isFinite(+dhwCfg.target_C)?+dhwCfg.target_C:null,draw=normalizeDHWDraw24(dhwCfg.drawProfile24);
    if(cold==null||target==null||!(target>cold))issues.push({code:'PROGRAM_DHW_TEMPERATURES_UNRESOLVED',severity:'error'});
    else if(!draw)issues.push({code:'PROGRAM_DHW_DRAW_PROFILE_UNRESOLVED',severity:'error'});
    else{
      const props=resolveFluidProperties({family:'water'},(cold+target)/2);if(!props.available)throw new Error('water properties unavailable for program DHW');
      dhwEnergy_J_day=dhwL/1000*props.rho_kg_m3*props.cp_J_kgK*(target-cold);dhwTarget_C=target;
      for(let h=0;h<n;h++)programDHW[h]=dhwEnergy_J_day*draw[h%24]/HOUR_S;
      const baseHot=p0.hotSinkDemand_W&&p0.hotSinkDemand_W.length===n?Float64Array.from(p0.hotSinkDemand_W):new Float64Array(n),baseTarget=p0.hotSinkTarget_C&&p0.hotSinkTarget_C.length===n?Float64Array.from(p0.hotSinkTarget_C):new Float64Array(n).fill(target);
      for(let h=0;h<n;h++){baseHot[h]+=programDHW[h];if(programDHW[h]>0)baseTarget[h]=Math.max(baseTarget[h]||0,target);}p.hotSinkDemand_W=baseHot;p.hotSinkTarget_C=baseTarget;
    }
  }else if(dhwL>0)issues.push({code:'PROGRAM_DHW_NOT_COUPLED',severity:'warning'});
  p.programOutdoorAirRequired_m3_s=requiredVent;p.programOutdoorAirAdded_m3_s=programVentAdded;p.programExhaustReplacement_m3_s=programExhaust;p.programDHW_W=programDHW;
  const roomConstraints=Array.isArray(ai.roomConstraints)?ai.roomConstraints:[],roomSchedule=roomConstraints.length?programScheduleFractions(cfg.roomConstraintSchedule,n,{occupied:p0.occupied,name:'program room-constraint schedule'}):null;
  if(roomConstraints.length&&!roomSchedule)issues.push({code:'PROGRAM_ROOM_CONSTRAINT_SCHEDULE_UNRESOLVED',severity:cfg.enforceRoomConstraints===true?'error':'warning'});if(cfg.enforceRoomConstraints===true&&roomConstraints.some(r=>r.rhMin_frac!=null||r.rhMax_frac!=null)&&inputProject.humidity?.enabled!==true)issues.push({code:'PROGRAM_RH_CONSTRAINT_WITHOUT_HUMIDITY_STATE',severity:'error'});
  if(roomSchedule)p.programRoomConstraintSchedule=roomSchedule;
  const processRaw=inputProject.processExhaust??inputProject.processExhaustPaths??[],processPaths=Array.isArray(processRaw)?processRaw.slice():(processRaw?[processRaw]:[]);
  if(exhaustSched&&qExhaust>0){p.__programExhaustFlow_m3_s=programExhaust;processPaths.push({id:'program-adapter-exhaust',enabled:true,exhaustFlowProfileRef:'__programExhaustFlow_m3_s',makeupFraction:1,makeupRH_frac:null,moistureGeneration_kg_s:0,scheduleFraction:1,excludeSensibleAnnual:true});}
  const project={...inputProject,profiles:p,...(processPaths.length?{processExhaust:processPaths}:{})};
  return{project,summary:{enabled:true,programKind:ai.programKind??null,issues,mandatoryOutdoorAir_m3_h:+ai.mandatoryOutdoorAir_m3_h||0,designExhaust_m3_h:(+ai.designExhaust_m3_h||+ai.localExhaustDesign_m3_h||0),dhwDaily_L:dhwL,dhwEnergy_J_day,dhwTarget_C,roomConstraints,roomConstraintScheduleResolved:!!roomSchedule,sensibleOutdoorAirCoupled:cfg.includeSensibleOutdoorAir===true,exhaustReplacementCoupled:cfg.includeExhaustReplacement===true,exhaustHeatRecoveryEffectiveness:clamp(+cfg.exhaustHeatRecoveryEffectiveness||0,0,1),enforceRoomConstraints:cfg.enforceRoomConstraints===true,roomConstraintDegreeHourTolerance:Math.max(0,+cfg.roomConstraintDegreeHourTolerance||0)}};
}
function programSensibleAirExchangeW(programSummary,profiles,h,{Tout_C,roomT_C,airDensity_kg_m3=1.2,airCp_J_kgK=1006}={}){
  if(!programSummary?.enabled)return 0;let flow=0;if(programSummary.sensibleOutdoorAirCoupled)flow+=profiles.programOutdoorAirAdded_m3_s?.[h]??0;if(programSummary.exhaustReplacementCoupled)flow+=(profiles.programExhaustReplacement_m3_s?.[h]??0)*(1-programSummary.exhaustHeatRecoveryEffectiveness);return flow*airDensity_kg_m3*airCp_J_kgK*(Tout_C-roomT_C);
}
function programRoomConstraintViolation(programSummary,profiles,h,{roomT_C,rh_frac=null}={}){
  if(!programSummary?.enabled||!programSummary.roomConstraintScheduleResolved||!(profiles.programRoomConstraintSchedule?.[h]>0))return{active:false,tempDegreeHours:0,rhDegreeHours:0};
  const rooms=programSummary.roomConstraints??[];let tMin=-Infinity,tMax=Infinity,rhMin=-Infinity,rhMax=Infinity;for(const r of rooms){if(r.temperatureMin_C!=null&&Number.isFinite(+r.temperatureMin_C))tMin=Math.max(tMin,+r.temperatureMin_C);if(r.temperatureMax_C!=null&&Number.isFinite(+r.temperatureMax_C))tMax=Math.min(tMax,+r.temperatureMax_C);if(r.rhMin_frac!=null&&Number.isFinite(+r.rhMin_frac))rhMin=Math.max(rhMin,+r.rhMin_frac);if(r.rhMax_frac!=null&&Number.isFinite(+r.rhMax_frac))rhMax=Math.min(rhMax,+r.rhMax_frac);}
  const tempDegreeHours=Math.max(0,tMin-roomT_C)+Math.max(0,roomT_C-tMax);const rhDegreeHours=rh_frac==null?0:100*(Math.max(0,rhMin-rh_frac)+Math.max(0,rh_frac-rhMax));return{active:true,tMin_C:Number.isFinite(tMin)?tMin:null,tMax_C:Number.isFinite(tMax)?tMax:null,rhMin_frac:Number.isFinite(rhMin)?rhMin:null,rhMax_frac:Number.isFinite(rhMax)?rhMax:null,tempDegreeHours,rhDegreeHours,conflictingTemperatureBounds:tMin>tMax,conflictingRHBounds:rhMin>rhMax};
}


function resolveNamedHotSinkProfiles(project,n){
  const raw=project?.hotSinkProfiles??{};const out={},issues=[];
  if(raw==null||typeof raw!=='object'||Array.isArray(raw))return{profiles:out,issues:[phaseOwnershipIssue('HOT_SINK_PROFILE_MAP_INVALID','error','project.hotSinkProfiles must be an object keyed by graph hot-sink component id.',{})]};
  for(const [id,spec0] of Object.entries(raw)){
    const spec=spec0??{};let demand=null,target=null;
    try{demand=dynamicPhaseLoadProfile(project,spec.demandProfileRef??spec.demand_W,n);}catch(e){issues.push(phaseOwnershipIssue('HOT_SINK_DEMAND_PROFILE_REQUIRED','error',`Named hot sink ${id} requires demandProfileRef or demand_W.`,{componentId:id,reason:e.message}));}
    try{target=dynamicPhaseLoadProfile(project,spec.targetTemperatureProfileRef??spec.targetTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('HOT_SINK_TARGET_PROFILE_REQUIRED','error',`Named hot sink ${id} requires targetTemperatureProfileRef or targetTemperature_C.`,{componentId:id,reason:e.message}));}
    if(demand&&target)out[id]={componentId:id,demand_W:demand,targetTemperature_C:target};
  }
  return{profiles:out,issues};
}
function resolveNamedThermalSourceProfiles(project,n){
  const raw=project?.thermalSourceProfiles??{},out={},issues=[];
  if(raw==null||typeof raw!=='object'||Array.isArray(raw))return{profiles:out,issues:[phaseOwnershipIssue('THERMAL_SOURCE_PROFILE_MAP_INVALID','error','project.thermalSourceProfiles must be an object keyed by graph thermal-source component id.',{})]};
  for(const [id,spec0] of Object.entries(raw)){const spec=spec0??{};let available=null,temp=null;
    try{available=dynamicPhaseLoadProfile(project,spec.availableProfileRef??spec.available_W,n);}catch(e){issues.push(phaseOwnershipIssue('THERMAL_SOURCE_AVAILABLE_PROFILE_REQUIRED','error',`Thermal source ${id} requires availableProfileRef or available_W.`,{componentId:id,reason:e.message}));}
    try{temp=dynamicPhaseLoadProfile(project,spec.supplyTemperatureProfileRef??spec.supplyTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('THERMAL_SOURCE_TEMPERATURE_PROFILE_REQUIRED','error',`Thermal source ${id} requires supplyTemperatureProfileRef or supplyTemperature_C.`,{componentId:id,reason:e.message}));}
    const accountingMode=spec.accountingMode??null;if(!['alreadyAccounted','nonPurchased'].includes(accountingMode))issues.push(phaseOwnershipIssue('THERMAL_SOURCE_ACCOUNTING_MODE_REQUIRED','error',`Thermal source ${id} must declare accountingMode 'alreadyAccounted' or 'nonPurchased' so charging cannot create unpriced purchased energy.`,{componentId:id,accountingMode}));
    if(available&&temp&&['alreadyAccounted','nonPurchased'].includes(accountingMode))out[id]={componentId:id,available_W:available,supplyTemperature_C:temp,accountingMode};
  }
  return{profiles:out,issues};
}
function dispatchStorageChargingHour(phaseTopologyOwnership,storageStates,thermalSourceProfiles,{hour}={}){
  const storageMap=storageStates instanceof Map?storageStates:new Map(),details=[],byStorage_W={},bySource_W={},unusedBySource_W={},rows=phaseTopologyOwnership?.storageCharging??[],groups=new Map();let charged_W=0,available_W=0;
  for(const row of rows){if(!groups.has(row.sourceComponentId))groups.set(row.sourceComponentId,[]);groups.get(row.sourceComponentId).push(row);}
  for(const [sourceComponentId,sourceRows0] of groups){
    const src=thermalSourceProfiles?.[sourceComponentId];if(!src)continue;
    const q=Math.max(0,coldProfileValue(src.available_W,hour)||0),t=coldProfileValue(src.supplyTemperature_C,hour);available_W+=q;
    const sourceRows=[...sourceRows0].sort((a,b)=>((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.storageComponentId.localeCompare(b.storageComponentId));
    if(!(q>0&&Number.isFinite(t))){unusedBySource_W[sourceComponentId]=q;for(const row of sourceRows)details.push({...row,available_W:0,supplyTemperature_C:Number.isFinite(t)?t:null,charged_W:0,unused_W:0});continue;}
    const mode=sourceRows.length>1?(sourceRows[0].allocation?.mode??null):'single';let sourceCharged=0;
    if(mode==='fixedShares'){
      for(const row of sourceRows){const st=storageMap.get(row.storageComponentId),allocated=q*Math.max(0,+row.allocation?.share||0),x=st?tankCharge(st,allocated,t,HOUR_S):0;sourceCharged+=x;charged_W+=x;byStorage_W[row.storageComponentId]=(byStorage_W[row.storageComponentId]??0)+x;details.push({...row,available_W:allocated,supplyTemperature_C:t,charged_W:x,unused_W:Math.max(0,allocated-x)});}
    }else{
      let remaining=q;
      for(const row of sourceRows){const st=storageMap.get(row.storageComponentId),allocated=remaining,x=st?tankCharge(st,allocated,t,HOUR_S):0;sourceCharged+=x;charged_W+=x;remaining=Math.max(0,remaining-x);byStorage_W[row.storageComponentId]=(byStorage_W[row.storageComponentId]??0)+x;details.push({...row,available_W:allocated,supplyTemperature_C:t,charged_W:x,unused_W:remaining});if(remaining<=1e-12)break;}
    }
    bySource_W[sourceComponentId]=sourceCharged;unusedBySource_W[sourceComponentId]=Math.max(0,q-sourceCharged);
  }
  return{available_W,charged_W,unused_W:Object.values(unusedBySource_W).reduce((a,b)=>a+b,0),byStorage_W,bySource_W,unusedBySource_W,details};
}
function createStorageStateMap(storageSpecs){
  const map=new Map();
  for(const spec of(storageSpecs??[])){
    const id=spec?.componentId??spec?.storageId??null;if(!id)continue;
    if(map.has(id))throw new Error(`duplicate stateful storage id: ${id}`);
    map.set(id,createTankState(spec));
  }
  return map;
}
function storageSnapshots(storageStates){const out={};for(const [id,st] of(storageStates??new Map()))out[id]=tankSnapshot(st);return out;}

function normalizeColdStorageSpec(spec={}){
  const volume_m3=+spec.volume_m3||0,rho_kg_m3=+(spec.rho_kg_m3??998),cp_J_kgK=+(spec.cp_J_kgK??4180);
  const Tcharged_C=+(spec.Tcharged_C??spec.Tcold_C??6),Tdischarged_C=+(spec.Tdischarged_C??spec.Thot_C??12);
  if(volume_m3<0||!(rho_kg_m3>0&&cp_J_kgK>0&&Tdischarged_C>Tcharged_C))throw new Error('invalid cold storage spec');
  const storageThermalMode=spec.storageThermalMode??spec.thermalMode??'cooling';
  if(storageThermalMode!=='cooling')throw new Error('cold storage requires storageThermalMode=cooling');
  return {
    model:'mixedCold',
    componentId:spec.componentId??spec.storageId??null,
    storageId:spec.storageId??spec.componentId??null,
    storageThermalMode:'cooling',
    volume_m3,rho_kg_m3,cp_J_kgK,Tcharged_C,Tdischarged_C,
    capacity_J:volume_m3*rho_kg_m3*cp_J_kgK*(Tdischarged_C-Tcharged_C),
    initialSOC:clamp(+(spec.initialSOC??0.5),0,1),
    UA_W_K:Math.max(0,+(spec.UA_W_K??Math.max(0,2.2*Math.pow(Math.max(volume_m3,0.001),2/3)))),
    maxCharge_W:spec.maxCharge_W==null?Infinity:Math.max(0,+spec.maxCharge_W),
    maxDischarge_W:spec.maxDischarge_W==null?Infinity:Math.max(0,+spec.maxDischarge_W),
    chargeEfficiency:clamp(+(spec.chargeEfficiency??0.98),1e-9,1),
    dischargeEfficiency:clamp(+(spec.dischargeEfficiency??0.98),1e-9,1),
    chargeApproach_K:Math.max(0,+(spec.chargeApproach_K??0)),
    serviceApproach_K:Math.max(0,+(spec.serviceApproach_K??0)),
    capexFixed:Math.max(0,+(spec.capexFixed??0)),
    capexPerM3:Math.max(0,+(spec.capexPerM3??0))
  };
}

function createColdStorageState(spec){
  const s=normalizeColdStorageSpec(spec);
  return {spec:s,cold_J:s.capacity_J*s.initialSOC,heatGain_J:0,chargeInput_J:0,dischargeOutput_J:0};
}
function coldStorageSOC(st){return st.spec.capacity_J>0?clamp(st.cold_J/st.spec.capacity_J,0,1):0;}
function coldStorageTemperatureC(st){
  const s=st.spec;if(!(s.capacity_J>0))return s.Tdischarged_C;
  return s.Tdischarged_C-coldStorageSOC(st)*(s.Tdischarged_C-s.Tcharged_C);
}
function coldStorageStandingGain(st,ambient_C,dt_s=HOUR_S){
  const s=st.spec;if(!(s.capacity_J>0))return 0;
  const q=Math.max(0,s.UA_W_K*(ambient_C-coldStorageTemperatureC(st)));
  const e=Math.min(st.cold_J,q*dt_s);st.cold_J-=e;st.heatGain_J+=e;return e;
}
/* Charging means removing heat from the store. A cooling source must be cold enough to
   reach the declared charged state plus explicit approach. */
function coldStorageCharge(st,availableCooling_W,sourceSupply_C,dt_s=HOUR_S){
  const s=st.spec;if(!(availableCooling_W>0)||!(s.capacity_J>0))return 0;
  if(!(Number.isFinite(sourceSupply_C)&&sourceSupply_C<=s.Tcharged_C-s.chargeApproach_K+1e-9))return 0;
  const room=Math.max(0,s.capacity_J-st.cold_J),accepted=Math.min(availableCooling_W,s.maxCharge_W,room/(dt_s*s.chargeEfficiency));
  st.cold_J+=accepted*dt_s*s.chargeEfficiency;st.chargeInput_J+=accepted*dt_s;return accepted;
}
/* Discharge supplies cooling. A mixed tank remains eligible while its current temperature,
   plus any service approach, is no warmer than the sink's maximum required supply. */
function coldStorageDischarge(st,requestCooling_W,maxSupply_C,dt_s=HOUR_S){
  const s=st.spec;if(!(requestCooling_W>0)||!(s.capacity_J>0))return 0;
  if(!(Number.isFinite(maxSupply_C)&&coldStorageTemperatureC(st)+s.serviceApproach_K<=maxSupply_C+1e-9))return 0;
  const delivered=Math.min(requestCooling_W,s.maxDischarge_W,st.cold_J*s.dischargeEfficiency/dt_s);
  st.cold_J-=delivered*dt_s/s.dischargeEfficiency;st.dischargeOutput_J+=delivered*dt_s;return delivered;
}
function coldStorageSnapshot(st){
  return {model:'mixedCold',storageThermalMode:'cooling',componentId:st.spec.componentId,volume_m3:st.spec.volume_m3,
    SOC:coldStorageSOC(st),cold_kWh:st.cold_J/3.6e6,temperature_C:coldStorageTemperatureC(st),
    heatGain_kWh:st.heatGain_J/3.6e6,charge_kWh:st.chargeInput_J/3.6e6,discharge_kWh:st.dischargeOutput_J/3.6e6};
}

/* Dispatch against v0.8 graph ownership output.
   Cooling-source profiles: {available_W[], supplyTemperature_C[]}.
   Cold-sink profiles: {demand_W[], maxSupplyTemperature_C[]}.
*/
function coldProfileValue(v,h){return Number.isFinite(+v)?+v:(v!=null?+v[h]:NaN);}
function dispatchColdStorageChargingHour(ownership,states,sourceProfiles,{hour=0,alreadyChargedByStorage_W={}}={}){
  const rows=(ownership?.storageCharging??[]).filter(x=>x.serviceMode==='cooling'),groups=new Map(),details=[],byStorage_W={},bySource_W={},unusedBySource_W={};
  let available_W=0,charged_W=0;
  for(const row of rows){if(!groups.has(row.sourceComponentId))groups.set(row.sourceComponentId,[]);groups.get(row.sourceComponentId).push(row);}
  for(const [sid,rs0] of groups){
    const src=sourceProfiles?.[sid];if(!src)continue;
    const q=Math.max(0,coldProfileValue(src.available_W,hour)||0),t=coldProfileValue(src.supplyTemperature_C,hour);available_W+=q;
    const rs=[...rs0].sort((a,b)=>((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.storageComponentId.localeCompare(b.storageComponentId));
    const mode=rs.length>1?(rs[0].allocation?.mode??null):'single';let sourceCharged=0;
    if(mode==='fixedShares'){
      for(const row of rs){const alloc0=q*Math.max(0,+row.allocation?.share||0),st=states.get(row.storageComponentId),used=(alreadyChargedByStorage_W[row.storageComponentId]??0)+(byStorage_W[row.storageComponentId]??0),alloc=Math.min(alloc0,Math.max(0,(st?.spec?.maxCharge_W??0)-used)),x=st?coldStorageCharge(st,alloc,t,HOUR_S):0;sourceCharged+=x;charged_W+=x;byStorage_W[row.storageComponentId]=(byStorage_W[row.storageComponentId]??0)+x;details.push({...row,available_W:alloc,charged_W:x,unused_W:Math.max(0,alloc0-x),supplyTemperature_C:t});}
    }else{
      let rem=q;
      for(const row of rs){const st=states.get(row.storageComponentId),used=(alreadyChargedByStorage_W[row.storageComponentId]??0)+(byStorage_W[row.storageComponentId]??0),alloc=Math.min(rem,Math.max(0,(st?.spec?.maxCharge_W??0)-used)),x=st?coldStorageCharge(st,alloc,t,HOUR_S):0;sourceCharged+=x;charged_W+=x;rem=Math.max(0,rem-x);byStorage_W[row.storageComponentId]=(byStorage_W[row.storageComponentId]??0)+x;details.push({...row,available_W:alloc,charged_W:x,unused_W:rem,supplyTemperature_C:t});if(rem<=1e-12)break;}
    }
    bySource_W[sid]=sourceCharged;unusedBySource_W[sid]=Math.max(0,q-sourceCharged);
  }
  return {available_W,charged_W,unused_W:Object.values(unusedBySource_W).reduce((a,b)=>a+b,0),byStorage_W,bySource_W,unusedBySource_W,details};
}

function dispatchColdStorageServicesHour(ownership,states,{coldSinkRemaining_W={},coldSinkMaxSupply_C={}}={}){
  const remaining={};for(const [id,q] of Object.entries(coldSinkRemaining_W))remaining[id]=Math.max(0,+q||0);
  let toColdSink_W=0;const details=[],byStorage_W={},bySink_W={};
  for(const row of (ownership?.storageServices??[]).filter(x=>x.serviceMode==='cooling')){
    const st=states.get(row.storageComponentId);if(!st)continue;let delivered=0;
    for(const sinkId of row.coldSinkComponentIds??row.sinkComponentIds??[]){
      const rem=Math.max(0,+remaining[sinkId]||0),target=+coldSinkMaxSupply_C[sinkId];
      if(!(rem>0&&Number.isFinite(target)))continue;
      const x=coldStorageDischarge(st,rem,target,HOUR_S);remaining[sinkId]=rem-x;delivered+=x;toColdSink_W+=x;
      bySink_W[sinkId]=(bySink_W[sinkId]??0)+x;details.push({storageComponentId:row.storageComponentId,coldSinkComponentId:sinkId,demandBefore_W:rem,maxSupplyTemperature_C:target,delivered_W:x,demandAfter_W:remaining[sinkId]});
    }
    byStorage_W[row.storageComponentId]=(byStorage_W[row.storageComponentId]??0)+delivered;
  }
  return {toColdSink_W,coldSinkRemainingByComponent_W:remaining,byStorage_W,bySink_W,details};
}


function validateHeatRecoverySystemAndStorageBindings(phaseTopologyOwnership,legacyHeatRecovery,storageSpecs,project=null,n=0){
  const issues=[];
  const routed=(phaseTopologyOwnership?.refrigeration??[]).filter(x=>x.dynamicHeatRecovery?.routing);
  const systemIds=[...new Set(routed.map(x=>x.dynamicHeatRecovery?.systemId??x.dynamicComponentId).filter(Boolean))];
  const storageServiceRows=(phaseTopologyOwnership?.storageServices??[]).filter(x=>x.serviceMode!=='cooling'),storageChargeRows=(phaseTopologyOwnership?.storageCharging??[]).filter(x=>x.serviceMode!=='cooling');
  const storageIds=[...new Set([...routed.map(x=>x.dynamicHeatRecovery?.routing?.storageComponentId),...storageServiceRows.map(x=>x.storageComponentId),...storageChargeRows.map(x=>x.storageComponentId)].filter(Boolean))];
  const hotSinkIds=[...new Set([...routed.map(x=>x.dynamicHeatRecovery?.routing?.hotSinkComponentId),...storageServiceRows.flatMap(x=>x.hotSinkComponentIds??[])].filter(Boolean))];
  const specs=Array.isArray(storageSpecs)?storageSpecs:(storageSpecs?[storageSpecs]:[]),byStorageId=new Map();
  for(const spec of specs){const id=spec?.componentId??spec?.storageId??null;if(!id)continue;if(byStorageId.has(id))issues.push(phaseOwnershipIssue('DUPLICATE_STATEFUL_STORAGE_ID','error',`Multiple stateful storage specifications use component id ${id}.`,{storageComponentId:id}));else byStorageId.set(id,spec);}
  for(const graphId of storageIds){const spec=byStorageId.get(graphId);if(!spec)issues.push(phaseOwnershipIssue('GRAPH_STORAGE_DESTINATION_UNBOUND','error',`Graph storage destination ${graphId} has no component-keyed annual storage state.`,{storageComponentId:graphId}));else if(!(spec.volume_m3>0))issues.push(phaseOwnershipIssue('GRAPH_STORAGE_DESTINATION_WITHOUT_STATEFUL_STORAGE','error',`Graph storage destination ${graphId} is bound to a zero-volume storage specification.`,{storageComponentId:graphId}));}
  let named={profiles:{},issues:[]};if(project&&n>0){named=resolveNamedHotSinkProfiles(project,n);issues.push(...named.issues);for(const id of hotSinkIds)if(!named.profiles[id])issues.push(phaseOwnershipIssue('GRAPH_HOT_SINK_DESTINATION_UNBOUND','error',`Graph hot-sink destination ${id} has no named project.hotSinkProfiles binding.`,{hotSinkComponentId:id}));}let thermalSources={profiles:{},issues:[]};if(project&&n>0){thermalSources=resolveNamedThermalSourceProfiles(project,n);issues.push(...thermalSources.issues);for(const row of storageChargeRows)if(!thermalSources.profiles[row.sourceComponentId])issues.push(phaseOwnershipIssue('GRAPH_THERMAL_SOURCE_UNBOUND','error',`Graph thermal-source owner ${row.sourceComponentId} has no valid project.thermalSourceProfiles binding.`,{sourceComponentId:row.sourceComponentId,storageComponentId:row.storageComponentId}));}
  let legacyAllowed=!!legacyHeatRecovery?.enabled,legacySuppressedBySystemId=null;
  if(legacyAllowed&&systemIds.length){
    const legacySystemId=legacyHeatRecovery.systemId??null;
    if(legacySystemId){if(systemIds.includes(legacySystemId)){legacyAllowed=false;legacySuppressedBySystemId=legacySystemId;issues.push(phaseOwnershipIssue('LEGACY_RECOVERY_SUPPRESSED_SAME_SYSTEM','warning','Legacy condenser recovery is suppressed only for the same explicitly graph-owned recovery system.',{systemId:legacySystemId}));}}
    else if(systemIds.length===1){legacyAllowed=false;legacySuppressedBySystemId=systemIds[0];issues.push(phaseOwnershipIssue('LEGACY_RECOVERY_IMPLICIT_SINGLE_SYSTEM_MATCH','warning','Legacy condenser recovery has no systemId; with one graph-owned recovery system it is treated as that same system for backward-compatible double-count protection.',{systemId:systemIds[0]}));}
    else issues.push(phaseOwnershipIssue('LEGACY_RECOVERY_SYSTEM_AMBIGUOUS','error','Legacy condenser recovery has no systemId while multiple graph-owned recovery systems exist; explicit systemId is required to determine overlap.',{graphSystemIds:systemIds}));
  }
  return{issues,legacyAllowed,legacySuppressedBySystemId,graphRecoverySystemIds:systemIds,graphStorageComponentIds:storageIds,graphHotSinkComponentIds:hotSinkIds,namedHotSinkProfiles:named.profiles,thermalSourceProfiles:thermalSources.profiles};
}

function dispatchDynamicPhaseHeatRecoveryHour(phaseTopologyOwnership,storageStates,{hour,hotSinkDemands_W=null,hotSinkTargets_C=null,hotDemand_W=0,hotTarget_C=55}={}){
  const sinkRemaining={};for(const [id,q] of Object.entries(hotSinkDemands_W??{}))sinkRemaining[id]=Math.max(0,+q||0);
  const sinkTargets={};for(const [id,t] of Object.entries(hotSinkTargets_C??{}))sinkTargets[id]=+t;
  let legacyRemaining_W=Math.max(0,+hotDemand_W||0),toSink_W=0,toStorage_W=0,available_W=0,ambient_W=0;const details=[];
  const storageMap=storageStates instanceof Map?storageStates:new Map();
  for(const row of(phaseTopologyOwnership?.refrigeration??[])){
    const dr=row.dynamicHeatRecovery,routing=dr?.routing;if(!dr?.feasible||!routing)continue;
    let q=Math.max(0,+dr.hourlyCapacityLimited_W?.[hour]||0),qInitial=q;const tCondK=+dr.hourlyCondensingTemperature_K?.[hour]||0,tCondC=tCondK-273.15,approach=Math.max(0,+dr.approach_K||0);available_W+=qInitial;
    const routeSink=()=>{if(!routing.hotSinkComponentId||!(q>0))return 0;const id=routing.hotSinkComponentId;let rem,target;if(Object.prototype.hasOwnProperty.call(sinkRemaining,id)){rem=sinkRemaining[id];target=sinkTargets[id];}else{rem=legacyRemaining_W;target=hotTarget_C;}if(!(Number.isFinite(target)&&tCondK>=target+273.15+approach))return 0;const x=Math.min(q,Math.max(0,rem));q-=x;toSink_W+=x;if(Object.prototype.hasOwnProperty.call(sinkRemaining,id))sinkRemaining[id]-=x;else legacyRemaining_W-=x;return x;};
    const routeStorage=()=>{if(!routing.storageComponentId||!(q>0))return 0;const st=storageMap.get(routing.storageComponentId);if(!st)return 0;const x=tankCharge(st,q,tCondC-approach,HOUR_S);q-=x;toStorage_W+=x;return x;};
    let sink=0,storage=0;if(routing.priority==='storageFirst'){storage=routeStorage();sink=routeSink();}else{sink=routeSink();storage=routeStorage();}ambient_W+=q;details.push({dynamicComponentId:row.dynamicComponentId,ownerId:dr.id,available_W:qInitial,toHotSink_W:sink,toStorage_W:storage,ambient_W:q,condensingTemperature_C:tCondC,routing});
  }
  return{toHotSink_W:toSink_W,toStorage_W:toStorage_W,available_W,ambient_W,hotSinkRemainingByComponent_W:sinkRemaining,legacyHotSinkRemaining_W:legacyRemaining_W,details};
}

function dispatchStorageServicesHour(phaseTopologyOwnership,storageStates,{hotSinkRemaining_W=null,hotSinkTargets_C=null}={}){
  const remaining={};for(const [id,q] of Object.entries(hotSinkRemaining_W??{}))remaining[id]=Math.max(0,+q||0);const targets={...hotSinkTargets_C};
  const storageMap=storageStates instanceof Map?storageStates:new Map(),byStorage_W={},bySink_W={},details=[];let toHotSink_W=0;
  for(const row of(phaseTopologyOwnership?.storageServices??[])){
    const id=row.storageComponentId,st=storageMap.get(id);if(!st)continue;let delivered=0;
    for(const sid of(row.hotSinkComponentIds??[])){const rem=Math.max(0,+remaining[sid]||0),target=+targets[sid];if(!(rem>0&&Number.isFinite(target)))continue;const x=tankDischarge(st,rem,target,HOUR_S);remaining[sid]=rem-x;delivered+=x;toHotSink_W+=x;bySink_W[sid]=(bySink_W[sid]??0)+x;details.push({storageComponentId:id,hotSinkComponentId:sid,demandBefore_W:rem,targetTemperature_C:target,delivered_W:x,demandAfter_W:remaining[sid]});}
    byStorage_W[id]=(byStorage_W[id]??0)+delivered;
  }
  return{toHotSink_W,hotSinkRemainingByComponent_W:remaining,byStorage_W,bySink_W,details};
}


function resolveNamedColdSinkProfiles(project,n){
  const raw=project?.coldSinkProfiles??{},out={},issues=[];
  if(raw==null||typeof raw!=='object'||Array.isArray(raw))return{profiles:out,issues:[phaseOwnershipIssue('COLD_SINK_PROFILE_MAP_INVALID','error','project.coldSinkProfiles must be an object keyed by graph cold-sink component id.',{})]};
  for(const [id,spec0] of Object.entries(raw)){
    const spec=spec0??{};let demand=null,maxSupply=null;
    try{demand=dynamicPhaseLoadProfile(project,spec.demandProfileRef??spec.demand_W,n);}catch(e){issues.push(phaseOwnershipIssue('COLD_SINK_DEMAND_PROFILE_REQUIRED','error',`Named cold sink ${id} requires demandProfileRef or demand_W.`,{componentId:id,reason:e.message}));}
    try{maxSupply=dynamicPhaseLoadProfile(project,spec.maxSupplyTemperatureProfileRef??spec.maxSupplyTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('COLD_SINK_TEMPERATURE_PROFILE_REQUIRED','error',`Named cold sink ${id} requires maxSupplyTemperatureProfileRef or maxSupplyTemperature_C.`,{componentId:id,reason:e.message}));}
    if(demand&&maxSupply)out[id]={componentId:id,demand_W:demand,maxSupplyTemperature_C:maxSupply};
  }
  return{profiles:out,issues};
}
function resolveNamedColdSourceProfiles(project,n,phaseTopologyOwnership,dynamicPhase,design=null){
  const raw=project?.coldSourceProfiles??{},out={},issues=[],freeCoolingModeOwners=new Map(),groundOwners=[],mechanicalOwners=[];
  if(raw==null||typeof raw!=='object'||Array.isArray(raw))return{profiles:out,issues:[phaseOwnershipIssue('COLD_SOURCE_PROFILE_MAP_INVALID','error','project.coldSourceProfiles must be an object keyed by graph cooling-source component id.',{})]};
  const refByLoadOwner=new Map((phaseTopologyOwnership?.refrigeration??[]).map(r=>[r.loadOwnerId,r]));
  for(const [id,spec0] of Object.entries(raw)){
    const spec=spec0??{};let available=null,temp=null;
    const mode=spec.availableMode??'profile';let freeCoolingMode=null,accountingMode=spec.accountingMode??null,electricity_W_perCooling_W=0,endogenous=false,airsideHydronicResolved=null,exhaustHydronicResolved=null;
    try{
      if(mode==='dynamicRefrigerationEvaporator'){
        const own=refByLoadOwner.get(id),dynId=own?.dynamicComponentId,hr=dynId!=null?dynamicPhase?.hourlyByComponent?.refrigeration?.[dynId]:null;
        if(!hr?.evaporator_W)throw new Error(`no dynamic refrigeration evaporator is owned by ${id}`);available=hr.evaporator_W;
      }else if(mode==='freeCoolingResidual'||mode==='freeCoolingDirect'){
        freeCoolingMode=String(spec.freeCoolingMode??'');if(!['ambientLoop','sourceWater'].includes(freeCoolingMode))throw new Error(`${mode} supports hydronic ambientLoop or sourceWater only`);
        const fc=design?.freeCooling?.[freeCoolingMode];if(!fc?.enabled)throw new Error(`design freeCooling.${freeCoolingMode} is not enabled`);
        available=new Float64Array(n);temp=new Float64Array(n).fill(design?.coolingSupply_C??NaN);endogenous=true;accountingMode='siteElectricityRatio';electricity_W_perCooling_W=freeCoolingMode==='ambientLoop'?Math.max(0,(fc.pump_W_per_kW+fc.fan_W_per_kW)/1000):Math.max(0,fc.pump_W_per_kW/1000);
        if(!freeCoolingModeOwners.has(freeCoolingMode))freeCoolingModeOwners.set(freeCoolingMode,[]);freeCoolingModeOwners.get(freeCoolingMode).push(id);
      }else if(mode==='airsideToHydronicConverter'){
        const a=design?.freeCooling?.airside;if(!a?.enabled||!(a.maxAirFlow_m3_s>0))throw new Error('design freeCooling.airside must be enabled with positive maxAirFlow_m3_s');
        const c=spec.airsideHydronicConverter??{};if(!(Number.isFinite(+c.UA_W_K)&&+c.UA_W_K>0))throw new Error('airsideHydronicConverter.UA_W_K must be positive');if(!(Number.isFinite(+c.hydronicVolumeFlow_m3_s)&&+c.hydronicVolumeFlow_m3_s>0))throw new Error('airsideHydronicConverter.hydronicVolumeFlow_m3_s must be positive');if(!c.hydronicFluidSpec)throw new Error('airsideHydronicConverter.hydronicFluidSpec is required');
        let ret;try{ret=dynamicPhaseLoadProfile(project,c.hydronicReturnTemperatureProfileRef??c.hydronicReturnTemperature_C,n);}catch(e){throw new Error(`airsideHydronicConverter hydronic return temperature is required: ${e.message}`);}available=new Float64Array(n);temp=new Float64Array(n).fill(NaN);endogenous=true;accountingMode='airsideHydronicConverter';
        const fanOwner=String(c.fanElectricityOwnerId??'').trim(),pumpOwner=String(c.pumpElectricityOwnerId??'').trim();if(!fanOwner||!pumpOwner)throw new Error('airsideHydronicConverter requires fanElectricityOwnerId and pumpElectricityOwnerId');if(c.auxiliaryControlMode!=='proportionalToAcceptedCooling')throw new Error("airsideHydronicConverter.auxiliaryControlMode must be 'proportionalToAcceptedCooling' in this slice");
        airsideHydronicResolved={UA_W_K:+c.UA_W_K,maxTransfer_W:Number.isFinite(+c.maxTransfer_W)?Math.max(0,+c.maxTransfer_W):Infinity,hydronicVolumeFlow_m3_s:+c.hydronicVolumeFlow_m3_s,hydronicFluidSpec:c.hydronicFluidSpec,hydronicReturnTemperature_C:ret,hydronicPressureDrop_Pa:Math.max(0,+c.hydronicPressureDrop_Pa||0),pumpEfficiency:clamp(Number.isFinite(+c.pumpEfficiency)?+c.pumpEfficiency:.7,.05,1),airPressureDrop_Pa:Math.max(0,Number.isFinite(+c.airPressureDrop_Pa)?+c.airPressureDrop_Pa:(a.extraStaticPressure_Pa??0)),fanEfficiency:clamp(Number.isFinite(+c.fanEfficiency)?+c.fanEfficiency:(a.fanEfficiency??.65),.05,1),fanElectricityOwnerId:fanOwner,pumpElectricityOwnerId:pumpOwner,auxiliaryControlMode:c.auxiliaryControlMode};
      }else if(mode==='exhaustAirToHydronicConverter'){
        const c=spec.exhaustHydronicConverter??{};
        if(!(Number.isFinite(+c.UA_W_K)&&+c.UA_W_K>0))throw new Error('exhaustHydronicConverter.UA_W_K must be positive');
        if(!(Number.isFinite(+c.hydronicVolumeFlow_m3_s)&&+c.hydronicVolumeFlow_m3_s>0))throw new Error('exhaustHydronicConverter.hydronicVolumeFlow_m3_s must be positive');
        if(!c.hydronicFluidSpec)throw new Error('exhaustHydronicConverter.hydronicFluidSpec is required');
        const airStreamMode=String(c.airStreamMode??'');if(!['zoneReturn','processExhaust','explicitExhaust'].includes(airStreamMode))throw new Error("exhaustHydronicConverter.airStreamMode must be 'zoneReturn', 'processExhaust' or 'explicitExhaust'");
        let airFlow=null,exhaustTemperature=null,exhaustRH=null;if(airStreamMode==='zoneReturn'||airStreamMode==='explicitExhaust'){try{airFlow=dynamicPhaseLoadProfile(project,c.airFlowProfileRef??c.airFlow_m3_s,n);}catch(e){throw new Error(`${airStreamMode} airFlow_m3_s/profile is required: ${e.message}`);}}if(airStreamMode==='explicitExhaust'){try{exhaustTemperature=dynamicPhaseLoadProfile(project,c.exhaustTemperatureProfileRef??c.exhaustTemperature_C,n);}catch(e){throw new Error(`explicitExhaust temperature is required: ${e.message}`);}try{exhaustRH=dynamicPhaseLoadProfile(project,c.exhaustRHProfileRef??c.exhaustRH_frac,n);}catch(e){throw new Error(`explicitExhaust RH is required: ${e.message}`);}}
        const processExhaustPathId=airStreamMode==='processExhaust'?String(c.processExhaustPathId??'').trim():null;if(airStreamMode==='processExhaust'&&!processExhaustPathId)throw new Error('processExhaustPathId is required for processExhaust airStreamMode');
        let ret;try{ret=dynamicPhaseLoadProfile(project,c.hydronicReturnTemperatureProfileRef??c.hydronicReturnTemperature_C,n);}catch(e){throw new Error(`exhaustHydronicConverter hydronic return temperature is required: ${e.message}`);}
        const bypassControlMode=String(c.bypassControlMode??'');if(!['outdoorEnthalpyAdvantage','alwaysWhenThermallyEligible'].includes(bypassControlMode))throw new Error("exhaustHydronicConverter.bypassControlMode must be 'outdoorEnthalpyAdvantage' or 'alwaysWhenThermallyEligible'");
        const frostProtectionMode=String(c.frostProtectionMode??'');if(frostProtectionMode!=='bypassBelowExhaustTemperature')throw new Error("exhaustHydronicConverter.frostProtectionMode must be 'bypassBelowExhaustTemperature'");
        const frostBypassBelow_C=+c.frostBypassBelow_C;if(!Number.isFinite(frostBypassBelow_C))throw new Error('exhaustHydronicConverter.frostBypassBelow_C must be finite');
        const transferMode=String(c.transferMode??'directHX');if(!['directHX','runAroundLoop'].includes(transferMode))throw new Error("exhaustHydronicConverter.transferMode must be 'directHX' or 'runAroundLoop'");
        const runAroundEffectiveness=transferMode==='runAroundLoop'?+c.runAroundEffectiveness:1;if(!(runAroundEffectiveness>0&&runAroundEffectiveness<=1))throw new Error('runAroundEffectiveness must be in (0,1]');
        const fanOwner=String(c.fanElectricityOwnerId??'').trim(),pumpOwner=String(c.pumpElectricityOwnerId??'').trim();if(!fanOwner||!pumpOwner)throw new Error('exhaustHydronicConverter requires fanElectricityOwnerId and pumpElectricityOwnerId');if(c.auxiliaryControlMode!=='proportionalToAcceptedCooling')throw new Error("exhaustHydronicConverter.auxiliaryControlMode must be 'proportionalToAcceptedCooling'");
        available=new Float64Array(n);temp=new Float64Array(n).fill(NaN);endogenous=true;accountingMode='exhaustAirHydronicConverter';
        exhaustHydronicResolved={UA_W_K:+c.UA_W_K,maxTransfer_W:Number.isFinite(+c.maxTransfer_W)?Math.max(0,+c.maxTransfer_W):Infinity,hydronicVolumeFlow_m3_s:+c.hydronicVolumeFlow_m3_s,hydronicFluidSpec:c.hydronicFluidSpec,hydronicReturnTemperature_C:ret,airStreamMode,airFlow_m3_s:airFlow,exhaustTemperature_C:exhaustTemperature,exhaustRH_frac:exhaustRH,processExhaustPathId,bypassControlMode,minimumOutdoorExhaustEnthalpyDifference_kJ_kgDA:Math.max(0,+c.minimumOutdoorExhaustEnthalpyDifference_kJ_kgDA||0),frostProtectionMode,frostBypassBelow_C,transferMode,runAroundEffectiveness,hydronicPressureDrop_Pa:Math.max(0,+c.hydronicPressureDrop_Pa||0),pumpEfficiency:clamp(Number.isFinite(+c.pumpEfficiency)?+c.pumpEfficiency:.7,.05,1),airPressureDrop_Pa:Math.max(0,+c.airPressureDrop_Pa||0),fanEfficiency:clamp(Number.isFinite(+c.fanEfficiency)?+c.fanEfficiency:.65,.05,1),fanElectricityOwnerId:fanOwner,pumpElectricityOwnerId:pumpOwner,auxiliaryControlMode:c.auxiliaryControlMode};
      }else if(mode==='groundDirectCooling'){
        if(!design?.groundCoupling?.enabled||!design.groundCoupling.directCoolingEnabled)throw new Error('design groundCoupling directCooling is not enabled');
        available=new Float64Array(n);temp=new Float64Array(n).fill(design?.coolingSupply_C??NaN);endogenous=true;accountingMode='siteElectricityRatio';electricity_W_perCooling_W=Math.max(0,+design.groundCoupling.pump_W_per_kW||0)/1000;groundOwners.push(id);
      }else if(mode==='mechanicalCoolingDirect'){
        const pid=String(spec.mechanicalPlantId??'builtinMechanicalCooling').trim(),plant=(design?.mechanicalCoolingPlants??[]).find(p=>p.id===pid);
        if((design?.mechanicalCoolingPlants?.length??0)>0&&!plant)throw new Error(`mechanicalPlantId ${pid} is not defined in design.mechanicalCoolingPlants`);
        if(!plant&&!(design?.coolingCapacity_W>0))throw new Error('design coolingCapacity_W is not positive');
        available=new Float64Array(n);temp=new Float64Array(n).fill(plant?.supplyTemperature_C??design?.coolingSupply_C??NaN);endogenous=true;accountingMode='builtInMechanical';mechanicalOwners.push(id);
      }else available=dynamicPhaseLoadProfile(project,spec.availableProfileRef??spec.available_W,n);
    }catch(e){issues.push(phaseOwnershipIssue('COLD_SOURCE_AVAILABLE_PROFILE_REQUIRED','error',`Cooling source ${id} requires available_W/profile or a resolvable endogenous cooling source.`,{componentId:id,reason:e.message,availableMode:mode}));}
    if(!endogenous)try{temp=dynamicPhaseLoadProfile(project,spec.supplyTemperatureProfileRef??spec.supplyTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('COLD_SOURCE_TEMPERATURE_PROFILE_REQUIRED','error',`Cooling source ${id} requires supplyTemperatureProfileRef or supplyTemperature_C.`,{componentId:id,reason:e.message}));}
    if(!endogenous){if(accountingMode==='siteElectricityRatio'){electricity_W_perCooling_W=+spec.electricity_W_perCooling_W;if(!(Number.isFinite(electricity_W_perCooling_W)&&electricity_W_perCooling_W>=0))issues.push(phaseOwnershipIssue('COLD_SOURCE_ELECTRICITY_RATIO_REQUIRED','error',`Cooling source ${id} with accountingMode siteElectricityRatio requires non-negative electricity_W_perCooling_W.`,{componentId:id}));}else if(!['alreadyAccounted','nonPurchased'].includes(accountingMode))issues.push(phaseOwnershipIssue('COLD_SOURCE_ACCOUNTING_MODE_REQUIRED','error',`Cooling source ${id} must declare accountingMode alreadyAccounted, nonPurchased, or siteElectricityRatio.`,{componentId:id,accountingMode}));}
    if(mode==='dynamicRefrigerationEvaporator'&&accountingMode!=='alreadyAccounted')issues.push(phaseOwnershipIssue('DYNAMIC_COLD_SOURCE_ACCOUNTING_MUST_BE_ALREADY_ACCOUNTED','error',`Dynamic refrigeration source ${id} is already carried by phase topology and must use accountingMode alreadyAccounted.`,{componentId:id,accountingMode}));
    let electricityOwnerId=null,rejectionOwnerId=null,mechanicalPlantId=null,mechanicalPlantAllocation=null;
    if(mode==='mechanicalCoolingDirect'){
      electricityOwnerId=String(spec.electricityOwnerId??'').trim();rejectionOwnerId=String(spec.rejectionOwnerId??'').trim();mechanicalPlantId=String(spec.mechanicalPlantId??'builtinMechanicalCooling').trim();mechanicalPlantAllocation=spec.mechanicalPlantAllocation??null;
      if(accountingMode!=='builtInMechanical')issues.push(phaseOwnershipIssue('MECHANICAL_COLD_SOURCE_ACCOUNTING_MODE_INVALID','error',`Built-in mechanical cooling source ${id} must use accountingMode builtInMechanical.`,{componentId:id,accountingMode}));
      if(!electricityOwnerId)issues.push(phaseOwnershipIssue('MECHANICAL_COLD_SOURCE_ELECTRICITY_OWNER_REQUIRED','error',`Built-in mechanical cooling source ${id} requires electricityOwnerId.`,{componentId:id}));
      if(!rejectionOwnerId)issues.push(phaseOwnershipIssue('MECHANICAL_COLD_SOURCE_REJECTION_OWNER_REQUIRED','error',`Built-in mechanical cooling source ${id} requires rejectionOwnerId.`,{componentId:id}));
      if(!mechanicalPlantId)issues.push(phaseOwnershipIssue('MECHANICAL_COLD_SOURCE_PLANT_ID_REQUIRED','error',`Built-in mechanical cooling source ${id} requires mechanicalPlantId.`,{componentId:id}));
      const plant=(design?.mechanicalCoolingPlants??[]).find(p=>p.id===mechanicalPlantId);
      if((design?.mechanicalCoolingPlants?.length??0)>0&&!plant)issues.push(phaseOwnershipIssue('MECHANICAL_COLD_SOURCE_PLANT_UNBOUND','error',`Mechanical source ${id} references undefined plant ${mechanicalPlantId}.`,{componentId:id,mechanicalPlantId}));
      if(plant&&electricityOwnerId!==plant.electricityOwnerId)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_ELECTRICITY_OWNER_MISMATCH','error',`Mechanical source ${id} electricity owner does not match physical plant ${mechanicalPlantId}.`,{componentId:id,mechanicalPlantId,electricityOwnerId,plantElectricityOwnerId:plant.electricityOwnerId}));
      if(plant&&rejectionOwnerId!==plant.rejectionOwnerId)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_REJECTION_OWNER_MISMATCH','error',`Mechanical source ${id} rejection owner does not match physical plant ${mechanicalPlantId}.`,{componentId:id,mechanicalPlantId,rejectionOwnerId,plantRejectionOwnerId:plant.rejectionOwnerId}));
    }
    const validAccounting=['alreadyAccounted','nonPurchased','siteElectricityRatio','builtInMechanical','airsideHydronicConverter','exhaustAirHydronicConverter'].includes(accountingMode);
    if(available&&temp&&validAccounting&&(accountingMode!=='siteElectricityRatio'||Number.isFinite(electricity_W_perCooling_W))&&(mode!=='mechanicalCoolingDirect'||(electricityOwnerId&&rejectionOwnerId&&mechanicalPlantId))&&(mode!=='airsideToHydronicConverter'||airsideHydronicResolved)&&(mode!=='exhaustAirToHydronicConverter'||exhaustHydronicResolved))out[id]={componentId:id,available_W:available,supplyTemperature_C:temp,availableMode:mode,freeCoolingMode,accountingMode,electricity_W_perCooling_W,electricityOwnerId,rejectionOwnerId,mechanicalPlantId,mechanicalPlantAllocation,airsideHydronicConverter:airsideHydronicResolved,exhaustHydronicConverter:exhaustHydronicResolved};
  }
  for(const [mode,ids] of freeCoolingModeOwners)if(ids.length>1)issues.push(phaseOwnershipIssue('FREE_COOLING_MODE_MULTIPLE_GRAPH_SOURCES','error',`Built-in free-cooling mode ${mode} is bound to multiple graph cold-source identities.`,{freeCoolingMode:mode,sourceComponentIds:ids.sort()}));
  if(groundOwners.length>1)issues.push(phaseOwnershipIssue('GROUND_DIRECT_MULTIPLE_GRAPH_SOURCES','error','Ground direct cooling is bound to multiple graph cold-source identities.',{sourceComponentIds:groundOwners.sort()}));
  const mechanicalGroups=new Map();for(const id of mechanicalOwners){const row=out[id];if(!row)continue;if(!mechanicalGroups.has(row.mechanicalPlantId))mechanicalGroups.set(row.mechanicalPlantId,[]);mechanicalGroups.get(row.mechanicalPlantId).push(row);}
  for(const [plantId,rows] of mechanicalGroups){const ids=rows.map(x=>x.componentId),eOwners=[...new Set(rows.map(x=>x.electricityOwnerId))],rOwners=[...new Set(rows.map(x=>x.rejectionOwnerId))];if(eOwners.length!==1)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_ELECTRICITY_OWNER_MISMATCH','error',`Graph source identities sharing mechanical plant ${plantId} must share one compressor-electricity owner.`,{mechanicalPlantId:plantId,sourceComponentIds:ids.sort(),electricityOwnerIds:eOwners.sort()}));if(rOwners.length!==1)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_REJECTION_OWNER_MISMATCH','error',`Graph source identities sharing mechanical plant ${plantId} must share one condenser-rejection owner.`,{mechanicalPlantId:plantId,sourceComponentIds:ids.sort(),rejectionOwnerIds:rOwners.sort()}));if(rows.length>1){const allocs=rows.map(x=>x.mechanicalPlantAllocation),modes=[...new Set(allocs.map(a=>a?.mode).filter(Boolean))];if(allocs.some(a=>!a)||modes.length!==1||!['priority','fixedShares'].includes(modes[0]))issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_SOURCE_ALLOCATION_REQUIRED','error',`Multiple graph source identities sharing mechanical plant ${plantId} require one explicit mechanicalPlantAllocation mode: priority or fixedShares.`,{mechanicalPlantId:plantId,sourceComponentIds:ids.sort()}));else if(modes[0]==='priority'){const ranks=allocs.map(a=>+a.rank);if(ranks.some(x=>!Number.isInteger(x)||x<1)||new Set(ranks).size!==ranks.length)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_SOURCE_PRIORITY_INVALID','error','Mechanical source priority allocation requires unique positive integer ranks.',{mechanicalPlantId:plantId,sourceComponentIds:ids.sort(),ranks}));}else{const shares=allocs.map(a=>+a.share),sum=shares.reduce((a,b)=>a+b,0);if(shares.some(x=>!(x>0))||Math.abs(sum-1)>1e-9)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_SOURCE_SHARES_INVALID','error','Mechanical fixedShares allocation requires positive shares summing to 1 within each physical plant.',{mechanicalPlantId:plantId,sourceComponentIds:ids.sort(),shares,sum}));}}}
  return{profiles:out,issues};
}
function createColdStorageStateMap(storageSpecs){
  const map=new Map();
  for(const spec of(storageSpecs??[])){const id=spec?.componentId??spec?.storageId??null;if(!id)continue;if(map.has(id))throw new Error(`duplicate cold storage id: ${id}`);map.set(id,createColdStorageState(spec));}
  return map;
}
function coldStorageSnapshots(states){const out={};for(const [id,st] of(states??new Map()))out[id]=coldStorageSnapshot(st);return out;}


function mechanicalStoragePlantSets(phaseTopologyOwnership,sourceProfiles){
  const out=new Map();
  for(const r of phaseTopologyOwnership?.coldSourceDeliveries??[]){
    if(r.destinationType!=='storage')continue;
    const src=sourceProfiles?.[r.sourceComponentId];if(src?.availableMode!=='mechanicalCoolingDirect')continue;
    const sid=String(r.destinationComponentId??''),pid=String(src.mechanicalPlantId??'').trim();if(!sid||!pid)continue;
    if(!out.has(sid))out.set(sid,new Set());out.get(sid).add(pid);
  }
  return out;
}
function resolveSharedMechanicalStorageReservations(rawDispatch,mechanicalStoragePlants,issues,project=null,n=0){
  const shared=[...mechanicalStoragePlants.entries()].filter(([,ps])=>ps.size>1).map(([storageComponentId,ps])=>({storageComponentId,plantIds:[...ps].sort()}));
  const raw=rawDispatch?.sharedStorageReservations;
  const reservations={};
  if(raw!=null&&typeof raw!=='object'){issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_RESERVATIONS_INVALID','error','mechanicalCoolingPlantDispatch.sharedStorageReservations must be an object keyed by shared storage component ID.',{}));return{reservations,shared};}
  for(const [sid,x0] of Object.entries(raw??{})){
    const row=shared.find(x=>x.storageComponentId===sid);
    if(!row){issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_RESERVATION_UNKNOWN','error',`Shared-storage reservation ${sid} does not identify a storage reached by multiple physical mechanical plants.`,{storageComponentId:sid}));continue;}
    const x=x0&&typeof x0==='object'?x0:{},mode=String(x.mode??'');
    if(mode==='fixedShares'){
      const shares=x.shares&&typeof x.shares==='object'?Object.fromEntries(Object.entries(x.shares).map(([k,v])=>[String(k),+v])):{};
      const keys=Object.keys(shares).sort(),vals=Object.values(shares),sum=vals.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0),exact=keys.length===row.plantIds.length&&row.plantIds.every(id=>keys.includes(id));
      if(!exact||vals.some(v=>!(v>0))||Math.abs(sum-1)>1e-9){issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_RESERVATION_SHARES_INVALID','error',`Shared storage ${sid} fixedShares reservation must provide positive shares summing to 1 for every connected physical plant.`,{storageComponentId:sid,plantIds:row.plantIds,shares,sum}));continue;}
      reservations[sid]={mode:'fixedShares',shares,plantIds:row.plantIds};continue;
    }
    if(mode==='absoluteReservations'){
      const rr=x.reservedAcceptance_W&&typeof x.reservedAcceptance_W==='object'?x.reservedAcceptance_W:{},keys=Object.keys(rr).sort(),exact=keys.length===row.plantIds.length&&row.plantIds.every(id=>keys.includes(id));
      if(!exact){issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_ABSOLUTE_RESERVATION_PLANTS_INVALID','error',`Shared storage ${sid} absoluteReservations must provide reservedAcceptance_W for every connected physical plant exactly once.`,{storageComponentId:sid,plantIds:row.plantIds,inputPlantIds:keys}));continue;}
      const reservedAcceptanceProfiles_W={};let bad=null;
      for(const pid of row.plantIds){try{const prof=dynamicPhaseLoadProfile(project,rr[pid],n);if(Array.from(prof).some(v=>!(Number.isFinite(+v)&&+v>=0)))throw new Error('reservation profile must be non-negative and finite');reservedAcceptanceProfiles_W[pid]=prof;}catch(e){bad={mechanicalPlantId:pid,reason:e.message};break;}}
      if(bad){issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_ABSOLUTE_RESERVATION_PROFILE_INVALID','error',`Shared storage ${sid} absolute reservation profile is invalid.`,{storageComponentId:sid,...bad}));continue;}
      reservations[sid]={mode:'absoluteReservations',reservedAcceptanceProfiles_W,plantIds:row.plantIds};continue;
    }
    issues.push(phaseOwnershipIssue('MECHANICAL_SHARED_STORAGE_RESERVATION_MODE_INVALID','error',`Shared storage ${sid} reservation mode must be fixedShares or absoluteReservations.`,{storageComponentId:sid,mode,plantIds:row.plantIds}));
  }
  return{reservations,shared};
}
function coldStorageRemainingChargeAcceptanceW(st,alreadyCharged_W=0){
  if(!st)return 0;
  const remainingPower=Math.max(0,st.spec.maxCharge_W-Math.max(0,+alreadyCharged_W||0));
  const room=Math.max(0,st.spec.capacity_J-st.cold_J),byEnergy=room/(HOUR_S*Math.max(st.spec.chargeEfficiency,1e-12));
  return Math.max(0,Math.min(remainingPower,byEnergy));
}
function sharedStorageReservationCapsByPlant(coldStorageStates,reservations,{alreadyChargedByStorage_W={},hour=0}={}){
  const out={};
  for(const [sid,row] of Object.entries(reservations??{})){
    const st=coldStorageStates?.get?.(sid),headroom=coldStorageRemainingChargeAcceptanceW(st,alreadyChargedByStorage_W?.[sid]??0),pids=row.plantIds??[];
    if(row.mode==='absoluteReservations'){
      const requested=Object.fromEntries(pids.map(pid=>[pid,Math.max(0,coldProfileValue(row.reservedAcceptanceProfiles_W?.[pid],hour)||0)])),sum=Object.values(requested).reduce((a,b)=>a+b,0),physicalDerate=sum>0?Math.min(1,headroom/sum):0;
      for(const pid of pids){if(!out[pid])out[pid]={};out[pid][sid]=requested[pid]*physicalDerate;}
    }else for(const pid of pids){if(!out[pid])out[pid]={};out[pid][sid]=headroom*Math.max(0,+row.shares?.[pid]||0);}
  }
  return out;
}
function sharedStorageReservationTrace(reservations,hour,capsByPlant){
  const out={};for(const [sid,row] of Object.entries(reservations??{})){if(row.mode==='fixedShares'){out[sid]={mode:'fixedShares',shares:{...(row.shares??{})}};continue;}const requestedAcceptance_W={};const reservedAcceptance_W={};for(const pid of row.plantIds??[]){requestedAcceptance_W[pid]=Math.max(0,coldProfileValue(row.reservedAcceptanceProfiles_W?.[pid],hour)||0);reservedAcceptance_W[pid]=Math.max(0,+capsByPlant?.[pid]?.[sid]||0);}out[sid]={mode:'absoluteReservations',requestedAcceptance_W,reservedAcceptance_W};}return out;
}

function resolveMechanicalCoolingPlantDispatchPolicy(design,phaseTopologyOwnership,sourceProfiles,project=null,n=0){
  const rows=phaseTopologyOwnership?.coldSourceDeliveries??[],destinationPlants=new Map();
  for(const r of rows){
    const src=sourceProfiles?.[r.sourceComponentId];if(src?.availableMode!=='mechanicalCoolingDirect')continue;
    const pid=String(src.mechanicalPlantId??'').trim();if(!pid)continue;
    if(!destinationPlants.has(r.destinationComponentId))destinationPlants.set(r.destinationComponentId,new Set());
    destinationPlants.get(r.destinationComponentId).add(pid);
  }
  const sharedDestinations=[...destinationPlants.entries()].filter(([,ps])=>ps.size>1).map(([destinationComponentId,ps])=>({destinationComponentId,plantIds:[...ps].sort()}));
  const relevantPlantIds=[...new Set(sharedDestinations.flatMap(x=>x.plantIds))].sort(),issues=[];
  if(relevantPlantIds.length<2)return{enabled:false,mode:null,priority:[],shares:null,relevantPlantIds,sharedDestinations,issues};
  const raw=design?.mechanicalCoolingPlantDispatch??null;
  if(!raw||typeof raw!=='object'){issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_DISPATCH_REQUIRED','error','Multiple physical mechanical-cooling plants can serve shared graph cold demand; design.mechanicalCoolingPlantDispatch is required so lexical source/plant order is not used as a control policy.',{plantIds:relevantPlantIds,sharedDestinations}));return{enabled:false,mode:null,priority:[],shares:null,relevantPlantIds,sharedDestinations,issues};}
  const mode=String(raw.mode??'');
  if(mode==='priority'){
    const priority=(Array.isArray(raw.priority)?raw.priority:[]).map(x=>String(x)).filter(Boolean),unique=[...new Set(priority)];
    const exact=priority.length===unique.length&&relevantPlantIds.length===unique.length&&relevantPlantIds.every(id=>unique.includes(id));
    if(!exact){issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_PRIORITY_INVALID','error','mechanicalCoolingPlantDispatch.priority must list every physical plant serving shared graph cold demand exactly once.',{plantIds:relevantPlantIds,priority}));return{enabled:false,mode,priority,shares:null,relevantPlantIds,sharedDestinations,issues};}
    return{enabled:true,mode:'priority',priority,shares:null,relevantPlantIds,sharedDestinations,issues};
  }
  if(mode==='fixedShares'){
    const shares=raw.shares&&typeof raw.shares==='object'?Object.fromEntries(Object.entries(raw.shares).map(([k,v])=>[String(k),+v])):{};
    const keys=Object.keys(shares).sort(),vals=Object.values(shares),sum=vals.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
    const exact=keys.length===relevantPlantIds.length&&relevantPlantIds.every(id=>keys.includes(id));
    if(!exact||vals.some(x=>!(x>0))||Math.abs(sum-1)>1e-9){
      issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_FIXED_SHARES_INVALID','error','mechanicalCoolingPlantDispatch.fixedShares must provide positive shares summing to 1 for every physical plant serving shared graph cold demand.',{plantIds:relevantPlantIds,shares,sum}));
      return{enabled:false,mode,priority:[],shares,relevantPlantIds,sharedDestinations,issues};
    }
    return{enabled:true,mode:'fixedShares',priority:[],shares,relevantPlantIds,sharedDestinations,issues};
  }
  if(mode==='marginalCost'){
    const inputs=raw.plantInputs&&typeof raw.plantInputs==='object'?raw.plantInputs:{},keys=Object.keys(inputs).sort();
    if(keys.length!==relevantPlantIds.length||!relevantPlantIds.every(id=>keys.includes(id))){issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_MARGINAL_INPUTS_REQUIRED','error','marginalCost dispatch requires explicit plantInputs for every physical plant serving shared graph cold demand.',{plantIds:relevantPlantIds,inputPlantIds:keys}));return{enabled:false,mode,priority:[],shares:null,relevantPlantIds,sharedDestinations,issues};}
    let price=null;try{price=dynamicPhaseLoadProfile(project,raw.electricityPriceProfileRef,n);}catch(e){issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_MARGINAL_TARIFF_REQUIRED','error','marginalCost dispatch requires an explicit electricityPriceProfileRef/scalar.',{reason:e.message,electricityPriceProfileRef:raw.electricityPriceProfileRef}));}
    const marginalCostProfiles={},intensityProfiles={},variableCostProfiles={},heatRecoveryCreditProfiles={},storageOpportunityValueProfiles={},storageOpportunityValueProfilesByStorage={},stateAwareByPlant={};
    const mechanicalStoragePlants=mechanicalStoragePlantSets(phaseTopologyOwnership,sourceProfiles),sharedReservationResolution=resolveSharedMechanicalStorageReservations(raw,mechanicalStoragePlants,issues,project,n),sharedStorageReservations=sharedReservationResolution.reservations;
    const storageValueRaw=raw.storageOpportunityValues;
    if(storageValueRaw!=null&&typeof storageValueRaw!=='object')issues.push(phaseOwnershipIssue('MECHANICAL_STORAGE_OPPORTUNITY_VALUES_INVALID','error','mechanicalCoolingPlantDispatch.storageOpportunityValues must be an object keyed by graph cold-storage component ID.',{}));
    for(const [sid,row0] of Object.entries(storageValueRaw&&typeof storageValueRaw==='object'?storageValueRaw:{})){try{if(!mechanicalStoragePlants.has(sid))throw new Error('storage is not a graph-owned forced-excess destination of an explicit mechanical plant');const row=row0&&typeof row0==='object'&&!Array.isArray(row0)?row0:{value_per_kWhAcceptedCooling:row0},rawValue=row.value_per_kWhAcceptedCooling;if(rawValue==null)throw new Error('value_per_kWhAcceptedCooling is required');const prof=dynamicPhaseLoadProfile(project,rawValue,n);if(Array.from(prof).some(v=>!(Number.isFinite(+v)&&+v>=0)))throw new Error('storage opportunity value must be non-negative and finite');storageOpportunityValueProfilesByStorage[sid]=prof;const shared=(mechanicalStoragePlants.get(sid)?.size??0)>1;if(shared&&Array.from(prof).some(v=>+v>0)&&!sharedStorageReservations[sid])throw new Error('positive shared-storage opportunity value requires an explicit shared-storage headroom reservation');}catch(e){issues.push(phaseOwnershipIssue('MECHANICAL_STORAGE_OPPORTUNITY_VALUE_INVALID','error',`Storage-owned opportunity value for ${sid} is invalid.`,{storageComponentId:sid,reason:e.message}));}}
    for(const pid of relevantPlantIds){const x=inputs[pid]??{};stateAwareByPlant[pid]=x.stateAware===true;try{const intensity=dynamicPhaseLoadProfile(project,x.electricity_kWh_per_kWhCooling,n),variable=dynamicPhaseLoadProfile(project,x.variableCost_per_kWhCooling??0,n),recoveryCredit=dynamicPhaseLoadProfile(project,x.heatRecoveryCredit_per_kWhCooling??0,n),storageValue=x.forcedExcessStorageOpportunityValue_per_kWhAcceptedCooling==null?null:dynamicPhaseLoadProfile(project,x.forcedExcessStorageOpportunityValue_per_kWhAcceptedCooling,n),eligible=[...mechanicalStoragePlants.entries()].filter(([,ps])=>ps.has(pid)).map(([sid])=>sid),storageOwnedEligible=eligible.filter(sid=>storageOpportunityValueProfilesByStorage[sid]!=null);if(Array.from(intensity).some(v=>!(Number.isFinite(+v)&&+v>0)))throw new Error('electricity intensity must be positive and finite');if(Array.from(variable).some(v=>!(Number.isFinite(+v)&&+v>=0)))throw new Error('variable cost must be non-negative and finite');if(Array.from(recoveryCredit).some(v=>!(Number.isFinite(+v)&&+v>=0)))throw new Error('heat-recovery credit must be non-negative and finite');if(storageValue&&Array.from(storageValue).some(v=>!(Number.isFinite(+v)&&+v>=0)))throw new Error('forced-excess storage opportunity value must be non-negative and finite');if(storageValue&&storageOwnedEligible.length)throw new Error(`plant-owned forced-excess storage value conflicts with storage-owned value for: ${storageOwnedEligible.join(', ')}`);if((storageValue||storageOwnedEligible.length)&&!stateAwareByPlant[pid])throw new Error('storage opportunity value requires stateAware=true');if(storageValue){if(!eligible.length)throw new Error('forced-excess storage opportunity value requires an eligible graph-owned cold storage');const shared=eligible.filter(sid=>(mechanicalStoragePlants.get(sid)?.size??0)>1),unreserved=shared.filter(sid=>!sharedStorageReservations[sid]);if(unreserved.length)throw new Error(`shared cold storage opportunity value requires an explicit headroom reservation: ${unreserved.join(', ')}`);storageOpportunityValueProfiles[pid]=storageValue;}intensityProfiles[pid]=intensity;variableCostProfiles[pid]=variable;heatRecoveryCreditProfiles[pid]=recoveryCredit;if(price){const mc=new Float64Array(n);for(let h=0;h<n;h++)mc[h]=(+intensity[h])*(+price[h])+(+variable[h])-(+recoveryCredit[h]);marginalCostProfiles[pid]=mc;}}catch(e){issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_MARGINAL_PERFORMANCE_REQUIRED','error',`marginalCost dispatch plant ${pid} requires explicit electricity_kWh_per_kWhCooling and optional non-negative variableCost_per_kWhCooling / heatRecoveryCredit_per_kWhCooling profiles/scalars. Storage opportunity value may be storage-owned via storageOpportunityValues or retained as the legacy plant-owned forcedExcessStorageOpportunityValue_per_kWhAcceptedCooling, but not both for one destination; either requires stateAware=true and shared valued storage requires an explicit headroom reservation.`,{mechanicalPlantId:pid,reason:e.message}));}}
    const tieBreak=(Array.isArray(raw.tieBreakPriority)?raw.tieBreakPriority:[]).map(String).filter(Boolean),tieUnique=[...new Set(tieBreak)],tieExact=tieBreak.length===tieUnique.length&&tieUnique.length===relevantPlantIds.length&&relevantPlantIds.every(id=>tieUnique.includes(id));
    let hasTie=false;if(price&&Object.keys(marginalCostProfiles).length===relevantPlantIds.length){for(let h=0;h<n&&!hasTie;h++){const vals=relevantPlantIds.map(id=>marginalCostProfiles[id][h]).sort((a,b)=>a-b);for(let i=1;i<vals.length;i++)if(Math.abs(vals[i]-vals[i-1])<=1e-12){hasTie=true;break;}}}
    if((hasTie||Object.values(stateAwareByPlant).some(Boolean))&&!tieExact)issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_MARGINAL_TIEBREAK_REQUIRED','error','marginalCost dispatch with equal or state-aware hourly marginal costs requires tieBreakPriority listing every relevant plant exactly once so IDs are not a hidden tie-break.',{plantIds:relevantPlantIds,tieBreakPriority:tieBreak,stateAwarePlantIds:relevantPlantIds.filter(id=>stateAwareByPlant[id])}));
    if(issues.some(x=>x.severity==='error'))return{enabled:false,mode,priority:[],shares:null,relevantPlantIds,sharedDestinations,issues};
    return{enabled:true,mode:'marginalCost',priority:[],shares:null,relevantPlantIds,sharedDestinations,issues,marginalCostProfiles,intensityProfiles,variableCostProfiles,heatRecoveryCreditProfiles,storageOpportunityValueProfiles,storageOpportunityValueProfilesByStorage,electricityPriceProfile:price,stateAwareByPlant,tieBreakPriority:tieExact?tieBreak:[],sharedStorageReservations};
  }
  issues.push(phaseOwnershipIssue('MECHANICAL_PLANT_DISPATCH_MODE_INVALID','error',`Unsupported mechanical cooling plant dispatch mode ${mode}; supported modes are priority, fixedShares and marginalCost.`,{mode,plantIds:relevantPlantIds}));
  return{enabled:false,mode,priority:[],shares:null,relevantPlantIds,sharedDestinations,issues};
}

function resolveMechanicalForcedExcessStoragePolicies(design,phaseTopologyOwnership,sourceProfiles){
  const rows=phaseTopologyOwnership?.coldSourceDeliveries??[],byPlant=new Map(),issues=[],policies={};
  for(const r of rows){
    if(r.destinationType!=='storage')continue;
    const src=sourceProfiles?.[r.sourceComponentId];if(src?.availableMode!=='mechanicalCoolingDirect')continue;
    const pid=String(src.mechanicalPlantId??'').trim();if(!pid)continue;
    if(!byPlant.has(pid))byPlant.set(pid,new Set());byPlant.get(pid).add(r.destinationComponentId);
  }
  const plantMap=mechanicalCoolingPlantMap(design);
  for(const [pid,set0] of byPlant){
    const storageIds=[...set0].sort(),plant=plantMap.get(pid);if(!plant)continue;
    if(storageIds.length===1){policies[pid]={enabled:true,mode:'single',priority:storageIds,shares:null,storageIds};continue;}
    const raw=plant.forcedExcessStorageDispatch;
    if(!raw||typeof raw!=='object'){issues.push(phaseOwnershipIssue('MECHANICAL_FORCED_EXCESS_STORAGE_DISPATCH_REQUIRED','error',`Mechanical cooling plant ${pid} has multiple graph-connected cold-storage destinations; forcedExcessStorageDispatch is required.`,{mechanicalPlantId:pid,storageComponentIds:storageIds}));continue;}
    const mode=String(raw.mode??'');
    if(mode==='priority'){
      const priority=(Array.isArray(raw.priority)?raw.priority:[]).map(String).filter(Boolean),unique=[...new Set(priority)],exact=priority.length===unique.length&&unique.length===storageIds.length&&storageIds.every(id=>unique.includes(id));
      if(!exact){issues.push(phaseOwnershipIssue('MECHANICAL_FORCED_EXCESS_STORAGE_PRIORITY_INVALID','error',`Mechanical cooling plant ${pid} forced-excess priority must list every eligible graph cold storage exactly once.`,{mechanicalPlantId:pid,storageComponentIds:storageIds,priority}));continue;}
      policies[pid]={enabled:true,mode:'priority',priority,shares:null,storageIds};
    }else if(mode==='fixedShares'){
      const shares=raw.shares&&typeof raw.shares==='object'?Object.fromEntries(Object.entries(raw.shares).map(([k,v])=>[String(k),+v])):{},keys=Object.keys(shares).sort(),sum=Object.values(shares).reduce((a,b)=>a+b,0),exact=keys.length===storageIds.length&&storageIds.every(id=>keys.includes(id));
      if(!exact||Object.values(shares).some(x=>!(x>0))||Math.abs(sum-1)>1e-9){issues.push(phaseOwnershipIssue('MECHANICAL_FORCED_EXCESS_STORAGE_SHARES_INVALID','error',`Mechanical cooling plant ${pid} forced-excess fixedShares must provide positive shares summing to 1 for every eligible graph cold storage.`,{mechanicalPlantId:pid,storageComponentIds:storageIds,shares,sum}));continue;}
      policies[pid]={enabled:true,mode:'fixedShares',priority:[],shares,storageIds};
    }else issues.push(phaseOwnershipIssue('MECHANICAL_FORCED_EXCESS_STORAGE_DISPATCH_MODE_INVALID','error',`Mechanical cooling plant ${pid} forcedExcessStorageDispatch mode must be priority or fixedShares.`,{mechanicalPlantId:pid,mode,storageComponentIds:storageIds}));
  }
  return{policies,issues};
}
function recordMechanicalForcedExcessDisposition(st,plant,{toStorage_W=0,rejected_W=0}={},dt_s=HOUR_S){
  const a=Math.max(0,+toStorage_W||0),r=Math.max(0,+rejected_W||0);st.forcedExcessToStorage_J+=a*dt_s;st.forcedExcessRejected_J+=r*dt_s;if(!plant.staging.allowForcedExcessRejection&&r>0)st.rejectionViolation_J+=r*dt_s;return{toStorage_W:a,rejected_W:r};
}
function dispatchMechanicalForcedExcessToColdStorageHour(design,phaseTopologyOwnership,states,sourceProfiles,plantSteps,plantStates,policies,{alreadyChargedByStorage_W={},sharedStorageReservations=null,hour=0}={}){
  const plantMap=mechanicalCoolingPlantMap(design),eligibleByPlant=new Map(),details=[],byPlant={},byStorage_W={};let forcedExcess_W=0,toStorage_W=0,rejected_W=0;
  for(const r of phaseTopologyOwnership?.coldSourceDeliveries??[]){
    if(r.destinationType!=='storage')continue;const src=sourceProfiles?.[r.sourceComponentId];if(src?.availableMode!=='mechanicalCoolingDirect')continue;const pid=src.mechanicalPlantId;
    if(!eligibleByPlant.has(pid))eligibleByPlant.set(pid,new Set());eligibleByPlant.get(pid).add(r.destinationComponentId);
  }
  const used={...alreadyChargedByStorage_W},reservationCapsByPlant=sharedStorageReservationCapsByPlant(states,sharedStorageReservations,{alreadyChargedByStorage_W,hour}),reservationUsedByPlant={};
  const charge=(plantId,storageId,allocation_W,supply_C)=>{const st=states?.get?.(storageId);if(!st||!(allocation_W>0))return 0;const remainingPower=Math.max(0,st.spec.maxCharge_W-(used[storageId]??0)),caps=reservationCapsByPlant?.[plantId],capKey=`${plantId}::${storageId}`,reservationCap=caps&&Number.isFinite(caps[storageId])?Math.max(0,caps[storageId]-(reservationUsedByPlant[capKey]??0)):Infinity,x=coldStorageCharge(st,Math.min(allocation_W,remainingPower,reservationCap),supply_C,HOUR_S);used[storageId]=(used[storageId]??0)+x;reservationUsedByPlant[capKey]=(reservationUsedByPlant[capKey]??0)+x;byStorage_W[storageId]=(byStorage_W[storageId]??0)+x;return x;};
  for(const [pid,step] of plantSteps??new Map()){
    const plant=plantMap.get(pid),st=plantStates?.get?.(pid),forced=Math.max(0,+step?.forcedExcess_W||0),ids=[...(eligibleByPlant.get(pid)??[])].sort(),policy=policies?.[pid]??null;forcedExcess_W+=forced;let accepted=0;
    if(forced>0&&plant&&ids.length&&policy?.enabled){
      if(policy.mode==='fixedShares'){for(const id of ids){const allocation=forced*(policy.shares?.[id]??0),x=charge(pid,id,allocation,plant.supplyTemperature_C);accepted+=x;details.push({mechanicalPlantId:pid,storageComponentId:id,mode:'fixedShares',availableAllocation_W:allocation,accepted_W:x,supplyTemperature_C:plant.supplyTemperature_C});}}
      else{let rem=forced;for(const id of policy.priority??ids){const allocation=rem,x=charge(pid,id,allocation,plant.supplyTemperature_C);accepted+=x;rem=Math.max(0,rem-x);details.push({mechanicalPlantId:pid,storageComponentId:id,mode:policy.mode,availableAllocation_W:allocation,accepted_W:x,supplyTemperature_C:plant.supplyTemperature_C});if(rem<=1e-12)break;}}
    }
    const rejected=Math.max(0,forced-accepted);toStorage_W+=accepted;rejected_W+=rejected;if(st&&plant)recordMechanicalForcedExcessDisposition(st,plant,{toStorage_W:accepted,rejected_W:rejected},HOUR_S);byPlant[pid]={mechanicalPlantId:pid,forcedExcess_W:forced,toStorage_W:accepted,rejected_W:rejected,eligibleStorageComponentIds:ids,policy:policy?{mode:policy.mode,priority:[...(policy.priority??[])],shares:policy.shares?{...policy.shares}:null}:null};
  }
  return{forcedExcess_W,toStorage_W,rejected_W,byPlant,byStorage_W,details};
}

function validateColdStorageBindings(phaseTopologyOwnership,coldStorageSpecs,project,n,dynamicPhase,design=null){
  const issues=[],serviceRows=(phaseTopologyOwnership?.storageServices??[]).filter(x=>x.serviceMode==='cooling'),chargeRows=(phaseTopologyOwnership?.storageCharging??[]).filter(x=>x.serviceMode==='cooling'),directRows=phaseTopologyOwnership?.coldSourceDeliveries??[];
  const ids=[...new Set([...serviceRows.map(x=>x.storageComponentId),...chargeRows.map(x=>x.storageComponentId),...directRows.filter(x=>x.destinationType==='storage').map(x=>x.destinationComponentId)].filter(Boolean))],byId=new Map();
  for(const spec of(coldStorageSpecs??[])){const id=spec?.componentId??spec?.storageId??null;if(!id)continue;if(byId.has(id))issues.push(phaseOwnershipIssue('DUPLICATE_COLD_STORAGE_ID','error',`Multiple cold-storage specifications use component id ${id}.`,{storageComponentId:id}));else byId.set(id,spec);}
  for(const id of ids){const spec=byId.get(id);if(!spec)issues.push(phaseOwnershipIssue('GRAPH_COLD_STORAGE_UNBOUND','error',`Graph cooling storage ${id} has no component-keyed annual cold-storage state.`,{storageComponentId:id}));else if(!(spec.capacity_J>0))issues.push(phaseOwnershipIssue('GRAPH_COLD_STORAGE_WITHOUT_CAPACITY','error',`Graph cooling storage ${id} has zero useful cold capacity.`,{storageComponentId:id}));}
  const sinks=resolveNamedColdSinkProfiles(project,n);issues.push(...sinks.issues);
  const sinkIds=[...new Set([...serviceRows.flatMap(x=>x.coldSinkComponentIds??x.sinkComponentIds??[]),...directRows.filter(x=>x.destinationType==='coldSink').map(x=>x.destinationComponentId)])],buildingRaw=project?.buildingCoolingSink??null;let buildingCoolingSink=null;
  if(buildingRaw){const componentId=String(buildingRaw.componentId??'');let maxSupplyTemperature_C=null;if(!componentId)issues.push(phaseOwnershipIssue('BUILDING_COOLING_SINK_COMPONENT_REQUIRED','error','project.buildingCoolingSink requires componentId.',{}));else if(!sinkIds.includes(componentId))issues.push(phaseOwnershipIssue('BUILDING_COOLING_SINK_NOT_GRAPH_OWNED','error',`Building cooling sink ${componentId} is not graph-owned by direct cold-source or cold-storage service topology.`,{coldSinkComponentId:componentId}));if(componentId&&sinks.profiles[componentId])issues.push(phaseOwnershipIssue('BUILDING_COOLING_SINK_DOUBLE_BOUND','error',`Building cooling sink ${componentId} cannot also have project.coldSinkProfiles demand.`,{coldSinkComponentId:componentId}));try{maxSupplyTemperature_C=dynamicPhaseLoadProfile(project,buildingRaw.maxSupplyTemperatureProfileRef??buildingRaw.maxSupplyTemperature_C,n);}catch(e){issues.push(phaseOwnershipIssue('BUILDING_COOLING_SINK_TEMPERATURE_REQUIRED','error','project.buildingCoolingSink requires maxSupplyTemperature_C or maxSupplyTemperatureProfileRef.',{componentId,reason:e.message}));}if(componentId&&maxSupplyTemperature_C)buildingCoolingSink={componentId,maxSupplyTemperature_C};}
  for(const id of sinkIds)if(id!==buildingCoolingSink?.componentId&&!sinks.profiles[id])issues.push(phaseOwnershipIssue('GRAPH_COLD_SINK_UNBOUND','error',`Graph cold sink ${id} has no named project.coldSinkProfiles binding.`,{coldSinkComponentId:id}));
  const sources=resolveNamedColdSourceProfiles(project,n,phaseTopologyOwnership,dynamicPhase,design);issues.push(...sources.issues);for(const row of directRows){const src=sources.profiles[row.sourceComponentId];if(src?.availableMode==='airsideToHydronicConverter'&&row.destinationType!=='storage')issues.push(phaseOwnershipIssue('AIRSIDE_HYDRONIC_CONVERTER_STORAGE_ONLY','error',`Airside-to-hydronic converter source ${row.sourceComponentId} may only deliver to graph-owned cold storage in this model slice.`,{sourceComponentId:row.sourceComponentId,destinationComponentId:row.destinationComponentId,destinationType:row.destinationType}));if(src?.availableMode==='exhaustAirToHydronicConverter'&&row.destinationType!=='storage')issues.push(phaseOwnershipIssue('EXHAUST_HYDRONIC_CONVERTER_STORAGE_ONLY','error',`Exhaust/return-air-to-hydronic converter source ${row.sourceComponentId} may only deliver to graph-owned cold storage in this model slice.`,{sourceComponentId:row.sourceComponentId,destinationComponentId:row.destinationComponentId,destinationType:row.destinationType}));}const mechanicalPlantDispatch=resolveMechanicalCoolingPlantDispatchPolicy(design,phaseTopologyOwnership,sources.profiles,project,n);issues.push(...mechanicalPlantDispatch.issues);const mechanicalForcedExcessStorage=resolveMechanicalForcedExcessStoragePolicies(design,phaseTopologyOwnership,sources.profiles);issues.push(...mechanicalForcedExcessStorage.issues);
  for(const row of [...chargeRows,...directRows])if(!sources.profiles[row.sourceComponentId])issues.push(phaseOwnershipIssue('GRAPH_COLD_SOURCE_UNBOUND','error',`Graph cooling-source owner ${row.sourceComponentId} has no valid project.coldSourceProfiles binding.`,{sourceComponentId:row.sourceComponentId,destinationComponentId:row.destinationComponentId??row.storageComponentId}));
  return{issues,storageComponentIds:ids,coldSinkProfiles:sinks.profiles,coldSourceProfiles:sources.profiles,buildingCoolingSink,mechanicalPlantDispatch,mechanicalForcedExcessStoragePolicies:mechanicalForcedExcessStorage.policies};
}
function dispatchGraphDirectColdSourcesHour(phaseTopologyOwnership,coldStorageStates,sourceProfiles,{hour=0,coldSinkRemaining_W={},coldSinkMaxSupply_C={},mechanicalPlantDispatch=null,mechanicalPlantStates=null,mechanicalPlants=null,mechanicalForcedExcessStoragePolicies=null,alreadyChargedByStorage_W={}}={}){
  const rows=phaseTopologyOwnership?.coldSourceDeliveries??[],remaining={};for(const [id,q] of Object.entries(coldSinkRemaining_W??{}))remaining[id]=Math.max(0,+q||0);
  const initialRemaining={...remaining},bySource_W={},bySink_W={},byStorage_W={},details=[];let available_W=0,accepted_W=0,toColdSink_W=0,toStorage_W=0,electric_W=0;
  const groups=new Map();for(const r of rows){if(!groups.has(r.sourceComponentId))groups.set(r.sourceComponentId,[]);groups.get(r.sourceComponentId).push(r);}
  const sharedSet=new Set((mechanicalPlantDispatch?.sharedDestinations??[]).map(x=>x.destinationComponentId));
  const storageInitialAcceptance={};
  if(mechanicalPlantDispatch?.enabled&&(mechanicalPlantDispatch.mode==='fixedShares'||(mechanicalPlantDispatch.mode==='marginalCost'&&Object.values(mechanicalPlantDispatch.stateAwareByPlant??{}).some(Boolean)))){
    for(const id of sharedSet){const st=coldStorageStates?.get?.(id);if(st){const room=Math.max(0,st.spec.capacity_J-st.cold_J),byEnergy=room/(HOUR_S*Math.max(st.spec.chargeEfficiency,1e-12));storageInitialAcceptance[id]=Math.max(0,Math.min(st.spec.maxCharge_W,byEnergy));}}
  }
  const processSource=(sid,rs0,q0Override=null,destinationCaps=null)=>{
    const src=sourceProfiles?.[sid];if(!src)return 0;
    const nativeQ=Math.max(0,coldProfileValue(src.available_W,hour)),q0=q0Override==null?nativeQ:Math.max(0,Math.min(nativeQ,q0Override)),ts=coldProfileValue(src.supplyTemperature_C,hour);
    let q=q0,acc=0;const fixed=rs0.some(r=>r.allocation?.mode==='fixedShares'),rs=[...rs0].sort((a,b)=>((a.allocation?.rank??1e9)-(b.allocation?.rank??1e9))||a.destinationComponentId.localeCompare(b.destinationComponentId));
    for(const r of rs){
      let allocation=fixed?q0*Math.max(0,+r.allocation?.share||0):q;
      const cap=destinationCaps?.[r.destinationComponentId];if(Number.isFinite(cap))allocation=Math.min(allocation,Math.max(0,cap));
      if(!(allocation>0))continue;
      let x=0;
      if(r.destinationType==='coldSink'){
        const demand=remaining[r.destinationComponentId]??0,maxT=coldSinkMaxSupply_C?.[r.destinationComponentId];
        if(demand>0&&(maxT==null||ts<=maxT+1e-9)){x=Math.min(allocation,demand);remaining[r.destinationComponentId]=Math.max(0,demand-x);bySink_W[r.destinationComponentId]=(bySink_W[r.destinationComponentId]??0)+x;toColdSink_W+=x;}
      }else if(r.destinationType==='storage'){
        const st=coldStorageStates?.get?.(r.destinationComponentId);if(st)x=coldStorageCharge(st,allocation,ts,HOUR_S);
        if(x>0){byStorage_W[r.destinationComponentId]=(byStorage_W[r.destinationComponentId]??0)+x;toStorage_W+=x;}
      }
      acc+=x;if(!fixed)q=Math.max(0,q-x);
      if(destinationCaps&&Number.isFinite(destinationCaps[r.destinationComponentId]))destinationCaps[r.destinationComponentId]=Math.max(0,destinationCaps[r.destinationComponentId]-x);
      details.push({sourceComponentId:sid,destinationComponentId:r.destinationComponentId,destinationType:r.destinationType,availableAllocation_W:allocation,accepted_W:x,supplyTemperature_C:ts,interPlantDispatchMode:mechanicalPlantDispatch?.enabled?mechanicalPlantDispatch.mode:null});
    }
    bySource_W[sid]=acc;accepted_W+=acc;if(src.accountingMode==='siteElectricityRatio')electric_W+=acc*Math.max(0,+src.electricity_W_perCooling_W||0);return acc;
  };
  const mechanicalPools=new Map(),ordinary=[];for(const [sid,rs] of [...groups].sort()){const src=sourceProfiles?.[sid];if(src?.availableMode==='mechanicalCoolingDirect'){const pid=src.mechanicalPlantId??'builtinMechanicalCooling';if(!mechanicalPools.has(pid))mechanicalPools.set(pid,[]);mechanicalPools.get(pid).push([sid,rs,src]);}else ordinary.push([sid,rs]);}
  for(const [sid,rs] of ordinary){const src=sourceProfiles?.[sid];if(!src)continue;available_W+=Math.max(0,coldProfileValue(src.available_W,hour));processSource(sid,rs);}
  const plantEntries=[...mechanicalPools.entries()],rank=new Map((mechanicalPlantDispatch?.enabled&&mechanicalPlantDispatch.mode==='priority'?mechanicalPlantDispatch.priority:[]).map((id,i)=>[id,i])),tieRank=new Map((mechanicalPlantDispatch?.tieBreakPriority??[]).map((id,i)=>[id,i])),stateAwarePredictions={},sharedStorageReservationCaps=sharedStorageReservationCapsByPlant(coldStorageStates,mechanicalPlantDispatch?.sharedStorageReservations,{alreadyChargedByStorage_W,hour});
  if(mechanicalPlantDispatch?.enabled&&mechanicalPlantDispatch.mode==='marginalCost'){
    const plantMap=new Map((mechanicalPlants??[]).map(p=>[p.id,p]));
    for(const [pid,members] of plantEntries){if(!mechanicalPlantDispatch.stateAwareByPlant?.[pid])continue;const plant=plantMap.get(pid),st=mechanicalPlantStates?.get?.(pid);if(!plant||!st)continue;const destIds=new Set(),temps=[];for(const [,rs,src] of members){temps.push(coldProfileValue(src.supplyTemperature_C,hour));for(const r of rs)destIds.add(r.destinationComponentId);}let probeDemand=0;const ts=Math.min(...temps.filter(Number.isFinite));for(const id of destIds){if(!sharedSet.has(id))continue;const sinkDemand=initialRemaining[id];if(Number.isFinite(sinkDemand)){const maxT=coldSinkMaxSupply_C?.[id];if(maxT==null||ts<=maxT+1e-9)probeDemand+=Math.max(0,sinkDemand);}else if(storageInitialAcceptance[id]!=null)probeDemand+=Math.max(0,storageInitialAcceptance[id]);}const poolAvailable=Math.max(0,...members.map(([, ,src])=>coldProfileValue(src.available_W,hour))),target=Math.min(poolAvailable,probeDemand),base=coldProfileValue(mechanicalPlantDispatch.intensityProfiles?.[pid],hour);try{const pred=predictMechanicalCoolingPlantMarginalPerformance(st,plant,target,hour,{baseElectricity_kWh_per_kWhCooling:base});const price=coldProfileValue(mechanicalPlantDispatch.electricityPriceProfile,hour),variable=coldProfileValue(mechanicalPlantDispatch.variableCostProfiles?.[pid],hour),credit=coldProfileValue(mechanicalPlantDispatch.heatRecoveryCreditProfiles?.[pid],hour),legacyStorageValue=mechanicalPlantDispatch.storageOpportunityValueProfiles?.[pid]!=null?coldProfileValue(mechanicalPlantDispatch.storageOpportunityValueProfiles[pid],hour):0,storageValueByComponent={};for(const sid of Object.keys(mechanicalPlantDispatch.storageOpportunityValueProfilesByStorage??{})){const ps=mechanicalStoragePlantSets(phaseTopologyOwnership,sourceProfiles).get(sid);if(ps?.has(pid))storageValueByComponent[sid]=coldProfileValue(mechanicalPlantDispatch.storageOpportunityValueProfilesByStorage[sid],hour);}const hasStorageValue=legacyStorageValue>0||Object.values(storageValueByComponent).some(v=>v>0),storageProbe=hasStorageValue?predictMechanicalForcedExcessStorageAcceptance(pid,pred.forcedExcess_W,plant,coldStorageStates,mechanicalForcedExcessStoragePolicies?.[pid],{alreadyChargedByStorage_W,storageAcceptanceCapByComponent_W:sharedStorageReservationCaps?.[pid]??null}):{forcedExcess_W:pred.forcedExcess_W,accepted_W:0,rejected_W:pred.forcedExcess_W,byStorage_W:{},details:[]};let storageCredit=0;if(pred.available&&pred.useful_W>0){if(legacyStorageValue>0)storageCredit=(storageProbe.accepted_W/pred.useful_W)*legacyStorageValue;else for(const [sid,q] of Object.entries(storageProbe.byStorage_W??{}))storageCredit+=(Math.max(0,+q||0)/pred.useful_W)*Math.max(0,+storageValueByComponent[sid]||0);}pred.storageOpportunityValue_per_kWhAcceptedCooling=legacyStorageValue;pred.storageOpportunityValueByComponent_per_kWhAcceptedCooling=storageValueByComponent;pred.predictedForcedExcessStorageAcceptance_W=storageProbe.accepted_W;pred.predictedForcedExcessStorageByComponent_W=storageProbe.byStorage_W;pred.storageOpportunityCredit_per_kWhUsefulCooling=storageCredit;pred.marginalCost_per_kWhCooling=pred.available?pred.electricity_kWh_per_kWhCooling*price+variable-credit-storageCredit:Infinity;stateAwarePredictions[pid]=pred;}catch(e){stateAwarePredictions[pid]={available:false,error:e.message,marginalCost_per_kWhCooling:Infinity};}}
  }
  const marginalCostAt=(pid)=>mechanicalPlantDispatch?.stateAwareByPlant?.[pid]?(stateAwarePredictions[pid]?.marginalCost_per_kWhCooling??Infinity):coldProfileValue(mechanicalPlantDispatch?.marginalCostProfiles?.[pid],hour);
  plantEntries.sort((a,b)=>{if(mechanicalPlantDispatch?.enabled&&mechanicalPlantDispatch.mode==='marginalCost'){const ca=marginalCostAt(a[0]),cb=marginalCostAt(b[0]);if(Math.abs(ca-cb)>1e-12)return ca-cb;return(tieRank.get(a[0])??1e9)-(tieRank.get(b[0])??1e9);}return(rank.get(a[0])??1e9)-(rank.get(b[0])??1e9)||a[0].localeCompare(b[0]);});
  for(const [pid,members0] of plantEntries){
    const members=[...members0],poolAvailable=Math.max(0,...members.map(([, ,src])=>coldProfileValue(src.available_W,hour)));available_W+=poolAvailable;
    let caps=null;
    if(mechanicalPlantDispatch?.enabled&&mechanicalPlantDispatch.mode==='fixedShares'&&mechanicalPlantDispatch.shares?.[pid]>0){
      const share=mechanicalPlantDispatch.shares[pid];caps={};
      for(const d of mechanicalPlantDispatch.sharedDestinations??[]){
        if(!d.plantIds.includes(pid))continue;
        const id=d.destinationComponentId;
        caps[id]=(storageInitialAcceptance[id]??initialRemaining[id]??0)*share;
      }
    }
    if(members.length===1){processSource(members[0][0],members[0][1],poolAvailable,caps);continue;}
    const mode=members[0][2].mechanicalPlantAllocation?.mode;
    if(mode==='fixedShares'){for(const [sid,rs,src] of members)processSource(sid,rs,poolAvailable*Math.max(0,+src.mechanicalPlantAllocation?.share||0),caps);}
    else{let residual=poolAvailable;members.sort((a,b)=>(+a[2].mechanicalPlantAllocation?.rank||1e9)-(+b[2].mechanicalPlantAllocation?.rank||1e9)||a[0].localeCompare(b[0]));for(const [sid,rs] of members){const used=processSource(sid,rs,residual,caps);residual=Math.max(0,residual-used);}}
  }
  return{available_W,accepted_W,toColdSink_W,toStorage_W,unused_W:Math.max(0,available_W-accepted_W),electric_W,bySource_W,bySink_W,byStorage_W,coldSinkRemainingByComponent_W:remaining,details,mechanicalPlantDispatchApplied:mechanicalPlantDispatch?.enabled?{mode:mechanicalPlantDispatch.mode,priority:[...(mechanicalPlantDispatch.priority??[])],shares:mechanicalPlantDispatch.shares?{...mechanicalPlantDispatch.shares}:null,tieBreakPriority:[...(mechanicalPlantDispatch.tieBreakPriority??[])],sharedStorageReservations:sharedStorageReservationTrace(mechanicalPlantDispatch.sharedStorageReservations,hour,sharedStorageReservationCaps),marginalCost_per_kWhCooling:mechanicalPlantDispatch.mode==='marginalCost'?Object.fromEntries(mechanicalPlantDispatch.relevantPlantIds.map(id=>[id,marginalCostAt(id)])):null,stateAwarePredictions:mechanicalPlantDispatch.mode==='marginalCost'?stateAwarePredictions:null}:null};
}

function endogenousDirectColdSourceProfilesHour(boundProfiles,design,ground,fcProbe,{mechanicalAvailable_W=0,mechanicalPlantAvailable_W=null}={}){
  const out={};for(const [sid,src] of Object.entries(boundProfiles??{})){if(src.availableMode==='freeCoolingDirect'){const row=fcProbe?.modes?.find(x=>x.mode===src.freeCoolingMode);out[sid]={...src,available_W:Math.max(0,+row?.availableCapacity_W||0),supplyTemperature_C:(Number.isFinite(+row?.supplyTemperature_C)?+row.supplyTemperature_C:design.coolingSupply_C)};}else if(src.availableMode==='groundDirectCooling'){const ok=design.groundCoupling.enabled&&design.groundCoupling.directCoolingEnabled&&ground.T_C+design.groundCoupling.approach_K<=design.coolingSupply_C,cap=ok?Math.min(design.groundCoupling.maxDirectCooling_W,groundExchangeCapacityW(ground,design.groundCoupling,'inject',HOUR_S)):0;out[sid]={...src,available_W:Math.max(0,cap),supplyTemperature_C:design.coolingSupply_C};}else if(src.availableMode==='mechanicalCoolingDirect'){const plant=(design.mechanicalCoolingPlants??[]).find(p=>p.id===src.mechanicalPlantId);out[sid]={...src,available_W:Math.max(0,plant?(mechanicalPlantAvailable_W?.get?.(plant.id)??plant.capacity_W):(+mechanicalAvailable_W||0)),supplyTemperature_C:plant?.supplyTemperature_C??design.coolingSupply_C};}else if(src.availableMode==='airsideToHydronicConverter'||src.availableMode==='exhaustAirToHydronicConverter'){out[sid]={...src,available_W:0,supplyTemperature_C:NaN,electricity_W_perCooling_W:0};}else out[sid]=src;}return out;
}
function coldSourceChargingElectricityW(dispatch,sourceProfiles){
  let w=0;for(const [sid,q] of Object.entries(dispatch?.bySource_W??{})){const src=sourceProfiles?.[sid];if(src?.accountingMode==='siteElectricityRatio')w+=Math.max(0,+q||0)*Math.max(0,+src.electricity_W_perCooling_W||0);}return w;
}
function dispatchMechanicalColdSinksHour(remaining0,maxSupply0,{plantSupply_C,availableCapacity_W}={}){
  const remaining={};for(const [id,q] of Object.entries(remaining0??{}))remaining[id]=Math.max(0,+q||0);
  let cap=Math.max(0,+availableCapacity_W||0),served_W=0;const bySink_W={},temperatureBlocked_W={},details=[];
  for(const id of Object.keys(remaining).sort()){
    const before=remaining[id],maxT=+maxSupply0?.[id];let x=0,blocked=0;
    if(before>0&&Number.isFinite(maxT)){if(plantSupply_C<=maxT+1e-9){x=Math.min(before,cap);cap-=x;remaining[id]-=x;served_W+=x;bySink_W[id]=x;}else{blocked=before;temperatureBlocked_W[id]=before;}}
    details.push({coldSinkComponentId:id,demandBefore_W:before,maxSupplyTemperature_C:Number.isFinite(maxT)?maxT:null,plantSupply_C,served_W:x,temperatureBlocked_W:blocked,demandAfter_W:remaining[id]});
  }
  return{served_W,remainingCapacity_W:cap,coldSinkRemainingByComponent_W:remaining,bySink_W,temperatureBlocked_W,details};
}

function simulateCandidate(project,designInput,{retainTrace=false,phasePropertyProviders=null}={}){
  const programPrepared=prepareProgramAnnualProject(project);project=programPrepared.project;const programIntegration=programPrepared.summary;
  const d=normalizeCandidate(designInput),p=project.profiles;let dynamicPhase={available:true,refrigeration:[],steamCondensing:[],totals:{compressorElectricity_J:0,steamHeat_J:0,steamMass_kg:0,steamUtilityCost:0},hourly:{compressor_W:new Float64Array(p.outdoor_C.length),steamMassFlow_kg_s:new Float64Array(p.outdoor_C.length)},providerProvenance:{}};let dynamicPhaseIssues=[];
  if(d.dynamicPhaseComponents&&((d.dynamicPhaseComponents.refrigeration?.length??0)||(d.dynamicPhaseComponents.steamCondensing?.length??0))){try{dynamicPhase=evaluateDynamicPhaseComponentsAnnual(project,d.dynamicPhaseComponents,phasePropertyProviders??{});}catch(e){dynamicPhase={available:false,reason:e.message,refrigeration:[],steamCondensing:[],totals:{compressorElectricity_J:0,steamHeat_J:0,steamMass_kg:0,steamUtilityCost:0},hourly:{compressor_W:new Float64Array(p.outdoor_C.length),steamMassFlow_kg_s:new Float64Array(p.outdoor_C.length)},hourlyByComponent:{refrigeration:{},steamCondensing:{}}};dynamicPhaseIssues=[{circuit:'dynamicPhase',reason:e.message}];}}
  const phaseTopologyOwnership=evaluatePhaseTopologyOwnershipAnnual(project,dynamicPhase,d.dynamicPhaseComponents??{},d.phaseTopologyOwnership??{}),phaseOwnershipIssues=phaseTopologyOwnership.issues??[];
  const n=p.outdoor_C.length,heatRecoveryBinding=validateHeatRecoverySystemAndStorageBindings(phaseTopologyOwnership,d.heatRecovery,d.storages,project,n);phaseOwnershipIssues.push(...heatRecoveryBinding.issues);phaseTopologyOwnership.heatRecoveryBinding=heatRecoveryBinding;
  const coldStorageBinding=validateColdStorageBindings(phaseTopologyOwnership,d.coldStorages,project,n,dynamicPhase,d);phaseOwnershipIssues.push(...coldStorageBinding.issues);phaseTopologyOwnership.coldStorageBinding=coldStorageBinding;const exhaustRecoveryBinding=validateExhaustRecoveryBindings(phaseTopologyOwnership,project,coldStorageBinding.coldSourceProfiles);phaseOwnershipIssues.push(...exhaustRecoveryBinding.issues);phaseTopologyOwnership.exhaustRecoveryBinding=exhaustRecoveryBinding;
  const phaseOwnershipErrors=phaseOwnershipIssues.filter(x=>x.severity==='error');
  const bld=createBuildingState(project.building),storageStates=createStorageStateMap(d.storages),coldStorageStates=createColdStorageStateMap(d.coldStorages),tank=storageStates.get(d.primaryStorageId)??createTankState(d.tank),ground=createGroundState(d.groundCoupling),humidity=createHumidityState(project,bld.Tair_C),contaminantState=createProcessContaminantState(project),plantCyclingState=createPlantCyclingState(d.heatPumpPlant,d.plantCycling),mechanicalPlantStates=createMechanicalCoolingPlantStateMap(d,project,n);
  const primaryStorageComponentId=tank?.spec?.componentId??d.primaryStorageId??null,primaryStorageGraphOwned=!!primaryStorageComponentId&&((phaseTopologyOwnership.storageCharging??[]).some(x=>x.storageComponentId===primaryStorageComponentId)||(phaseTopologyOwnership.storageServices??[]).some(x=>x.storageComponentId===primaryStorageComponentId)||(phaseTopologyOwnership.refrigeration??[]).some(x=>x.dynamicHeatRecovery?.routing?.storageComponentId===primaryStorageComponentId));
  if(![p.internalGains_W,p.electricity_per_kWh,p.gas_per_kWh,p.wasteTemp_C,p.wasteAvailable_W].every(a=>a.length===n))throw new Error('profile length mismatch');
  if(p.indoorDewPoint_C&&p.indoorDewPoint_C.length!==n)throw new Error('dew-point profile length mismatch');
  if(d.heatPumpSource.enabled&&p[d.heatPumpSource.temperatureProfileRef]?.length!==n)throw new Error('heat-pump source profile length mismatch: '+d.heatPumpSource.temperatureProfileRef);
  const cheap=percentile(p.electricity_per_kWh,d.cheapQuantile),expensive=percentile(p.electricity_per_kWh,d.expensiveQuantile);
  const totals={zoneHeat_J:0,zoneCool_J:0,directWaste_J:0,hpHeat_J:0,boilerHeat_J:0,tankToZone_J:0,tankChargeHeat_J:0,coolingElectricity_J:0,coolingRejected_J:0,heatRecovered_J:0,heatRecoveryToSink_J:0,heatRecoveryToTank_J:0,hotSinkDemand_J:0,hotSinkBackup_J:0,ambientRejected_J:0,electricity_J:0,gas_J:0,deliveredFuel_J:0,pumpElectricity_J:0,fanElectricity_J:0,wasteRejected_J:0,unservedHeat_J:0,unservedCool_J:0,unserved_J:0,latentCooling_J:0,condensate_kg:0,unservedMoisture_kg:0,dedicatedLatentCooling_J:0,dedicatedLatentElectricity_J:0,dedicatedLatentFanElectricity_J:0,dedicatedLatentRejected_J:0,freeCooling_J:0,freeCoolingElectricity_J:0,groundDirectHeat_J:0,groundDirectCooling_J:0,groundHPExtraction_J:0,groundMechanicalRejection_J:0,groundPumpElectricity_J:0,sourceWaterHPExtraction_J:0,sourceWaterHPPumpElectricity_J:0,pvGeneration_J:0,pvDirectUse_J:0,pvExport_J:0,pvCurtailed_J:0,gridImport_J:0,avoidedSolarGain_J:0,humidifierWater_kg:0,humidifierElectricity_J:0,humidifierAdditionalHeating_J:0,processCapturedMoisture_kg:0,processUncapturedZoneMoisture_kg:0,processExhaustAirExchangeMoisture_kg:0,processExhaustSensibleZone_J:0,processContaminantGenerated_kg:{},processContaminantCaptured_kg:{},programSensibleAirExchange_J:0,programDHW_J:0,dynamicRefrigerationElectricity_J:0,dynamicCondenserHeatRecovered_J:0,dynamicCondenserHeatToSink_J:0,dynamicCondenserHeatToTank_J:0,dynamicCondenserAmbientRejection_J:0,storageSourceAvailable_J:0,storageSourceCharge_J:0,storageSourceUnused_J:0,storageSourceChargeByComponent_J:{},storageSourceChargeBySource_J:{},storageServiceToSink_J:0,storageServiceByComponent_J:{},coldStorageSourceAvailable_J:0,coldStorageCharge_J:0,coldStorageSourceUnused_J:0,coldStorageChargeByComponent_J:{},coldStorageChargeBySource_J:{},coldStorageChargeElectricity_J:0,coldSinkDemand_J:0,coldStorageService_J:0,coldStorageServiceByComponent_J:{},buildingColdStorageService_J:0,freeCoolingStorageCharge_J:0,freeCoolingStorageChargeElectricity_J:0,exhaustRecoveryStorageCharge_J:0,exhaustRecoveryStorageChargeElectricity_J:0,coldMechanicalBackup_J:0,coldSinkUnserved_J:0,graphDirectColdSource_J:0,graphDirectColdToSink_J:0,graphDirectColdToStorage_J:0,graphDirectColdElectricity_J:0,graphMechanicalCold_J:0,graphMechanicalElectricity_J:0,graphMechanicalCondenserRejection_J:0,graphMechanicalGeneratedCold_J:0,graphMechanicalForcedExcessToStorage_J:0,graphMechanicalForcedExcessRejected_J:0,graphMechanicalStartupElectricity_J:0,graphMechanicalColdBySource_J:{},graphMechanicalElectricityByOwner_J:{},graphMechanicalRejectionByOwner_J:{},phaseOwnedElectricity_J:0,phaseOwnedGas_J:0,phaseOwnedDeliveredFuel_J:0,steamCondensingHeat_J:0,steamMass_kg:0,steamUtilityCost:0,hpCyclingForcedExcess_J:0,hpCyclingForcedExcessToTank_J:0,hpCyclingForcedExcessRejected_J:0,hpCyclingRestartBlockedUnmet_J:0,hpCyclingStartupElectricity_J:0};
  let costEnergyYear1=0,peakElecW=0,peakGridImportW=0,peakGasW=0,peakDeliveredFuelW=0,occupiedRHDegreeHoursBelow=0,rhDegreeHoursBelow=0,programTempDegreeHours=0,programRHDegreeHours=0,programConstraintConflicts=0,peakFlow=0,peakVelocity=0,peakDp=0,peakAirFlow=0,peakAirVelocity=0,peakAirDp=0,peakFanW=0,minSourceWaterOutlet_C=Infinity,maxSourceWaterDeltaT_K=0;
  const groundMonthlyNetToGround_J=Array(12).fill(0);
  const reps={winterDesign:null,summerDesign:null,peakElectric:null,maxTankCharge:null,maxTankDischarge:null,minTankSOC:null,maxTankSOC:null};
  let maxHeatNeed=-Infinity,maxCoolNeed=-Infinity,maxElec=-Infinity,maxCh=-Infinity,maxDis=-Infinity,minSoc=Infinity,maxSoc=-Infinity;
  const trace=retainTrace?new Array(n):null;
  for(let h=0;h<n;h++){
    const Tout=p.outdoor_C[h],price=p.electricity_per_kWh[h],gasPrice=p.gas_per_kWh[h],deliveredFuelPrice=(p.deliveredFuel_per_kWh?.[h]??normalizeSiteEnergyAvailability(project.siteEnergyAvailability??{}).deliveredFuel.price_per_kWh??gasPrice),baseGains=p.internalGains_W[h],solarRaw=p.solarGain_W?.[h]??0,irr=p.poaIrradiance_W_m2?.[h]??null,shade=d.shading.enabled?automaticShadingHour({solarGain_W:solarRaw,windowArea_m2:d.shading.windowArea_m2,irradiance_W_m2:irr,occupied:!!(p.occupied?.[h]??1),indoor_C:bld.Tair_C,coolingSetpoint_C:project.operation?.occupiedComfortMax_C??project.building?.comfortMax_C??23,type:d.shading.type,closedMultiplier:d.shading.closedMultiplier,minIrradiance_W_m2:d.shading.minIrradiance_W_m2}):{solarGainAfter_W:solarRaw,avoidedSolarGain_W:0,active:false},gains=baseGains+shade.solarGainAfter_W,wT=p.wasteTemp_C[h],wAvail=p.wasteAvailable_W[h],legacyHotDemand=p.hotSinkDemand_W?.[h]??0,legacyHotTarget=p.hotSinkTarget_C?.[h]??55,namedHotDemand={},namedHotTarget={};for(const [sid,b] of Object.entries(heatRecoveryBinding.namedHotSinkProfiles??{})){namedHotDemand[sid]=b.demand_W[h]??0;namedHotTarget[sid]=b.targetTemperature_C[h]??55;}const namedHotDemandTotal=Object.values(namedHotDemand).reduce((a,b)=>a+(+b||0),0),hotDemand=legacyHotDemand+namedHotDemandTotal,hotTarget=Math.max(legacyHotTarget,...Object.entries(namedHotDemand).filter(([,q])=>q>0).map(([sid])=>namedHotTarget[sid]??55)),opb=operationBounds(project,p,h),vent=p.ventilationFlow_m3_s?.[h]??0;const namedColdDemand={},namedColdMaxSupply={};for(const [sid,b] of Object.entries(coldStorageBinding.coldSinkProfiles??{})){namedColdDemand[sid]=b.demand_W[h]??0;namedColdMaxSupply[sid]=b.maxSupplyTemperature_C[h]??d.coolingSupply_C;}
    groundRecoveryStep(ground,d.groundCoupling,HOUR_S);for(const st of coldStorageStates.values())coldStorageStandingGain(st,project.plantRoom_C??15,HOUR_S);
    const humidityTarget_C=humidity.spec.enabled?((opb.occupied||opb.prestart)?humidity.spec.occupiedMaxDewPoint_C:humidity.spec.unoccupiedMaxDewPoint_C):(p.indoorDewPoint_C?p.indoorDewPoint_C[h]:(project.defaultIndoorDewPoint_C??14));
    const hydronicFirstPlan=planHydronicFirstExhaustRecoveryHour(project,p,h,{roomT_C:bld.Tair_C,zoneHumidityRatio_kg_kgDA:humidity.x_kg_kgDA,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,pressure_Pa:humidity.spec.pressure_Pa,phaseTopologyOwnership,coldStorageStates,coldSourceProfiles:coldStorageBinding.coldSourceProfiles}),hydronicFirstDispatch=hydronicFirstPlan?dispatchAirsideHydronicConvertersToColdStorageHour(phaseTopologyOwnership,coldStorageStates,hydronicFirstPlan.sourceProfiles,{hour:h,sourceAcceptanceCaps_W:hydronicFirstPlan.requestedBySource_W}):null;
    const processExhaust=processExhaustAnnualHour(project,p,h,{roomT_C:bld.Tair_C,zoneHumidityRatio_kg_kgDA:humidity.x_kg_kgDA,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,pressure_Pa:humidity.spec.pressure_Pa,zoneContaminants_kg_kgDA:contaminantState.concentrations_kg_kgDA,exhaustRecoveryOwnershipByPath:exhaustRecoveryBinding.byPath,hydronicFirstAcceptedByRecovery_W:hydronicFirstDispatch?.bySource_W??{}});
    let humDemand=humidityHourDemand(humidity,{roomT_C:bld.Tair_C,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,ventilation_m3_s:vent,internalMoisture_kg_s:p.internalMoisture_kg_s?.[h]??0,externalMoistureTransfer_kg_s:processExhaust.netZoneMoistureRate_kg_s,targetDewPoint_C:humidityTarget_C,dt_s:HOUR_S});
    let humidPerf={waterToAir_kg:0,makeupWater_kg:0,electricity_J:0,additionalHeating_J:0},humidRate=0,humidityMinRH=null;
    if(humidity.spec.enabled&&d.humidifier.enabled){humidityMinRH=(opb.occupied||opb.prestart)?(project.humidity?.occupiedMinRH_frac??.35):(project.humidity?.unoccupiedMinRH_frac??.25);const minX=humidityRatioFromRH(bld.Tair_C,humidityMinRH,humidity.spec.pressure_Pa),need=Math.max(0,(minX-humDemand.xNoHVAC)*humDemand.zoneDryAir_kg/HOUR_S),cap=d.humidifier.design_kg_h/3600;humidRate=Math.min(need,cap);humidPerf=humidifierPerformance(d.humidifier.type,humidRate*HOUR_S,{electric_kWh_per_kg:d.humidifier.electric_kWh_per_kg,water_kg_per_kg:d.humidifier.water_kg_per_kg});const xHum=humDemand.xNoHVAC+humidRate*HOUR_S/Math.max(humDemand.zoneDryAir_kg,1e-9);humDemand={...humDemand,xNoHVAC:xHum,requiredCondensate_kg_s:Math.max(0,(xHum-humDemand.targetX)*humDemand.zoneDryAir_kg/HOUR_S)};}
    const dew=humidity.spec.enabled?dewPointFromHumidityRatio(humDemand.xNoHVAC,humidity.spec.pressure_Pa):humidityTarget_C;
    for(const st of storageStates.values())tankStandingLoss(st,project.plantRoom_C??15,HOUR_S);
    let heatTermMax=heatingTerminalCapacityW(d.heatingTerminal,bld.Tair_C),coolTermMax=coolingTerminalCapacityW(d.coolingTerminal,bld.Tair_C,dew);
    if(d.heatingTerminal.type==='ventilationAir')heatTermMax=Math.min(heatTermMax,ventilationAirHeatingCapacityW(vent,bld.Tair_C,opb.operation));
    else if(d.heatingTerminal.type==='airPlusLocalCoils')heatTermMax=Math.min(d.heatingTerminal.nominal_W,ventilationAirHeatingCapacityW(vent,bld.Tair_C,opb.operation)+d.heatingTerminal.localCoil_W);
    const massFrac=deliveryToMassFraction(d.heatingTerminal),coolMassFrac=deliveryToMassFraction(d.coolingTerminal),humidHeatW=humidPerf.additionalHeating_J/HOUR_S,programSensibleW=programSensibleAirExchangeW(programIntegration,p,h,{Tout_C:Tout,roomT_C:bld.Tair_C,airDensity_kg_m3:opb.operation.airDensity_kg_m3,airCp_J_kgK:opb.operation.airCp_J_kgK}),effectiveGains=gains-humidHeatW+programSensibleW+processExhaust.sensibleZoneGain_W;
    const qToMin=hvacPowerForTarget(bld,{Tout_C:Tout,gains_W:effectiveGains,targetAir_C:opb.comfortMin_C,deliveryToMassFraction:massFrac});
    const qToMax=hvacPowerForTarget(bld,{Tout_C:Tout,gains_W:effectiveGains,targetAir_C:opb.comfortMax_C,deliveryToMassFraction:coolMassFrac});
    const heatNeeded=qToMin>0,coolNeeded=qToMax<0;
    let mode='idle',target=bld.Tair_C,heatRequest=0,coolRequest=0;
    if(heatNeeded){mode='heating';target=(opb.occupied&&d.preheatOnCheap&&price<=cheap)?opb.operation.occupiedComfortMax_C:opb.comfortMin_C;heatRequest=Math.max(0,hvacPowerForTarget(bld,{Tout_C:Tout,gains_W:effectiveGains,targetAir_C:target,min_W:0,max_W:heatTermMax,deliveryToMassFraction:massFrac}));}
    else if(coolNeeded){mode='cooling';target=(opb.occupied&&d.precoolOnCheap&&price<=cheap)?opb.operation.occupiedComfortMin_C:opb.comfortMax_C;coolRequest=Math.max(0,-hvacPowerForTarget(bld,{Tout_C:Tout,gains_W:effectiveGains,targetAir_C:target,min_W:-coolTermMax,max_W:0,deliveryToMassFraction:coolMassFrac}));}

    let remaining=heatRequest,direct=0,groundDirectHeat=0,groundHeatPumpElectric=0,tankOut=0,hpZone=0,boiler=0,hpCharge=0,wasteCharge=0;
    const directTemperatureOK=wT>=d.busSupply_C+d.wasteHXApproach_K;
    if(remaining>0&&directTemperatureOK){direct=Math.min(remaining,wAvail,d.wasteDirectMax_W);remaining-=direct;}
    if(remaining>0&&d.groundCoupling.enabled){const gh=groundDirectHeatingHour(ground,d.groundCoupling,{request_W:remaining,supply_C:d.busSupply_C});groundDirectHeat=gh.delivered_W;groundHeatPumpElectric+=gh.electric_W;remaining-=groundDirectHeat;}
    let wasteSurplus=Math.max(0,wAvail-direct);
    if(remaining>0&&d.dischargeOnExpensive&&price>=expensive){tankOut=tankDischarge(tank,remaining,d.busSupply_C,HOUR_S);remaining-=tankOut;}
    const hpUsesGround=d.groundCoupling.enabled&&d.groundCoupling.useAsHeatPumpSource,hpUsesProfile=d.heatPumpSource.enabled,hpSource_C=hpUsesGround?ground.T_C:(hpUsesProfile?p[d.heatPumpSource.temperatureProfileRef][h]:Tout),hpTypeCalc=hpUsesGround?(d.groundCoupling.hpTypeOverride??d.hpType):(hpUsesProfile?d.heatPumpSource.hpTypeOverride:d.hpType),hpCop=heatPumpCOP(hpSource_C,d.hpSink_C,hpTypeCalc,d.hpOptions);
    let hpAvail=d.hpCapacity_W*heatPumpCapacityFactor(hpSource_C,hpTypeCalc,d.hpOptions);if(hpUsesGround&&hpCop>1){const srcCap=groundExchangeCapacityW(ground,d.groundCoupling,'extract',HOUR_S),sourceFrac=Math.max(1e-9,1-1/hpCop);hpAvail=Math.min(hpAvail,srcCap/sourceFrac);}if(hpUsesProfile&&hpCop>1){const sourceFrac=Math.max(1e-9,1-1/hpCop),flowLimit=d.heatPumpSource.sourceMdot_kg_s>0?d.heatPumpSource.sourceMdot_kg_s*d.heatPumpSource.sourceCp_J_kgK*Math.max(0,hpSource_C-d.heatPumpSource.minOutlet_C):Infinity,sourceLimit=d.heatPumpSource.maxExtraction_W>0?Math.min(flowLimit,d.heatPumpSource.maxExtraction_W):flowLimit;hpAvail=Math.min(hpAvail,sourceLimit/sourceFrac);}
    let hpCyclingStep=null,hpCyclingForcedToTank=0,hpCyclingForcedRejected=0,hpCyclingStartupW=0;
    if(d.plantCycling.enabled){const capacityScale=d.hpCapacity_W>0?hpAvail/d.hpCapacity_W:0;hpCyclingStep=advancePlantCyclingState(plantCyclingState,remaining,{capacityScale,dt_s:HOUR_S});hpZone=Math.min(remaining,hpCyclingStep.usefulServed_W);remaining-=hpZone;hpCyclingStartupW=hpCyclingStep.startupElectricity_J/HOUR_S;if(hpCyclingStep.forcedExcess_W>0&&d.plantCycling.forcedExcessToTank&&!primaryStorageGraphOwned)hpCyclingForcedToTank=tankCharge(tank,hpCyclingStep.forcedExcess_W,d.hpSink_C,HOUR_S);hpCyclingForcedRejected=Math.max(0,hpCyclingStep.forcedExcess_W-hpCyclingForcedToTank);plantCyclingState.forcedExcessToTank_J+=hpCyclingForcedToTank*HOUR_S;plantCyclingState.forcedExcessRejected_J+=hpCyclingForcedRejected*HOUR_S;if(!d.plantCycling.allowForcedExcessRejection&&hpCyclingForcedRejected>0)plantCyclingState.rejectionViolation_J+=hpCyclingForcedRejected*HOUR_S;}
    else{hpZone=Math.min(remaining,hpAvail);remaining-=hpZone;}
    if(remaining>0){const extra=tankDischarge(tank,remaining,d.busSupply_C,HOUR_S);tankOut+=extra;remaining-=extra;}
    boiler=Math.min(remaining,d.boilerCapacity_W);remaining-=boiler;
    const unservedHeat=Math.max(0,remaining),deliveredHeat=Math.max(0,heatRequest-unservedHeat);

    let deliveredCool=0,unservedCool=0,coolCop=0,recovery={COP:0,electric_W:0,rejected_W:0,recoverable_W:0,reject_C:Tout+(d.coolingOptions.rejectApproach_K??10)},recoveryToSink=0,recoveryToTank=0,dynamicRecoveryToSink=0,dynamicRecoveryToTank=0,dynamicRecoveryAmbient=0,dynamicRecoveryDispatch=null,storageSourceDispatch=null,storageSourceCharge=0,storageServiceDispatch=null,storageServiceToSink=0,hotBackup=0,condensateRate=0,latentCooling_W=0,dedicatedLatentElectric_W=0,dedicatedLatentRejected_W=0,coldStorageChargeDispatch=null,coldStorageCharge_W=0,coldStorageChargeElectric_W=0,airsideHydronicConverterDispatch=null,coldStorageServiceDispatch=null,coldStorageService_W=0,coldMechanicalDispatch=null,coldMechanicalBackup_W=0,coldSinkUnserved_W=0;
    const latentTerminal=d.latentTerminal.enabled?d.latentTerminal:d.coolingTerminal,dedicatedLatent=d.latentTerminal.enabled;
    if(humidity.spec.enabled){const psychMax=dehumidificationCapacityKgS(latentTerminal,bld.Tair_C,humDemand.xNoHVAC,humidity.spec.pressure_Pa),qPerKg=condensateSpecificCooling_J_kg(bld.Tair_C,latentTerminal.coilADP_C??8),latentPowerCap=dedicatedLatent?d.latentTerminal.coolingCapacity_W:d.coolingCapacity_W,byPower=latentPowerCap/Math.max(qPerKg,1e-9);condensateRate=Math.min(humDemand.requiredCondensate_kg_s,psychMax,byPower);latentCooling_W=condensateRate*qPerKg;if(dedicatedLatent&&latentCooling_W>0){const lc=coolingCOP(d.latentTerminal.chilledSupply_C,Tout,d.latentTerminal.coolingOptions);dedicatedLatentElectric_W=latentCooling_W/Math.max(lc,1e-6);dedicatedLatentRejected_W=latentCooling_W+dedicatedLatentElectric_W;}}
    const sensibleMechanicalCapacity=Math.max(0,d.coolingCapacity_W-(dedicatedLatent?0:latentCooling_W));
    const directColdRows=phaseTopologyOwnership.coldSourceDeliveries??[],directColdSourceIds=new Set(directColdRows.map(x=>x.sourceComponentId)),hasColdStorageCharging=(phaseTopologyOwnership.storageCharging??[]).some(x=>x.serviceMode==='cooling'&&!directColdSourceIds.has(x.sourceComponentId)),graphColdTopologyExists=directColdRows.length>0||(phaseTopologyOwnership.storageServices??[]).some(x=>x.serviceMode==='cooling')||(phaseTopologyOwnership.storageCharging??[]).some(x=>x.serviceMode==='cooling'),baseColdSources={};
    for(const [sid,src] of Object.entries(coldStorageBinding.coldSourceProfiles??{}))if(src.availableMode!=='freeCoolingResidual'&&!directColdSourceIds.has(sid))baseColdSources[sid]=src;
    const phaseColdChargeOwnership=directColdSourceIds.size?{...phaseTopologyOwnership,storageCharging:(phaseTopologyOwnership.storageCharging??[]).filter(x=>!directColdSourceIds.has(x.sourceComponentId))}:phaseTopologyOwnership;
    let baseColdChargeDispatch=null;if(hasColdStorageCharging&&Object.keys(baseColdSources).length)baseColdChargeDispatch=dispatchColdStorageChargingHour(phaseColdChargeOwnership,coldStorageStates,baseColdSources,{hour:h,alreadyChargedByStorage_W:hydronicFirstDispatch?.byStorage_W??{}});
    const buildingColdSinkId=coldStorageBinding.buildingCoolingSink?.componentId??null,directColdDemand={...namedColdDemand},directColdMaxSupply={...namedColdMaxSupply};if(buildingColdSinkId){directColdDemand[buildingColdSinkId]=Math.max(0,coolRequest);directColdMaxSupply[buildingColdSinkId]=coldStorageBinding.buildingCoolingSink.maxSupplyTemperature_C[h];}
    const fcProbe=freeCoolingHour(d.freeCooling,{coolRequest_W:Number.MAX_SAFE_INTEGER,roomT_C:bld.Tair_C,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,outdoorWetBulb_C:p.outdoorWetBulb_C?.[h]??null,sourceWater_C:p.sourceWater_C?.[h]??null,chilledSupply_C:d.coolingSupply_C,chilledReturn_C:d.coolingReturn_C,pressure_Pa:humidity.spec.pressure_Pa});
    const mechanicalPlantAvailable_W=new Map();for(const plant of(d.mechanicalCoolingPlants??[])){const st=mechanicalPlantStates.get(plant.id);mechanicalPlantAvailable_W.set(plant.id,st?mechanicalPlantAvailableCapacityW(st,h,plant):plant.capacity_W);}const directColdProfiles=endogenousDirectColdSourceProfilesHour(coldStorageBinding.coldSourceProfiles,d,ground,fcProbe,{mechanicalAvailable_W:sensibleMechanicalCapacity,mechanicalPlantAvailable_W}),preDirectChargedByStorage_W={};for(const [id,q] of Object.entries(hydronicFirstDispatch?.byStorage_W??{}))preDirectChargedByStorage_W[id]=(preDirectChargedByStorage_W[id]??0)+q;for(const [id,q] of Object.entries(baseColdChargeDispatch?.byStorage_W??{}))preDirectChargedByStorage_W[id]=(preDirectChargedByStorage_W[id]??0)+q;const directColdDispatch=directColdRows.length?dispatchGraphDirectColdSourcesHour(phaseTopologyOwnership,coldStorageStates,directColdProfiles,{hour:h,coldSinkRemaining_W:directColdDemand,coldSinkMaxSupply_C:directColdMaxSupply,mechanicalPlantDispatch:coldStorageBinding.mechanicalPlantDispatch,mechanicalPlantStates,mechanicalPlants:d.mechanicalCoolingPlants,mechanicalForcedExcessStoragePolicies:coldStorageBinding.mechanicalForcedExcessStoragePolicies,alreadyChargedByStorage_W:preDirectChargedByStorage_W}):{available_W:0,accepted_W:0,toColdSink_W:0,toStorage_W:0,unused_W:0,electric_W:0,bySource_W:{},bySink_W:{},byStorage_W:{},coldSinkRemainingByComponent_W:directColdDemand,details:[]};
    const graphFreeCoolingModes=new Set(),graphGroundSources=new Set(),graphMechanicalSources=new Set();for(const sid of directColdSourceIds){const src=coldStorageBinding.coldSourceProfiles?.[sid];if(src?.availableMode==='freeCoolingDirect')graphFreeCoolingModes.add(src.freeCoolingMode);if(src?.availableMode==='groundDirectCooling')graphGroundSources.add(sid);if(src?.availableMode==='mechanicalCoolingDirect')graphMechanicalSources.add(sid);}
    let graphGroundDirect_W=0,graphFreeCoolingDirect_W=0,graphFreeCoolingDirectElectric_W=0,graphMechanicalDirect_W=0;for(const [sid,q] of Object.entries(directColdDispatch.bySource_W??{})){const src=coldStorageBinding.coldSourceProfiles?.[sid];if(src?.availableMode==='groundDirectCooling')graphGroundDirect_W+=q;if(src?.availableMode==='freeCoolingDirect'){graphFreeCoolingDirect_W+=q;graphFreeCoolingDirectElectric_W+=q*Math.max(0,+src.electricity_W_perCooling_W||0);}if(src?.availableMode==='mechanicalCoolingDirect')graphMechanicalDirect_W+=q;}
    if(graphGroundDirect_W>0)groundExchange(ground,d.groundCoupling,graphGroundDirect_W,HOUR_S);
    const graphBuildingDirect_W=buildingColdSinkId?(directColdDispatch.bySink_W?.[buildingColdSinkId]??0):0,buildingAfterGraph_W=buildingColdSinkId?(directColdDispatch.coldSinkRemainingByComponent_W?.[buildingColdSinkId]??coolRequest):coolRequest;
    const gc=(d.groundCoupling.enabled&&graphGroundSources.size===0)?groundDirectCoolingHour(ground,d.groundCoupling,{request_W:buildingAfterGraph_W,chilledSupply_C:d.coolingSupply_C}):{delivered_W:0,electric_W:0};
    const legacyFreeCooling={...d.freeCooling,ambientLoop:{...d.freeCooling.ambientLoop,enabled:d.freeCooling.ambientLoop.enabled&&!graphFreeCoolingModes.has('ambientLoop')},sourceWater:{...d.freeCooling.sourceWater,enabled:d.freeCooling.sourceWater.enabled&&!graphFreeCoolingModes.has('sourceWater')}};
    const fc=freeCoolingHour(legacyFreeCooling,{coolRequest_W:Math.max(0,buildingAfterGraph_W-gc.delivered_W),roomT_C:bld.Tair_C,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,outdoorWetBulb_C:p.outdoorWetBulb_C?.[h]??null,sourceWater_C:p.sourceWater_C?.[h]??null,chilledSupply_C:d.coolingSupply_C,chilledReturn_C:d.coolingReturn_C,pressure_Pa:humidity.spec.pressure_Pa});
    const serviceColdDemand={...namedColdDemand},serviceColdMaxSupply={...namedColdMaxSupply};for(const sid of Object.keys(serviceColdDemand))serviceColdDemand[sid]=directColdDispatch.coldSinkRemainingByComponent_W?.[sid]??serviceColdDemand[sid];
    if(buildingColdSinkId){serviceColdDemand[buildingColdSinkId]=Math.max(0,fc.remaining_W);serviceColdMaxSupply[buildingColdSinkId]=coldStorageBinding.buildingCoolingSink.maxSupplyTemperature_C[h];}
    coldStorageServiceDispatch=dispatchColdStorageServicesHour(phaseTopologyOwnership,coldStorageStates,{coldSinkRemaining_W:serviceColdDemand,coldSinkMaxSupply_C:serviceColdMaxSupply});coldStorageService_W=coldStorageServiceDispatch.toColdSink_W;
    const buildingColdStorageService_W=buildingColdSinkId?(coldStorageServiceDispatch.bySink_W?.[buildingColdSinkId]??0):0,zoneAfterStorage_W=Math.max(0,fc.remaining_W-buildingColdStorageService_W);
    const freeCoolingResidualProfiles=freeCoolingResidualColdSourceProfilesHour(coldStorageBinding.coldSourceProfiles,fc);let residualFreeCoolingChargeDispatch=null,residualAlready={};for(const [id,q] of Object.entries(hydronicFirstDispatch?.byStorage_W??{}))residualAlready[id]=(residualAlready[id]??0)+q;for(const [id,q] of Object.entries(baseColdChargeDispatch?.byStorage_W??{}))residualAlready[id]=(residualAlready[id]??0)+q;for(const [id,q] of Object.entries(directColdDispatch.byStorage_W??{}))residualAlready[id]=(residualAlready[id]??0)+q;
    if(hasColdStorageCharging&&Object.keys(freeCoolingResidualProfiles).length)residualFreeCoolingChargeDispatch=dispatchColdStorageChargingHour(phaseColdChargeOwnership,coldStorageStates,freeCoolingResidualProfiles,{hour:h,alreadyChargedByStorage_W:residualAlready});
    const converterProfiles=airsideHydronicConverterColdSourceProfilesHour(coldStorageBinding.coldSourceProfiles,fc,{hour:h,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,pressure_Pa:humidity.spec.pressure_Pa,design:d}),exhaustConverterProfiles=exhaustAirHydronicConverterColdSourceProfilesHour(coldStorageBinding.coldSourceProfiles,processExhaust,{hour:h,roomT_C:bld.Tair_C,zoneHumidityRatio_kg_kgDA:humidity.x_kg_kgDA,outdoorT_C:Tout,outdoorRH:p.outdoorRH?.[h]??.5,pressure_Pa:humidity.spec.pressure_Pa}),allAirHydronicConverterProfiles={...converterProfiles,...exhaustConverterProfiles,...(hydronicFirstPlan?.sourceProfiles??{})},lateAirHydronicConverterProfiles={...converterProfiles,...exhaustConverterProfiles},converterAlready={};for(const sid of hydronicFirstPlan?.sourceIds??[])delete lateAirHydronicConverterProfiles[sid];for(const part of [hydronicFirstDispatch,baseColdChargeDispatch,residualFreeCoolingChargeDispatch])for(const [id,q] of Object.entries(part?.byStorage_W??{}))converterAlready[id]=(converterAlready[id]??0)+q;for(const [id,q] of Object.entries(directColdDispatch.byStorage_W??{}))converterAlready[id]=(converterAlready[id]??0)+q;const lateAirHydronicConverterDispatch=Object.keys(lateAirHydronicConverterProfiles).length?dispatchAirsideHydronicConvertersToColdStorageHour(phaseTopologyOwnership,coldStorageStates,lateAirHydronicConverterProfiles,{hour:h,alreadyChargedByStorage_W:converterAlready}):null;if(hydronicFirstDispatch||lateAirHydronicConverterDispatch){const m=mergeColdStorageChargeDispatch(hydronicFirstDispatch,lateAirHydronicConverterDispatch);airsideHydronicConverterDispatch={...m,electric_W:(hydronicFirstDispatch?.electric_W??0)+(lateAirHydronicConverterDispatch?.electric_W??0)};}
    coldStorageChargeDispatch=mergeColdStorageChargeDispatch(baseColdChargeDispatch,residualFreeCoolingChargeDispatch,airsideHydronicConverterDispatch);coldStorageCharge_W=(coldStorageChargeDispatch.charged_W??0)+directColdDispatch.toStorage_W;coldStorageChargeElectric_W=coldSourceChargingElectricityW(baseColdChargeDispatch,baseColdSources)+coldSourceChargingElectricityW(residualFreeCoolingChargeDispatch,freeCoolingResidualProfiles)+(airsideHydronicConverterDispatch?.electric_W??0)+directColdDispatch.electric_W;
    const airHydronicAcceptedByMode=(mode)=>Object.entries(airsideHydronicConverterDispatch?.bySource_W??{}).reduce((a,[sid,q])=>a+(allAirHydronicConverterProfiles?.[sid]?.availableMode===mode?Math.max(0,+q||0):0),0),airHydronicElectricByMode=(mode)=>Object.entries(airsideHydronicConverterDispatch?.bySource_W??{}).reduce((a,[sid,q])=>{const src=allAirHydronicConverterProfiles?.[sid];return a+(src?.availableMode===mode?Math.max(0,+q||0)*Math.max(0,+src.electricity_W_perCooling_W||0):0);},0),airsideConverterCharge_W=airHydronicAcceptedByMode('airsideToHydronicConverter'),airsideConverterElectric_W=airHydronicElectricByMode('airsideToHydronicConverter'),exhaustRecoveryStorageCharge_W=airHydronicAcceptedByMode('exhaustAirToHydronicConverter'),exhaustRecoveryStorageChargeElectric_W=airHydronicElectricByMode('exhaustAirToHydronicConverter'),freeCoolingStorageChargeElectric_W=coldSourceChargingElectricityW(residualFreeCoolingChargeDispatch,freeCoolingResidualProfiles)+airsideConverterElectric_W,graphDirectColdElectric_W=directColdDispatch.electric_W+(airsideHydronicConverterDispatch?.electric_W??0);
    const namedColdRemaining={};for(const sid of Object.keys(namedColdDemand))namedColdRemaining[sid]=coldStorageServiceDispatch.coldSinkRemainingByComponent_W?.[sid]??directColdDispatch.coldSinkRemainingByComponent_W?.[sid]??namedColdDemand[sid]??0;
    const remainingMechanicalCapacity=Math.max(0,sensibleMechanicalCapacity-graphMechanicalDirect_W),buildingGraphOwned=!!buildingColdSinkId,mechanicalSensible=buildingGraphOwned?0:Math.min(zoneAfterStorage_W,remainingMechanicalCapacity),capacityAfterZone=Math.max(0,remainingMechanicalCapacity-mechanicalSensible);
    if(!graphColdTopologyExists){coldMechanicalDispatch=dispatchMechanicalColdSinksHour(namedColdRemaining,namedColdMaxSupply,{plantSupply_C:d.coolingSupply_C,availableCapacity_W:capacityAfterZone});coldMechanicalBackup_W=coldMechanicalDispatch.served_W;coldSinkUnserved_W=Object.values(coldMechanicalDispatch.coldSinkRemainingByComponent_W).reduce((a,b)=>a+(+b||0),0);}else{coldMechanicalDispatch={served_W:0,remainingCapacity_W:capacityAfterZone,coldSinkRemainingByComponent_W:namedColdRemaining,bySink_W:{},temperatureBlocked_W:{},details:[]};coldMechanicalBackup_W=0;coldSinkUnserved_W=Object.values(namedColdRemaining).reduce((a,b)=>a+(+b||0),0);}
    deliveredCool=graphBuildingDirect_W+gc.delivered_W+fc.delivered_W+buildingColdStorageService_W+mechanicalSensible;unservedCool=Math.max(0,coolRequest-deliveredCool)+coldSinkUnserved_W;
    const refrigerationCooling_W=graphMechanicalDirect_W+mechanicalSensible+coldMechanicalBackup_W+(dedicatedLatent?0:latentCooling_W);
    const explicitMechanicalPlantsActive=(d.mechanicalCoolingPlants?.length??0)>0,mechanicalPlantSteps=new Map();if(explicitMechanicalPlantsActive){const targetByPlant=new Map();for(const [sid,q0] of Object.entries(directColdDispatch.bySource_W??{})){const src=coldStorageBinding.coldSourceProfiles?.[sid];if(src?.availableMode!=='mechanicalCoolingDirect')continue;targetByPlant.set(src.mechanicalPlantId,(targetByPlant.get(src.mechanicalPlantId)??0)+Math.max(0,+q0||0));}for(const plant of d.mechanicalCoolingPlants){const st=mechanicalPlantStates.get(plant.id),target=targetByPlant.get(plant.id)??0;if(st)mechanicalPlantSteps.set(plant.id,advanceMechanicalCoolingPlantState(st,plant,target,h,{dt_s:HOUR_S}));}}const alreadyChargedByStorage_W={};for(const [id,q] of Object.entries(baseColdChargeDispatch?.byStorage_W??{}))alreadyChargedByStorage_W[id]=(alreadyChargedByStorage_W[id]??0)+q;for(const [id,q] of Object.entries(residualFreeCoolingChargeDispatch?.byStorage_W??{}))alreadyChargedByStorage_W[id]=(alreadyChargedByStorage_W[id]??0)+q;for(const [id,q] of Object.entries(airsideHydronicConverterDispatch?.byStorage_W??{}))alreadyChargedByStorage_W[id]=(alreadyChargedByStorage_W[id]??0)+q;for(const [id,q] of Object.entries(directColdDispatch.byStorage_W??{}))alreadyChargedByStorage_W[id]=(alreadyChargedByStorage_W[id]??0)+q;const mechanicalForcedExcessDispatch=explicitMechanicalPlantsActive?dispatchMechanicalForcedExcessToColdStorageHour(d,phaseTopologyOwnership,coldStorageStates,coldStorageBinding.coldSourceProfiles,mechanicalPlantSteps,mechanicalPlantStates,coldStorageBinding.mechanicalForcedExcessStoragePolicies,{alreadyChargedByStorage_W,sharedStorageReservations:coldStorageBinding.mechanicalPlantDispatch?.sharedStorageReservations??null,hour:h}):{forcedExcess_W:0,toStorage_W:0,rejected_W:0,byPlant:{},byStorage_W:{},details:[]};coldStorageCharge_W+=mechanicalForcedExcessDispatch.toStorage_W;const explicitGraphMechanical=explicitMechanicalPlantsActive?evaluateExplicitMechanicalPlantsHour(d,directColdDispatch,coldStorageBinding.coldSourceProfiles,{outdoor_C:Tout,groundTemperature_C:ground.T_C,plantSteps:mechanicalPlantSteps}):null;
    const aggregateRefrigerationCooling_W=explicitMechanicalPlantsActive?Math.max(0,refrigerationCooling_W-graphMechanicalDirect_W):refrigerationCooling_W;
    if(aggregateRefrigerationCooling_W>0){const groundReject=d.groundCoupling.enabled&&d.groundCoupling.mechanicalCoolingRejectionToGround,rejectAmbient=groundReject?ground.T_C:Tout,rejectOptions=groundReject?{...d.coolingOptions,rejectApproach_K:d.groundCoupling.approach_K}:d.coolingOptions;if(heatRecoveryBinding.legacyAllowed)recovery=condenserRecoveryState({cooling_W:aggregateRefrigerationCooling_W,chilledSupply_C:d.coolingSupply_C,outdoor_C:rejectAmbient,hotSinkTarget_C:hotTarget,recoveryApproach_K:d.heatRecovery.approach_K,maxRecovery_W:d.heatRecovery.maxRecovery_W,coolingOptions:rejectOptions});else{coolCop=coolingCOP(d.coolingSupply_C,rejectAmbient,rejectOptions);const ec=aggregateRefrigerationCooling_W/Math.max(coolCop,1e-6);recovery={COP:coolCop,electric_W:ec,rejected_W:aggregateRefrigerationCooling_W+ec,recoverable_W:0,reject_C:rejectAmbient+(rejectOptions.rejectApproach_K??10)};}coolCop=recovery.COP;}
    const graphMechanicalFraction=(!explicitMechanicalPlantsActive&&refrigerationCooling_W>0)?Math.min(1,graphMechanicalDirect_W/refrigerationCooling_W):0,graphMechanicalElectric_W=explicitMechanicalPlantsActive?(explicitGraphMechanical?.electric_W??0):recovery.electric_W*graphMechanicalFraction,graphMechanicalRejected_W=explicitMechanicalPlantsActive?(explicitGraphMechanical?.rejected_W??0):recovery.rejected_W*graphMechanicalFraction;if(explicitMechanicalPlantsActive&&graphMechanicalDirect_W>0)coolCop=explicitGraphMechanical?.COP??coolCop;
    const humState=applyHumidityRemoval(humidity,humDemand,{removed_kg_s:condensateRate,roomT_C:bld.Tair_C,targetDewPoint_C:humidityTarget_C,occupied:opb.occupied,dt_s:HOUR_S,condensateT_C:latentTerminal.coilADP_C??8});
    const contaminantHour=advanceProcessContaminantState(contaminantState,processExhaust,{roomT_C:bld.Tair_C,zoneHumidityRatio_kg_kgDA:humidity.x_kg_kgDA,pressure_Pa:humidity.spec.pressure_Pa,dt_s:HOUR_S});
    if(humidity.spec.enabled&&humidityMinRH!=null){const pvNow=vapourPressureFromHumidityRatio(humidity.x_kg_kgDA,humidity.spec.pressure_Pa),rhNow=clamp(pvNow/saturationPressurePa(bld.Tair_C),0,1),below=Math.max(0,humidityMinRH-rhNow)*100;rhDegreeHoursBelow+=below;if(opb.occupied)occupiedRHDegreeHoursBelow+=below;}
    if(mode==='idle'&&latentCooling_W>0)mode='dehumidification';
    const hasGraphRecoveryRouting=(phaseTopologyOwnership.refrigeration??[]).some(x=>x.dynamicHeatRecovery?.routing);
    if(heatRecoveryBinding.legacyAllowed&&recovery.recoverable_W>0){recoveryToSink=Math.min(legacyHotDemand,recovery.recoverable_W);let recLeft=recovery.recoverable_W-recoveryToSink;if(recLeft>0&&d.heatRecovery.allowTankCharge&&recovery.reject_C>=d.tank.Thot_C+d.heatRecovery.approach_K)recoveryToTank=tankCharge(tank,recLeft,recovery.reject_C-d.heatRecovery.approach_K,HOUR_S);}
    if(hasGraphRecoveryRouting){dynamicRecoveryDispatch=dispatchDynamicPhaseHeatRecoveryHour(phaseTopologyOwnership,storageStates,{hour:h,hotSinkDemands_W:namedHotDemand,hotSinkTargets_C:namedHotTarget,hotDemand_W:0,hotTarget_C:legacyHotTarget});dynamicRecoveryToSink=dynamicRecoveryDispatch.toHotSink_W;dynamicRecoveryToTank=dynamicRecoveryDispatch.toStorage_W;dynamicRecoveryAmbient=dynamicRecoveryDispatch.ambient_W;}
    if((phaseTopologyOwnership.storageCharging?.length??0)>0){storageSourceDispatch=dispatchStorageChargingHour(phaseTopologyOwnership,storageStates,heatRecoveryBinding.thermalSourceProfiles,{hour:h});storageSourceCharge=storageSourceDispatch.charged_W;}
    const storageServiceInput=dynamicRecoveryDispatch?.hotSinkRemainingByComponent_W??namedHotDemand;if((phaseTopologyOwnership.storageServices?.length??0)>0){storageServiceDispatch=dispatchStorageServicesHour(phaseTopologyOwnership,storageStates,{hotSinkRemaining_W:storageServiceInput,hotSinkTargets_C:namedHotTarget});storageServiceToSink=storageServiceDispatch.toHotSink_W;}
    const namedHotRemaining=storageServiceDispatch?.hotSinkRemainingByComponent_W??storageServiceInput,namedHotBackup=Object.values(namedHotRemaining??{}).reduce((a,b)=>a+(+b||0),0);hotBackup=Math.max(0,legacyHotDemand-recoveryToSink)+namedHotBackup;

    // Waste heat can charge the heating store even when the building is not heating.
    if(wasteSurplus>0&&directTemperatureOK&&!primaryStorageGraphOwned){wasteCharge=tankCharge(tank,wasteSurplus,wT,HOUR_S);wasteSurplus-=wasteCharge;}
    // Compressor heat recovery may charge the hot store above; ordinary heat-pump charging remains disabled during active cooling.
    if(refrigerationCooling_W<=0&&price<=cheap&&!primaryStorageGraphOwned){const hpSpare=d.plantCycling.enabled?(d.plantCycling.discretionaryChargeWithinActiveStage?Math.max(0,(hpCyclingStep?.activeMaxOutput_W??0)-(hpCyclingStep?.output_W??0)):0):Math.max(0,hpAvail-hpZone),chargeRequest=Math.min(hpSpare,d.hpCapacity_W*d.hpChargeReserveFactor);hpCharge=tankCharge(tank,chargeRequest,d.hpSink_C,HOUR_S);}

    const hpHeat=(d.plantCycling.enabled?(hpCyclingStep?.output_W??0):hpZone)+hpCharge,elecHP=hpHeat/Math.max(hpCop,1e-6),groundHPSource_W=(d.groundCoupling.enabled&&d.groundCoupling.useAsHeatPumpSource)?Math.max(0,hpHeat-elecHP):0,sourceWaterHPExtraction_W=hpUsesProfile?Math.max(0,hpHeat-elecHP):0,sourceWaterHPPumpW=sourceWaterHPExtraction_W/1000*d.heatPumpSource.pump_W_per_kW,sourceWaterDeltaT_K=(hpUsesProfile&&d.heatPumpSource.sourceMdot_kg_s>0)?sourceWaterHPExtraction_W/(d.heatPumpSource.sourceMdot_kg_s*d.heatPumpSource.sourceCp_J_kgK):0,sourceWaterOutlet_C=hpUsesProfile?hpSource_C-sourceWaterDeltaT_K:null;if(groundHPSource_W>0)groundExchange(ground,d.groundCoupling,-groundHPSource_W,HOUR_S);if(hpUsesProfile){minSourceWaterOutlet_C=Math.min(minSourceWaterOutlet_C,sourceWaterOutlet_C);maxSourceWaterDeltaT_K=Math.max(maxSourceWaterDeltaT_K,sourceWaterDeltaT_K);}const boilerFuelIn=boiler/Math.max(d.boilerEfficiency,1e-6),hotBackupInput=hotBackup/Math.max(d.hotSinkBackupEfficiency,1e-6),hotBackupElectricW=d.hotSinkBackupCarrier==='electricity'?hotBackupInput:0,phaseGasW=phaseTopologyOwnership.enabled?(phaseTopologyOwnership.hourly.gas_W[h]??0):0,phaseDeliveredFuelW=phaseTopologyOwnership.enabled?(phaseTopologyOwnership.hourly.deliveredFuel_W[h]??0):0,gasIn=(d.boilerFuelCarrier==='gas'?boilerFuelIn:0)+(d.hotSinkBackupCarrier==='gas'?hotBackupInput:0)+phaseGasW,deliveredFuelIn=(d.boilerFuelCarrier==='deliveredFuel'?boilerFuelIn:0)+(d.hotSinkBackupCarrier==='deliveredFuel'?hotBackupInput:0)+phaseDeliveredFuelW,elecCool=recovery.electric_W+(explicitMechanicalPlantsActive?graphMechanicalElectric_W:0)+dedicatedLatentElectric_W+coldStorageChargeElectric_W;
    let groundMechanicalReject_W=0;if(d.groundCoupling.enabled&&d.groundCoupling.mechanicalCoolingRejectionToGround&&(recovery.rejected_W+(explicitMechanicalPlantsActive?graphMechanicalRejected_W:0))>0){const qReject=Math.max(0,recovery.rejected_W+(explicitMechanicalPlantsActive?graphMechanicalRejected_W:0)-recoveryToSink-recoveryToTank),accepted=groundExchange(ground,d.groundCoupling,qReject,HOUR_S);groundMechanicalReject_W=accepted;if(!d.groundCoupling.allowAmbientRejectionBackup&&accepted+1e-6<qReject)unservedCool+=Math.min(deliveredCool,(qReject-accepted));}
    const heatSplit=heatingDeliverySplit(d.heatingTerminal,deliveredHeat,vent,bld.Tair_C,opb.operation);
    let flow={mdot_kg_s:0,Vdot_m3_s:0},hyd={velocity_m_s:0,dp_Pa:0},pumpW=0;
    if(heatSplit.hydronic_W>0&&d.heatingFluidProperties.available){const fp=d.heatingFluidProperties;flow=hydronicFlowFromHeat(heatSplit.hydronic_W,d.busSupply_C-d.busReturn_C,{rho_kg_m3:fp.rho_kg_m3,cp_J_kgK:fp.cp_J_kgK});hyd=pipeHydraulics({Vdot_m3_s:flow.Vdot_m3_s,D_m:d.pipe.D_m,L_m:d.pipe.L_m,roughness_m:d.pipe.roughness_m,K:d.pipe.K,rho_kg_m3:fp.rho_kg_m3,nu_m2_s:fp.mu_Pa_s/fp.rho_kg_m3});pumpW=hyd.dp_Pa*flow.Vdot_m3_s/Math.max(d.pipe.pumpEfficiency,1e-6);}
    else if(refrigerationCooling_W>0&&d.coolingFluidProperties.available){const fp=d.coolingFluidProperties;flow=hydronicFlowFromHeat(refrigerationCooling_W,d.coolingReturn_C-d.coolingSupply_C,{rho_kg_m3:fp.rho_kg_m3,cp_J_kgK:fp.cp_J_kgK});hyd=pipeHydraulics({Vdot_m3_s:flow.Vdot_m3_s,D_m:d.coolingPipe.D_m,L_m:d.coolingPipe.L_m,roughness_m:d.coolingPipe.roughness_m,K:d.coolingPipe.K,rho_kg_m3:fp.rho_kg_m3,nu_m2_s:fp.mu_Pa_s/fp.rho_kg_m3});pumpW=hyd.dp_Pa*flow.Vdot_m3_s/Math.max(d.coolingPipe.pumpEfficiency,1e-6);}
    const airPerf=airsidePerformance(d.airside,vent),fanW=airPerf.fan_W;
    const latentFanW=(d.latentTerminal.enabled&&latentCooling_W>0)?d.latentTerminal.fanPower_W:0,groundPumpW=groundHeatPumpElectric+gc.electric_W+(groundHPSource_W+groundMechanicalReject_W)/1000*d.groundCoupling.pump_W_per_kW,elecGross=elecHP+elecCool+hotBackupElectricW+pumpW+fanW+latentFanW+fc.electric_W+groundPumpW+sourceWaterHPPumpW+humidPerf.electricity_J/HOUR_S+hpCyclingStartupW+(phaseTopologyOwnership.enabled?(phaseTopologyOwnership.hourly.electricity_W[h]??0):(dynamicPhase.hourly?.compressor_W?.[h]??0)),pvGeneration=d.pv.enabled?pvPowerFromIrradiance({capacity_kWp:d.pv.capacity_kWp,poaIrradiance_W_m2:p.poaIrradiance_W_m2?.[h]??0,cellTemp_C:p.pvCellTemp_C?.[h]??25,tempCoeff_per_K:d.pv.tempCoeff_per_K,systemLossFraction:d.pv.systemLossFraction,inverterLimit_kW:d.pv.inverterLimit_kW}):0,pvd=dispatchPV({generation_W:pvGeneration,load_W:elecGross,exportAllowed:d.pv.exportAllowed}),elecTotal=elecGross,gridImportW=pvd.gridImport_W,deliveredSigned=deliveredHeat-deliveredCool;
    const activeFrac=deliveredSigned>=0?massFrac:coolMassFrac;building2R2CStep(bld,{Tout_C:Tout,gains_W:effectiveGains,Qair_W:deliveredSigned*(1-activeFrac),Qmass_W:deliveredSigned*activeFrac,dt_s:HOUR_S,comfortMin_C:opb.comfortMin_C,comfortMax_C:opb.comfortMax_C,occupied:opb.occupied});
    let programRH=null;if(humidity.spec.enabled){const pv=vapourPressureFromHumidityRatio(humidity.x_kg_kgDA,humidity.spec.pressure_Pa);programRH=clamp(pv/saturationPressurePa(bld.Tair_C),0,1);}const programConstraint=programRoomConstraintViolation(programIntegration,p,h,{roomT_C:bld.Tair_C,rh_frac:programRH});programTempDegreeHours+=programConstraint.tempDegreeHours;programRHDegreeHours+=programConstraint.rhDegreeHours;if(programConstraint.conflictingTemperatureBounds||programConstraint.conflictingRHBounds)programConstraintConflicts++;

    totals.zoneHeat_J+=deliveredHeat*HOUR_S;totals.zoneCool_J+=deliveredCool*HOUR_S;totals.freeCooling_J+=(fc.delivered_W+graphFreeCoolingDirect_W)*HOUR_S;totals.groundDirectHeat_J+=groundDirectHeat*HOUR_S;totals.groundDirectCooling_J+=(gc.delivered_W+graphGroundDirect_W)*HOUR_S;totals.graphDirectColdSource_J+=(directColdDispatch.accepted_W+(airsideHydronicConverterDispatch?.charged_W??0))*HOUR_S;totals.graphDirectColdToSink_J+=directColdDispatch.toColdSink_W*HOUR_S;totals.graphDirectColdToStorage_J+=(directColdDispatch.toStorage_W+(airsideHydronicConverterDispatch?.charged_W??0)+(mechanicalForcedExcessDispatch?.toStorage_W??0))*HOUR_S;totals.graphDirectColdElectricity_J+=graphDirectColdElectric_W*HOUR_S;totals.graphMechanicalCold_J+=graphMechanicalDirect_W*HOUR_S;totals.graphMechanicalElectricity_J+=graphMechanicalElectric_W*HOUR_S;totals.graphMechanicalCondenserRejection_J+=graphMechanicalRejected_W*HOUR_S;if(explicitMechanicalPlantsActive){totals.graphMechanicalGeneratedCold_J+=(explicitGraphMechanical?.cooling_W??0)*HOUR_S+(explicitGraphMechanical?.forcedExcess_W??0)*HOUR_S;totals.graphMechanicalForcedExcessToStorage_J+=(mechanicalForcedExcessDispatch?.toStorage_W??0)*HOUR_S;totals.graphMechanicalForcedExcessRejected_J+=(mechanicalForcedExcessDispatch?.rejected_W??0)*HOUR_S;totals.graphMechanicalStartupElectricity_J+=(explicitGraphMechanical?.startupElectric_W??0)*HOUR_S;}for(const sid of graphMechanicalSources){const q=Math.max(0,+directColdDispatch.bySource_W?.[sid]||0),src=coldStorageBinding.coldSourceProfiles?.[sid];totals.graphMechanicalColdBySource_J[sid]=(totals.graphMechanicalColdBySource_J[sid]??0)+q*HOUR_S;if(graphMechanicalDirect_W>0&&q>0){const f=q/graphMechanicalDirect_W,e=explicitMechanicalPlantsActive?(explicitGraphMechanical?.bySourceElectric_W?.[sid]??0):graphMechanicalElectric_W*f,r=explicitMechanicalPlantsActive?(explicitGraphMechanical?.bySourceRejected_W?.[sid]??0):graphMechanicalRejected_W*f,eo=src?.electricityOwnerId,ro=src?.rejectionOwnerId;if(eo)totals.graphMechanicalElectricityByOwner_J[eo]=(totals.graphMechanicalElectricityByOwner_J[eo]??0)+e*HOUR_S;if(ro)totals.graphMechanicalRejectionByOwner_J[ro]=(totals.graphMechanicalRejectionByOwner_J[ro]??0)+r*HOUR_S;}}if(explicitMechanicalPlantsActive){for(const [pid,z] of Object.entries(explicitGraphMechanical?.byPlant??{})){const plant=(d.mechanicalCoolingPlants??[]).find(x=>x.id===pid),sourceElec=Object.entries(explicitGraphMechanical?.bySourceElectric_W??{}).filter(([sid])=>coldStorageBinding.coldSourceProfiles?.[sid]?.mechanicalPlantId===pid).reduce((a,[,v])=>a+(+v||0),0),sourceRej=Object.entries(explicitGraphMechanical?.bySourceRejected_W??{}).filter(([sid])=>coldStorageBinding.coldSourceProfiles?.[sid]?.mechanicalPlantId===pid).reduce((a,[,v])=>a+(+v||0),0),eResidual=Math.max(0,(z.electric_W??0)-sourceElec),rResidual=Math.max(0,(z.rejected_W??0)-sourceRej);if(plant?.electricityOwnerId&&eResidual>0)totals.graphMechanicalElectricityByOwner_J[plant.electricityOwnerId]=(totals.graphMechanicalElectricityByOwner_J[plant.electricityOwnerId]??0)+eResidual*HOUR_S;if(plant?.rejectionOwnerId&&rResidual>0)totals.graphMechanicalRejectionByOwner_J[plant.rejectionOwnerId]=(totals.graphMechanicalRejectionByOwner_J[plant.rejectionOwnerId]??0)+rResidual*HOUR_S;}}totals.groundHPExtraction_J+=groundHPSource_W*HOUR_S;totals.groundMechanicalRejection_J+=groundMechanicalReject_W*HOUR_S;totals.groundPumpElectricity_J+=groundPumpW*HOUR_S;totals.processCapturedMoisture_kg+=processExhaust.capturedMoisture_kg_s*HOUR_S;totals.processUncapturedZoneMoisture_kg+=processExhaust.uncapturedZoneMoistureSource_kg_s*HOUR_S;totals.processExhaustAirExchangeMoisture_kg+=processExhaust.airExchangeMoisture_kg_s*HOUR_S;totals.processExhaustSensibleZone_J+=processExhaust.sensibleZoneGain_W*HOUR_S;for(const [cid,cv] of Object.entries(processExhaust.contaminants??{})){totals.processContaminantGenerated_kg[cid]=(totals.processContaminantGenerated_kg[cid]??0)+cv.generation_kg_s*HOUR_S;totals.processContaminantCaptured_kg[cid]=(totals.processContaminantCaptured_kg[cid]??0)+cv.captured_kg_s*HOUR_S;}totals.programSensibleAirExchange_J+=programSensibleW*HOUR_S;totals.programDHW_J+=(p.programDHW_W?.[h]??0)*HOUR_S;totals.humidifierWater_kg+=humidPerf.makeupWater_kg;totals.humidifierElectricity_J+=humidPerf.electricity_J;totals.humidifierAdditionalHeating_J+=humidPerf.additionalHeating_J;totals.freeCoolingElectricity_J+=(fc.electric_W+freeCoolingStorageChargeElectric_W+graphFreeCoolingDirectElectric_W)*HOUR_S;totals.freeCoolingStorageCharge_J+=((residualFreeCoolingChargeDispatch?.charged_W??0)+airsideConverterCharge_W)*HOUR_S;totals.freeCoolingStorageChargeElectricity_J+=freeCoolingStorageChargeElectric_W*HOUR_S;totals.exhaustRecoveryStorageCharge_J+=exhaustRecoveryStorageCharge_W*HOUR_S;totals.exhaustRecoveryStorageChargeElectricity_J+=exhaustRecoveryStorageChargeElectric_W*HOUR_S;totals.avoidedSolarGain_J+=shade.avoidedSolarGain_W*HOUR_S;totals.directWaste_J+=direct*HOUR_S;totals.hpHeat_J+=hpHeat*HOUR_S;totals.boilerHeat_J+=boiler*HOUR_S;totals.tankToZone_J+=tankOut*HOUR_S;totals.tankChargeHeat_J+=(wasteCharge+hpCharge+hpCyclingForcedToTank+dynamicRecoveryToTank)*HOUR_S;totals.hpCyclingForcedExcess_J+=(hpCyclingStep?.forcedExcess_W??0)*HOUR_S;totals.hpCyclingForcedExcessToTank_J+=hpCyclingForcedToTank*HOUR_S;totals.hpCyclingForcedExcessRejected_J+=hpCyclingForcedRejected*HOUR_S;totals.hpCyclingRestartBlockedUnmet_J+=(hpCyclingStep?.restartBlockedUnmet_W??0)*HOUR_S;totals.hpCyclingStartupElectricity_J+=(hpCyclingStep?.startupElectricity_J??0);
    totals.coolingElectricity_J+=elecCool*HOUR_S;totals.coolingRejected_J+=(recovery.rejected_W+(explicitMechanicalPlantsActive?graphMechanicalRejected_W:0)+dedicatedLatentRejected_W)*HOUR_S;totals.latentCooling_J+=latentCooling_W*HOUR_S;totals.dedicatedLatentCooling_J+=(dedicatedLatent?latentCooling_W:0)*HOUR_S;totals.dedicatedLatentElectricity_J+=dedicatedLatentElectric_W*HOUR_S;totals.dedicatedLatentFanElectricity_J+=latentFanW*HOUR_S;totals.dedicatedLatentRejected_J+=dedicatedLatentRejected_W*HOUR_S;totals.condensate_kg+=condensateRate*HOUR_S;totals.unservedMoisture_kg+=Math.max(0,humDemand.requiredCondensate_kg_s-condensateRate)*HOUR_S;totals.heatRecovered_J+=(recoveryToSink+recoveryToTank+dynamicRecoveryToSink+dynamicRecoveryToTank)*HOUR_S;totals.heatRecoveryToSink_J+=(recoveryToSink+dynamicRecoveryToSink)*HOUR_S;totals.heatRecoveryToTank_J+=(recoveryToTank+dynamicRecoveryToTank)*HOUR_S;totals.dynamicCondenserHeatToSink_J+=dynamicRecoveryToSink*HOUR_S;totals.dynamicCondenserHeatToTank_J+=dynamicRecoveryToTank*HOUR_S;totals.dynamicCondenserAmbientRejection_J+=dynamicRecoveryAmbient*HOUR_S;totals.storageSourceAvailable_J+=(storageSourceDispatch?.available_W??0)*HOUR_S;totals.storageSourceCharge_J+=storageSourceCharge*HOUR_S;totals.storageSourceUnused_J+=(storageSourceDispatch?.unused_W??0)*HOUR_S;for(const [sid,q] of Object.entries(storageSourceDispatch?.byStorage_W??{}))totals.storageSourceChargeByComponent_J[sid]=(totals.storageSourceChargeByComponent_J[sid]??0)+q*HOUR_S;for(const [sid,q] of Object.entries(storageSourceDispatch?.bySource_W??{}))totals.storageSourceChargeBySource_J[sid]=(totals.storageSourceChargeBySource_J[sid]??0)+q*HOUR_S;totals.hotSinkDemand_J+=hotDemand*HOUR_S;totals.hotSinkBackup_J+=hotBackup*HOUR_S;totals.storageServiceToSink_J+=storageServiceToSink*HOUR_S;for(const [sid,q] of Object.entries(storageServiceDispatch?.byStorage_W??{}))totals.storageServiceByComponent_J[sid]=(totals.storageServiceByComponent_J[sid]??0)+q*HOUR_S;totals.coldStorageSourceAvailable_J+=(coldStorageChargeDispatch?.available_W??0)*HOUR_S;totals.coldStorageCharge_J+=coldStorageCharge_W*HOUR_S;totals.coldStorageSourceUnused_J+=(coldStorageChargeDispatch?.unused_W??0)*HOUR_S;totals.coldStorageChargeElectricity_J+=coldStorageChargeElectric_W*HOUR_S;for(const [sid,q] of Object.entries(coldStorageChargeDispatch?.byStorage_W??{}))totals.coldStorageChargeByComponent_J[sid]=(totals.coldStorageChargeByComponent_J[sid]??0)+q*HOUR_S;for(const [sid,q] of Object.entries(coldStorageChargeDispatch?.bySource_W??{}))totals.coldStorageChargeBySource_J[sid]=(totals.coldStorageChargeBySource_J[sid]??0)+q*HOUR_S;for(const [sid,q] of Object.entries(directColdDispatch.byStorage_W??{}))totals.coldStorageChargeByComponent_J[sid]=(totals.coldStorageChargeByComponent_J[sid]??0)+q*HOUR_S;for(const [sid,q] of Object.entries(mechanicalForcedExcessDispatch?.byStorage_W??{}))totals.coldStorageChargeByComponent_J[sid]=(totals.coldStorageChargeByComponent_J[sid]??0)+q*HOUR_S;for(const [sid,q] of Object.entries(directColdDispatch.bySource_W??{}))totals.coldStorageChargeBySource_J[sid]=(totals.coldStorageChargeBySource_J[sid]??0)+q*HOUR_S;totals.coldSinkDemand_J+=Object.values(namedColdDemand).reduce((a,b)=>a+(+b||0),0)*HOUR_S;totals.coldStorageService_J+=coldStorageService_W*HOUR_S;totals.buildingColdStorageService_J+=buildingColdStorageService_W*HOUR_S;for(const [sid,q] of Object.entries(coldStorageServiceDispatch?.byStorage_W??{}))totals.coldStorageServiceByComponent_J[sid]=(totals.coldStorageServiceByComponent_J[sid]??0)+q*HOUR_S;totals.coldMechanicalBackup_J+=coldMechanicalBackup_W*HOUR_S;totals.coldSinkUnserved_J+=coldSinkUnserved_W*HOUR_S;totals.ambientRejected_J+=(Math.max(0,recovery.rejected_W+(explicitMechanicalPlantsActive?graphMechanicalRejected_W:0)-recoveryToSink-recoveryToTank-groundMechanicalReject_W)+dedicatedLatentRejected_W)*HOUR_S;totals.electricity_J+=elecTotal*HOUR_S;totals.sourceWaterHPExtraction_J+=sourceWaterHPExtraction_W*HOUR_S;totals.sourceWaterHPPumpElectricity_J+=sourceWaterHPPumpW*HOUR_S;totals.dynamicRefrigerationElectricity_J+=(phaseTopologyOwnership.enabled?(phaseTopologyOwnership.hourly.refrigerantCompressor_W[h]??0):(dynamicPhase.hourly?.compressor_W?.[h]??0))*HOUR_S;totals.phaseOwnedElectricity_J+=(phaseTopologyOwnership.enabled?(phaseTopologyOwnership.hourly.electricity_W[h]??0):0)*HOUR_S;totals.phaseOwnedGas_J+=phaseGasW*HOUR_S;totals.phaseOwnedDeliveredFuel_J+=phaseDeliveredFuelW*HOUR_S;totals.pvGeneration_J+=pvd.generation_W*HOUR_S;totals.pvDirectUse_J+=pvd.directUse_W*HOUR_S;totals.pvExport_J+=pvd.export_W*HOUR_S;totals.pvCurtailed_J+=pvd.curtailed_W*HOUR_S;totals.gridImport_J+=gridImportW*HOUR_S;totals.gas_J+=gasIn*HOUR_S;totals.deliveredFuel_J+=deliveredFuelIn*HOUR_S;totals.pumpElectricity_J+=(pumpW+sourceWaterHPPumpW)*HOUR_S;totals.fanElectricity_J+=fanW*HOUR_S;totals.wasteRejected_J+=wasteSurplus*HOUR_S;totals.unservedHeat_J+=unservedHeat*HOUR_S;totals.unservedCool_J+=unservedCool*HOUR_S;totals.unserved_J+=(unservedHeat+unservedCool)*HOUR_S;
    const groundNetThisHour_J=(gc.delivered_W+graphGroundDirect_W+groundMechanicalReject_W-groundDirectHeat-groundHPSource_W)*HOUR_S;groundMonthlyNetToGround_J[Math.min(11,Math.floor(h*12/n))]+=groundNetThisHour_J;
    costEnergyYear1+=kWh(gridImportW*HOUR_S)*price-kWh(pvd.export_W*HOUR_S)*d.pv.exportPrice_per_kWh+kWh(gasIn*HOUR_S)*gasPrice+kWh(deliveredFuelIn*HOUR_S)*deliveredFuelPrice;
    peakElecW=Math.max(peakElecW,elecTotal);peakGridImportW=Math.max(peakGridImportW,gridImportW);peakGasW=Math.max(peakGasW,gasIn);peakDeliveredFuelW=Math.max(peakDeliveredFuelW,deliveredFuelIn);peakFlow=Math.max(peakFlow,flow.Vdot_m3_s);peakVelocity=Math.max(peakVelocity,hyd.velocity_m_s);peakDp=Math.max(peakDp,hyd.dp_Pa);peakAirFlow=Math.max(peakAirFlow,vent);peakAirVelocity=Math.max(peakAirVelocity,airPerf.velocity_m_s);peakAirDp=Math.max(peakAirDp,airPerf.totalDp_Pa);peakFanW=Math.max(peakFanW,fanW);
    const soc=tankSOC(tank),snap={hour:h,mode,occupied:opb.occupied,prestart:opb.prestart,comfortMin_C:opb.comfortMin_C,comfortMax_C:opb.comfortMax_C,ventilation_m3_s:vent,airVelocity_m_s:airPerf.velocity_m_s,airDp_Pa:airPerf.totalDp_Pa,fan_W:fanW,airHeat_W:heatSplit.air_W,localCoilHeat_W:heatSplit.localCoil_W,hotSinkDemand_W:hotDemand,programDHW_W:p.programDHW_W?.[h]??0,programSensibleAirExchange_W:programSensibleW,programRoomConstraint:programConstraint,heatRecovery_W:recoveryToSink+recoveryToTank+dynamicRecoveryToSink+dynamicRecoveryToTank,heatRecoveryToSink_W:recoveryToSink+dynamicRecoveryToSink,heatRecoveryToTank_W:recoveryToTank+dynamicRecoveryToTank,dynamicHeatRecoveryToSink_W:dynamicRecoveryToSink,dynamicHeatRecoveryToTank_W:dynamicRecoveryToTank,dynamicHeatRecoveryAmbient_W:dynamicRecoveryAmbient,dynamicHeatRecoveryDispatch:dynamicRecoveryDispatch,storageSourceCharge_W:storageSourceCharge,storageSourceDispatch,storageServiceToSink_W:storageServiceToSink,storageServiceDispatch,coldSinkDemand_W:Object.values(namedColdDemand).reduce((a,b)=>a+(+b||0),0),coldStorageCharge_W,coldStorageChargeElectric_W,coldStorageChargeDispatch,airsideHydronicConverterDispatch,graphDirectColdDispatch:directColdDispatch,graphDirectCold_W:directColdDispatch.accepted_W,graphDirectColdToSink_W:directColdDispatch.toColdSink_W,graphDirectColdToStorage_W:directColdDispatch.toStorage_W,graphDirectColdElectric_W,graphMechanicalCold_W:graphMechanicalDirect_W,graphMechanicalElectric_W,graphMechanicalCondenserRejection_W:graphMechanicalRejected_W,graphMechanicalPlants:explicitGraphMechanical?.byPlant??null,graphMechanicalForcedExcessDispatch:mechanicalForcedExcessDispatch,mechanicalCoolingPlantStates:explicitMechanicalPlantsActive?mechanicalCoolingPlantStateSnapshots(mechanicalPlantStates):null,graphMechanicalSourceIds:[...graphMechanicalSources],coldStorageService_W,buildingColdStorageService_W,coldStorageServiceDispatch,freeCoolingStorageCharge_W:(residualFreeCoolingChargeDispatch?.charged_W??0)+airsideConverterCharge_W,freeCoolingStorageChargeElectric_W,exhaustRecoveryStorageCharge_W,exhaustRecoveryStorageChargeElectric_W,coldMechanicalBackup_W,coldMechanicalDispatch,coldSinkUnserved_W,coldStorageStates:coldStorageSnapshots(coldStorageStates),hotSinkBackup_W:hotBackup,condenserReject_C:recovery.reject_C,ambientReject_W:Math.max(0,recovery.rejected_W-recoveryToSink-recoveryToTank),Tout_C:Tout,dewPoint_C:humState.dewPoint_C??dew,humidityTargetDewPoint_C:humidityTarget_C,processExhaustNetMoisture_kg_h:processExhaust.netZoneMoistureRate_kg_s*3600,processCapturedMoisture_kg_h:processExhaust.capturedMoisture_kg_s*3600,processExhaustDryAir_kg_s:processExhaust.exhaustDryAir_kg_s,processExhaustSensibleZone_W:processExhaust.sensibleZoneGain_W,processContaminants_kg_kgDA:contaminantHour.concentrations_kg_kgDA,processContaminantViolations:contaminantHour.violations,condensate_kg_h:condensateRate*3600,latentCooling_W,dedicatedLatentCooling_W:dedicatedLatent?latentCooling_W:0,dedicatedLatentElectric_W,dedicatedLatentFan_W:latentFanW,refrigerationCooling_W,freeCooling_W:fc.delivered_W+graphFreeCoolingDirect_W,freeCoolingElectric_W:fc.electric_W+graphFreeCoolingDirectElectric_W,freeCoolingModes:fc.modes,groundDirectHeat_W:groundDirectHeat,groundDirectCooling_W:gc.delivered_W+graphGroundDirect_W,groundHPExtraction_W:groundHPSource_W,groundMechanicalRejection_W:groundMechanicalReject_W,groundPump_W:groundPumpW,groundTemp_C:ground.T_C,hpSource_C,sourceWaterHPExtraction_W,sourceWaterHPPump_W:sourceWaterHPPumpW,sourceWaterOutlet_C,sourceWaterDeltaT_K,humidifierRate_kg_h:humidRate*3600,humidifierElectric_W:humidPerf.electricity_J/HOUR_S,humidifierHeating_W:humidHeatW,shadingActive:shade.active,avoidedSolarGain_W:shade.avoidedSolarGain_W,pvGeneration_W:pvd.generation_W,pvDirectUse_W:pvd.directUse_W,pvExport_W:pvd.export_W,gridImport_W:gridImportW,Tair_C:bld.Tair_C,Tmass_C:bld.Tmass_C,target_C:target,heatRequest_W:heatRequest,coolRequest_W:coolRequest,deliveredHeat_W:deliveredHeat,deliveredCool_W:deliveredCool,delivered_W:deliveredSigned,directWaste_W:direct,hpZone_W:hpZone,hpCharge_W:hpCharge,hpCyclingOutput_W:hpCyclingStep?.output_W??hpZone,hpCyclingForcedExcess_W:hpCyclingStep?.forcedExcess_W??0,hpCyclingForcedToTank_W:hpCyclingForcedToTank,hpCyclingForcedRejected_W:hpCyclingForcedRejected,hpCyclingActiveModuleIds:hpCyclingStep?.activeModuleIds??[],hpCyclingStartedModuleIds:hpCyclingStep?.startedModuleIds??[],hpCyclingRestartBlockedUnmet_W:hpCyclingStep?.restartBlockedUnmet_W??0,hpCyclingStartupElectric_W:hpCyclingStartupW,boiler_W:boiler,cooling_W:refrigerationCooling_W,sensibleCooling_W:deliveredCool,tankDischarge_W:tankOut,wasteCharge_W:wasteCharge,COP:hpCop,coolingCOP:coolCop,dynamicPhaseCompressor_W:dynamicPhase.hourly?.compressor_W?.[h]??0,dynamicSteamMassFlow_kg_s:dynamicPhase.hourly?.steamMassFlow_kg_s?.[h]??0,electric_W:elecTotal,gasInput_W:gasIn,deliveredFuelInput_W:deliveredFuelIn,price_per_kWh:price,tankSOC:soc,tankTop_C:tankTopTemperatureC(tank),flow_m3_h:flow.Vdot_m3_s*3600,velocity_m_s:hyd.velocity_m_s,dp_Pa:hyd.dp_Pa,pump_W:pumpW+sourceWaterHPPumpW,unservedHeat_W:unservedHeat,unservedCool_W:unservedCool,unserved_W:unservedHeat+unservedCool};
    if(retainTrace)trace[h]=snap;
    if(heatRequest>maxHeatNeed){maxHeatNeed=heatRequest;reps.winterDesign=snap}if(coolRequest>maxCoolNeed){maxCoolNeed=coolRequest;reps.summerDesign=snap}if(elecTotal>maxElec){maxElec=elecTotal;reps.peakElectric=snap}if(wasteCharge+hpCharge+hpCyclingForcedToTank+dynamicRecoveryToTank+storageSourceCharge>maxCh){maxCh=wasteCharge+hpCharge+hpCyclingForcedToTank+dynamicRecoveryToTank+storageSourceCharge;reps.maxTankCharge=snap}if(tankOut>maxDis){maxDis=tankOut;reps.maxTankDischarge=snap}if(soc<minSoc){minSoc=soc;reps.minTankSOC=snap}if(soc>maxSoc){maxSoc=soc;reps.maxTankSOC=snap}
  }
  totals.dynamicCondenserHeatRecovered_J=totals.dynamicCondenserHeatToSink_J+totals.dynamicCondenserHeatToTank_J;if(!((phaseTopologyOwnership.refrigeration??[]).some(x=>x.dynamicHeatRecovery?.routing)))totals.dynamicCondenserAmbientRejection_J=(phaseTopologyOwnership.refrigeration??[]).reduce((a,x)=>a+(x.dynamicHeatRecovery?.ambientRejection_J??x.ambientRejection_J??0),0);totals.steamCondensingHeat_J=dynamicPhase.totals?.steamHeat_J??0;totals.steamMass_kg=dynamicPhase.totals?.steamMass_kg??0;totals.steamUtilityCost=dynamicPhase.totals?.steamUtilityCost??0;
  if(!phaseTopologyOwnership.enabled)costEnergyYear1+=totals.steamUtilityCost;
  const capex0=candidateCapex(d,project),annualOpex=costEnergyYear1+d.fixedOpex_per_year+d.latentTerminal.fixedOpex_per_year+(d.mechanicalCoolingPlants??[]).reduce((a,p)=>a+(p.fixedOpex_per_year??0),0)+d.reliability.mobileRental_per_event*d.reliability.expectedMobileEvents_per_year;
  const replacements=d.hpReplacementYear>0&&d.hpReplacementFraction>0?[{year:d.hpReplacementYear,cost:d.hpCapacity_W/1000*d.hpCapex_per_kW*d.hpReplacementFraction}]:[];if(d.pv.enabled&&d.pv.inverterReplacementYear>0){const pvc=estimatePVCost({capacity_kWp:d.pv.capacity_kWp});replacements.push({year:d.pv.inverterReplacementYear,cost:pvc.mid*(Array.isArray(pvc.inverterReplacementFraction)?(pvc.inverterReplacementFraction[0]+pvc.inverterReplacementFraction[1])/2:pvc.inverterReplacementFraction)});}if(d.humidifier.enabled&&d.humidifier.replacementYear>0){const hc=estimateHumidifierCost(d.humidifier.type,d.humidifier.design_kg_h);replacements.push({year:d.humidifier.replacementYear,cost:hc.mid*.65});}
  const econ=netPresentCost({analysisYears:project.economics.analysisYears,discountRate:project.economics.discountRate,capex0,opexAnnual:y=>annualOpex*Math.pow(1+(project.economics.energyEscalation??0),y-1),replacements,residualValue:d.residualValue});
  const comfortViolation=bld.occupiedDegreeHoursBelow+(project.constraints.enforceUpperComfort?bld.occupiedDegreeHoursAbove:0);
  const humidityViolation=humidity.spec.enabled?humidity.occupiedDewPointDegreeHoursAbove:0,lowHumidityViolation=d.humidifier.enabled?occupiedRHDegreeHoursBelow:0;
  const reliability=assessHeatPlantReliability({plant:d.heatPumpPlant,reliability:d.reliability,designLoad_W:Math.max(0,maxHeatNeed),otherFirmCapacity_W:d.boilerCapacity_W});
  const cyclingBuffer=minimumBufferForCycling({plant:d.heatPumpPlant,minimumRunTime_min:designInput.minimumRunTime_min??10,deltaT_K:Math.max(1,d.busSupply_C-d.busReturn_C)});
  const reliabilityFeasible=reliability.meetsInstalled&&reliability.meetsImmediate&&reliability.meetsRestored;
  const programConstraintViolation=programTempDegreeHours+programRHDegreeHours,programInputErrors=(programIntegration.issues??[]).filter(x=>x.severity==='error').length,programFeasible=programInputErrors===0&&(!programIntegration.enforceRoomConstraints||(programConstraintConflicts===0&&programConstraintViolation<=programIntegration.roomConstraintDegreeHourTolerance));
  const contaminantDegreeHours=Object.values(contaminantState.degreeHoursAboveLimit).reduce((a,b)=>a+(+b||0),0),contaminantFeasible=!contaminantState.spec.enabled||contaminantDegreeHours<=contaminantState.spec.degreeHourTolerance;
  const cyclingFeasible=!d.plantCycling.enabled||d.plantCycling.allowForcedExcessRejection||plantCyclingState.rejectionViolation_J<=1e-6;
  const mechanicalPlantStagingFeasible=(d.mechanicalCoolingPlants??[]).every(p=>p.staging.allowForcedExcessRejection||(mechanicalPlantStates.get(p.id)?.rejectionViolation_J??0)<=1e-6);
  const physicalFeasible=d.fluidPropertyIssues.length===0&&d.phaseInterfaceIssues.length===0&&dynamicPhaseIssues.length===0&&phaseOwnershipErrors.length===0&&cyclingFeasible&&mechanicalPlantStagingFeasible&&totals.unserved_J<=project.constraints.unservedTolerance_J&&comfortViolation<=project.constraints.comfortDegreeHourTolerance&&humidityViolation<=(project.constraints.humidityDegreeHourTolerance??1)&&lowHumidityViolation<=(project.constraints.lowHumidityDegreeHourTolerance??5)&&reliabilityFeasible&&programFeasible&&contaminantFeasible;
  const provisional={design:d,peaks:{gridImport_W:peakGridImportW,gas_W:peakGasW,deliveredFuel_W:peakDeliveredFuelW,boilerFuelInput_W:Math.max(peakGasW,peakDeliveredFuelW)}};const siteEnergy=assessSiteEnergyFeasibility(project,provisional),feasible=physicalFeasible&&siteEnergy.feasible;
  const groundLongTerm=borefieldLongTermScreen({undisturbedTemp_C:d.groundCoupling.undisturbedTemp_C,monthlyNetToGround_J:groundMonthlyNetToGround_J,longTerm:d.groundCoupling.longTerm});
  return{design:d,feasible,phaseInterfaces:d.phaseInterfaces,dynamicPhase:{...dynamicPhase,issues:dynamicPhaseIssues},phaseTopologyOwnership,fluidProperties:{heating:d.heatingFluidProperties,cooling:d.coolingFluidProperties,tank:d.tankFluidProperties,freeze:{heating:d.heatingFreezeAssessment,cooling:d.coolingFreezeAssessment,warnings:d.fluidFreezeWarnings},issues:d.fluidPropertyIssues},npc:econ.npc,capex0,annualOpex,costEnergyYear1,totals,heatPumpSource:d.heatPumpSource.enabled?{...d.heatPumpSource,minOutletObserved_C:Number.isFinite(minSourceWaterOutlet_C)?minSourceWaterOutlet_C:null,maxDeltaT_K:maxSourceWaterDeltaT_K}:null,peaks:{electric_W:peakElecW,gridImport_W:peakGridImportW,gas_W:peakGasW,deliveredFuel_W:peakDeliveredFuelW,boilerFuelInput_W:Math.max(peakGasW,peakDeliveredFuelW),flow_m3_s:peakFlow,velocity_m_s:peakVelocity,dp_Pa:peakDp,airFlow_m3_s:peakAirFlow,airVelocity_m_s:peakAirVelocity,airDp_Pa:peakAirDp,fan_W:peakFanW},
    reliability,cyclingBuffer,plantCycling:plantCyclingSnapshot(plantCyclingState),mechanicalCoolingPlantStates:mechanicalCoolingPlantStateSnapshots(mechanicalPlantStates),siteEnergy,programIntegration:{...programIntegration,temperatureDegreeHoursOutside:programTempDegreeHours,rhDegreeHoursOutside:programRHDegreeHours,constraintConflicts:programConstraintConflicts,inputErrorCount:programInputErrors,feasible:programFeasible},ground:{...groundSnapshot(ground,d.groundCoupling),monthlyNetToGround_J:groundMonthlyNetToGround_J,longTerm:groundLongTerm},humidity:{enabled:humidity.spec.enabled,finalHumidityRatio_kg_kgDA:humidity.x_kg_kgDA,finalDewPoint_C:humidity.spec.enabled?dewPointFromHumidityRatio(humidity.x_kg_kgDA,humidity.spec.pressure_Pa):null,maxDewPoint_C:humidity.maxDewPoint_C,dewPointDegreeHoursAbove:humidity.dewPointDegreeHoursAbove,occupiedDewPointDegreeHoursAbove:humidity.occupiedDewPointDegreeHoursAbove,rhDegreeHoursBelow,occupiedRHDegreeHoursBelow,condensate_kg:humidity.condensate_kg,latentCooling_J:humidity.latentCooling_J},contaminants:{enabled:contaminantState.spec.enabled,finalConcentrations_kg_kgDA:{...contaminantState.concentrations_kg_kgDA},maxConcentrations_kg_kgDA:{...contaminantState.maxConcentrations_kg_kgDA},degreeHoursAboveLimit:{...contaminantState.degreeHoursAboveLimit},violationCount:contaminantState.violationCount,degreeHoursTotal:contaminantDegreeHours,feasible:contaminantFeasible},comfort:{degreeHoursBelow:bld.degreeHoursBelow,degreeHoursAbove:bld.degreeHoursAbove,occupiedDegreeHoursBelow:bld.occupiedDegreeHoursBelow,occupiedDegreeHoursAbove:bld.occupiedDegreeHoursAbove,finalAir_C:bld.Tair_C,finalMass_C:bld.Tmass_C},tank:tankSnapshot(tank),storageStates:storageSnapshots(storageStates),coldStorageStates:coldStorageSnapshots(coldStorageStates),representative:reps,trace};
}


/* ---------- worker ensemble adapter ---------- */
function thermalWorkerPreamble(extraPreamble=''){
  const fns=[
    finiteNumber,normalizeThermoState,sameThermoFluid,steamCondensateExchange,vaporCompressionPHCycle,evaluatePhaseInterfaces,phaseProviderResolve,stateRequestingVaporCompression,steamControlCondensing,dynamicPhaseLoadProfile,evaluateDynamicPhaseComponentsAnnual,phaseOwnershipIssue,phaseOwnershipFinite,phaseOwnershipString,validateCarrierOwnership,evaluateSteamTopology,evaluateRefrigerantTopology,rolesOf,roleGroup,portMap,componentMap,nodeMap,endpoint,phasePortClass,graphPhaseEdges,componentsWithRoles,connectedSets,groupsForKind,oneRole,copyDefined,phaseRecoveryDestinationRole,phaseGraphNeighbours,phaseStorageServiceRole,phaseStorageThermalMode,phaseThermalSourceMode,phaseThermalSinkMode,phaseThermalBusMode,phaseBusAllowsMode,phaseStorageChargeRole,phaseThermalServiceEdges,derivePhaseStorageServices,derivePhaseStorageCharging,phaseColdDirectRole,derivePhaseColdSourceDeliveries,phaseExhaustRecoveryRole,deriveExhaustRecoveryOwnership,validateExhaustRecoveryBindings,derivePhaseHeatRecoveryRouting,deriveSteam,deriveRefrigerant,derivePhaseTopologyOwnership,evaluateDynamicCondenserHeatRecovery,evaluatePhaseTopologyOwnershipAnnual,resolveNamedHotSinkProfiles,resolveNamedThermalSourceProfiles,dispatchStorageChargingHour,createStorageStateMap,storageSnapshots,normalizeMechanicalCoolingPlant,normalizeMechanicalCoolingPlants,mechanicalStoragePlantSets,resolveSharedMechanicalStorageReservations,coldStorageRemainingChargeAcceptanceW,sharedStorageReservationCapsByPlant,sharedStorageReservationTrace,resolveMechanicalCoolingPlantDispatchPolicy,resolveMechanicalForcedExcessStoragePolicies,recordMechanicalForcedExcessDisposition,dispatchMechanicalForcedExcessToColdStorageHour,mechanicalCoolingPlantMap,mechanicalPlantCOPMultiplier,createMechanicalCoolingPlantState,createMechanicalCoolingPlantStateMap,mechanicalPlantAvailabilityFractions,mechanicalPlantAvailableCapacityW,advanceMechanicalCoolingPlantState,cloneMechanicalCoolingPlantState,predictMechanicalCoolingPlantMarginalPerformance,cloneColdStorageState,predictMechanicalForcedExcessStorageAcceptance,mechanicalCoolingPlantStateSnapshots,evaluateExplicitMechanicalPlantsHour,normalizeColdStorageSpec,createColdStorageState,coldStorageSOC,coldStorageTemperatureC,coldStorageStandingGain,coldStorageCharge,coldStorageDischarge,coldStorageSnapshot,coldProfileValue,dispatchColdStorageChargingHour,dispatchColdStorageServicesHour,resolveNamedColdSinkProfiles,resolveNamedColdSourceProfiles,dispatchGraphDirectColdSourcesHour,endogenousDirectColdSourceProfilesHour,freeCoolingResidualColdSourceProfilesHour,airsideHydronicConverterColdSourceProfilesHour,exhaustAirHydronicConverterColdSourceProfilesHour,exhaustRecoveryHydronicFirstReservationW,planHydronicFirstExhaustRecoveryHour,dispatchAirsideHydronicConvertersToColdStorageHour,mergeColdStorageChargeDispatch,createColdStorageStateMap,coldStorageSnapshots,validateColdStorageBindings,coldSourceChargingElectricityW,dispatchMechanicalColdSinksHour,validateHeatRecoverySystemAndStorageBindings,dispatchDynamicPhaseHeatRecoveryHour,dispatchStorageServicesHour,
    saturationPressurePa,humidityRatioFromPv,vapourPressureFromHumidityRatio,saturationHumidityRatio,humidityRatioFromRH,dewPointFromHumidityRatio,moistAirEnthalpy_kJ_kgDA,dryAirDensity_kg_m3,condensateSpecificCooling_J_kg,normalizeHumidity,createHumidityState,coolingTerminalSupportsDehumidification,dehumidificationCapacityKgS,humidityHourDemand,processExhaustMoistureHour,processExhaustAnnualHour,normalizeProcessContaminants,createProcessContaminantState,advanceProcessContaminantState,applyHumidityRemoval,
    dtLog,emitterFactor,emitterCapacityW,surfaceOutputWm2,surfaceExcessK,floorSeriesResistance,floorRequiredMeanWaterC,floorHeatingCapacityW,floorRequiredMeanWaterCoolingC,floorCoolingCapacityW,heatingTerminalCapacityW,coolingTerminalCapacityW,heatPumpCOP,heatPumpCapacityFactor,coolingCOPAtReject,coolingCOP,condenserRecoveryState,
    effNTUCounterflow,lmtd,directHX,prandtlNumber,internalTubeNusselt,heatExchangerTubeSideFilm,directHXFromGeometry,lerp,bracket,bilerp,interpRows,interpPairs,centeredPoly2D,centeredPoly1D,calciumChlorideMCAProps,brineFreezingPoint_C,assessFreezeMargin,chlorideBrineConstraints,potassiumFormateConstraints,productTableProps,potassiumAcetateConstraints,potassiumAcetateProductProps,interpPaired,convertGlycolConcentration,normalizeGlycolFluidSpec,glycolProps,glycolHighMassProps,brineProps,resolveFluidProperties,hydronicScreen,heatExchangerCapacityRates,storageSensibleCapacity,colebrookFriction,frictionFactor,pipeHydraulics,hydronicFlowFromHeat,
    pv,netPresentCost,npvVsReference,humidifierPerformance,estimateHumidifierCost,automaticShadingHour,estimateAutomaticShadingCost,pvPowerFromIrradiance,dispatchPV,estimatePVCost,
    normalizeTankSpec,initFiniteStratifiedNodes,createTankState,finiteTankEnergyJ,syncTankEnergy,sortFiniteTank,
    tankSOC,tankTopTemperatureC,tankMeanTemperatureC,finiteTankAxialConduction,tankStandingLoss,tankCharge,tankDischarge,tankCapex,tankSnapshot,
    normalizeBuildingSpec,createBuildingState,building2R2CStep,hvacPowerForTarget,percentile,normalizeOperation,deliveryToMassFraction,ventilationAirHeatingCapacityW,ventilationAirCoolingCapacityW,heatingDeliverySplit,operationBounds,normalizeHydronicPipe,normalizeAirside,airsidePerformance,airsideCapex,normalizeDirectHXGeometry,sourceWaterDirectHXLimit,normalizeFreeCooling,freeCoolingHour,freeCoolingCapex,normalizeGroundCoupling,createGroundState,groundRecoveryStep,groundExchangeCapacityW,groundExchange,groundDirectHeatingHour,groundDirectCoolingHour,groundSnapshot,normalizeGroundLongTerm,lookupAshraeBoreholeResistance,resolveEffectiveBoreholeResistance,erfApprox,erfIntegral,simpsonIntegral,convergedSimpsonIntegral,finiteLineSourceResponse,finiteLineSourceResponseConverged,rectangularBorefieldPositions,borefieldDistanceHistogram,solveLinearSystem,borefieldFLSInteractionMatrix,solveBoreholeLevelUBWT,generateBoreholeLevelUBWTFLSGFunction,eskilsonSegmentRatios,normalizeAxialSegmentRatios,borefieldSegmentGeometry,borefieldSegmentFLSInteractionMatrix,solveSegmentedUBWT,generateSegmentedUBWTSnapshotFLSResponse,generateSegmentedUBWTFLSGFunction,linearInterp1D,reconstructUBWTLoadHistory,interpResponseMatrix,generateTransientSegmentedUBWTFLSGFunction,assessSegmentedUBWTConvergence,generateUniformHeatExtractionFLSGFunction,meanFluidTemperatureFromWall,borefieldShortTermPeakOverlay,generateBorefieldGeometryCandidates,gFunctionInterpolate,borefieldWallTemperatureFromG,borefieldGFunctionSuperposition,borefieldLongTermScreen,normalizePV,normalizeShading,normalizeHumidifier,normalizeHeatingTerminal,normalizeCoolingTerminal,normalizeLatentTerminal,
    normalizeHeatPumpPlant,normalizePlantCycling,plantCyclingMaskIndexes,createPlantCyclingState,plantCyclingBand,advancePlantCyclingState,plantCyclingSnapshot,normalizeReliability,normalizeSiteEnergyAvailability,assessSiteEnergyFeasibility,programScheduleFractions,normalizeDHWDraw24,prepareProgramAnnualProject,programSensibleAirExchangeW,programRoomConstraintViolation,generateJointTopologyCandidates,jointDesignSignature,refineJointTopologyCandidates,coarseToFineJointSearch,enumerateIndexCombinations,enumerateHeatPumpPlantStages,hpPlantFailureStates,hpPlantCapacityAfterFailures,assessHeatPlantReliability,minimumBufferForCycling,generateHeatPumpPlantVariants,normalizeCandidate,legacyHeatRecoveryCapex,candidateCapex,simulateCandidate
  ];
  return `'use strict';\n`
    +`const PHASES=new Set(${JSON.stringify(Array.from(PHASES))});\n`
    +`const PHASE_PROPERTY_PROVIDER_CONTRACT=Object.freeze(${JSON.stringify(PHASE_PROPERTY_PROVIDER_CONTRACT)});\n`
    +`const PHASE_GRAPH_SCHEMA=${JSON.stringify(PHASE_GRAPH_SCHEMA)};\n`
    +`const PHASE_GRAPH_STEAM_ROLES=new Set(${JSON.stringify(Array.from(PHASE_GRAPH_STEAM_ROLES))});\n`
    +`const PHASE_GRAPH_REFRIG_ROLES=new Set(${JSON.stringify(Array.from(PHASE_GRAPH_REFRIG_ROLES))});\n`
    +`const phaseGraphArr=${phaseGraphArr.toString()};\n`
    +`const phaseGraphIssue=${phaseGraphIssue.toString()};\n`
    +`const phaseGraphStr=${phaseGraphStr.toString()};\n`
    +`const HOUR_S=${HOUR_S},G=${G},DT_NOM=${DT_NOM};\n`
    +`const RA_DA=${RA_DA},HUM_RATIO=${HUM_RATIO},CPA_KJ=${CPA_KJ},CPV_KJ=${CPV_KJ},HFG_KJ=${HFG_KJ},CW_KJ=${CW_KJ};\n`
    +`const EMITTER_EXPONENT=Object.freeze(${JSON.stringify(EMITTER_EXPONENT)});\n`
    +`const FLOOR_R_SCREED=${FLOOR_R_SCREED};\n`
    +`const HP_QUALITY=Object.freeze(${JSON.stringify(HP_QUALITY)});\n`
    +`const AIR_HP=new Set(${JSON.stringify(Array.from(AIR_HP))});\n`
    +`const ENVELOPE_OPTION_DEFAULTS=Object.freeze(${JSON.stringify(ENVELOPE_OPTION_DEFAULTS)});\n`
    +`const ASHRAE_RB_LIBRARY=Object.freeze(${JSON.stringify(ASHRAE_RB_LIBRARY)});\n`
    +`const SOURCES=Object.freeze(${JSON.stringify(SOURCES)});\n`
    +`const T=${JSON.stringify(T)},C=${JSON.stringify(C)};\n`
    +`const EG=${JSON.stringify(EG)},PG=${JSON.stringify(PG)};\n`
    +`const GLYCOL_HIGH_MASS_T=${JSON.stringify(GLYCOL_HIGH_MASS_T)},GLYCOL_HIGH_MASS_C=${JSON.stringify(GLYCOL_HIGH_MASS_C)},GLYCOL_HIGH_MASS=${JSON.stringify(GLYCOL_HIGH_MASS)};\n`
    +`const KFORMATE_PRODUCTS=${JSON.stringify(KFORMATE_PRODUCTS)},KACETATE_PRODUCTS=${JSON.stringify(KACETATE_PRODUCTS)};\n`
    +`const NACL20=${JSON.stringify(NACL20)},CACL220=${JSON.stringify(CACL220)};\n`
    +`const CACL2_MCA=${JSON.stringify(CACL2_MCA)};\n`
    +`const NACL_RHOMU_T=${JSON.stringify(NACL_RHOMU_T)},NACL_RHOMU_C=${JSON.stringify(NACL_RHOMU_C)},NACL_RHO=${JSON.stringify(NACL_RHO)},NACL_MU=${JSON.stringify(NACL_MU)};\n`
    +`const NACL_CPK_T=${JSON.stringify(NACL_CPK_T)},NACL_CPK_C=${JSON.stringify(NACL_CPK_C)},NACL_CP=${JSON.stringify(NACL_CP)},NACL_K=${JSON.stringify(NACL_K)},NACL_FREEZE=${JSON.stringify(NACL_FREEZE)};\n`
    +`const GLYCOL_BASIS_MAP=${JSON.stringify(GLYCOL_BASIS_MAP)};\n`
    +`const clamp=${clamp.toString()};\n`
    +`const kWh=${kWh.toString()};\n`
    +fns.map(f=>f.toString()).join('\n')+'\n'+String(extraPreamble||'')+'\n';
}
function onEvaluateCandidateCase(c,ctx){
  const p=(ctx&&ctx.params)||{},a=(c&&c.parameters)||{},i=Number(a.i);
  if(!Number.isInteger(i)||i<0||!Array.isArray(p.designs)||i>=p.designs.length)throw new Error('invalid candidate case index');
  const providers=(typeof globalThis!=='undefined'&&globalThis.__THERMAL_PHASE_PROVIDERS__)||null;
  return simulateCandidate(p.project,p.designs[i],{retainTrace:false,phasePropertyProviders:providers});
}
async function createCandidateEnsemble(api,o={}){
  if(!api||typeof api.ComputeRuntime!=='function')throw new Error('DiagramCompute runtime unavailable');
  const runtime=await api.ComputeRuntime.create({benchmark:false}),caps=runtime.capabilities||{};
  const phaseProviderPreamble=String(o.phaseProviderPreamble??'');
  const phaseProviderKinds=Array.from(new Set(Array.isArray(o.phaseProviderKinds)?o.phaseProviderKinds.map(String):[]));
  const preamble=thermalWorkerPreamble(phaseProviderPreamble);
  const source=typeof api.createEnsembleWorkerSource==='function'
    ?api.createEnsembleWorkerSource(onEvaluateCandidateCase,{preamble})
    :null;
  // A supplied Worker factory is a valid execution platform for tests/non-DOM hosts,
  // exactly like DiagramCompute's own ENS-6 self-test. Production browser runs omit it.
  if(o.workerFactory&&caps.cpu)caps.cpu.workerAvailable=true;
  if(!caps.cpu||!caps.cpu.workerAvailable)throw new Error('this context has no Worker constructor');
  const workers=Math.max(1,Math.trunc(o.workers??runtime.getWorkerCount()));
  const ensemble=runtime.createEnsembleEngine({prefix:o.prefix??'thermaloptimizer'});
  const spec={workers,poolKey:(o.prefix??'thermaloptimizer')+':candidate',determinism:'repeatable',primitives:[{kind:'ensemble',factor:1}]};
  if(source)spec.source=source;else{spec.handler=onEvaluateCandidateCase;spec.preamble=preamble;}
  if(o.workerFactory)spec.workerFactory=()=>o.workerFactory(source);
  ensemble.registerEnsemble('candidate',spec);
  ensemble.__thermalPhaseProviderKinds=phaseProviderKinds.slice();
  return{runtime,ensemble,workers,workerSource:source,phaseProviderKinds:phaseProviderKinds.slice()};
}
async function runCandidateEnsemble(ensemble,project,designs,o={}){
  if(!ensemble||typeof ensemble.run!=='function')throw new Error('candidate ensemble is not initialized');
  const required=new Set();
  for(const d of designs||[]){const x=d&&d.dynamicPhaseComponents;if(!x)continue;if(Array.isArray(x.refrigeration)&&x.refrigeration.length)required.add('refrigerant');if(Array.isArray(x.steamCondensing)&&x.steamCondensing.length)required.add('steam');}
  const available=new Set(ensemble.__thermalPhaseProviderKinds||[]),missing=Array.from(required).filter(k=>!available.has(k));
  if(missing.length)throw new Error('Worker phase property provider unavailable: '+missing.join(', '));
  const cases=designs.map((_,i)=>({i})),workers=Math.max(1,Math.trunc(o.workers??1));
  const payload={design:{method:'list',cases},params:{project,designs},keepResults:true,workers,
    chunkSize:Math.max(1,Math.trunc(o.chunkSize??Math.ceil(Math.max(1,cases.length)/(workers*4)))),
    backend:'workers',signal:o.signal??null,onProgress:o.onProgress};
  const res=(await ensemble.run('candidate',payload)).result,out=new Array(designs.length),errors=[];
  for(const e of res.results||[]){
    const i=e.parameters&&e.parameters.i;if(!Number.isInteger(i)||i<0||i>=out.length)continue;
    if(e.ok)out[i]=e.value;else errors.push({i,error:e.error??'worker case failed'});
  }
  return{results:out,errors,workers:res.workers??workers,partitions:res.partitions??null,determinism:res.determinism??'repeatable'};
}

function rankCandidates(project,designs,options={}){
  const results=designs.map(d=>simulateCandidate(project,d,options));
  const comparison=results.filter(x=>x.design.comparisonOnly).sort((a,b)=>a.npc-b.npc),feasible=results.filter(x=>x.feasible&&!x.design.comparisonOnly).sort((a,b)=>a.npc-b.npc),infeasible=results.filter(x=>!x.feasible&&!x.design.comparisonOnly).sort((a,b)=>a.npc-b.npc);
  if(project.referenceNPC!=null)for(const x of results)x.npvVsReference=npvVsReference(x.npc,project.referenceNPC);
  return{best:feasible[0]??null,feasible,infeasible,comparison,all:results};
}


/* ---------- robustness / sensitivity ---------- */
function scaledProfile(a,m=1){return a?Float64Array.from(a,x=>x*m):a;}
function perturbProject(project,scenario={}){
  const p=project.profiles||{},electricityMultiplier=scenario.electricityMultiplier??1,gasMultiplier=scenario.gasMultiplier??1;
  return{...project,profiles:{...p,electricity_per_kWh:scaledProfile(p.electricity_per_kWh,electricityMultiplier),gas_per_kWh:scaledProfile(p.gas_per_kWh,gasMultiplier)}};
}
function perturbDesign(design,scenario={}){
  const capex=scenario.capexMultiplier??1,hpCapex=scenario.hpCapexMultiplier??capex,boilerCapex=scenario.boilerCapexMultiplier??capex,coolingCapex=scenario.coolingCapexMultiplier??capex,emitterCapex=scenario.emitterCapexMultiplier??capex,airsideCapexM=scenario.airsideCapexMultiplier??capex,tankCapexM=scenario.tankCapexMultiplier??capex;
  const hpQualityMultiplier=scenario.hpQualityMultiplier??1,coolingQualityMultiplier=scenario.coolingQualityMultiplier??hpQualityMultiplier;
  const tank=design.tank?{...design.tank,capexFixed:(design.tank.capexFixed??0)*tankCapexM,capexPerM3:(design.tank.capexPerM3??0)*tankCapexM}:design.tank;
  const air=design.airside?{...design.airside,fixedCapex:(design.airside.fixedCapex??0)*airsideCapexM,ductCapex_per_m2:(design.airside.ductCapex_per_m2??70)*airsideCapexM,fanCapex_per_kW:(design.airside.fanCapex_per_kW??350)*airsideCapexM}:design.airside;
  const recovery=design.heatRecovery?{...design.heatRecovery,capex:(design.heatRecovery.capex??0)*capex}:design.heatRecovery;
  const hpOptions={...(design.hpOptions||{})};if(hpQualityMultiplier!==1)hpOptions.quality=(hpOptions.quality??HP_QUALITY[design.hpType??'airWater']??.42)*hpQualityMultiplier;
  const coolingOptions={...(design.coolingOptions||{})};if(coolingQualityMultiplier!==1)coolingOptions.quality=(coolingOptions.quality??.45)*coolingQualityMultiplier;
  return{...design,hpOptions,coolingOptions,tank,airside:air,heatRecovery:recovery,
    hpCapex_per_kW:(design.hpCapex_per_kW??850)*hpCapex,boilerCapex_per_kW:(design.boilerCapex_per_kW??180)*boilerCapex,coolingCapex_per_kW:(design.coolingCapex_per_kW??0)*coolingCapex,coolingFixedCapex:(design.coolingFixedCapex??0)*coolingCapex,
    emitterCapex:(design.emitterCapex??0)*emitterCapex,coolingTerminalCapex:(design.coolingTerminalCapex??0)*emitterCapex,pipeCapex:(design.pipeCapex??0)*capex,coolingPipeCapex:(design.coolingPipeCapex??0)*capex,fixedOpex_per_year:(design.fixedOpex_per_year??1200)*(scenario.opexMultiplier??1)};
}
function defaultRobustnessScenarios(){return[
  {id:'BASE',label:'Base assumptions',weight:2},
  {id:'ELEC_LOW',label:'Electricity -25%',electricityMultiplier:.75,weight:1},
  {id:'ELEC_HIGH',label:'Electricity +35%',electricityMultiplier:1.35,weight:1},
  {id:'GAS_HIGH',label:'Gas +35%',gasMultiplier:1.35,weight:1},
  {id:'CAPEX_HIGH',label:'Installed CAPEX +25%',capexMultiplier:1.25,weight:1},
  {id:'HP_PERF_LOW',label:'Heat-pump quality -12%',hpQualityMultiplier:.88,coolingQualityMultiplier:.88,weight:1},
  {id:'ENERGY_STRESS',label:'Electricity +25%, gas +45%',electricityMultiplier:1.25,gasMultiplier:1.45,weight:1},
  {id:'CAPEX_ENERGY_STRESS',label:'CAPEX +20%, electricity +20%',capexMultiplier:1.20,electricityMultiplier:1.20,weight:1},
];}
function evaluateRobustnessScenario(project,designs,scenario){const pp=perturbProject(project,scenario),dd=designs.map(d=>perturbDesign(d,scenario)),rank=rankCandidates(pp,dd);return{scenario,rank};}
function robustnessAnalysis(project,designs,options={}){
  const scenarios=options.scenarios??defaultRobustnessScenarios(),withinFraction=options.withinFraction??.05,baseRank=rankCandidates(project,designs),physical=designs.filter(d=>!d.comparisonOnly),names=physical.map(d=>d.name),stats=Object.fromEntries(names.map(n=>[n,{name:n,weight:0,feasibleWeight:0,winWeight:0,withinWeight:0,totalRegret:0,maxRegret:0,npcWeighted:0}]));
  const rows=[];let totalWeight=0;
  for(const sc0 of scenarios){const sc={weight:1,...sc0},w=Math.max(0,sc.weight);if(!(w>0))continue;totalWeight+=w;const {rank}=evaluateRobustnessScenario(project,designs,sc),best=rank.best,bestNpc=best?.npc??Infinity,row={id:sc.id,label:sc.label??sc.id,weight:w,best:best?.design.name??null,bestNPC:Number.isFinite(bestNpc)?bestNpc:null,candidates:[]};
    for(const r of rank.all.filter(x=>!x.design.comparisonOnly)){const st=stats[r.design.name];st.weight+=w;if(r.feasible){const regret=Math.max(0,r.npc-bestNpc),within=best&&r.npc<=bestNpc*(1+withinFraction)+1e-9;st.feasibleWeight+=w;st.npcWeighted+=w*r.npc;st.totalRegret+=w*regret;st.maxRegret=Math.max(st.maxRegret,regret);if(best?.design.name===r.design.name)st.winWeight+=w;if(within)st.withinWeight+=w;row.candidates.push({name:r.design.name,feasible:true,npc:r.npc,regret,within});}else row.candidates.push({name:r.design.name,feasible:false,npc:r.npc,regret:null,within:false});}
    rows.push(row);
  }
  const candidates=Object.values(stats).map(st=>({...st,winProbability:totalWeight?st.winWeight/totalWeight:0,withinProbability:totalWeight?st.withinWeight/totalWeight:0,feasibleProbability:totalWeight?st.feasibleWeight/totalWeight:0,meanRegret:st.feasibleWeight?st.totalRegret/st.feasibleWeight:null,meanNPC:st.feasibleWeight?st.npcWeighted/st.feasibleWeight:null})).sort((a,b)=>(b.winProbability-a.winProbability)||((a.meanRegret??Infinity)-(b.meanRegret??Infinity)));
  return{schema:'thermal-optimizer/robustness/v0.1',objective:'minimum NPC (unchanged)',scenarioWeightsCalibratedProbability:false,withinFraction,totalWeight,baseBest:baseRank.best?.design.name??null,baseNPC:baseRank.best?.npc??null,scenarios:rows,candidates};
}
function scalarScenario(parameter,value){const m={electricityMultiplier:'electricityMultiplier',gasMultiplier:'gasMultiplier',capexMultiplier:'capexMultiplier',hpQualityMultiplier:'hpQualityMultiplier'};return{[m[parameter]??parameter]:value};}
function pairDeltaNPC(project,baseDesign,altDesign,parameter,value){const sc=scalarScenario(parameter,value),pp=perturbProject(project,sc),a=simulateCandidate(pp,perturbDesign(baseDesign,sc)),b=simulateCandidate(pp,perturbDesign(altDesign,sc));if(!a.feasible||!b.feasible)return null;return b.npc-a.npc;}
function switchingThreshold(project,baseDesign,altDesign,parameter,{lo=.5,hi=2,tol=1e-4,maxIter=8}={}){
  let flo=pairDeltaNPC(project,baseDesign,altDesign,parameter,lo),fhi=pairDeltaNPC(project,baseDesign,altDesign,parameter,hi);if(flo==null||fhi==null)return{parameter,threshold:null,reason:'infeasible-bracket'};if(Math.abs(flo)<1e-7)return{parameter,threshold:lo,deltaNPC:0};if(Math.abs(fhi)<1e-7)return{parameter,threshold:hi,deltaNPC:0};if(flo*fhi>0)return{parameter,threshold:null,reason:flo>0&&fhi>0?'base-dominates-bracket':'alternative-dominates-bracket',deltaAtLo:flo,deltaAtHi:fhi};
  let a=lo,b=hi,fa=flo,fb=fhi,m=NaN,fm=NaN;for(let i=0;i<maxIter;i++){m=(a+b)/2;fm=pairDeltaNPC(project,baseDesign,altDesign,parameter,m);if(fm==null)return{parameter,threshold:null,reason:'infeasible-midpoint'};if(Math.abs(fm)<1||Math.abs(b-a)<tol)break;if(fa*fm<=0){b=m;fb=fm}else{a=m;fa=fm}}
  return{parameter,threshold:m,deltaNPC:fm,bracket:[lo,hi]};
}
function alternativeSwitchingThresholds(project,designs,options={}){const rank=rankCandidates(project,designs),base=rank.best;if(!base)return{schema:'thermal-optimizer/switching-thresholds/v0.1',base:null,alternatives:[]};const params=options.parameters??[{name:'electricityMultiplier',lo:.4,hi:2.2},{name:'gasMultiplier',lo:.4,hi:2.5},{name:'capexMultiplier',lo:.5,hi:1.8},{name:'hpQualityMultiplier',lo:.75,hi:1.3}],alts=rank.feasible.filter(x=>x!==base).slice(0,options.maxAlternatives??1);return{schema:'thermal-optimizer/switching-thresholds/v0.1',base:base.design.name,baseNPC:base.npc,alternatives:alts.map(alt=>({name:alt.design.name,baseDeltaNPC:alt.npc-base.npc,thresholds:params.map(p=>switchingThreshold(project,base.design,alt.design,p.name,p))}))};}

function terminalLabel(t={}){const m={floor:'embedded floor',radiator:'radiators',fanCoil:'fan-coils',ventilationAir:'ventilation air',airPlusLocalCoils:'ventilation air with local duct/zone coils',ceiling:'radiant ceiling',tabs:'thermally activated building structure'};return m[t.type]??t.type??'terminal';}
function profileStats(a){if(!a||!a.length)return{min:null,max:null,mean:null,sum:0};let min=Infinity,max=-Infinity,sum=0;for(const v of a){if(!Number.isFinite(v))continue;min=Math.min(min,v);max=Math.max(max,v);sum+=v;}return{min:Number.isFinite(min)?min:null,max:Number.isFinite(max)?max:null,mean:a.length?sum/a.length:null,sum};}
function bodBlock(id,title,text,reasonCodes=[],sourceFields=[],assumptions=[],warnings=[]){return{id,title,text,reasonCodes:[...new Set(reasonCodes)],sourceFields:[...new Set(sourceFields)],assumptions:[...new Set(assumptions)],warnings:[...new Set(warnings)]};}
function bodDocumentModel(project,result,rank=null){
  const d=result.design,p=project.profiles,o=normalizeOperation(project),hum=normalizeHumidity(project),occ=p.occupied?Array.from(p.occupied).reduce((a,b)=>a+(b?1:0),0):p.outdoor_C.length,occFrac=occ/p.outdoor_C.length;
  const blocks=[],omitted=[];const add=(...x)=>blocks.push(bodBlock(...x));const omit=(id,title,reasonCodes=[],note='Not applicable to the evaluated topology.')=>omitted.push({id,title,reasonCodes:[...new Set(reasonCodes)],note});
  const recommended=!rank||rank.best===result||rank.best?.design?.name===result.design.name;
  const hotStats=profileStats(p.hotSinkDemand_W),targetStats=profileStats(p.hotSinkTarget_C),ventStats=profileStats(p.ventilationFlow_m3_s),wasteStats=profileStats(p.wasteAvailable_W),wasteTemp=profileStats(p.wasteTemp_C);
  const genericHP=['HP_CARNOT_QUALITY_FACTOR_DEFAULT','HP_DEFROST_FACTOR_DEFAULT','HP_CAPACITY_DERATING_DEFAULT'];
  add('BOD-001','Design basis',`The thermal concept was evaluated by an hourly stateful simulation over ${p.outdoor_C.length} h. The ${recommended?'recommended':'evaluated'} candidate is “${d.name}”. The economic objective is minimum Net Present Cost over ${project.economics.analysisYears} years at a ${(project.economics.discountRate*100).toFixed(1)} % discount rate. Calculated NPC is €${Math.round(result.npc).toLocaleString('en-US')} with initial CAPEX of €${Math.round(result.capex0).toLocaleString('en-US')} and first-year OPEX of €${Math.round(result.annualOpex).toLocaleString('en-US')}.`,['HOURLY_DYNAMIC_SIMULATION','NPC_OBJECTIVE',recommended?'RECOMMENDED_CANDIDATE':'EVALUATED_NONWINNER'],['profiles.outdoor_C','economics.analysisYears','economics.discountRate','CandidateResult.npc','CandidateResult.capex0','CandidateResult.annualOpex'],['Hourly profiles are treated as regular local-standard-time timesteps.'],[]);
  add('BOD-010','Building operation',`The occupied schedule represents ${occ.toLocaleString('en-US')} h/year (${(100*occFrac).toFixed(1)} % of the year). Occupied temperature limits are ${o.occupiedComfortMin_C.toFixed(1)}–${o.occupiedComfortMax_C.toFixed(1)} °C. Outside occupied periods the heating setback is ${o.unoccupiedHeatSetback_C.toFixed(1)} °C and the cooling limit is ${o.unoccupiedCoolSetback_C.toFixed(1)} °C; the model allows ${o.prestartHours.toFixed(1)} h of pre-start.`,occFrac<0.45?['INTERMITTENT_OCCUPANCY','SETBACK_ALLOWED']:['CONTINUOUS_OR_HIGH_OCCUPANCY'],['profiles.occupied','operation.occupiedComfortMin_C','operation.occupiedComfortMax_C','operation.unoccupiedHeatSetback_C','operation.unoccupiedCoolSetback_C','operation.prestartHours'],[],[]);
  add('BOD-015','Thermal sources and sinks',`The simulated space-heating demand is ${(kWh(result.totals.zoneHeat_J)/1000).toFixed(1)} MWh/year. It is supplied by ${(kWh(result.totals.directWaste_J)/1000).toFixed(1)} MWh/year of direct recovered waste heat, ${(kWh(result.totals.hpHeat_J)/1000).toFixed(1)} MWh/year from the heat pump and ${(kWh(result.totals.boilerHeat_J)/1000).toFixed(1)} MWh/year from boiler back-up. The available waste-heat source varies from ${(wasteStats.min/1000).toFixed(1)} to ${(wasteStats.max/1000).toFixed(1)} kW at ${wasteTemp.min?.toFixed(1)}–${wasteTemp.max?.toFixed(1)} °C; ${(kWh(result.totals.wasteRejected_J)/1000).toFixed(1)} MWh/year remains unused. Space cooling is ${(kWh(result.totals.zoneCool_J)/1000).toFixed(1)} MWh/year sensible plus ${(kWh(result.totals.latentCooling_J)/1000).toFixed(1)} MWh/year latent refrigeration.`,['SOURCE_SINK_BALANCE','TEMPERATURE_GRADE_MATCHING'],['profiles.wasteAvailable_W','profiles.wasteTemp_C','CandidateResult.totals.directWaste_J','CandidateResult.totals.hpHeat_J','CandidateResult.totals.boilerHeat_J','CandidateResult.totals.wasteRejected_J','CandidateResult.totals.zoneCool_J','CandidateResult.totals.latentCooling_J'],['Waste-heat availability profile is accepted as a project boundary condition.'],[]);
  let rationale='',reasons=[];
  if(d.heatingTerminal.type==='airPlusLocalCoils'){const peak=d.heatingTerminal.nominal_W||d.hpCapacity_W,cap=ventilationAirHeatingCapacityW(ventStats.max??0,o.occupiedComfortMin_C,o);rationale=`Heating is delivered first through the mandatory ventilation airflow, limited by the air heat-capacity rate and a maximum supply-air temperature of ${o.airHeatingMaxSupply_C.toFixed(0)} °C. At the maximum scheduled ventilation flow of ${(ventStats.max??0).toFixed(2)} m³/s, the ventilation stream can carry approximately ${(cap/1000).toFixed(1)} kW at ${o.occupiedComfortMin_C.toFixed(0)} °C room temperature; residual zone load is assigned to local duct/zone coils up to ${(d.heatingTerminal.localCoil_W/1000).toFixed(0)} kW. The ventilation rate is not increased solely to transport heat.`;reasons.push('AIR_HEATING_USES_VENTILATION_FLOW','LOW_INERTIA_DELIVERY');}
  else if(d.heatingTerminal.type==='ventilationAir'){rationale=`Heating is delivered only through scheduled ventilation air. The ventilation rate is not increased solely to transport heat, so terminal capacity follows the scheduled airflow and the ${o.airHeatingMaxSupply_C.toFixed(0)} °C supply-air limit.`;reasons.push('AIR_HEATING_USES_VENTILATION_FLOW','LOW_INERTIA_DELIVERY');}
  else if(['floor','tabs'].includes(d.heatingTerminal.type)){rationale=`Heating is delivered by ${terminalLabel(d.heatingTerminal)} with approximately ${(deliveryToMassFraction(d.heatingTerminal)*100).toFixed(0)} % of terminal output coupled to the building mass in the reduced-order model. This is treated as a high-inertia delivery path and is assessed against the actual occupied/setback schedule.`;reasons.push('HIGH_INERTIA_TERMINAL','MASS_COUPLED_DELIVERY');}
  else{rationale=`Heating is delivered through ${terminalLabel(d.heatingTerminal)} with predominantly room-air coupling.`;reasons.push('ROOM_AIR_COUPLED_DELIVERY');}
  add('BOD-020','Heat delivery concept',`${rationale} Design water temperatures are ${d.busSupply_C.toFixed(0)}/${d.busReturn_C.toFixed(0)} °C where a hydronic terminal is used.`,reasons,['CandidateDesign.heatingTerminal','CandidateDesign.busSupply_C','CandidateDesign.busReturn_C','profiles.ventilationFlow_m3_s','operation.airHeatingMaxSupply_C'],['Terminal-to-air/mass coupling is a reduced-order representation.'],[]);
  add('BOD-030','Plant sizing and annual energy',`Installed heat-pump capacity is ${(d.hpCapacity_W/1000).toFixed(0)} kW and boiler back-up capacity is ${(d.boilerCapacity_W/1000).toFixed(0)} kW. The annual simulated zone heating and cooling deliveries are ${(kWh(result.totals.zoneHeat_J)/1000).toFixed(1)} MWh and ${(kWh(result.totals.zoneCool_J)/1000).toFixed(1)} MWh respectively. Peak electrical demand attributable to the simulated thermal plant is ${(result.peaks.electric_W/1000).toFixed(1)} kW.`,['PLANT_CAPACITY','ANNUAL_BALANCE'],['CandidateDesign.hpCapacity_W','CandidateDesign.boilerCapacity_W','CandidateResult.totals.zoneHeat_J','CandidateResult.totals.zoneCool_J','CandidateResult.peaks.electric_W'],genericHP,['Generic heat-pump performance is not a manufacturer EN 14511 map.']);
  add('BOD-040','Thermal storage',d.tank.volume_m3>0?`A ${d.tank.volume_m3.toFixed(1)} m³ ${d.tank.model} thermal store is included. The simulated end-state report gives ${(result.tank.loss_kWh/1000).toFixed(2)} MWh of standing losses and a final state of charge of ${(result.tank.SOC*100).toFixed(0)} %.`:`No thermal buffer is selected in this candidate because the lifecycle-cost search allows storage capacity to optimize to zero.`,d.tank.volume_m3>0?['THERMAL_STORAGE_SELECTED']:['STORAGE_OPTIMIZED_TO_ZERO'],['CandidateDesign.tank','CandidateResult.tank'],d.tank.model==='finiteStratified'?['FINITE_LAYER_STRATIFIED_TANK_MODEL']:[],d.tank.model==='idealStratified'?['IDEAL_STRATIFIED_IS_COMPARISON_ONLY']:[]);
  if(d.heatRecovery.enabled)add('BOD-045','Condenser heat recovery',`The cooling plant is equipped with condenser heat recovery rated to ${(d.heatRecovery.maxRecovery_W/1000).toFixed(0)} kW. The annual simulation recovers ${(kWh(result.totals.heatRecovered_J)/1000).toFixed(1)} MWh: ${(kWh(result.totals.heatRecoveryToSink_J)/1000).toFixed(1)} MWh is delivered directly to DHW/process demand and ${(kWh(result.totals.heatRecoveryToTank_J)/1000).toFixed(1)} MWh is transferred to hot storage. Remaining condenser rejection to ambient is ${(kWh(result.totals.ambientRejected_J)/1000).toFixed(1)} MWh. Recovery raises the condenser temperature when required by the hot sink, and the associated COP penalty is included in compressor electricity.`,['CONDENSER_HEAT_RECOVERY','SIMULTANEOUS_HEATING_COOLING'],['CandidateDesign.heatRecovery','profiles.hotSinkTarget_C','CandidateResult.totals.heatRecovered_J','CandidateResult.totals.heatRecoveryToSink_J','CandidateResult.totals.heatRecoveryToTank_J','CandidateResult.totals.ambientRejected_J'],[],[]);
  else add('BOD-045','Condenser heat recovery',`No condenser heat-recovery exchanger is included in this candidate; cooling rejection is sent to ambient.`,['NO_CONDENSER_HEAT_RECOVERY'],['CandidateDesign.heatRecovery.enabled','CandidateResult.totals.ambientRejected_J'],[],[]);
  if(hotStats.max>0)add('BOD-046','DHW / process hot-water sink',`The project hot-sink profile totals ${(kWh(result.totals.hotSinkDemand_J)/1000).toFixed(1)} MWh/year with an hourly demand range of ${(hotStats.min/1000).toFixed(1)}–${(hotStats.max/1000).toFixed(1)} kW and target temperature ${targetStats.min?.toFixed(1)}–${targetStats.max?.toFixed(1)} °C. Condenser recovery supplies ${(kWh(result.totals.heatRecoveryToSink_J)/1000).toFixed(1)} MWh/year directly; the remaining ${(kWh(result.totals.hotSinkBackup_J)/1000).toFixed(1)} MWh/year is assigned to the simplified backup-heating path.`,['DHW_PROCESS_SINK','HOT_SINK_BACKUP_REQUIRED'],['profiles.hotSinkDemand_W','profiles.hotSinkTarget_C','CandidateResult.totals.hotSinkDemand_J','CandidateResult.totals.heatRecoveryToSink_J','CandidateResult.totals.hotSinkBackup_J'],['Hot-sink demand is modeled as an hourly thermal demand, not as a detailed tapping profile.'],['No dedicated DHW store, legionella cycle or alternative DHW generator is modeled yet.']);
  else omit('BOD-046','DHW / process hot-water sink',['NO_HOT_SINK_PROFILE'],'No DHW/process hot-sink demand is present in the input profiles.');
  if(result.peaks.flow_m3_s>1e-12)add('BOD-050','Hydraulics',`At the governing simulated condition the principal circuit reaches ${(result.peaks.flow_m3_s*3600).toFixed(1)} m³/h, ${(result.peaks.velocity_m_s).toFixed(2)} m/s and ${(result.peaks.dp_Pa/1000).toFixed(1)} kPa. Pumping energy is included in operating cost.`,['HYDRAULIC_LOSSES_INCLUDED'],['CandidateDesign.pipe','CandidateResult.peaks.flow_m3_s','CandidateResult.peaks.velocity_m_s','CandidateResult.peaks.dp_Pa','CandidateResult.totals.pumpElectricity_J'],[],['Current hydraulic model is a principal-circuit Darcy–Weisbach/Colebrook representation, not a balanced meshed network.']);
  else omit('BOD-050','Hydraulics',['NO_HYDRONIC_FLOW'],'No hydronic flow occurs in the evaluated candidate.');
  if(result.humidity?.enabled){const h=result.humidity,lt=d.latentTerminal.enabled?d.latentTerminal:d.coolingTerminal;if(coolingTerminalSupportsDehumidification(lt))add('BOD-055','Humidity control and condensate',`Occupied humidity is limited by a maximum room dew point of ${hum.occupiedMaxDewPoint_C.toFixed(1)} °C. The ${d.latentTerminal.enabled?'dedicated latent airside terminal':'cooling terminal'} is modeled as a condensing air coil with apparatus dew point ${(lt.coilADP_C??8).toFixed(1)} °C and bypass factor ${(lt.bypassFactor??.1).toFixed(2)}. Annual latent refrigeration duty is ${(kWh(h.latentCooling_J)/1000).toFixed(1)} MWh and calculated condensate production is ${h.condensate_kg.toFixed(0)} kg/year.${d.latentTerminal.enabled?' This latent refrigeration is capacity- and energy-accounted separately from the radiant/TABS sensible path.':' Latent duty shares the mechanical cooling capacity with sensible cooling.'}`,['PSYCHROMETRIC_HUMIDITY_BALANCE','CONDENSING_COIL','CONDENSATE_HANDLING',...(d.latentTerminal.enabled?['DEDICATED_LATENT_PATH']:[])],['humidity','profiles.outdoorRH','profiles.internalMoisture_kg_s','CandidateDesign.coolingTerminal','CandidateDesign.latentTerminal','CandidateResult.humidity'],['Zone air is a well-mixed dry-air moisture volume.'],['Hygroscopic moisture buffering and detailed coil/drain geometry are not modeled.']);else add('BOD-055','Humidity control and condensate',`The selected cooling topology does not provide active dehumidification. The hourly moisture balance is nevertheless evaluated against the occupied dew-point limit; any exceedance is a feasibility constraint rather than being hidden inside sensible cooling.`,['NO_ACTIVE_DEHUMIDIFICATION','HUMIDITY_CONSTRAINT'],['humidity','CandidateDesign.coolingTerminal','CandidateDesign.latentTerminal','CandidateResult.humidity'],['Zone air is a well-mixed dry-air moisture volume.'],[]);}else omit('BOD-055','Humidity control and condensate',['HUMIDITY_MODEL_DISABLED'],'Humidity-state simulation is disabled for this project.');
  if(d.latentTerminal.enabled)add('BOD-067','Hybrid radiant/TABS sensible and latent airside cooling',`The sensible terminal is ${d.coolingTerminal.type}; moisture removal is assigned to a separate ${d.latentTerminal.type} condensing path. The dedicated path provides ${(kWh(result.totals.dedicatedLatentCooling_J)/1000).toFixed(1)} MWh/year of latent refrigeration, consumes ${(kWh(result.totals.dedicatedLatentElectricity_J)/1000).toFixed(1)} MWh/year of compressor electricity plus ${(kWh(result.totals.dedicatedLatentFanElectricity_J)/1000).toFixed(1)} MWh/year of explicit fan electricity, and receives no sensible-capacity credit for the slab/radiant terminal.`,['HYBRID_SENSIBLE_LATENT_SPLIT','DEDICATED_LATENT_PATH'],['CandidateDesign.coolingTerminal','CandidateDesign.latentTerminal','CandidateResult.totals.dedicatedLatentCooling_J','CandidateResult.totals.dedicatedLatentElectricity_J'],['The first hybrid model treats the dedicated latent coil as a separate refrigeration path rejecting heat to ambient.'],['Detailed DOAS supply-air sensible balance, reheat and coil UA are deferred.']);else omit('BOD-067','Hybrid radiant/TABS sensible and latent airside cooling',['NO_DEDICATED_LATENT_PATH'],'No separate latent terminal is selected.');
  if(d.humidifier.enabled)add('BOD-057','Winter humidification',`Winter humidification is enabled using ${d.humidifier.type}. Modeled annual make-up water is ${result.totals.humidifierWater_kg.toFixed(0)} kg and humidifier electricity is ${(kWh(result.totals.humidifierElectricity_J)/1000).toFixed(2)} MWh. ${d.humidifier.type==='adiabatic'?`Adiabatic evaporation imposes ${(kWh(result.totals.humidifierAdditionalHeating_J)/1000).toFixed(2)} MWh/year of additional sensible heating duty.`:'Steam/electrode electricity is counted as electrical input; no separate useful sensible-heat credit is claimed in this screening model.'}`,['WINTER_HUMIDIFICATION','HUMIDIFIER_ENERGY_WATER'],['CandidateDesign.humidifier','humidity.occupiedMinRH_frac','CandidateResult.totals.humidifierWater_kg','CandidateResult.totals.humidifierElectricity_J'],['Well-mixed zone moisture balance.'],['Water quality, blowdown, hygiene treatment and detailed humidifier controls are not modeled.']);
  else omit('BOD-057','Winter humidification',['HUMIDIFIER_NOT_SELECTED'],'No active winter humidifier is enabled in this candidate.');
  if(ventStats.max>0){const ap=airsidePerformance(d.airside,ventStats.max??0);if(d.airside.enabled)add('BOD-060','Ventilation and airside delivery',`Scheduled ventilation varies from ${(ventStats.min??0).toFixed(2)} to ${(ventStats.max??0).toFixed(2)} m³/s. The explicit main-duct model uses ${d.airside.D_m.toFixed(2)} m equivalent diameter over ${d.airside.L_m.toFixed(0)} m with local-loss coefficient ${d.airside.K.toFixed(1)}. At peak scheduled flow the calculated air velocity is ${ap.velocity_m_s.toFixed(2)} m/s, total external/static pressure is ${(ap.totalDp_Pa).toFixed(0)} Pa and fan electrical input is ${(ap.fan_W/1000).toFixed(1)} kW. Annual fan electricity is ${(kWh(result.totals.fanElectricity_J)/1000).toFixed(1)} MWh. Airside CAPEX included in the candidate is €${Math.round(airsideCapex(d.airside)).toLocaleString('en-US')}. Ventilation air may carry useful heating/cooling within supply-air temperature limits; airflow is not increased solely for thermal transport.`,['VENTILATION_PROFILE','AIR_THERMAL_TRANSPORT_LIMITED_BY_FLOW','AIRSIDE_PRESSURE_MODELED','FAN_ELECTRICITY_INCLUDED','DUCT_CAPEX_INCLUDED'],['profiles.ventilationFlow_m3_s','CandidateDesign.airside','CandidateResult.totals.fanElectricity_J','CandidateResult.peaks.airDp_Pa','CandidateResult.peaks.fan_W'],['Ventilation airflow remains prescribed by the project profile.'],['Fan heat to air, branch-by-branch duct balancing and acoustics are not yet modeled.']);else add('BOD-060','Ventilation and airside delivery',`Scheduled ventilation varies from ${(ventStats.min??0).toFixed(2)} to ${(ventStats.max??0).toFixed(2)} m³/s. Airflow is used as a thermal-transport limit, but the evaluated candidate has no explicit airside pressure/fan/cost model enabled.`,['VENTILATION_PROFILE','AIR_THERMAL_TRANSPORT_LIMITED_BY_FLOW','AIRSIDE_MODEL_DISABLED'],['profiles.ventilationFlow_m3_s','CandidateDesign.airside.enabled'],['Ventilation airflow is prescribed by the profile.'],['Fan electricity and duct CAPEX are omitted when the airside model is disabled.']);}
  else omit('BOD-060','Ventilation and airside delivery',['NO_VENTILATION_PROFILE'],'No positive ventilation airflow is present in the input profile.');
  const fcEnabled=d.freeCooling.airside.enabled||d.freeCooling.ambientLoop.enabled||d.freeCooling.sourceWater.enabled;
  if(fcEnabled)add('BOD-065','Free cooling / economizer',`The candidate includes explicit free-cooling paths. Annual sensible cooling supplied without compressor refrigeration is ${(kWh(result.totals.freeCooling_J)/1000).toFixed(1)} MWh, using ${(kWh(result.totals.freeCoolingElectricity_J)/1000).toFixed(2)} MWh of modeled fan/pump electricity. Air-side economizer eligibility checks outdoor dry-bulb, dew point and optionally enthalpy; ambient-loop and source-water paths require source temperature plus HX approach to reach the chilled-water supply temperature. Free cooling is dispatched before mechanical sensible cooling, while latent dehumidification remains assigned to the condensing mechanical path in this screening model.`,['FREE_COOLING','INTEGRATED_ECONOMIZER','TEMPERATURE_APPROACH_CONSTRAINT'],['CandidateDesign.freeCooling','profiles.outdoor_C','profiles.outdoorRH','profiles.outdoorWetBulb_C','profiles.sourceWater_C','CandidateResult.totals.freeCooling_J','CandidateResult.totals.freeCoolingElectricity_J'],['Free cooling displaces sensible compressor load first.'],['Latent cooling is not credited to free-cooling paths in v0.15; detailed coil/tower fouling, freeze protection and water treatment are outside this screening model.']);
  if(d.groundCoupling?.enabled){const g=result.ground,ext=kWh(g.extracted_J)/1000,inj=kWh(g.injected_J)/1000,net=kWh(g.netInjection_J)/1000,lt=d.groundCoupling.longTerm??{},lr=g.longTerm??{},rb=lr.rbSelection??lt.rbSelection??{},pk=lr.shortTermPeak??{};const rbText=lr.minMeanFluidTemp_C==null?'':` Effective Rb=${lt.effectiveBoreholeResistance_mK_W.toFixed(3)} m·K/W (${rb.method??'unspecified'}${rb.provenance?.title?`, ${rb.provenance.title}`:''}); mean-fluid temperature spans ${lr.minMeanFluidTemp_C.toFixed(1)} to ${lr.maxMeanFluidTemp_C.toFixed(1)} °C.`;const pkText=pk.enabled?` The long-term-only wall range is ${lr.longTermMinWallTemp_C.toFixed(1)} to ${lr.longTermMaxWallTemp_C.toFixed(1)} °C; after the ${Math.round(pk.duration_s/3600*10)/10} h incremental peak overlay the governing range is ${lr.minWallTemp_C.toFixed(1)} to ${lr.maxWallTemp_C.toFixed(1)} °C.${lr.longTermMinMeanFluidTemp_C==null?'':` Long-term-only mean-fluid extrema are ${lr.longTermMinMeanFluidTemp_C.toFixed(1)} to ${lr.longTermMaxMeanFluidTemp_C.toFixed(1)} °C.`}`:'';add('BOD-066','Ground / borefield coupling',`The candidate couples the thermal plant to a ${d.groundCoupling.kind} source/sink. The screening seasonal state starts at ${d.groundCoupling.initialTemp_C.toFixed(1)} °C against an undisturbed reference of ${d.groundCoupling.undisturbedTemp_C.toFixed(1)} °C and finishes at ${g.T_C.toFixed(1)} °C; the simulated annual range is ${g.minT_C.toFixed(1)} to ${g.maxT_C.toFixed(1)} °C. Gross extraction is ${ext.toFixed(1)} MWh and gross injection is ${inj.toFixed(1)} MWh, giving net injection ${net.toFixed(1)} MWh before the lumped ground-recovery term. Direct ground cooling contributes ${(kWh(result.totals.groundDirectCooling_J)/1000).toFixed(1)} MWh; direct heating contributes ${(kWh(result.totals.groundDirectHeat_J)/1000).toFixed(1)} MWh. Heat-pump source extraction and mechanical cooling rejection are tracked explicitly.`,['GROUND_COUPLING','SEASONAL_GROUND_BALANCE','DIRECT_HX_FIRST'],['CandidateDesign.groundCoupling','CandidateResult.ground','CandidateResult.totals.groundDirectCooling_J','CandidateResult.totals.groundHPExtraction_J'],['The hourly seasonal state is a reduced-order screening state; the optional long-term layer is a separate response-function screen.'],[(lt.enabled&&lr.available)?`A ${lr.years}-year response screen is active for ${lt.boreholes} boreholes × ${lt.boreholeLength_m.toFixed(0)} m at ${lt.spacing_m.toFixed(1)} m spacing. Governing borehole-wall temperature spans ${lr.minWallTemp_C.toFixed(1)} to ${lr.maxWallTemp_C.toFixed(1)} °C.${rbText}${pkText} Response source: ${lt.gFunction.generatorKind??lt.gFunction.source??'supplied table'}.`:'The reduced-order annual state is not by itself a borefield sizing model.'],['Geometry-generated response may use UHE, borehole-level UBWT or segmented UBWT according to candidate metadata. In auto mode the short-term incremental pulse overlay follows a segmented long-term response when available, but it remains a pulse overlay rather than full hourly load convolution. Segment-count and quadrature convergence must pass before the segmented response is treated as design-screening evidence. Unsupported Rb configurations are not extrapolated; groundwater advection, TRT calibration and detailed hydraulic/thermal borehole models remain outside this kernel.']);}
  else omit('BOD-065','Free cooling / economizer',['FREE_COOLING_NOT_SELECTED'],'No air-side, ambient-loop or source-water free-cooling path is enabled in this candidate.');
  if(d.pv.enabled||d.shading.enabled)add('BOD-067','Envelope and on-site electrical options',`${d.shading.enabled?`Automatic external shading avoids ${(kWh(result.totals.avoidedSolarGain_J)/1000).toFixed(1)} MWh/year of explicit modeled solar gain. `:''}${d.pv.enabled?`PV generation is ${(kWh(result.totals.pvGeneration_J)/1000).toFixed(1)} MWh/year, of which ${(kWh(result.totals.pvDirectUse_J)/1000).toFixed(1)} MWh is used directly and ${(kWh(result.totals.pvExport_J)/1000).toFixed(1)} MWh is exported; grid import is ${(kWh(result.totals.gridImport_J)/1000).toFixed(1)} MWh/year.`:''}`.trim(),['ENVELOPE_OPTION','ONSITE_GENERATION'],['CandidateDesign.shading','CandidateDesign.pv','profiles.solarGain_W','profiles.poaIrradiance_W_m2','CandidateResult.totals'],['Shading acts only on an explicit solar-gain channel.'],['Battery storage is not included in v0.14 PV dispatch.']);
  else omit('BOD-067','Envelope and on-site electrical options',['PV_SHADING_NOT_SELECTED'],'PV and automatic shading are not enabled in this candidate.');
  const controlReasons=['OCCUPANCY_CONTROL','SETBACK_CONTROL','PRESTART_CONTROL'];if(d.preheatOnCheap)controlReasons.push('TARIFF_PREHEAT_ENABLED');if(d.precoolOnCheap)controlReasons.push('TARIFF_PRECOOL_ENABLED');if(d.dischargeOnExpensive)controlReasons.push('STORAGE_DISCHARGE_ON_EXPENSIVE_PERIOD');if(d.heatRecovery.enabled)controlReasons.push('HEAT_RECOVERY_PRIORITY');
  add('BOD-070','Controls and operating sequence',`The supervisory sequence applies occupied/unoccupied comfort limits and ${o.prestartHours.toFixed(1)} h pre-start. ${d.preheatOnCheap?'Heat-pump charging/preheating may use the lower electricity-price quantile when thermal headroom exists.':'Tariff-driven preheating is disabled.'} ${d.precoolOnCheap?'Precooling may use the lower electricity-price quantile within comfort limits.':'Tariff-driven precooling is disabled.'} ${d.dischargeOnExpensive?'Available thermal storage may discharge during the configured expensive-price quantile.':'Price-triggered storage discharge is disabled.'} ${d.heatRecovery.enabled?'During cooling, recoverable condenser heat is dispatched first to the hot sink and then to eligible hot storage before ambient rejection.':''}`.trim(),controlReasons,['operation','profiles.electricity_per_kWh','CandidateDesign.preheatOnCheap','CandidateDesign.precoolOnCheap','CandidateDesign.dischargeOnExpensive','CandidateDesign.cheapQuantile','CandidateDesign.expensiveQuantile','CandidateDesign.heatRecovery'],['Control is hourly supervisory dispatch, not a valve/damper/PID sequence.'],['Minimum run time, cycling degradation, valve authority and detailed equipment interlocks are not yet modeled.']);
  const provenanceAssumptions=[...genericHP,'DEFAULT_COST_LIBRARY_PLACEHOLDERS','SYNTHETIC_DEMO_PROFILES_WHERE_APPLICABLE','SI_INTERNAL_UNITS'];
  add('BOD-042','Plant modularity and resilience',`Heat-pump plant is modeled as ${d.heatPumpPlant.modules.map(m=>(m.capacity_W/1000).toFixed(1)).join(' + ')} kW (${d.heatPumpPlant.moduleCount} module(s)), total ${(d.hpCapacity_W/1000).toFixed(1)} kW. Reliability mode is ${d.reliability.mode}. After ${d.reliability.oneFailureCount} module failure(s), immediate firm heating capacity including boiler backup is ${(result.reliability.capacityAfterFailure_W/1000).toFixed(1)} kW against a ${(result.reliability.criterionTarget_W/1000).toFixed(1)} kW criterion. ${d.reliability.mode==='mobileReady'?`Mobile-ready connections add ${(d.reliability.mobileCapacity_W/1000).toFixed(1)} kW after an assumed ${d.reliability.mobileMobilization_h.toFixed(0)} h mobilization.`:''} The current minimum-runtime screening volume associated with the smallest staged heat-pump output is ${result.cyclingBuffer.volume_m3.toFixed(2)} m³; actual optimal storage remains an economic/dynamic design variable.`,['MODULAR_HEAT_PUMP_PLANT','RELIABILITY_CRITERION','BUFFER_CYCLING_SCREEN'],['CandidateDesign.heatPumpPlant','CandidateDesign.reliability','CandidateResult.reliability','CandidateResult.cyclingBuffer'],['Module failure is represented as loss of whole-module capacity; common-cause failures are not yet probabilistically modeled.'],['Reliability modes are deterministic design criteria, not failure-probability estimates.']);
  add('BOD-080','Assumptions and provenance',`The calculation is traceable to the ProjectInput profiles, candidate parameters and deterministic reference-core equations identified by each report block's sourceFields list. Generic heat-pump quality/defrost/capacity-derating factors and the current demonstration cost values are model assumptions rather than manufacturer data. Every such parameter is intended to remain editable in the final tool.`,['ASSUMPTION_PROVENANCE','EDITABLE_DEFAULTS'],['ProjectInput','CandidateDesign','CandidateResult'],provenanceAssumptions,['Default cost provenance and regionalization are not yet production-ready.']);
  if(rank?.feasible?.length>1){if(recommended){const alt=rank.feasible.find(x=>x!==result);if(alt)add('BOD-090','Alternative considered',`The nearest retained feasible alternative is “${alt.design.name}” at €${Math.round(alt.npc-result.npc).toLocaleString('en-US')} higher NPC. The recommendation is therefore conditional on the stated cost, tariff, weather, occupancy and performance assumptions.`,['NEAR_OPTIMAL_ALTERNATIVE'],['CandidateResult.npc','Ranking.feasible'],[],['Switching thresholds are not yet solved explicitly.']);}else if(rank.best){add('BOD-090','Economic ranking',`This evaluated candidate is not the minimum-NPC solution. The current recommended candidate is “${rank.best.design.name}”, which is €${Math.round(result.npc-rank.best.npc).toLocaleString('en-US')} lower in NPC under the stated assumptions.`,['NONWINNER_VS_RECOMMENDED'],['CandidateResult.npc','Ranking.best.npc'],[],[]);}}else omit('BOD-090','Alternative considered / Economic ranking',['NO_SECOND_FEASIBLE_ALTERNATIVE'],'Fewer than two feasible physical candidates survive the current search.');
  add('BOD-099','Limitations',`This is a preliminary system-architecture Basis of Design, not a detailed HVAC design. Component performance maps, acoustic design, branch-level duct/pipe balancing and acoustics, detailed controls sequences, detailed coil selection/drainage, moisture buffering by materials and manufacturer-specific selections remain subject to subsequent design development.`,['PRELIMINARY_ASSESSMENT'],[],[],['Do not use this preliminary architecture result as a substitute for detailed equipment and network design.']);
  if(rank?.robustness){const rr=rank.robustness.candidates.find(x=>x.name===d.name);if(rr)add('BOD-095','Robustness and sensitivity',`Across the configured weighted sensitivity set, this candidate is minimum-NPC in ${(rr.winProbability*100).toFixed(0)} % of scenario weight and lies within ${(rank.robustness.withinFraction*100).toFixed(0)} % of scenario-best NPC in ${(rr.withinProbability*100).toFixed(0)} %. Mean regret over feasible scenarios is €${Math.round(rr.meanRegret??0).toLocaleString('en-US')} and maximum regret is €${Math.round(rr.maxRegret??0).toLocaleString('en-US')}. Scenario weights are engineering sensitivity weights, not calibrated probabilities.`,['ROBUSTNESS_SENSITIVITY','NPC_OBJECTIVE_UNCHANGED'],['Robustness.candidates','Robustness.withinFraction'],['Scenario weights are not calibrated probabilities.'],[]);}else omit('BOD-095','Robustness and sensitivity',['ROBUSTNESS_NOT_RUN'],'Robustness analysis was not supplied to the report renderer.');
  if(recommended&&rank?.switchingThresholds?.alternatives?.length){const a=rank.switchingThresholds.alternatives[0],parts=a.thresholds.map(t=>t.threshold==null?`${t.parameter}: no crossover in tested bracket (${t.reason})`:`${t.parameter}: crossover at ${t.threshold.toFixed(3)}×`).join('; ');add('BOD-096','Alternative switching thresholds',`The nearest feasible alternative is “${a.name}”, initially €${Math.round(a.baseDeltaNPC).toLocaleString('en-US')} above the recommended NPC. One-variable switching tests give: ${parts}. Each threshold varies one assumption family at a time while holding the others at base values; it is a sensitivity boundary, not a forecast.`,['SWITCHING_THRESHOLDS','ONE_VARIABLE_AT_A_TIME'],['SwitchingThresholds.alternatives'],['One-variable-at-a-time threshold analysis.'],['Threshold brackets are finite and a reported no-crossover result is only dominance within that tested bracket.']);}else omit('BOD-096','Alternative switching thresholds',['SWITCHING_THRESHOLDS_NOT_AVAILABLE'],'No switching-threshold set was supplied for this candidate.');
  return{schema:'thermal-optimizer/bod-model/v0.2',candidate:d.name,recommended,blocks,omitted};
}
function bodParagraphs(project,result,rank=null){return bodDocumentModel(project,result,rank).blocks;}
function bodReportMarkdown(project,result,rank=null){const m=bodDocumentModel(project,result,rank);const body=m.blocks.map(p=>{const meta=[`id: ${p.id}`,`reasons: ${p.reasonCodes.join(', ')}`,`sources: ${p.sourceFields.join(', ')}`,p.assumptions.length?`assumptions: ${p.assumptions.join(', ')}`:'',p.warnings.length?`warnings: ${p.warnings.join(', ')}`:''].filter(Boolean).join(' | ');return`## ${p.title}\n\n${p.text}\n\n<!-- ${meta} -->`;}).join('\n\n');const omitted=m.omitted.length?`\n\n## Omitted / not applicable\n\n${m.omitted.map(x=>`- ${x.id} ${x.title}: ${x.note} [${x.reasonCodes.join(', ')}]`).join('\n')}`:'';return body+omitted;}

function svgEscape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function fmt(x,n=1){return Number.isFinite(x)?Number(x).toFixed(n):'—'}
function schematicSVG(result,snap=result.representative.winterDesign){
  const d=result.design,s=snap||{},tank=result.tank,mode=s.mode??'heating',cool=mode==='cooling';
  const W=1120,H=430;
  const edge=(x1,y1,x2,y2,label)=>`<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2" marker-end="url(#a)"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-7}" text-anchor="middle" font-size="12">${svgEscape(label)}</text></g>`;
  const box=(x,y,w,h,title,lines)=>`<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="currentColor"/><text x="${x+w/2}" y="${y+22}" text-anchor="middle" font-weight="700">${svgEscape(title)}</text>${lines.map((z,i)=>`<text x="${x+w/2}" y="${y+43+i*17}" text-anchor="middle" font-size="12">${svgEscape(z)}</text>`).join('')}</g>`;
  const supply=cool?d.coolingSupply_C:d.busSupply_C,ret=cool?d.coolingReturn_C:d.busReturn_C,terminal=cool?d.coolingTerminal:d.heatingTerminal,termKW=cool?s.deliveredCool_W:s.deliveredHeat_W;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Thermal system conceptual schematic"><defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs><rect width="100%" height="100%" fill="white"/><g fill="#111" color="#111" font-family="system-ui,Segoe UI,sans-serif">
  ${box(30,80,165,100,'Waste heat',[`${fmt(s.directWaste_W/1000)} kW direct`,`${fmt(s.wasteCharge_W/1000)} kW → tank`])}
  ${box(245,80,165,100,cool?'Cooling plant':'Heat pump',[cool?`${fmt(s.cooling_W/1000)} kW cool`:`${fmt(s.hpZone_W/1000)} kW → load`,cool?`EER ${fmt(s.coolingCOP,2)}`:`COP ${fmt(s.COP,2)}`])}
  ${box(460,80,165,100,'Boiler',[`${fmt(s.boiler_W/1000)} kW`,`η ${fmt(d.boilerEfficiency*100,0)} %`])}
  ${box(690,55,180,125,`Buffer · ${tank.model}`,[`${fmt(tank.volume_m3,1)} m³`,`SOC ${fmt(s.tankSOC*100,0)} %`,`top ${fmt(s.tankTop_C,1)} °C`])}
  ${box(905,210,180,115,cool?'Cooling terminal':'Heating terminal',[`${fmt(termKW/1000)} kW`,`${svgEscape(terminal.type)} · ${fmt(supply,0)}/${fmt(ret,0)} °C`,`${fmt(s.flow_m3_h,1)} m³/h`,`v ${fmt(s.velocity_m_s,2)} m/s`])}
  ${box(470,220,235,95,cool?'Chilled-water bus':'Hot-water bus',[`${fmt(supply,0)}/${fmt(ret,0)} °C`,`ΔT ${fmt(Math.abs(supply-ret),0)} K`,`Δp ${fmt(s.dp_Pa/1000,1)} kPa · pump ${fmt(s.pump_W/1000,2)} kW`])}
  ${box(905,360,180,50,'Building',[`${fmt(s.Tair_C,1)} °C air · ${fmt(s.Tmass_C,1)} °C mass`])}
  ${edge(195,130,470,255,`${fmt(s.directWaste_W/1000)} kW`)}
  ${edge(410,130,500,240,cool?`${fmt(s.cooling_W/1000)} kW cooling`:`${fmt(s.hpZone_W/1000)} kW`)}
  ${edge(625,130,560,240,`${fmt(s.boiler_W/1000)} kW`)}
  ${edge(780,180,660,240,`${fmt(s.tankDischarge_W/1000)} kW discharge`)}
  ${edge(705,267,905,267,`${fmt(termKW/1000)} kW`)}
  ${edge(995,325,995,360,cool?'cooling to building':'heating to building')}
  <text x="25" y="25" font-size="14" font-weight="700">${svgEscape(d.name)} · hour ${s.hour??'—'} · ${mode} · outdoor ${fmt(s.Tout_C,1)} °C</text>
  <text x="25" y="405" font-size="12">Conceptual optimization schematic — not a P&amp;ID.</text>
  </g></svg>`;
}

function makeDemoProject(){return{
  profiles:syntheticProfiles({meanOutdoorC:11,seasonalAmplitudeK:10,occupiedStartHour:8,occupiedEndHour:16,occupiedGains_W:35000,unoccupiedGains_W:8000,occupiedVentilation_m3_s:7,unoccupiedVentilation_m3_s:.3,occupiedHotSink_W:22000,unoccupiedHotSink_W:5000,hotSinkTarget_C:55,indoorDewPoint_C:14,outdoorRH:.76,occupiedMoistureGain_kg_s:.0035,unoccupiedMoistureGain_kg_s:.00025}),
  building:{Roa_K_W:0.00016,Ram_K_W:0.00007,Cair_J_K:7e7,Cmass_J_K:1.6e9,initialAir_C:21,initialMass_C:21,comfortMin_C:20,comfortMax_C:23},
  operation:{occupiedComfortMin_C:20,occupiedComfortMax_C:23,unoccupiedHeatSetback_C:14,unoccupiedCoolSetback_C:30,prestartHours:1,airHeatingMaxSupply_C:35},
  humidity:{enabled:true,pressure_Pa:101325,zoneVolume_m3:12000,initialRH:.50,occupiedMaxDewPoint_C:14,unoccupiedMaxDewPoint_C:18},
  economics:{analysisYears:25,discountRate:0.04,energyEscalation:0.01},constraints:{unservedTolerance_J:JfromkWh(2),comfortDegreeHourTolerance:3,humidityDegreeHourTolerance:1,enforceUpperComfort:true},plantRoom_C:15,
};}

function demoDesigns(){const base={hpType:'airWater',hpSink_C:47,boilerEfficiency:0.93,busSupply_C:45,busReturn_C:35,
  heatingTerminal:{type:'radiator',nominal_W:520000},coolingCapacity_W:200000,coolingSupply_C:16,coolingReturn_C:20,coolingTerminal:{type:'fanCoil',nominal_W:200000,airFlow_m3_s:16,coilADP_C:8,bypassFactor:.10,maxCondensate_kg_s:.03},coolingOptions:{quality:.45,evapApproach_K:5,rejectApproach_K:10},
  pipe:{D_m:0.08,L_m:80,K:12,pumpEfficiency:0.55},coolingPipe:{D_m:0.08,L_m:80,K:12,pumpEfficiency:0.55},hpCapex_per_kW:850,boilerCapex_per_kW:180,coolingCapex_per_kW:0,emitterCapex:0,coolingTerminalCapex:18000,fixedOpex_per_year:1200,hpReplacementYear:18,hpReplacementFraction:0.55,
  wasteHXApproach_K:3,airside:{enabled:true,designFlow_m3_s:7,D_m:1.4,L_m:120,K:12,fixedPressure_Pa:450,fanEfficiency:.68,motorEfficiency:.90,ductCapex_per_m2:70,ductFittingMultiplier:1.25,fanCapex_per_kW:350}};
  return[
    {...base,name:'A · HP80 + boiler180 · no tank',hpCapacity_W:80000,boilerCapacity_W:180000,tank:{model:'mixed',volume_m3:0,initialSOC:0,capexPerM3:900}},
    {...base,name:'B · HP80 + boiler180 · mixed 20m³',hpCapacity_W:80000,boilerCapacity_W:180000,tank:{model:'mixed',volume_m3:20,initialSOC:0.5,Thot_C:47,Tcold_C:30,maxCharge_W:80000,maxDischarge_W:80000,capexFixed:5000,capexPerM3:850}},
    {...base,name:'C · HP80 + boiler180 · finite stratified 20m³',hpCapacity_W:80000,boilerCapacity_W:180000,tank:{model:'finiteStratified',nodes:8,volume_m3:20,initialSOC:0.5,Thot_C:47,Tcold_C:30,maxCharge_W:80000,maxDischarge_W:80000,capexFixed:5000,capexPerM3:850,stratificationPremium:1.12}},
    {...base,name:'D · HP80 + boiler180 · ideal stratified 20m³ [BOUND]',comparisonOnly:true,hpCapacity_W:80000,boilerCapacity_W:180000,tank:{model:'idealStratified',volume_m3:20,initialSOC:0.5,Thot_C:47,Tcold_C:30,maxCharge_W:80000,maxDischarge_W:80000,capexFixed:5000,capexPerM3:850,stratificationPremium:1.12}},
    {...base,name:'E · HP80 + boiler180 · condenser recovery',hpCapacity_W:80000,boilerCapacity_W:180000,heatRecovery:{enabled:true,maxRecovery_W:100000,approach_K:3,allowTankCharge:false,capex:14000},tank:{model:'mixed',volume_m3:0,initialSOC:0}},
    {...base,name:'F · ventilation air + local coils · HP100 + boiler150',hpCapacity_W:100000,boilerCapacity_W:150000,heatingTerminal:{type:'airPlusLocalCoils',nominal_W:260000,localCoil_W:150000},emitterCapex:24000,tank:{model:'mixed',volume_m3:0,initialSOC:0}},
    {...base,name:'G · low-T floor · HP120 + boiler140 · finite 10m³',hpCapacity_W:120000,hpSink_C:37,boilerCapacity_W:140000,busSupply_C:35,busReturn_C:30,heatingTerminal:{type:'floor',area_m2:3200,coveringR_m2K_W:.04,spacing_m:.15,surfaceLimit_C:29},coolingCapacity_W:100000,coolingSupply_C:18,coolingReturn_C:21,coolingTerminal:{type:'floor',area_m2:3200,coveringR_m2K_W:.04,spacing_m:.15,surfaceMin_C:19,dewpointMargin_K:2,maxFlux_W_m2:35},coolingTerminalCapex:38000,tank:{model:'finiteStratified',nodes:8,volume_m3:10,initialSOC:0.5,Thot_C:40,Tcold_C:27,maxCharge_W:90000,maxDischarge_W:90000,capexFixed:4500,capexPerM3:900,stratificationPremium:1.12}},
  ];}


function runBenchmarks(){
  const cases=[];
  const add=(id,group,kind,source,actual,expected,tolerance,notes='')=>{
    const abs=Math.abs(actual-expected),limit=tolerance.abs??Math.abs(expected)*(tolerance.rel??0);
    cases.push({id,group,kind,source,actual,expected,absoluteError:abs,tolerance,ok:abs<=limit,notes});
  };
  add('BM-PSY-001','psychrometrics','published-reference',
    {title:'PsychroLib API example / ASHRAE Handbook Fundamentals 2017',url:'https://psychrometrics.github.io/psychrolib/api_docs.html',reference:'25 °C dry bulb, 80 % RH -> dew point 21.309397163661785 °C'},
    dewPointFromHumidityRatio(humidityRatioFromRH(25,0.80,101325),101325),21.309397163661785,{abs:1e-6},
    'PsychroLib documents this numerical example and states that its equations implement ASHRAE Handbook—Fundamentals.');
  add('BM-FLOOR-001','floor-emission','published-equation',
    {title:'CIBSE Guide B / BS EN 1264 basic characteristic',url:'https://ierga.com/hr/wp-content/uploads/sites/2/2017/10/CIBSE-Guide-B-Heating-Ventilating-Air-Conditioning-And-Refrigeration-Fixed.pdf',reference:'q = 8.92 (t_fm - t_i)^1.1'},
    surfaceOutputWm2(29,20),8.92*Math.pow(9,1.1),{rel:1e-12},
    'General-area surface limit example: 29 °C floor, 20 °C room gives about 100 W/m².');
  add('BM-RAD-001','radiator-emission','published-equation',
    {title:'Kermi convector technical data / EN 442 logarithmic conversion',url:'https://radiaatorikeskus.ee/wp-content/uploads/2023/10/Kermi-konvektorite-tehniline-andmeleht-ENG.pdf',reference:'Phi = Phi_SL (Delta t_ln / 49.83)^n; Delta t_ln logarithmic mean excess'},
    1979*emitterFactor(40,33,20,'radiator',1.2803),471.39623610371854,{abs:1e-6},
    'Reference data from an EN 442 chamber example: Phi_SL=1979 W, n=1.2803; evaluated at 40/33/20 °C with the published logarithmic law.');
  add('BM-HX-001','heat-exchanger','closed-form-identity',
    {title:'Counterflow epsilon-NTU equal-capacity limit',reference:'epsilon = NTU/(1+NTU) for C*=1; NTU=1 -> 0.5'},
    effNTUCounterflow(1,1),0.5,{abs:1e-12});
  add('BM-HX-FILM-001','heat-exchanger-film','published-reference',
    {title:'Gnielinski 1976 internal turbulent-flow correlation',url:'https://ht.readthedocs.io/en/release/_modules/ht/conv_internal.html',reference:'Heat Transfer 1.2.0 documented example: Re=1e5, Pr=1.2, Darcy f=0.0185 -> Nu=254.62682749359632'},
    internalTubeNusselt({Re:1e5,Pr:1.2,frictionFactor:0.0185}).Nu,254.62682749359632,{abs:1e-10},
    'Published-correlation regression for the new tube-side film model; Gnielinski validity is bounded to 0.5 < Pr <= 2000 and 2300 <= Re <= 5e6 in the cited implementation.');
  add('BM-HYD-001','hydraulics','closed-form-identity',
    {title:'Darcy laminar friction identity',reference:'f_D = 64/Re; Re=1000 -> 0.064'},
    frictionFactor(1000,0),0.064,{abs:1e-12});
  add('BM-FLS-001','finite-line-source','published-reference',
    {title:'pygfunction finite_line_source example',url:'https://pygfunction.readthedocs.io/en/stable/modules/heat_transfer.html',reference:'H1=H2=150 m, D1=D2=4 m, distance=5 m, alpha=1e-6 m2/s, t=4 weeks -> h=0.0110473635393'},
    finiteLineSourceResponse({time_s:4*168*3600,alpha_m2_s:1e-6,distance_m:5,H1_m:150,D1_m:4,H2_m:150,D2_m:4,quadratureN:2048}),0.0110473635393,{abs:2e-8},
    'Independent numerical check of the vertical FLS primitive used for geometry-generated screening response tables.');
  add('BM-GROUND-001','borefield-g-function','published-reference',
    {title:'ASHRAE Handbook Geothermal Energy, Example 2',url:'https://handbook.ashrae.org/Handbooks/A15/SI/a15_ch34/a15_ch34_si.aspx',reference:'3x2 field; T0=15 C, k=1.5 W/mK, 10 y extraction 5 W/m, g=12.3 -> Tb=8.5 C'},
    borefieldWallTemperatureFromG({undisturbedTemp_C:15,qToGround_W_per_m:-5,groundConductivity_W_mK:1.5,g:12.3}),8.5,{abs:0.05},
    'Direct check of the published g-function temperature-response relation.');
  add('BM-RB-001','borehole-resistance','published-table',
    {title:'ASHRAE Handbook 2023 Chapter 35 Table 5',url:'https://handbook.ashrae.org/Handbooks/A23/SI/A23_Ch35/a23_ch35_si.aspx',reference:'25 mm DR11 HDPE single U-tube, location B, 100 mm bore, Re=4000, grout k=1.40 W/(m K) -> Rb=0.14 m K/W'},
    lookupAshraeBoreholeResistance({reynolds:4000,groutConductivity_W_mK:1.4}).value_mK_W,.14,{abs:1e-12},
    'Exact provenance-bearing table lookup; it validates the supported library point, not arbitrary borehole-resistance prediction.');
  add('BM-UBWT-001','borefield-segmented-UBWT','published-reference',
    {title:'pygfunction g-function module uniform_temperature example',url:'https://pygfunction.readthedocs.io/en/v2.0.0/gfunction.html',reference:'two vertical boreholes H=150 m, D=4 m, rb=0.075 m, spacing=5 m, alpha=1e-6 m2/s; t=1e7 s -> g=4.33406497'},
    generateSegmentedUBWTFLSGFunction({rows:1,cols:2,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,nSegments:12,segmentPolicy:'equal',groundDiffusivity_m2_s:1e-6,times_s:[1e7],quadratureConvergence:{initialN:32,maxN:1024,absTol:1e-8,relTol:1e-8}}).g[0],4.33406497,{abs:5e-5},
    'Legacy pygfunction 2.0 numerical point uses 12 equal segments; this validates one time point, not spatial convergence.');
  {const times=[1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11],ref=[.75978079,1.84859851,2.98852756,4.33406497,6.27830732,8.05746656,8.93697282,9.04925079],calc=generateSegmentedUBWTFLSGFunction({rows:1,cols:2,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,nSegments:12,segmentPolicy:'equal',groundDiffusivity_m2_s:1e-6,times_s:times,quadratureConvergence:{initialN:32,maxN:1024,absTol:1e-8,relTol:1e-8}}).g,maxErr=Math.max(...calc.map((v,i)=>Math.abs(v-ref[i])));add('BM-UBWT-002','borefield-segmented-UBWT-transient','published-reference',{title:'pygfunction 2.0 uniform_temperature time-series example',url:'https://pygfunction.readthedocs.io/en/v2.0.0/gfunction.html',reference:'two 150 m boreholes, 5 m spacing, 12 equal segments; t=1e4..1e11 s published g-function array'},maxErr,0,{abs:2e-7},'Validates transient BC-III load redistribution and temporal superposition over eight decades of time for the published geometry.');}
  {const ph=steamCondensateExchange({mdot_kg_s:1,inletState:{phase:'vapor',pressure_Pa:101325,enthalpy_J_kg:2675529.32550072,propertyModelId:'CoolProp-8.0.0'},outletState:{phase:'liquid',pressure_Pa:101325,enthalpy_J_kg:419057.7330939922,propertyModelId:'CoolProp-8.0.0'}});add('BM-PH-001','steam-condensation-p-h','published-reference',{title:'CoolProp 8.0.0 High-Level Interface saturation example',url:'https://coolprop.org/coolprop/HighLevelAPI.html',reference:'Water at 1 atm: saturated vapor h=2675529.32550072 J/kg, saturated liquid h=419057.7330939922 J/kg; latent heat=2256471.592406728 J/kg'},ph.deltaH_J_kg,2256471.592406728,{abs:1e-6},'Validates enthalpy-difference steam/condensate interface and explicitly avoids constant-cp treatment through phase change.');}
  const r=.05,N=10,c=1000,cap=5000;
  add('BM-ECO-001','economics','closed-form-identity',
    {title:'Level annuity present-value identity',reference:'PV = C(1-(1+r)^-N)/r'},
    netPresentCost({analysisYears:N,discountRate:r,capex0:cap,opexAnnual:c}).npc,
    cap+c*(1-Math.pow(1+r,-N))/r,{rel:1e-12});
  const pass=cases.filter(x=>x.ok).length;
  return{
    schema:'thermal-optimizer/benchmark-suite/v0.1',
    benchmarked:true,
    independentlyValidated:false,
    passed:pass,total:cases.length,failed:cases.length-pass,
    scope:{
      externallyGrounded:['psychrometrics','floor-emission','radiator-emission','borefield-g-function','borehole-resistance','borefield-segmented-UBWT','borefield-segmented-UBWT-transient','steam-condensation-p-h'],
      closedForm:['heat-exchanger','hydraulics','economics'],
      notExternallyBenchmarked:['generic heat-pump quality factors/capacity derating','candidate topology search','8760 dispatch policy','2R2C parameter defaults','cost defaults','refrigerant property backend/state generation']
    },
    cases
  };
}

function runSelfTests(){const tests=[];const test=(name,fn)=>{try{fn();tests.push({name,ok:true})}catch(e){tests.push({name,ok:false,error:e.message})}};
  test('EN442 rating point',()=>{if(!near(dtLog(75,65,20),49.832886,2e-8))throw Error('dtLog');});
  test('modular heat-pump plant N+1 assessment',()=>{const plant=normalizeHeatPumpPlant({hpCapacity_W:150000,heatPumpPlant:{moduleCount:3,moduleCapacity_W:50000}}),rel=normalizeReliability({mode:'N+1'}),a=assessHeatPlantReliability({plant,reliability:rel,designLoad_W:100000});if(!a.meetsImmediate||a.capacityAfterFailure_W!==100000)throw Error(JSON.stringify(a));});
  test('three 33 percent modules are not full N+1',()=>{const plant=normalizeHeatPumpPlant({hpCapacity_W:99000,heatPumpPlant:{moduleCount:3,moduleCapacity_W:33000}}),rel=normalizeReliability({mode:'N+1'}),a=assessHeatPlantReliability({plant,reliability:rel,designLoad_W:99000});if(a.meetsImmediate)throw Error(JSON.stringify(a));});
  test('cycling buffer falls with smaller staged module',()=>{const one=minimumBufferForCycling({plant:normalizeHeatPumpPlant({hpCapacity_W:120000,heatPumpPlant:{moduleCount:1,moduleCapacity_W:120000,minModulationFraction:.25}})}),three=minimumBufferForCycling({plant:normalizeHeatPumpPlant({hpCapacity_W:120000,heatPumpPlant:{moduleCount:3,moduleCapacity_W:40000,minModulationFraction:.25}})});if(!(three.volume_m3<one.volume_m3))throw Error(JSON.stringify({one,three}));});
  test('plant variant generator includes module and redundancy choices',()=>{const v=generateHeatPumpPlantVariants({designLoad_W:100000,moduleCounts:[1,2,3],moduleFractions:[.5,1],reliabilityModes:['none','N+1']});if(v.length!==12||!v.some(x=>x.moduleCount===3&&x.reliabilityMode==='N+1'))throw Error(String(v.length));});
  test('HP defrost convention',()=>{const b=0.42*(35+273.15)/(35-2);if(!near(heatPumpCOP(2,35,'airWater'),b*0.88,1e-12))throw Error('COP')});
  test('counterflow equal-capacity limit',()=>{if(!near(effNTUCounterflow(1,1),0.5,1e-12))throw Error('eps')});
  test('HX energy balance',()=>{const x=directHX({UA_W_K:10000,hotCapacity_W_K:5000,coldCapacity_W_K:8000,hotIn_C:40,coldIn_C:10});if(!near((40-x.hotOut_C)*5000,x.Q_W)||!near((x.coldOut_C-10)*8000,x.Q_W))throw Error('balance')});
  test('laminar friction',()=>{if(!near(frictionFactor(1000,0),0.064,1e-12))throw Error('f')});
  test('Colebrook matches Moody core',()=>{if(!near(colebrookFriction(1e5,1e-4),0.01851386607747164,1e-12))throw Error('colebrook')});
  test('Moody transition endpoints',()=>{if(!near(frictionFactor(2300,1e-4),64/2300,1e-12)||!near(frictionFactor(4000,1e-4),colebrookFriction(4000,1e-4),1e-12))throw Error('transition')});
  test('NPC closed-form annuity',()=>{const r=.05,N=10,c=1000,cap=5000,x=netPresentCost({analysisYears:N,discountRate:r,capex0:cap,opexAnnual:c}),ref=cap+c*(1-Math.pow(1+r,-N))/r;if(!near(x.npc,ref,1e-12))throw Error('npc')});
  test('mixed tank energy round-trip',()=>{const t=createTankState({model:'mixed',volume_m3:10,Tcold_C:30,Thot_C:50,initialSOC:0,UA_W_K:0,chargeEfficiency:1,dischargeEfficiency:1});const c=tankCharge(t,10000,50,HOUR_S),d=tankDischarge(t,10000,30,HOUR_S);if(!near(c,10000)||!near(d,10000)||!near(t.E_J,0,1e-12,1e-5))throw Error('tank')});
  test('mixed tank respects delivery temperature grade',()=>{const t=createTankState({model:'mixed',volume_m3:1,Tcold_C:30,Thot_C:50,initialSOC:.5,UA_W_K:0,chargeEfficiency:1,dischargeEfficiency:1});if(tankDischarge(t,1e6,45,HOUR_S)!==0)throw Error('should be unavailable');const expected=1*998*4180*(40-35)/HOUR_S,d=tankDischarge(t,1e6,35,HOUR_S);if(!near(d,expected,1e-12,1e-6))throw Error(`${d} != ${expected}`)});
  test('stratified tank keeps hot top',()=>{const t=createTankState({model:'idealStratified',volume_m3:10,Tcold_C:30,Thot_C:50,initialSOC:.1,UA_W_K:0});if(!near(tankTopTemperatureC(t),50,1e-12))throw Error('top')});
  test('finite stratified tank preserves energy and thermocline',()=>{const t=createTankState({model:'finiteStratified',nodes:8,volume_m3:8,Tcold_C:30,Thot_C:50,initialSOC:.25,UA_W_K:0,axialConductance_W_K:0,chargeEfficiency:1,dischargeEfficiency:1});if(!near(tankSOC(t),.25,1e-12)||!near(tankTopTemperatureC(t),50,1e-12))throw Error('init');const e0=t.E_J,c=tankCharge(t,10000,50,HOUR_S);if(!near(t.E_J,e0+c*HOUR_S,1e-12,1e-4))throw Error('charge energy');for(let i=1;i<t.nodeTemps_C.length;i++)if(t.nodeTemps_C[i-1]+1e-12<t.nodeTemps_C[i])throw Error('unstable stratification')});
  test('finite stratified discharge respects delivery temperature',()=>{const t=createTankState({model:'finiteStratified',nodes:4,volume_m3:4,Tcold_C:30,Thot_C:50,initialSOC:.25,UA_W_K:0,axialConductance_W_K:0,chargeEfficiency:1,dischargeEfficiency:1});const d=tankDischarge(t,1e6,45,HOUR_S);if(!(d>0)||tankTopTemperatureC(t)<45-1e-9)throw Error('delivery floor')});
  test('2R2C equilibrium',()=>{const b=createBuildingState({Roa_K_W:.001,Ram_K_W:.001,Cair_J_K:1e8,Cmass_J_K:1e9,initialAir_C:20,initialMass_C:20,comfortMin_C:18,comfortMax_C:24});building2R2CStep(b,{Tout_C:20,gains_W:0,Qhvac_W:0});if(!near(b.Tair_C,20,1e-12)||!near(b.Tmass_C,20,1e-12))throw Error('equilibrium')});
  test('2R2C target power hits target',()=>{const b=createBuildingState({initialAir_C:20,initialMass_C:20,comfortMin_C:18,comfortMax_C:24});const q=hvacPowerForTarget(b,{Tout_C:5,gains_W:10000,targetAir_C:21,min_W:0,max_W:1e7});const c={spec:b.spec,Tair_C:b.Tair_C,Tmass_C:b.Tmass_C,degreeHoursBelow:0,degreeHoursAbove:0};building2R2CStep(c,{Tout_C:5,gains_W:10000,Qhvac_W:q});if(!near(c.Tair_C,21,1e-10))throw Error(`${c.Tair_C}`)});
  test('floor heating surface cap',()=>{const x=floorHeatingCapacityW({area_m2:100,supply_C:80,return_C:70,coveringR_m2K_W:0,spacing_m:.15,surfaceLimit_C:29},20);if(x.surface_C>29+1e-9||x.capacity_W<=0)throw Error('surface cap')});
  test('floor heating low-water limit',()=>{const x=floorHeatingCapacityW({area_m2:100,supply_C:30,return_C:26,coveringR_m2K_W:.1,spacing_m:.15,surfaceLimit_C:29},20);if(!(x.surface_C<29&&x.meanWater_C===28&&x.capacity_W>0))throw Error(JSON.stringify(x))});
  test('floor cooling dew-point guard',()=>{const spec={area_m2:100,supply_C:10,return_C:14,coveringR_m2K_W:.01,surfaceMin_C:18,dewpointMargin_K:2,maxFlux_W_m2:100},a=floorCoolingCapacityW(spec,25,18),b=floorCoolingCapacityW(spec,25,14);if(!(a.capacity_W<b.capacity_W&&a.surface_C>=20-1e-9&&b.surface_C>=18-1e-9))throw Error(`${a.capacity_W}/${b.capacity_W}`)});
  test('cooling COP improves with cooler rejection air',()=>{if(!(coolingCOP(16,20)>coolingCOP(16,35)))throw Error('EER trend')});
  test('upper comfort makes no-cooling candidate infeasible',()=>{const p=makeDemoProject(),d={...demoDesigns()[0],coolingCapacity_W:0,coolingTerminal:{type:'fanCoil',nominal_W:0}},r=simulateCandidate(p,d);if(r.feasible||!(r.comfort.degreeHoursAbove>p.constraints.comfortDegreeHourTolerance))throw Error(`above=${r.comfort.degreeHoursAbove}`)});
  test('active cooling respects upper comfort',()=>{const p=makeDemoProject(),r=simulateCandidate(p,demoDesigns()[0]);if(!(r.totals.zoneCool_J>0)||r.comfort.degreeHoursAbove>p.constraints.comfortDegreeHourTolerance+1e-9)throw Error(`cool=${r.totals.zoneCool_J} above=${r.comfort.degreeHoursAbove}`)});
  test('demo candidate deterministic',()=>{const p=makeDemoProject(),d=demoDesigns()[2],a=simulateCandidate(p,d),b=simulateCandidate(p,d);const clean=x=>JSON.stringify({feasible:x.feasible,npc:x.npc,capex0:x.capex0,annualOpex:x.annualOpex,totals:x.totals,peaks:x.peaks,comfort:x.comfort,tank:x.tank,representative:x.representative});if(clean(a)!==clean(b))throw Error('nondeterministic')});
  test('worker preamble reproduces candidate result',()=>{const p=makeDemoProject(),ds=demoDesigns(),factory=new Function(thermalWorkerPreamble()+`\nreturn (${onEvaluateCandidateCase.toString()});`),handler=factory(),a=handler({parameters:{i:2}},{params:{project:p,designs:ds}}),b=simulateCandidate(p,ds[2]);const clean=x=>JSON.stringify({feasible:x.feasible,npc:x.npc,annualOpex:x.annualOpex,totals:x.totals,peaks:x.peaks,comfort:x.comfort,tank:x.tank,representative:x.representative});if(clean(a)!==clean(b))throw Error('worker parity')});
  test('condenser recovery energy balance',()=>{const x=condenserRecoveryState({cooling_W:100000,chilledSupply_C:7,outdoor_C:30,hotSinkTarget_C:55,recoveryApproach_K:3,maxRecovery_W:200000,coolingOptions:{quality:.45,evapApproach_K:5,rejectApproach_K:10}});if(!near(x.rejected_W,100000+x.electric_W,1e-12)||x.recoverable_W!==x.rejected_W||x.reject_C<58)throw Error(JSON.stringify(x))});
  test('hotter recovery sink penalizes cooling COP',()=>{const a=condenserRecoveryState({cooling_W:100000,chilledSupply_C:7,outdoor_C:25,hotSinkTarget_C:35,recoveryApproach_K:3,coolingOptions:{quality:.45,evapApproach_K:5,rejectApproach_K:10}}),b=condenserRecoveryState({cooling_W:100000,chilledSupply_C:7,outdoor_C:25,hotSinkTarget_C:60,recoveryApproach_K:3,coolingOptions:{quality:.45,evapApproach_K:5,rejectApproach_K:10}});if(!(b.COP<a.COP&&b.electric_W>a.electric_W))throw Error(`${a.COP}/${b.COP}`)});
  test('recovery candidate offsets hot-sink backup heat',()=>{const p=makeDemoProject(),ds=demoDesigns(),base=simulateCandidate(p,ds[0]),rec=simulateCandidate(p,ds.find(x=>x.heatRecovery?.enabled));if(!(rec.totals.heatRecovered_J>0&&rec.totals.hotSinkBackup_J<base.totals.hotSinkBackup_J))throw Error('no recovery benefit')});
  test('intermittent operation applies setback',()=>{const p=makeDemoProject(),b=operationBounds(p,p.profiles,2);if(b.occupied||b.comfortMin_C!==14)throw Error(JSON.stringify(b))});
  test('ventilation-air capacity follows airflow',()=>{const o=normalizeOperation(makeDemoProject()),a=ventilationAirHeatingCapacityW(1,20,o),b=ventilationAirHeatingCapacityW(2,20,o);if(!near(b,2*a,1e-12)||!(a>0))throw Error(`${a}/${b}`)});
  test('floor delivery couples predominantly to mass',()=>{if(deliveryToMassFraction({type:'floor'})<.8||deliveryToMassFraction({type:'ventilationAir'})!==0)throw Error('delivery split')});
  test('air plus local coils split respects ventilation airflow',()=>{const o=normalizeOperation(makeDemoProject()),x=heatingDeliverySplit({type:'airPlusLocalCoils',localCoil_W:50000},80000,2,20,o),cap=ventilationAirHeatingCapacityW(2,20,o);if(!near(x.air_W,cap,1e-12)||!near(x.localCoil_W,80000-cap,1e-12)||!near(x.hydronic_W,x.localCoil_W,1e-12))throw Error(JSON.stringify(x))});
  test('ideal stratified bound cannot win ranking',()=>{const p=makeDemoProject(),r=rankCandidates(p,demoDesigns());if(r.best?.design.comparisonOnly||!r.comparison.some(x=>x.design.tank.model==='idealStratified'))throw Error('comparison bound leaked into winner')});
  test('intermittent occupancy penalizes mass-coupled floor warm-up',()=>{const p=makeDemoProject(),r=rankCandidates(p,demoDesigns()),air=r.all.find(x=>x.design.heatingTerminal.type==='airPlusLocalCoils'),floor=r.all.find(x=>x.design.heatingTerminal.type==='floor');if(!air.feasible||floor.feasible||!(floor.comfort.occupiedDegreeHoursBelow>air.comfort.occupiedDegreeHoursBelow))throw Error(`${air.feasible}/${floor.feasible}/${air.comfort.occupiedDegreeHoursBelow}/${floor.comfort.occupiedDegreeHoursBelow}`)});
  test('psychrometric saturation and dew-point inversion',()=>{const x=humidityRatioFromRH(25,.5,101325),td=dewPointFromHumidityRatio(x,101325);if(!(x>.009&&x<.011)||Math.abs(td-13.86)>.15)throw Error(`${x}/${td}`)});
  test('condensing coil capacity falls to zero without air flow',()=>{const x=dehumidificationCapacityKgS({type:'fanCoil',airFlow_m3_s:0,coilADP_C:8,bypassFactor:.1},25,.012,101325);if(x!==0)throw Error(`${x}`)});
  test('latent load consumes cooling capacity',()=>{const p=makeDemoProject(),d=demoDesigns()[0],r=simulateCandidate(p,d);if(!(r.totals.latentCooling_J>0&&r.totals.condensate_kg>0&&r.totals.coolingRejected_J>r.totals.zoneCool_J))throw Error(JSON.stringify({lat:r.totals.latentCooling_J,c:r.totals.condensate_kg,rej:r.totals.coolingRejected_J,sens:r.totals.zoneCool_J}))});
  test('floor cooling cannot silently dehumidify',()=>{const p=makeDemoProject(),d=demoDesigns().find(x=>x.coolingTerminal?.type==='floor'),r=simulateCandidate(p,d);if(r.totals.condensate_kg!==0||r.humidity.occupiedDewPointDegreeHoursAbove<=0)throw Error(JSON.stringify(r.humidity))});
  test('airside pressure and fan power rise with airflow',()=>{const a=normalizeAirside({enabled:true,designFlow_m3_s:4,D_m:1,L_m:50,K:5,fixedPressure_Pa:300}),x=airsidePerformance(a,2),y=airsidePerformance(a,4);if(!(y.totalDp_Pa>x.totalDp_Pa*3.5&&y.fan_W>x.fan_W*7))throw Error(JSON.stringify({x,y}));});
  test('airside fan electricity and capex enter candidate economics',()=>{const p=makeDemoProject(),d=demoDesigns()[0],r=simulateCandidate(p,d),off=simulateCandidate(p,{...d,airside:{enabled:false}});if(!(r.totals.fanElectricity_J>0&&r.capex0>off.capex0&&r.annualOpex>off.annualOpex&&r.peaks.airDp_Pa>0))throw Error(JSON.stringify({fan:r.totals.fanElectricity_J,cap:r.capex0-off.capex0,op:r.annualOpex-off.annualOpex,dp:r.peaks.airDp_Pa}));});
  test('BoD nonwinner ranking wording is signed correctly',()=>{const p=makeDemoProject(),rank=rankCandidates(p,demoDesigns()),rec=rank.all.find(x=>x.design.heatRecovery?.enabled),md=bodReportMarkdown(p,rec,rank);if(!md.includes('not the minimum-NPC solution')||md.includes('€-'))throw Error('ranking wording')});
  test('BoD report is composable and populated',()=>{const p=makeDemoProject(),rank=rankCandidates(p,demoDesigns()),r=rank.best,md=bodReportMarkdown(p,r,rank);for(const q of['Design basis','Building operation','Humidity control','€','h/year','Limitations'])if(!md.includes(q))throw Error(`missing ${q}`);if(!bodParagraphs(p,r,rank).every(x=>x.id&&x.reasonCodes))throw Error('paragraph contract')});
  test('BoD v0.2 metadata contract is populated',()=>{const p=makeDemoProject(),rank=rankCandidates(p,demoDesigns()),m=bodDocumentModel(p,rank.best,rank);if(m.schema!=='thermal-optimizer/bod-model/v0.2'||!m.blocks.every(x=>Array.isArray(x.sourceFields)&&Array.isArray(x.assumptions)&&Array.isArray(x.warnings)))throw Error('BoD metadata contract');for(const id of['BOD-015','BOD-046','BOD-060','BOD-070','BOD-080'])if(!m.blocks.some(x=>x.id===id))throw Error(`missing ${id}`);});
  test('BoD omitted registry explains non-applicable blocks',()=>{const p=makeDemoProject();p.humidity={enabled:false};p.profiles.hotSinkDemand_W=new Float64Array(p.profiles.outdoor_C.length);const r=rankCandidates(p,demoDesigns()),m=bodDocumentModel(p,r.best,r);if(!m.omitted.some(x=>x.id==='BOD-046')||!m.omitted.some(x=>x.id==='BOD-055'))throw Error(JSON.stringify(m.omitted));});
  test('SVG contains heating and cooling principal quantities',()=>{const p=makeDemoProject(),r=simulateCandidate(p,demoDesigns()[2]);const a=schematicSVG(r),b=schematicSVG(r,r.representative.summerDesign);for(const q of['COP','m³/h','Δp','SOC','°C'])if(!a.includes(q))throw Error(`missing ${q}`);for(const q of['EER','cooling','Chilled-water'])if(!b.includes(q))throw Error(`missing ${q}`)});
  test('ASHRAE 3x2 g-function example gives 8.5 C wall temperature',()=>{const T=borefieldWallTemperatureFromG({undisturbedTemp_C:15,qToGround_W_per_m:-5,groundConductivity_W_mK:1.5,g:12.3});if(Math.abs(T-8.474)<0.03!==true)throw Error(String(T));});
  test('g-function superposition preserves constant-load response',()=>{const H=100,a=1.12e-6,ts=H*H/(9*a),t=10*365.25*86400,ln=Math.log(t/ts),gf={lnTts:[ln-1,ln,ln+1],g:[11.3,12.3,13.3]},r=borefieldGFunctionSuperposition({undisturbedTemp_C:15,loads_W:[-3000],step_s:t,totalLength_m:600,boreholeLength_m:H,groundConductivity_W_mK:1.5,groundDiffusivity_m2_s:a,gFunction:gf});if(Math.abs(r[0]-8.474)>0.03)throw Error(JSON.stringify(r));});
  test('finite line source reproduces pygfunction example',()=>{const h=finiteLineSourceResponse({time_s:4*168*3600,alpha_m2_s:1e-6,distance_m:5,H1_m:150,D1_m:4,H2_m:150,D2_m:4,quadratureN:2048});if(Math.abs(h-0.0110473635393)>2e-8)throw Error(String(h));});
  test('generated rectangular FLS response grows with time',()=>{const gf=generateUniformHeatExtractionFLSGFunction({rows:2,cols:3,spacing_m:5,boreholeLength_m:100,groundDiffusivity_m2_s:1.12e-6,lnTts:[-10,-6,-2],quadratureN:512});if(!(gf.g.length===3&&gf.g[0]<gf.g[1]&&gf.g[1]<gf.g[2]&&gf.boreholes===6))throw Error(JSON.stringify(gf));});
  test('mean fluid temperature applies borehole resistance with sign',()=>{const hot=meanFluidTemperatureFromWall({wallTemp_C:12,qToGround_W_per_m:20,effectiveBoreholeResistance_mK_W:.1}),cold=meanFluidTemperatureFromWall({wallTemp_C:12,qToGround_W_per_m:-20,effectiveBoreholeResistance_mK_W:.1});if(!(near(hot,14)&&near(cold,10)))throw Error(JSON.stringify({hot,cold}));});
  test('borefield geometry candidates expose count length spacing and generated response',()=>{const c=generateBorefieldGeometryCandidates({rowsChoices:[2],colsChoices:[2,3],lengthChoices_m:[80,120],spacingChoices_m:[5],lnTts:[-8,-4,0]});if(!(c.length===4&&c.every(x=>x.gFunction.g.length===3)&&c.some(x=>x.boreholes===6&&x.boreholeLength_m===120)))throw Error(String(c.length));});
  test('multi-year borefield screen reports drift and limits',()=>{const lt=normalizeGroundLongTerm({enabled:true,years:10,boreholes:6,boreholeLength_m:100,groundConductivity_W_mK:1.5,groundDiffusivity_m2_s:1.12e-6,minWallTemp_C:0,maxWallTemp_C:30,gFunction:{lnTts:[-8.75,-5.66,-1.15,0],g:[1.55,3.99,12.3,14]}}),m=Array(12).fill(-5*600*(365.25/12*86400)),r=borefieldLongTermScreen({undisturbedTemp_C:15,monthlyNetToGround_J:m,longTerm:lt});if(!(r.available&&r.finalWallTemp_C<15&&r.minWallTemp_C<15))throw Error(JSON.stringify(r));});
  test('borehole resistance can make fluid limit governing while wall remains acceptable',()=>{const lt=normalizeGroundLongTerm({enabled:true,years:1,boreholes:6,boreholeLength_m:100,groundConductivity_W_mK:1.5,groundDiffusivity_m2_s:1.12e-6,effectiveBoreholeResistance_mK_W:.15,minWallTemp_C:0,maxWallTemp_C:30,minMeanFluidTemp_C:8,gFunction:{lnTts:[-10,-6,-2,0],g:[.5,3,10,14]}}),m=Array(12).fill(-8*600*(365.25/12*86400)),r=borefieldLongTermScreen({undisturbedTemp_C:15,monthlyNetToGround_J:m,longTerm:lt});if(!(r.withinWallTemperatureLimits&&!r.withinMeanFluidTemperatureLimits&&!r.withinTemperatureLimits&&r.minMeanFluidTemp_C<r.minWallTemp_C))throw Error(JSON.stringify(r));});
  test('ASHRAE Rb library exact point',()=>{const r=lookupAshraeBoreholeResistance({reynolds:4000,groutConductivity_W_mK:1.4});if(!(r.available&&near(r.value_mK_W,.14,1e-12)&&!r.interpolated))throw Error(JSON.stringify(r));});
  test('ASHRAE Rb library interpolates only inside supported axes',()=>{const r=lookupAshraeBoreholeResistance({reynolds:3000,groutConductivity_W_mK:1.05}),x=lookupAshraeBoreholeResistance({reynolds:12000,groutConductivity_W_mK:1.4});if(!(r.available&&r.interpolated&&r.value_mK_W>.14&&r.value_mK_W<.26&&!x.available))throw Error(JSON.stringify({r,x}));});
  test('explicit Rb overrides library selector',()=>{const r=resolveEffectiveBoreholeResistance({effectiveBoreholeResistance_mK_W:.123,rbModel:{type:'ashraeTable5SingleU',reynolds:4000,groutConductivity_W_mK:1.4}});if(!(r.available&&near(r.value_mK_W,.123)&&r.method==='explicit'))throw Error(JSON.stringify(r));});
  test('short-term extraction pulse worsens borefield minimum temperature',()=>{const lt=normalizeGroundLongTerm({enabled:true,years:1,rows:2,cols:3,boreholes:6,boreholeLength_m:100,spacing_m:5,boreholeRadius_m:.075,buriedDepth_m:4,groundConductivity_W_mK:1.5,groundDiffusivity_m2_s:1.12e-6,effectiveBoreholeResistance_mK_W:.14,shortTermPeak:{enabled:true,duration_s:6*3600,incrementalExtraction_W:60000},gFunction:{lnTts:[-10,-6,-2,0],g:[.5,3,10,14]}}),m=Array(12).fill(-3*600*(365.25/12*86400)),r=borefieldLongTermScreen({undisturbedTemp_C:15,monthlyNetToGround_J:m,longTerm:lt});if(!(r.shortTermPeak.enabled&&r.minWallTemp_C<r.longTermMinWallTemp_C&&r.minMeanFluidTemp_C<r.longTermMinMeanFluidTemp_C))throw Error(JSON.stringify(r.shortTermPeak));});
  test('borehole-level UBWT equals UHE for one borehole',()=>{const a=generateUniformHeatExtractionFLSGFunction({rows:1,cols:1,spacing_m:5,lnTts:[-6],quadratureN:384}),b=generateBoreholeLevelUBWTFLSGFunction({rows:1,cols:1,spacing_m:5,lnTts:[-6],quadratureN:384});if(Math.abs(a.g[0]-b.g[0])>1e-9||Math.abs(b.loadProfiles[0][0]-1)>1e-9)throw Error(JSON.stringify({a,b}));});
  test('borehole-level UBWT redistributes rectangular-field loads and equalizes wall response',()=>{const gf=generateBoreholeLevelUBWTFLSGFunction({rows:2,cols:3,spacing_m:7.5,boreholeLength_m:150,buriedDepth_m:4,groundDiffusivity_m2_s:1e-6,lnTts:[-2],quadratureN:384}),q=gf.loadProfiles[0],spread=Math.max(...q)-Math.min(...q),H=borefieldFLSInteractionMatrix({rows:2,cols:3,spacing_m:7.5,boreholeLength_m:150,buriedDepth_m:4,groundDiffusivity_m2_s:1e-6,time_s:150*150/(9e-6)*Math.exp(-2),quadratureN:384}),sol=solveBoreholeLevelUBWT(H);if(!(spread>1e-4&&Math.abs(q.reduce((a,b)=>a+b,0)-6)<1e-8&&sol.maxWallResidual<1e-8&&sol.minRelativeLoad>0))throw Error(JSON.stringify({q,sol}));});
  test('segmented UBWT conserves length-weighted load and equalizes all segment wall responses',()=>{const m=borefieldSegmentFLSInteractionMatrix({rows:1,cols:2,spacing_m:5,boreholeLength_m:150,buriedDepth_m:4,nSegments:6,groundDiffusivity_m2_s:1e-6,time_s:1e7,quadratureN:384}),sol=solveSegmentedUBWT(m.matrix,{segmentLengths_m:m.segments.map(x=>x.H_m)});if(!(Math.abs(sol.weightedMeanRelativeLoad-1)<1e-9&&sol.maxWallResidual<1e-8&&sol.minRelativeLoad>0))throw Error(JSON.stringify(sol));});
  test('transient segmented BCIII reproduces published pygfunction time series',()=>{const times=[1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11],ref=[.75978079,1.84859851,2.98852756,4.33406497,6.27830732,8.05746656,8.93697282,9.04925079],g=generateSegmentedUBWTFLSGFunction({rows:1,cols:2,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,nSegments:12,segmentPolicy:'equal',groundDiffusivity_m2_s:1e-6,times_s:times,quadratureConvergence:{initialN:32,maxN:1024,absTol:1e-8,relTol:1e-8}}).g,e=Math.max(...g.map((v,i)=>Math.abs(v-ref[i])));if(e>2e-7)throw Error(String(e));});
  test('Eskilson-style segment ratios reproduce documented five-segment example',()=>{const r=eskilsonSegmentRatios(5);const exp=[.02,.12,.72,.12,.02];if(Math.max(...r.map((v,i)=>Math.abs(v-exp[i])))>1e-10)throw Error(JSON.stringify(r));});
  test('geometry candidate generator can select borehole-level UBWT response',()=>{const [c]=generateBorefieldGeometryCandidates({rowsChoices:[2],colsChoices:[3],lengthChoices_m:[100],spacingChoices_m:[6],lnTts:[-6,-2],responseBoundaryCondition:'UBWT-borehole-level'});if(c.gFunction.generatorKind!=='boreholeLevelUBWTFLS'||c.gFunction.loadProfiles.length!==2)throw Error(JSON.stringify(c.gFunction));});
  test('converged FLS quadrature agrees with high-resolution fixed Simpson',()=>{const a=finiteLineSourceResponseConverged({time_s:1e9,alpha_m2_s:1e-6,distance_m:5,H1_m:150,D1_m:4,H2_m:150,D2_m:4,quadratureInitialN:128,quadratureMaxN:4096,quadratureAbsTol:1e-10,quadratureRelTol:1e-7}),b=finiteLineSourceResponse({time_s:1e9,alpha_m2_s:1e-6,distance_m:5,H1_m:150,D1_m:4,H2_m:150,D2_m:4,quadratureN:4096});if(!(a.converged&&Math.abs(a.value-b)<2e-7&&a.quadratureN<=4096))throw Error(JSON.stringify({a,b}));});
  test('legacy equal-segment sequence is not judged against a fixed 12-segment reference',()=>{const ts=150*150/(9e-6),c=assessSegmentedUBWTConvergence({rows:1,cols:2,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,groundDiffusivity_m2_s:1e-6,lnTts:[Math.log(1e7/ts)],segmentCounts:[4,8,12,16],segmentPolicy:'equal',quadratureN:768,absTol:1e-4,relTol:2e-5,stablePasses:2});if(c.trials.length!==4||c.trials.some(t=>!Number.isFinite(t.g[0])))throw Error(JSON.stringify(c));});
  test('segment-count convergence requires consecutive stable passes before acceptance',()=>{const ts=150*150/(9e-6),c=assessSegmentedUBWTConvergence({rows:1,cols:2,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,groundDiffusivity_m2_s:1e-6,lnTts:[Math.log(1e7/ts)],segmentCounts:[4,8,12,16],quadratureN:512,absTol:2e-3,relTol:1e-3,stablePasses:2});if(!(c.converged&&c.accepted.stablePasses===2&&c.accepted.nSegments>=12))throw Error(JSON.stringify(c));});
  test('segmented g-function propagates adaptive quadrature diagnostics',()=>{const ts=150*150/(9e-6),g=generateSegmentedUBWTFLSGFunction({rows:1,cols:1,spacing_m:5,boreholeRadius_m:.075,boreholeLength_m:150,buriedDepth_m:4,nSegments:4,groundDiffusivity_m2_s:1e-6,lnTts:[Math.log(1e9/ts)],quadratureConvergence:{quadratureInitialN:64,quadratureMaxN:2048,quadratureAbsTol:1e-8,quadratureRelTol:1e-6}});if(!(g.quadratureDiagnostics?.[0]?.enabled&&g.quadratureDiagnostics[0].allConverged))throw Error(JSON.stringify(g.quadratureDiagnostics));});
  test('short-term peak auto mode follows segmented long-term response metadata',()=>{const lt=normalizeGroundLongTerm({enabled:true,years:1,rows:1,cols:2,boreholes:2,boreholeLength_m:150,spacing_m:5,boreholeRadius_m:.075,buriedDepth_m:4,groundConductivity_W_mK:2,groundDiffusivity_m2_s:1e-6,effectiveBoreholeResistance_mK_W:.12,shortTermPeak:{enabled:true,duration_s:24*3600,incrementalExtraction_W:30000,responseMode:'auto',axialSegments:8,quadratureN:512},gFunction:{lnTts:[-8,-4,0],g:[1,5,10],generatorKind:'segmentedUBWTFLS',boundaryCondition:'UBWT-segmented-BCIII-screen',nSegments:8}}),p=borefieldShortTermPeakOverlay({baselineMinWallTemp_C:10,baselineMaxWallTemp_C:18,longTerm:lt});if(!(p.enabled&&p.responseGeneratorKind==='transientSegmentedUBWTFLS'&&p.axialSegments===8&&p.method.includes('segmented')))throw Error(JSON.stringify(p));});
  test('benchmark suite passes and is not mislabeled independent validation',()=>{const b=runBenchmarks();if(b.passed!==b.total||b.independentlyValidated!==false||!b.scope.notExternallyBenchmarked.length)throw Error(JSON.stringify(b));});
  test('robustness analysis preserves NPC objective and normalized weights',()=>{const p=makeDemoProject(),r=robustnessAnalysis(p,demoDesigns());if(r.objective!=='minimum NPC (unchanged)'||r.scenarioWeightsCalibratedProbability!==false||!(r.totalWeight>0))throw Error(JSON.stringify(r));for(const c of r.candidates)if(c.winProbability<0||c.winProbability>1||c.withinProbability<0||c.withinProbability>1)throw Error('probability bounds');});
  test('zero perturbation reproduces base ranking',()=>{const p=makeDemoProject(),ds=demoDesigns(),a=rankCandidates(p,ds),b=evaluateRobustnessScenario(p,ds,{id:'X'}).rank;if(a.best?.design.name!==b.best?.design.name||!near(a.best.npc,b.best.npc,1e-12))throw Error('base mismatch');});
  test('switching threshold solver either brackets crossover or reports dominance',()=>{const p=makeDemoProject(),r=rankCandidates(p,demoDesigns()),alt=r.feasible[1],x=switchingThreshold(p,r.best.design,alt.design,'electricityMultiplier',{lo:.4,hi:2.2});if(x.threshold!=null){const d=pairDeltaNPC(p,r.best.design,alt.design,'electricityMultiplier',x.threshold);if(d==null||Math.abs(d)>20)throw Error(JSON.stringify(x));}else if(!x.reason)throw Error('missing threshold reason');});
  test('BoD free-cooling block is emitted when selected',()=>{const p=makeDemoProject(),d=JSON.parse(JSON.stringify(demoDesigns()[0]));d.freeCooling={sourceWater:{enabled:true,maxCapacity_W:50000,approach_K:2}};p.profiles.sourceWater_C=new Float64Array(p.profiles.outdoor_C.length).fill(8);const r=simulateCandidate(p,d),m=bodDocumentModel(p,r,{best:r,feasible:[r]});if(!m.blocks.some(x=>x.id==='BOD-065'))throw Error('missing BOD-065');});
  test('BoD robustness blocks consume robustness and thresholds',()=>{const p=makeDemoProject(),ds=demoDesigns(),rank=rankCandidates(p,ds),b=rank.best;rank.robustness={withinFraction:.05,candidates:[{name:b.design.name,winProbability:1,withinProbability:1,meanRegret:0,maxRegret:0}]};rank.switchingThresholds={alternatives:[{name:rank.feasible[1].design.name,baseDeltaNPC:rank.feasible[1].npc-b.npc,thresholds:[{parameter:'gasMultiplier',threshold:1.4}]}]};const m=bodDocumentModel(p,b,rank);for(const id of['BOD-095','BOD-096'])if(!m.blocks.some(x=>x.id===id))throw Error(`missing ${id}`);});
  test('expert cost power-law preserves range ordering',()=>{const x=estimateComponentCost('airWaterHeatPump',100);if(!(x.low<x.mid&&x.mid<x.high&&x.mid>100000))throw Error(JSON.stringify(x));});
  test('four-pipe distribution costs more than two-pipe',()=>{const a=estimateHydronicPipeCost({length_m:100,DN:50,system:'twoPipe'}),b=estimateHydronicPipeCost({length_m:100,DN:50,system:'fourPipe'});if(!(b.mid>a.mid*1.5))throw Error(JSON.stringify({a,b}));});
  test('VRF heat recovery premium is visible',()=>{const a=estimateVRFCost({floorArea_m2:1000}),b=estimateVRFCost({floorArea_m2:1000,heatRecovery:true});if(!(b.mid>a.mid&&b.tradeoffs.acoustic))throw Error('vrf');});
  test('envelope glazing fraction affects UA',()=>{const a=estimateEnvelopeHeatLoss({floorArea_m2:1000,storeys:2,glazingFraction:.2,envelopePreset:'earlyInsulated',glazingPreset:'oldDouble'}),b=estimateEnvelopeHeatLoss({floorArea_m2:1000,storeys:2,glazingFraction:.6,envelopePreset:'earlyInsulated',glazingPreset:'oldDouble'});if(!(b.totalHeatLoss_W_K>a.totalHeatLoss_W_K&&a.geometry.roofArea_m2===500))throw Error(JSON.stringify({a:a.totalHeatLoss_W_K,b:b.totalHeatLoss_W_K}));});
  test('winter humidification demand is positive for dry air',()=>{const x=humidificationRequirement({Tair_C:21,humidityRatio_kg_kgDA:.004,targetRH_frac:.4,dryAirMass_kg:1000});if(!(x.waterToAir_kg>0&&x.rate_kg_h>0))throw Error(JSON.stringify(x));});
  test('adiabatic humidification exposes heat penalty',()=>{const x=humidifierPerformance('adiabatic',10);if(!(x.additionalHeating_J>2e7&&x.electricity_J>0))throw Error(JSON.stringify(x));});
  test('automatic shading suppresses only explicit solar gain when active',()=>{const a=automaticShadingHour({solarGain_W:10000,windowArea_m2:50,irradiance_W_m2:600,occupied:true,indoor_C:25,coolingSetpoint_C:24}),b=automaticShadingHour({solarGain_W:10000,windowArea_m2:50,irradiance_W_m2:50,occupied:true,indoor_C:22,coolingSetpoint_C:24});if(!(a.avoidedSolarGain_W>5000&&b.avoidedSolarGain_W===0))throw Error(JSON.stringify({a,b}));});
  test('PV dispatch conserves instantaneous electric power',()=>{const x=dispatchPV({generation_W:8000,load_W:5000});if(Math.abs(x.directUse_W+x.export_W+x.curtailed_W-x.generation_W)>1e-9||x.gridImport_W!==0)throw Error(JSON.stringify(x));});
  test('PV cost scales with capacity',()=>{const a=estimatePVCost({capacity_kWp:50}),b=estimatePVCost({capacity_kWp:100});if(!(b.mid>a.mid*1.9&&b.mid<a.mid*2.1))throw Error(JSON.stringify({a,b}));});
  test('humidifier enters 8760 electricity and water accounting',()=>{const p=makeDemoProject();p.humidity.occupiedMinRH_frac=.45;p.humidity.unoccupiedMinRH_frac=.30;p.humidity.initialRH=.15;const d=JSON.parse(JSON.stringify(demoDesigns()[0]));d.humidifier={enabled:true,type:'steamElectric',design_kg_h:50,capex:0};const r=simulateCandidate(p,d);if(!(r.totals.humidifierWater_kg>0&&r.totals.humidifierElectricity_J>0))throw Error(JSON.stringify(r.totals));});
  test('airside free cooling displaces mechanical sensible cooling',()=>{const fc=normalizeFreeCooling({airside:{enabled:true,maxAirFlow_m3_s:10,minRoomOutdoorDelta_K:1,maxOutdoorDewPoint_C:14,capex:0}}),x=freeCoolingHour(fc,{coolRequest_W:50000,roomT_C:24,outdoorT_C:12,outdoorRH:.5,chilledSupply_C:16});if(!(x.delivered_W>0&&x.remaining_W<50000&&x.electric_W>=0))throw Error(JSON.stringify(x));});
  test('source-water free cooling obeys approach temperature',()=>{const fc=normalizeFreeCooling({sourceWater:{enabled:true,maxCapacity_W:100000,approach_K:2}}),a=freeCoolingHour(fc,{coolRequest_W:50000,roomT_C:24,outdoorT_C:25,sourceWater_C:10,chilledSupply_C:16}),b=freeCoolingHour(fc,{coolRequest_W:50000,roomT_C:24,outdoorT_C:25,sourceWater_C:15,chilledSupply_C:16});if(!(a.delivered_W===50000&&b.delivered_W===0))throw Error(JSON.stringify({a,b}));});
  test('free cooling reduces compressor electricity in 8760 dispatch',()=>{const p=makeDemoProject(),ds=demoDesigns(),n=p.profiles.outdoor_C.length;p.profiles.sourceWater_C=new Float64Array(n).fill(8);const a=simulateCandidate(p,ds[0]);const d=JSON.parse(JSON.stringify(ds[0]));d.freeCooling={sourceWater:{enabled:true,maxCapacity_W:150000,approach_K:2,pump_W_per_kW:15,capex:0}};const b=simulateCandidate(p,d);if(!(b.totals.freeCooling_J>0&&b.totals.coolingElectricity_J<a.totals.coolingElectricity_J))throw Error(JSON.stringify({free:b.totals.freeCooling_J,a:a.totals.coolingElectricity_J,b:b.totals.coolingElectricity_J}));});
  test('PV reduces grid import but conserves site load',()=>{const p=makeDemoProject(),n=p.profiles.outdoor_C.length;p.profiles.poaIrradiance_W_m2=new Float64Array(n).fill(600);const d=JSON.parse(JSON.stringify(demoDesigns()[0]));d.pv={enabled:true,capacity_kWp:200,capex:0,exportAllowed:false};const r=simulateCandidate(p,d);if(!(r.totals.pvDirectUse_J>0&&r.totals.gridImport_J<r.totals.electricity_J))throw Error(JSON.stringify(r.totals));});
  test('shading only changes dispatch when explicit solar profile exists',()=>{const p=makeDemoProject(),n=p.profiles.outdoor_C.length;p.profiles.solarGain_W=new Float64Array(n).fill(30000);p.profiles.poaIrradiance_W_m2=new Float64Array(n).fill(600);const d=JSON.parse(JSON.stringify(demoDesigns()[0]));const a=simulateCandidate(p,d);d.shading={enabled:true,type:'externalVenetian',windowArea_m2:500,capex:0,closedMultiplier:.2,minIrradiance_W_m2:100};const b=simulateCandidate(p,d);if(!(b.totals.avoidedSolarGain_J>0&&b.totals.zoneCool_J<=a.totals.zoneCool_J+1e-6))throw Error(JSON.stringify({avoided:b.totals.avoidedSolarGain_J,ca:a.totals.zoneCool_J,cb:b.totals.zoneCool_J}));});
  test('asymmetric 1 to 2 cascade exposes one-third two-thirds full-load stages',()=>{const p=normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[100000/3,200000/3]}}),s=enumerateHeatPumpPlantStages(p).map(x=>Math.round(x.nominal_W));if(JSON.stringify(s)!==JSON.stringify([33333,66667,100000]))throw Error(JSON.stringify(s));});
  test('asymmetric reliability evaluates failure of each actual module',()=>{const p=normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[40000,60000]}}),r=normalizeReliability({mode:'partialNPlus1',criticalFraction:.4}),a=assessHeatPlantReliability({plant:p,reliability:r,designLoad_W:100000});if(a.capacityAfterFailure_W!==40000||a.failureStates.length!==2||!a.meetsImmediate)throw Error(JSON.stringify(a));});
  test('asymmetric 1 to 2 plant is not full N plus 1 at 100 percent design load',()=>{const p=normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[100000/3,200000/3]}}),r=normalizeReliability({mode:'N+1'}),a=assessHeatPlantReliability({plant:p,reliability:r,designLoad_W:100000});if(a.meetsImmediate||Math.abs(a.capacityAfterFailure_W-100000/3)>1e-6)throw Error(JSON.stringify(a));});
  test('plant variant generator accepts unequal fraction sets',()=>{const v=generateHeatPumpPlantVariants({designLoad_W:90000,moduleCounts:[],moduleFractions:[],moduleFractionSets:[[1/3,2/3],[.5,.5]],reliabilityModes:['none']});const x=v.find(q=>q.moduleFractionsOfDesign.length===2&&q.moduleFractionsOfDesign[0]<.34);if(v.length!==2||!x||x.stages.length!==3)throw Error(JSON.stringify(v));});
  test('site electric capacity rejects excessive grid import',()=>{const p=makeDemoProject();p.siteEnergyAvailability={electricity:{status:'available',firmImport_W:1000},naturalGas:{status:'available',firmInput_W:1e6}};const r=simulateCandidate(p,demoDesigns()[0]);if(r.feasible||!r.siteEnergy.issues.some(x=>x.code==='ELECTRIC_IMPORT_CAPACITY_EXCEEDED'))throw Error(JSON.stringify(r.siteEnergy));});
  test('grid upgrade can restore electric site feasibility',()=>{const p=makeDemoProject();p.siteEnergyAvailability={electricity:{status:'available',firmImport_W:1000,upgradeAvailable:true,upgradeFirmImport_W:1e6,upgradeCapex:12345},naturalGas:{status:'available',firmInput_W:1e6}};const d={...demoDesigns()[0],siteEnergyStrategy:{electricUpgrade:true}};const r=simulateCandidate(p,d);if(!r.siteEnergy.feasible||r.capex0<candidateCapex(normalizeCandidate(d))+12000)throw Error(JSON.stringify({site:r.siteEnergy,capex:r.capex0}));});
  test('delivered fuel boiler works when gas unavailable',()=>{const p=makeDemoProject();p.siteEnergyAvailability={electricity:{status:'unknown'},naturalGas:{status:'unavailable'},deliveredFuel:{status:'available',firmInput_W:1e6,price_per_kWh:.11}};const d={...demoDesigns()[0],boilerFuelCarrier:'deliveredFuel'};const r=simulateCandidate(p,d);if(!r.siteEnergy.feasible||!(r.totals.deliveredFuel_J>0)||r.totals.gas_J!==0)throw Error(JSON.stringify({site:r.siteEnergy,tot:r.totals}));});
  test('joint topology generator crosses modules backup buffer reliability and energy strategy',()=>{const p=makeDemoProject();p.siteEnergyAvailability={electricity:{status:'available',firmImport_W:200000,upgradeAvailable:true,upgradeFirmImport_W:500000},naturalGas:{status:'available'},deliveredFuel:{status:'unavailable'}};const xs=generateJointTopologyCandidates(p,{baseDesign:demoDesigns()[0],designHeatLoad_W:100000,moduleFractionSets:[[1/3,2/3]],boilerFractions:[0,.5],bufferVolumes_m3:[0,10],reliabilityModes:['none','N+1'],freeCoolingModes:['none','sourceWater'],heatRecoveryModes:[false,true],maxCandidates:1000});if(xs.length!==64||!xs.some(x=>x.siteEnergyStrategy.electricUpgrade&&x.heatRecovery.enabled&&x.freeCooling.sourceWater?.enabled))throw Error(String(xs.length));});
  test('joint refinement perturbs unequal modules without changing discrete family',()=>{const p=makeDemoProject(),seed={...demoDesigns()[0],heatPumpPlant:{moduleCapacities_W:[40000,60000]},boilerCapacity_W:50000,reliability:{mode:'none'},freeCooling:{sourceWater:{enabled:true}},siteEnergyStrategy:{electricUpgrade:true}};const xs=refineJointTopologyCandidates(p,{seedDesigns:[seed],designHeatLoad_W:100000,moduleFractionStep:.05,boilerFractionStep:.1,bufferStep_m3:5});if(xs.length<7||!xs.some(x=>(x.heatPumpPlant?.moduleCapacities_W??[])[0]===45000)||!xs.every(x=>normalizeCandidate(x).freeCooling.sourceWater.enabled))throw Error(String(xs.length));});
  test('joint refinement deduplicates zero buffer lower neighbour',()=>{const p=makeDemoProject(),seed={...demoDesigns()[0],heatPumpPlant:{moduleCapacities_W:[50000,50000]},tank:{...demoDesigns()[0].tank,volume_m3:0}};const xs=refineJointTopologyCandidates(p,{seedDesigns:[seed],designHeatLoad_W:100000,bufferStep_m3:5});const keys=xs.map(x=>jointDesignSignature(x,100000));if(new Set(keys).size!==keys.length)throw Error('duplicate refinement signature');});
  test('coarse to fine search retains and refines feasible families',()=>{const p=makeDemoProject();for(const k of Object.keys(p.profiles)){const v=p.profiles[k];if(v&&v.length>72)p.profiles[k]=v.slice(0,72)}p.siteEnergyAvailability={electricity:{status:'available',firmImport_W:500000},naturalGas:{status:'available',firmInput_W:1e6}};const base=demoDesigns()[0],r=coarseToFineJointSearch(p,{coarseOptions:{baseDesign:base,designHeatLoad_W:250000,moduleFractionSets:[[.4,.6],[.5,.5]],boilerFractions:[.5,.8],bufferVolumes_m3:[0],reliabilityModes:['none'],freeCoolingModes:['none'],heatRecoveryModes:[false],maxCandidates:20},retainTop:2,withinNPCFraction:.2,refinementOptions:{moduleFractionStep:.05,boilerFractionStep:.1,bufferStep_m3:5,maxCandidates:50}});if(!(r.coarse.candidateCount>0&&r.retention.retainedCount>0&&r.refinement.candidateCount>r.retention.retainedCount&&r.best))throw Error(JSON.stringify({c:r.coarse,ret:r.retention,ref:r.refinement,b:!!r.best}));});
  test('ground exchange extraction cools and injection warms seasonal state',()=>{const g=normalizeGroundCoupling({enabled:true,initialTemp_C:10,undisturbedTemp_C:10,effectiveHeatCapacity_J_K:3.6e8,minTemp_C:0,maxTemp_C:30}),s=createGroundState(g);groundExchange(s,g,-10000,HOUR_S);const a=s.T_C;groundExchange(s,g,20000,HOUR_S);if(!(a<10&&s.T_C>a&&s.extracted_J>0&&s.injected_J>0))throw Error(JSON.stringify(s));});
  test('warm ground can directly preheat a low-temperature loop when temperature level permits',()=>{const g=normalizeGroundCoupling({enabled:true,initialTemp_C:30,undisturbedTemp_C:30,effectiveHeatCapacity_J_K:3.6e9,approach_K:2,maxDirectHeating_W:30000,maxExtraction_W:30000}),s=createGroundState(g),x=groundDirectHeatingHour(s,g,{request_W:20000,supply_C:25});if(!(x.delivered_W===20000&&x.electric_W>0&&s.extracted_J>0&&s.T_C<30))throw Error(JSON.stringify({x,s}));});
  test('ground direct cooling serves TABS-like supply and regenerates ground',()=>{const g=normalizeGroundCoupling({enabled:true,initialTemp_C:10,undisturbedTemp_C:10,effectiveHeatCapacity_J_K:3.6e9,approach_K:2,maxDirectCooling_W:50000}),s=createGroundState(g),x=groundDirectCoolingHour(s,g,{request_W:40000,chilledSupply_C:16});if(!(x.delivered_W===40000&&x.electric_W>0&&s.injected_J>0&&s.T_C>10))throw Error(JSON.stringify({x,s}));});
  test('ground source heat pump records borefield extraction in dispatch',()=>{const p=makeDemoProject();for(const k of Object.keys(p.profiles)){const v=p.profiles[k];if(v&&v.length>168)p.profiles[k]=v.slice(0,168)}const d={...demoDesigns()[0],hpType:'borehole',groundCoupling:{enabled:true,initialTemp_C:11,undisturbedTemp_C:11,effectiveHeatCapacity_J_K:3.6e11,minTemp_C:0,maxTemp_C:28,useAsHeatPumpSource:true,directHeatingEnabled:false,directCoolingEnabled:false}};const r=simulateCandidate(p,d);if(!(r.totals.groundHPExtraction_J>0&&r.ground.extracted_J>0&&r.ground.minT_C<11))throw Error(JSON.stringify({tot:r.totals.groundHPExtraction_J,g:r.ground}));});
  test('ground direct cooling displaces compressor cooling',()=>{const p=makeDemoProject();const base={...demoDesigns()[0],groundCoupling:{enabled:false}},a=simulateCandidate(p,base),d={...base,groundCoupling:{enabled:true,initialTemp_C:8,undisturbedTemp_C:8,effectiveHeatCapacity_J_K:3.6e12,minTemp_C:0,maxTemp_C:30,directHeatingEnabled:false,directCoolingEnabled:true,maxDirectCooling_W:200000,approach_K:2,pump_W_per_kW:10,useAsHeatPumpSource:false}},b=simulateCandidate(p,d);if(!(b.totals.groundDirectCooling_J>0&&b.totals.coolingElectricity_J<a.totals.coolingElectricity_J&&b.ground.injected_J>0))throw Error(JSON.stringify({a:a.totals.coolingElectricity_J,b:b.totals.coolingElectricity_J,g:b.totals.groundDirectCooling_J}));});
  test('dedicated latent terminal dehumidifies without stealing TABS sensible capacity',()=>{const p=makeDemoProject(),N=168;for(const k of Object.keys(p.profiles)){const v=p.profiles[k];if(v&&v.length>N)p.profiles[k]=v.slice(0,N)}p.profiles.outdoor_C=Float64Array.from({length:N},()=>28);p.profiles.outdoorRH=Float64Array.from({length:N},()=>.82);p.profiles.internalGains_W=Float64Array.from({length:N},()=>110000);p.profiles.internalMoisture_kg_s=Float64Array.from({length:N},()=>.003);const base=demoDesigns().find(x=>x.coolingTerminal?.type==='floor'),d={...base,coolingCapacity_W:100000,latentTerminal:{enabled:true,type:'dedicatedAirside',airFlow_m3_s:16,coilADP_C:8,bypassFactor:.08,maxCondensate_kg_s:.04,coolingCapacity_W:140000,chilledSupply_C:6,fanPower_W:3000,capex:20000}};const r=simulateCandidate(p,d);if(!(r.totals.dedicatedLatentCooling_J>0&&r.totals.condensate_kg>0&&r.totals.dedicatedLatentElectricity_J>0&&r.totals.dedicatedLatentFanElectricity_J>0))throw Error(JSON.stringify({tot:r.totals,hum:r.humidity}));});
  test('hybrid ground TABS plus dedicated latent path can satisfy humidity where TABS alone cannot',()=>{const p=makeDemoProject(),N=168;for(const k of Object.keys(p.profiles)){const v=p.profiles[k];if(v&&v.length>N)p.profiles[k]=v.slice(0,N)}p.profiles.outdoor_C=Float64Array.from({length:N},()=>30);p.profiles.outdoorRH=Float64Array.from({length:N},()=>.86);p.profiles.internalGains_W=Float64Array.from({length:N},()=>140000);p.profiles.internalMoisture_kg_s=Float64Array.from({length:N},()=>.004);const base=demoDesigns().find(x=>x.coolingTerminal?.type==='floor'),ground={enabled:true,initialTemp_C:8,undisturbedTemp_C:8,effectiveHeatCapacity_J_K:3.6e12,minTemp_C:0,maxTemp_C:30,directHeatingEnabled:false,directCoolingEnabled:true,maxDirectCooling_W:200000,approach_K:2,pump_W_per_kW:10,useAsHeatPumpSource:false},alone=simulateCandidate(p,{...base,groundCoupling:ground}),hybrid=simulateCandidate(p,{...base,groundCoupling:ground,latentTerminal:{enabled:true,type:'dedicatedAirside',airFlow_m3_s:80,coilADP_C:6,bypassFactor:.02,maxCondensate_kg_s:.20,coolingCapacity_W:600000,chilledSupply_C:4,fanPower_W:12000,capex:60000}});if(!(alone.humidity.occupiedDewPointDegreeHoursAbove>0&&hybrid.humidity.occupiedDewPointDegreeHoursAbove<=p.constraints.humidityDegreeHourTolerance&&hybrid.totals.groundDirectCooling_J>0&&hybrid.totals.dedicatedLatentCooling_J>0))throw Error(JSON.stringify({alone:alone.humidity.occupiedDewPointDegreeHoursAbove,hybrid:hybrid.humidity.occupiedDewPointDegreeHoursAbove,g:hybrid.totals.groundDirectCooling_J,l:hybrid.totals.dedicatedLatentCooling_J}));});
  test('Gnielinski film example',()=>{const x=internalTubeNusselt({Re:1e5,Pr:1.2,frictionFactor:.0185});if(!x.available||!near(x.Nu,254.62682749359632,1e-10))throw Error(JSON.stringify(x));});
  test('laminar fully developed tube film uses Nu 3.66',()=>{const x=internalTubeNusselt({Re:1000,Pr:7});if(!x.available||x.Nu!==3.66||x.regime!=='laminar')throw Error(JSON.stringify(x));});
  test('property-coupled direct HX produces finite UA and energy balance',()=>{const water={family:'water'},pg={family:'aqueous_glycol',glycolType:'propylene',concentration:30,concentrationBasis:'volume'},x=directHXFromGeometry({hotSide:{fluidSpec:water,mdot_kg_s:2,hydraulicDiameter_m:.025,flowArea_m2:.0015,T_C:35},coldSide:{fluidSpec:pg,mdot_kg_s:2.2,hydraulicDiameter_m:.025,flowArea_m2:.0015,T_C:15},heatTransferArea_m2:20,wallResistance_m2K_W:.00005,hotIn_C:45,coldIn_C:15});if(!(x.available&&x.UA_W_K>0&&x.hot.Pr>0&&x.cold.Pr>x.hot.Pr&&near((45-x.hotOut_C)*2*x.hot.properties.cp_J_kgK,x.Q_W,1e-6)&&near((x.coldOut_C-15)*2.2*x.cold.properties.cp_J_kgK,x.Q_W,1e-6)))throw Error(JSON.stringify(x));});
  test('CaCl2 complete property state enables HX film',()=>{const x=heatExchangerTubeSideFilm({fluidSpec:{family:'aqueous_brine',solute:'CaCl2',concentration:20,concentrationBasis:'mass'},T_C:20,mdot_kg_s:2,hydraulicDiameter_m:.025,flowArea_m2:.001});if(!(x.available&&x.h_W_m2K>0&&x.properties&&x.properties.propertyModelId==='coolprop-mca-melinder2010-v0.1'))throw Error(JSON.stringify(x));});
  test('source-water free cooling can be limited by property-derived HX geometry',()=>{const water={family:'water',phase:'liquid'},fc=normalizeFreeCooling({sourceWater:{enabled:true,maxCapacity_W:200000,pump_W_per_kW:10,directHXGeometry:{hotSide:{fluidSpec:water,mdot_kg_s:8,hydraulicDiameter_m:.04,flowArea_m2:.004},coldSide:{fluidSpec:water,mdot_kg_s:10,hydraulicDiameter_m:.04,flowArea_m2:.004},heatTransferArea_m2:120,wallResistance_m2K_W:.00004}}}),r=freeCoolingHour(fc,{coolRequest_W:100000,roomT_C:24,outdoorT_C:30,sourceWater_C:8,chilledSupply_C:16,chilledReturn_C:20});const m=r.modes.find(x=>x.mode==='sourceWater');if(!(m&&m.model==='geometryPropertyUA'&&m.cooling_W>0&&m.cooling_W<=100000&&m.UA_W_K>0&&m.supplyTargetReached&&m.hotOut_C<=16.000001))throw Error(JSON.stringify(r));});
  test('undersized source-water HX receives no fixed-approach free-cooling credit',()=>{const water={family:'water',phase:'liquid'},fc=normalizeFreeCooling({sourceWater:{enabled:true,maxCapacity_W:200000,approach_K:2,directHXGeometry:{hotSide:{fluidSpec:water,mdot_kg_s:8,hydraulicDiameter_m:.04,flowArea_m2:.004},coldSide:{fluidSpec:water,mdot_kg_s:10,hydraulicDiameter_m:.04,flowArea_m2:.004},heatTransferArea_m2:2}}}),r=freeCoolingHour(fc,{coolRequest_W:100000,roomT_C:24,outdoorT_C:30,sourceWater_C:8,chilledSupply_C:16,chilledReturn_C:20});const m=r.modes.find(x=>x.mode==='sourceWater');if(!(m&&m.model==='geometryPropertyUA'&&m.cooling_W===0&&!m.supplyTargetReached&&r.remaining_W===100000))throw Error(JSON.stringify(r));});
  test('legacy source-water approach model is preserved without HX geometry',()=>{const fc=normalizeFreeCooling({sourceWater:{enabled:true,maxCapacity_W:50000,approach_K:2,pump_W_per_kW:10}}),r=freeCoolingHour(fc,{coolRequest_W:60000,roomT_C:24,outdoorT_C:30,sourceWater_C:10,chilledSupply_C:16,chilledReturn_C:20});const m=r.modes.find(x=>x.mode==='sourceWater');if(!(m&&m.model==='legacyApproachCapacity'&&m.cooling_W===50000&&r.remaining_W===10000))throw Error(JSON.stringify(r));});
  test('better glazing reduces screening heat loss',()=>{const a=estimateEnvelopeHeatLoss({floorArea_m2:1000,storeys:2,glazingFraction:.4,glazingPreset:'single'}),b=estimateEnvelopeHeatLoss({floorArea_m2:1000,storeys:2,glazingFraction:.4,glazingPreset:'tripleLowE'});if(!(b.specificHeatLoss_W_m2K<a.specificHeatLoss_W_m2K))throw Error('glazing');});
  test('PG30 changes annual hydronic properties',()=>{const d=normalizeCandidate({...demoDesigns()[0],heatingFluidSpec:{family:'aqueous_glycol',glycolType:'propylene',concentration:30,concentrationBasis:'volume'}});if(!d.heatingFluidProperties.available||near(d.heatingFluidProperties.cp_J_kgK,4180,1e-6))throw Error(JSON.stringify(d.heatingFluidProperties));});
  test('tank capacity inherits working-fluid rho cp',()=>{const d=normalizeCandidate({...demoDesigns()[0],tank:{...demoDesigns()[0].tank,volume_m3:10,fluidSpec:{family:'aqueous_glycol',glycolType:'ethylene',concentration:30,concentrationBasis:'volume'}}});if(!(d.tank.cp_J_kgK<4100&&d.tank.rho_kg_m3>1000))throw Error(JSON.stringify(d.tank));});
  test('NaCl20 resolves complete property state at 20C',()=>{const p=resolveFluidProperties({family:'aqueous_brine',solute:'NaCl',concentration:20,concentrationBasis:'mass'},20);if(!(p.available&&!p.partial&&Math.abs(p.rho_kg_m3-1148.1)<.2&&p.k_W_mK>0&&p.freezingPoint_C<0))throw Error(JSON.stringify(p));});
  test('NaCl working fluid is accepted in annual cooling circuit',()=>{const d=normalizeCandidate({...demoDesigns()[0],coolingSupply_C:7,coolingReturn_C:13,coolingFluidSpec:{family:'aqueous_brine',solute:'NaCl',concentration:20,concentrationBasis:'mass'}});if(!(d.coolingFluidProperties.available&&d.coolingFluidProperties.freezeMargin_K>20&&d.coolingFluidProperties.mu_Pa_s>0.0015))throw Error(JSON.stringify(d.coolingFluidProperties));});
  test('NaCl freeze margin is assessed independently of property-grid temperature',()=>{const f={family:'aqueous_brine',solute:'NaCl',concentration:11,concentrationBasis:'mass'},a=assessFreezeMargin(f,-8,0),p=resolveFluidProperties(f,-8);if(!(a.available&&!a.meetsRequiredMargin&&a.freezingPoint_C===-7.35&&!p.available&&p.reason==='outside-supported-NaCl-complete-grid'))throw Error(JSON.stringify({a,p}));});
  test('annual normalization rejects explicit exposure below NaCl freezing point',()=>{const p=makeDemoProject(),d={...demoDesigns()[0],coolingSupply_C:7,coolingReturn_C:13,coolingFluidSpec:{family:'aqueous_brine',solute:'NaCl',concentration:11,concentrationBasis:'mass',minimumExposure_C:-8}},r=simulateCandidate(p,d);if(r.feasible||!r.fluidProperties.issues.some(x=>x.reason==='working-fluid-below-freezing-point'))throw Error(JSON.stringify(r.fluidProperties));});
  test('generic potassium-formate concentration remains unsupported without product preset',()=>{const p=makeDemoProject(),d={...demoDesigns()[0],heatingFluidSpec:{family:'aqueous_brine',solute:'potassium_formate',concentration:30,concentrationBasis:'mass'}},r=simulateCandidate(p,d);if(r.feasible||!r.fluidProperties.issues.length)throw Error('generic product-formulation guard not enforced');});
  test('NuTherm HC30 potassium-formate preset resolves complete property state',()=>{const f={family:'aqueous_brine',solute:'potassium_formate',productPreset:'NuTherm_HC30'},p=resolveFluidProperties(f,20),z=assessFreezeMargin(f,-30,3);if(!(p.available&&!p.partial&&p.rho_kg_m3===1275&&Math.abs(p.cp_J_kgK-3077)<1e-9&&Math.abs(p.mu_Pa_s-.0025)<1e-12&&Math.abs(p.k_W_mK-.519)<1e-12&&z.available&&z.meetsRequiredMargin&&z.margin_K===10))throw Error(JSON.stringify({p,z}));});
  test('NuTherm HC50 potassium-formate preset works in annual cooling circuit',()=>{const d=normalizeCandidate({...demoDesigns()[0],coolingSupply_C:7,coolingReturn_C:13,coolingFluidSpec:{family:'aqueous_brine',solute:'potassium_formate',productPreset:'NuTherm_HC50',minimumExposure_C:-40}});if(!(d.coolingFluidProperties.available&&d.coolingFluidProperties.rho_kg_m3>1340&&d.coolingFreezeAssessment.meetsRequiredMargin))throw Error(JSON.stringify({p:d.coolingFluidProperties,f:d.coolingFreezeAssessment}));});
    test('CaCl2 Melinder model matches legacy 20 C ASHRAE anchors',()=>{const p=resolveFluidProperties({family:'aqueous_brine',solute:'CaCl2',concentration:20,concentrationBasis:'mass'},20);if(!(p.available&&!p.partial&&near(p.rho_kg_m3,1177.5,5)&&near(p.cp_J_kgK,3100,25)&&near(p.mu_Pa_s,.00193,5e-5)&&p.k_W_mK>.55&&p.k_W_mK<.60&&near(p.freezingPoint_C,-18.3,.2)))throw Error(JSON.stringify(p));});
  test('CaCl2 annual cooling circuit carries complete properties',()=>{const d=normalizeCandidate({...demoDesigns()[0],coolingSupply_C:7,coolingReturn_C:13,coolingFluidSpec:{family:'aqueous_brine',solute:'CaCl2',concentration:20,concentrationBasis:'mass',minimumExposure_C:-10}});if(!(d.coolingFluidProperties.available&&!d.coolingFluidProperties.partial&&d.coolingFluidProperties.k_W_mK>0&&d.coolingFreezeAssessment.meetsRequiredMargin))throw Error(JSON.stringify({p:d.coolingFluidProperties,f:d.coolingFreezeAssessment}));});
test('TYFOXIT potassium-acetate preset works in annual cooling circuit',()=>{const d=normalizeCandidate({...demoDesigns()[0],coolingSupply_C:7,coolingReturn_C:13,coolingFluidSpec:{family:'aqueous_brine',solute:'potassium_acetate',productPreset:'TYFOXIT_1.20',minimumExposure_C:-30}});if(!(d.coolingFluidProperties.available&&d.coolingFluidProperties.rho_kg_m3>1190&&d.coolingFluidProperties.k_W_mK>.46&&d.coolingFreezeAssessment.meetsRequiredMargin))throw Error(JSON.stringify({p:d.coolingFluidProperties,f:d.coolingFreezeAssessment}));});
  test('EG60 mass uses ASHRAE high-concentration property model',()=>{const p=resolveFluidProperties({family:'aqueous_glycol',glycolType:'ethylene',concentration:60,concentrationBasis:'mass'},20);if(!(p.available&&p.propertyModelId==='ashrae-f25-high-mass-v0.1'&&near(p.rho_kg_m3,1087,1e-9)&&near(p.mu_Pa_s,.005,1e-12)))throw Error(JSON.stringify(p));});
  test('PG60 mass uses ASHRAE high-concentration property model',()=>{const p=resolveFluidProperties({family:'aqueous_glycol',glycolType:'propylene',concentration:60,concentrationBasis:'mass'},20);if(!(p.available&&p.propertyModelId==='ashrae-f25-high-mass-v0.1'&&near(p.cp_J_kgK,3240,1e-9)&&near(p.k_W_mK,.302,1e-12)))throw Error(JSON.stringify(p));});
  test('steam p-h interface reproduces CoolProp 1 atm latent heat',()=>{const r=steamCondensateExchange({mdot_kg_s:1,inletState:{phase:'vapor',pressure_Pa:101325,enthalpy_J_kg:2675529.32550072,propertyModelId:'CoolProp-8.0.0'},outletState:{phase:'liquid',pressure_Pa:101325,enthalpy_J_kg:419057.7330939922,propertyModelId:'CoolProp-8.0.0'}});if(!(r.available&&near(r.heatReleased_W,2256471.592406728,1e-6)))throw Error(JSON.stringify(r));});
  test('refrigerant p-h cycle energy closes without cp fallback',()=>{const r=vaporCompressionPHCycle({refrigerantId:'R134a',mdot_kg_s:.1,state1:{phase:'vapor',pressure_Pa:3e5,enthalpy_J_kg:4e5},state2:{phase:'vapor',pressure_Pa:1.2e6,enthalpy_J_kg:4.4e5},state3:{phase:'liquid',pressure_Pa:1.2e6,enthalpy_J_kg:2.5e5},state4:{phase:'two_phase',pressure_Pa:3e5,enthalpy_J_kg:2.5e5}});if(!(r.available&&near(r.copCooling,3.75,1e-12)&&near(r.copHeating,4.75,1e-12)&&near(r.energyClosure_W,0,1e-9)))throw Error(JSON.stringify(r));});
  test('invalid explicit phase interface makes candidate infeasible',()=>{const p=makeDemoProject(),d={...demoDesigns()[0],phaseInterfaces:{refrigerantCycles:[{refrigerantId:'R134a',mdot_kg_s:.1,state1:{phase:'vapor',pressure_Pa:3e5,enthalpy_J_kg:4e5},state2:{phase:'vapor',pressure_Pa:1.2e6,enthalpy_J_kg:4.4e5},state3:{phase:'liquid',pressure_Pa:1.2e6,enthalpy_J_kg:2.5e5},state4:{phase:'two_phase',pressure_Pa:3e5,enthalpy_J_kg:2.6e5}}]}};const r=simulateCandidate(p,d);if(r.feasible||!r.phaseInterfaces.issues.length)throw Error(JSON.stringify(r.phaseInterfaces));});
  test('Worker preamble executes phase-state interfaces',()=>{const src=thermalWorkerPreamble()+`\nreturn [steamCondensateExchange({mdot_kg_s:1,inletState:{phase:'vapor',pressure_Pa:101325,enthalpy_J_kg:2675529.32550072},outletState:{phase:'liquid',pressure_Pa:101325,enthalpy_J_kg:419057.7330939922}}),vaporCompressionPHCycle({refrigerantId:'R134a',mdot_kg_s:.1,state1:{phase:'vapor',pressure_Pa:3e5,enthalpy_J_kg:4e5},state2:{phase:'vapor',pressure_Pa:1.2e6,enthalpy_J_kg:4.4e5},state3:{phase:'liquid',pressure_Pa:1.2e6,enthalpy_J_kg:2.5e5},state4:{phase:'two_phase',pressure_Pa:3e5,enthalpy_J_kg:2.5e5}})];`,r=Function(src)();if(!(r[0].available&&r[1].available&&near(r[1].copCooling,3.75,1e-12)))throw Error(JSON.stringify(r));});
  test('Worker preamble carries product and high-mass property data',()=>{const src=thermalWorkerPreamble()+`\nreturn [resolveFluidProperties({family:'aqueous_brine',solute:'potassium_formate',productPreset:'NuTherm_HC30'},20),resolveFluidProperties({family:'aqueous_brine',solute:'potassium_acetate',productPreset:'TYFOXIT_1.20'},20),resolveFluidProperties({family:'aqueous_glycol',glycolType:'propylene',concentration:60,concentrationBasis:'mass'},20),resolveFluidProperties({family:'aqueous_brine',solute:'CaCl2',concentration:20,concentrationBasis:'mass'},20)];`,r=Function(src)();if(!(r[0].available&&r[0].rho_kg_m3===1275&&r[1].available&&r[1].rho_kg_m3===1200&&r[2].available&&r[2].propertyModelId==='ashrae-f25-high-mass-v0.1'&&r[3].available&&r[3].propertyModelId==='coolprop-mca-melinder2010-v0.1'))throw Error(JSON.stringify(r));});
  test('phase ownership rejects duplicate accounting owners',()=>{const r=validateCarrierOwnership([{id:'a',owns:['x']},{id:'b',owns:['x']}]);if(r.ok||!r.issues.some(x=>x.code==='DUPLICATE_ACCOUNTING_OWNER'))throw Error(JSON.stringify(r));});
  test('steam ownership exposes generator input and condensate return',()=>{const r=evaluateSteamTopology({steamLoad:{id:'load',usefulHeat_J:1e9,steamMass_kg:500},distribution:{id:'dist',lossFraction:.1},generator:{id:'boiler',efficiency:.9,carrier:'naturalGas'},condensateReturn:{id:'ret',returnFraction:.8,returnedEnthalpy_J_kg:4e5,makeupEnthalpy_J_kg:1e5,recoveryEfficiency:.9}});if(!r.feasible||!(r.generator.upstreamCarrierInput_J>r.steamLoad.usefulHeat_J)||!(r.condensateReturn.recoveredEnthalpy_J>0))throw Error(JSON.stringify(r));});
  test('refrigerant ownership closes cycle and bounds recovered heat',()=>{const r=evaluateRefrigerantTopology({cycle:{evaporatorHeat_J:1e9,compressorElectricity_J:2e8,condenserHeat_J:1.2e9},loadOwnerId:'evap',compressorOwnerId:'comp',rejectionOwnerId:'cond',heatRecovery:{id:'hr',recoveredHeat_J:3e8}});if(!r.feasible||r.ambientRejection_J!==9e8)throw Error(JSON.stringify(r));});
  test('graph heat-recovery owner derives without pre-solved annual energy',()=>{const rp=(id,role)=>({id,carrierKind:'refrigerant',role,fluidSpec:{family:'refrigerant',refrigerantId:'R134a'}}),g={components:[{id:'evap',parameters:{phaseAccountingRole:'refrigerantLoad',dynamicPhaseComponentId:'cycle1'},ports:[rp('a','sink'),rp('b','source')]},{id:'comp',parameters:{phaseAccountingRole:'refrigerantCompressor',dynamicPhaseComponentId:'cycle1'},ports:[rp('a','sink'),rp('b','source')]},{id:'cond',parameters:{phaseAccountingRole:'refrigerantCondenser',dynamicPhaseComponentId:'cycle1'},ports:[rp('a','sink'),rp('b','source')]},{id:'hr',parameters:{phaseAccountingRole:'condenserHeatRecovery',dynamicPhaseComponentId:'cycle1',maxRecovery_W:70000,recoverableFraction:.5,sinkDemand_W:80000,targetTemperature_C:40,approach_K:3},ports:[rp('a','sink'),rp('b','source')]},{id:'exp',ports:[rp('a','sink'),rp('b','source')]}],edges:[{from:'evap.b',into:'comp.a'},{from:'comp.b',into:'cond.a'},{from:'cond.b',into:'hr.a'},{from:'hr.b',into:'exp.a'},{from:'exp.b',into:'evap.a'}]},r=derivePhaseTopologyOwnership(g);if(!r.feasible||r.refrigeration[0].heatRecovery?.id!=='hr'||r.refrigeration[0].heatRecovery?.maxRecovery_W!==70000)throw Error(JSON.stringify(r));});
  test('dynamic condenser recovery is bounded by rejection fraction capacity sink and temperature grade',()=>{const p={profiles:{outdoor_C:new Float64Array(2),sink:new Float64Array([80000,80000]),target:new Float64Array([40,50])}},ch={condenser_W:new Float64Array([126666.66666666667,126666.66666666667]),condensingSaturationTemperature_K:new Float64Array([320,320])},r=evaluateDynamicCondenserHeatRecovery(p,{id:'hr',maxRecovery_W:70000,recoverableFraction:.5,sinkDemandProfileRef:'sink',targetTemperatureProfileRef:'target',approach_K:3},ch,2);if(!r.feasible||!near(r.hourlyRecovered_W[0],63333.333333333336,1e-12)||r.hourlyRecovered_W[1]!==0||!near(r.recoveredHeat_J,228000000,1e-12))throw Error(JSON.stringify(r));});
  test('dynamic condenser recovery missing sink contract is a hard issue',()=>{const p={profiles:{outdoor_C:new Float64Array(1)}},ch={condenser_W:new Float64Array([100000]),condensingSaturationTemperature_K:new Float64Array([320])},r=evaluateDynamicCondenserHeatRecovery(p,{id:'hr',maxRecovery_W:50000,recoverableFraction:.5,targetTemperature_C:40,approach_K:3},ch,1);if(r.feasible||!r.issues.some(x=>x.code==='REFRIGERANT_HEAT_RECOVERY_SINK_DEMAND_REQUIRED'))throw Error(JSON.stringify(r));});
  test('Worker preamble executes dynamic condenser recovery binding',()=>{const src=thermalWorkerPreamble()+`\nconst p={profiles:{outdoor_C:new Float64Array(1),sink:new Float64Array([80000])}},ch={condenser_W:new Float64Array([120000]),condensingSaturationTemperature_K:new Float64Array([320])};return evaluateDynamicCondenserHeatRecovery(p,{id:'hr',maxRecovery_W:50000,recoverableFraction:.5,sinkDemandProfileRef:'sink',targetTemperature_C:40,approach_K:3},ch,1);`,r=Function(src)();if(!r.feasible||r.hourlyRecovered_W[0]!==50000)throw Error(JSON.stringify(r));});
  test('Worker preamble executes phase ownership validation',()=>{const src=thermalWorkerPreamble()+`
return validateCarrierOwnership([{id:'a',owns:['x']},{id:'b',owns:['x']}]);`,r=Function(src)();if(r.ok||!r.issues.some(x=>x.code==='DUPLICATE_ACCOUNTING_OWNER'))throw Error(JSON.stringify(r));});
  test('different-system legacy condenser recovery coexists with graph-owned recovery',()=>{const po={refrigeration:[{dynamicComponentId:'cycleA',dynamicHeatRecovery:{routing:{hotSinkComponentId:'dhwA'}}}]},x=validateHeatRecoverySystemAndStorageBindings(po,{enabled:true,systemId:'cycleB'},{volume_m3:0});if(!x.legacyAllowed||x.issues.some(i=>i.severity==='error'))throw Error(JSON.stringify(x));});
  test('same-system legacy condenser recovery is suppressed locally',()=>{const po={refrigeration:[{dynamicComponentId:'cycleA',dynamicHeatRecovery:{routing:{hotSinkComponentId:'dhwA'}}}]},x=validateHeatRecoverySystemAndStorageBindings(po,{enabled:true,systemId:'cycleA'},{volume_m3:0});if(x.legacyAllowed||x.legacySuppressedBySystemId!=='cycleA')throw Error(JSON.stringify(x));});
  test('graph storage recovery requires exact stateful storage identity',()=>{const po={refrigeration:[{dynamicComponentId:'cycleA',dynamicHeatRecovery:{routing:{storageComponentId:'storeA'}}}]},okx=validateHeatRecoverySystemAndStorageBindings(po,{enabled:false},{volume_m3:10,componentId:'storeA'}),bad=validateHeatRecoverySystemAndStorageBindings(po,{enabled:false},{volume_m3:10,componentId:'storeB'});if(okx.issues.some(i=>i.severity==='error')||!bad.issues.some(i=>i.code==='GRAPH_STORAGE_DESTINATION_UNBOUND'))throw Error(JSON.stringify({okx,bad}));});
  test('multiple graph storage destinations require a state for each component id',()=>{const po={refrigeration:[{dynamicComponentId:'a',dynamicHeatRecovery:{routing:{storageComponentId:'storeA'}}},{dynamicComponentId:'b',dynamicHeatRecovery:{routing:{storageComponentId:'storeB'}}}]},x=validateHeatRecoverySystemAndStorageBindings(po,{enabled:false},[{volume_m3:10,componentId:'storeA'}]);if(!x.issues.some(i=>i.code==='GRAPH_STORAGE_DESTINATION_UNBOUND'&&i.refs?.storageComponentId==='storeB'))throw Error(JSON.stringify(x));});
  test('dynamic recovery dispatch charges only the explicitly bound storage identity',()=>{const tank=createTankState(normalizeTankSpec({componentId:'storeA',volume_m3:10,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),po={refrigeration:[{dynamicComponentId:'cycleA',dynamicHeatRecovery:{feasible:true,id:'hr',systemId:'cycleA',approach_K:3,hourlyCapacityLimited_W:Float64Array.from([50000]),hourlyCondensingTemperature_K:Float64Array.from([343.15]),routing:{systemId:'cycleA',storageComponentId:'storeA',priority:'storageFirst'}}}]},r=dispatchDynamicPhaseHeatRecoveryHour(po,new Map([['storeA',tank]]),{hour:0});if(!(r.toStorage_W>0&&r.ambient_W<50000))throw Error(JSON.stringify(r));});
  test('graph thermal source charging binds named profile and charges exact storage',()=>{const tank=createTankState(normalizeTankSpec({componentId:'storeA',volume_m3:10,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),po={storageCharging:[{storageComponentId:'storeA',sourceComponentId:'solar'}]},profiles={solar:{available_W:Float64Array.from([50000]),supplyTemperature_C:Float64Array.from([70]),accountingMode:'nonPurchased'}},r=dispatchStorageChargingHour(po,new Map([['storeA',tank]]),profiles,{hour:0});if(!(r.charged_W>0&&r.byStorage_W.storeA===r.charged_W&&r.bySource_W.solar===r.charged_W))throw Error(JSON.stringify(r));});
  test('thermal source binding rejects unpriced purchased-energy ambiguity',()=>{const p={profiles:{outdoor_C:Float64Array.from([10])},thermalSourceProfiles:{src:{available_W:10000,supplyTemperature_C:70}}},po={storageCharging:[{storageComponentId:'st',sourceComponentId:'src'}]},x=validateHeatRecoverySystemAndStorageBindings(po,{enabled:false},[{componentId:'st',volume_m3:1}],p,1);if(!x.issues.some(i=>i.code==='THERMAL_SOURCE_ACCOUNTING_MODE_REQUIRED'))throw Error(JSON.stringify(x));});
  test('thermal source resolver accepts already-accounted profile references',()=>{const p={profiles:{outdoor_C:Float64Array.from([10,11]),q:Float64Array.from([1000,2000]),t:Float64Array.from([65,66])},thermalSourceProfiles:{src:{availableProfileRef:'q',supplyTemperatureProfileRef:'t',accountingMode:'alreadyAccounted'}}},r=resolveNamedThermalSourceProfiles(p,2);if(r.issues.length||r.profiles.src.available_W[1]!==2000||r.profiles.src.supplyTemperature_C[0]!==65)throw Error(JSON.stringify(r));});
  test('Worker preamble executes storage-source charging',()=>{const src=thermalWorkerPreamble()+`\nconst st=createTankState(normalizeTankSpec({componentId:'s',volume_m3:2,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6}));return dispatchStorageChargingHour({storageCharging:[{storageComponentId:'s',sourceComponentId:'q'}]},new Map([['s',st]]),{q:{available_W:Float64Array.from([20000]),supplyTemperature_C:Float64Array.from([70]),accountingMode:'nonPurchased'}},{hour:0});`,r=Function(src)();if(!(r.charged_W>0))throw Error(JSON.stringify(r));});
  test('priority source allocation consumes source availability once',()=>{const a=createTankState(normalizeTankSpec({componentId:'a',volume_m3:.05,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),b=createTankState(normalizeTankSpec({componentId:'b',volume_m3:10,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),po={storageCharging:[{storageComponentId:'a',sourceComponentId:'src',allocation:{mode:'priority',rank:0}},{storageComponentId:'b',sourceComponentId:'src',allocation:{mode:'priority',rank:1}}]},profiles={src:{available_W:Float64Array.from([50000]),supplyTemperature_C:Float64Array.from([70]),accountingMode:'nonPurchased'}},r=dispatchStorageChargingHour(po,new Map([['a',a],['b',b]]),profiles,{hour:0});if(!(near(r.available_W,50000,1e-9)&&near(r.charged_W+r.unused_W,50000,1e-6)&&r.byStorage_W.a>0&&r.byStorage_W.b>0))throw Error(JSON.stringify(r));});
  test('fixed-share source allocation preserves declared split',()=>{const a=createTankState(normalizeTankSpec({componentId:'a',volume_m3:10,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),b=createTankState(normalizeTankSpec({componentId:'b',volume_m3:10,Tcold_C:30,Thot_C:60,initialSOC:0,maxCharge_W:1e6})),po={storageCharging:[{storageComponentId:'a',sourceComponentId:'src',allocation:{mode:'fixedShares',share:.25}},{storageComponentId:'b',sourceComponentId:'src',allocation:{mode:'fixedShares',share:.75}}]},profiles={src:{available_W:Float64Array.from([40000]),supplyTemperature_C:Float64Array.from([70]),accountingMode:'nonPurchased'}},r=dispatchStorageChargingHour(po,new Map([['a',a],['b',b]]),profiles,{hour:0});if(!(near(r.byStorage_W.a/r.byStorage_W.b,1/3,1e-9)&&near(r.available_W,40000,1e-9)))throw Error(JSON.stringify(r));});

  test('plant cycling minimum runtime creates explicit forced excess',()=>{const st=createPlantCyclingState(normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[100000],minModulationFraction:.3}}),{enabled:true,minRuntime_s:7200});const a=advancePlantCyclingState(st,80000),b=advancePlantCyclingState(st,0);if(a.startedModuleIds.length!==1||!(b.forcedExcess_W>29999))throw Error(JSON.stringify({a,b}));});
  test('plant cycling minimum off time exposes restart-blocked unmet load',()=>{const st=createPlantCyclingState(normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[100000],minModulationFraction:.2}}),{enabled:true,minOffTime_s:7200});advancePlantCyclingState(st,80000);advancePlantCyclingState(st,0);const c=advancePlantCyclingState(st,80000);if(!(c.restartBlockedUnmet_W>79999))throw Error(JSON.stringify(c));});
  test('Worker preamble executes annual plant cycling state functions',()=>{const src=thermalWorkerPreamble()+`\nconst p=normalizeHeatPumpPlant({heatPumpPlant:{moduleCapacities_W:[100000],minModulationFraction:.3}}),s=createPlantCyclingState(p,{enabled:true,minRuntime_s:7200});advancePlantCyclingState(s,80000);return advancePlantCyclingState(s,0);`,r=Function(src)();if(!(r.forcedExcess_W>29999))throw Error(JSON.stringify(r));});
  test('annual cycling forced excess charges eligible tank and startup electricity reaches grid accounting',()=>{const p=makeDemoProject(),n=4,vals=[-10,25,-10,25],arr=x=>Float64Array.from(x);p.humidity={enabled:false};p.profiles={outdoor_C:arr(vals),internalGains_W:new Float64Array(n),electricity_per_kWh:new Float64Array(n).fill(.25),gas_per_kWh:new Float64Array(n).fill(.08),wasteTemp_C:new Float64Array(n).fill(20),wasteAvailable_W:new Float64Array(n),indoorDewPoint_C:new Float64Array(n).fill(14),outdoorRH:new Float64Array(n).fill(.5),internalMoisture_kg_s:new Float64Array(n),occupied:new Float64Array(n).fill(1),ventilationFlow_m3_s:new Float64Array(n),hotSinkDemand_W:new Float64Array(n),hotSinkTarget_C:new Float64Array(n).fill(55)};p.constraints={...p.constraints,unservedTolerance_J:1e12,comfortDegreeHourTolerance:1e6};const d={...demoDesigns()[1],hpCapacity_W:100000,heatPumpPlant:{moduleCapacities_W:[100000],minModulationFraction:.3,cycling:{enabled:true,minRuntime_s:7200,startupElectricity_J_perStart:360000}},boilerCapacity_W:180000,preheatOnCheap:false};const r=simulateCandidate(p,d,{retainTrace:true});if(!(r.totals.hpCyclingForcedExcessToTank_J>0&&r.totals.hpCyclingStartupElectricity_J===360000&&r.totals.gridImport_J>=r.totals.hpCyclingStartupElectricity_J))throw Error(JSON.stringify({cycling:r.plantCycling,totals:r.totals}));});
  return{passed:tests.filter(x=>x.ok).length,total:tests.length,tests};}

if(require.main===module){
  const self=runSelfTests();console.log(JSON.stringify(self,null,2));if(self.passed!==self.total)process.exitCode=1;
  const bench=runBenchmarks();require('fs').writeFileSync('/mnt/data/thermal-core-v0.33-benchmarks.json',JSON.stringify(bench,null,2));if(bench.passed!==bench.total)process.exitCode=1;
  const p=makeDemoProject(),designs=demoDesigns(),rank=rankCandidates(p,designs,{retainTrace:false});
  rank.robustness=robustnessAnalysis(p,designs);rank.switchingThresholds=alternativeSwitchingThresholds(p,designs);
  require('fs').writeFileSync('/mnt/data/thermal-core-v0.22-robustness.json',JSON.stringify(rank.robustness,null,2));
  require('fs').writeFileSync('/mnt/data/thermal-core-v0.22-switching-thresholds.json',JSON.stringify(rank.switchingThresholds,null,2));
  console.log('\nRANKING');for(const x of [...rank.feasible,...rank.infeasible])console.log(`${x.design.name}: feasible=${x.feasible} NPC=${x.npc.toFixed(0)} capex=${x.capex0.toFixed(0)} opex1=${x.annualOpex.toFixed(0)} heatMWh=${(kWh(x.totals.zoneHeat_J)/1000).toFixed(1)} coolMWh=${(kWh(x.totals.zoneCool_J)/1000).toFixed(1)} belowDH=${x.comfort.degreeHoursBelow.toFixed(3)} aboveDH=${x.comfort.degreeHoursAbove.toFixed(3)} tank=${x.tank.model}/${x.tank.volume_m3}m3`);
  if(rank.best)require('fs').writeFileSync('/mnt/data/thermal-core-v0.22-best.svg',schematicSVG(rank.best));require('fs').writeFileSync('/mnt/data/thermal-core-v0.22-bod.md',bodReportMarkdown(p,rank.best,rank));require('fs').writeFileSync('/mnt/data/thermal-core-v0.22-bod-model.json',JSON.stringify(bodDocumentModel(p,rank.best,rank),null,2));
}

module.exports={PHASE_PROPERTY_PROVIDER_CONTRACT,derivePhaseTopologyOwnership,deriveExhaustRecoveryOwnership,validateExhaustRecoveryBindings,normalizeThermoState,sameThermoFluid,steamCondensateExchange,vaporCompressionPHCycle,evaluatePhaseInterfaces,phaseProviderResolve,stateRequestingVaporCompression,steamControlCondensing,evaluateDynamicPhaseComponentsAnnual,validateCarrierOwnership,evaluateSteamTopology,evaluateRefrigerantTopology,evaluateDynamicCondenserHeatRecovery,evaluatePhaseTopologyOwnershipAnnual,resolveNamedHotSinkProfiles,resolveNamedThermalSourceProfiles,dispatchStorageChargingHour,createStorageStateMap,storageSnapshots,normalizeMechanicalCoolingPlant,normalizeMechanicalCoolingPlants,mechanicalStoragePlantSets,resolveSharedMechanicalStorageReservations,coldStorageRemainingChargeAcceptanceW,sharedStorageReservationCapsByPlant,sharedStorageReservationTrace,resolveMechanicalCoolingPlantDispatchPolicy,resolveMechanicalForcedExcessStoragePolicies,recordMechanicalForcedExcessDisposition,dispatchMechanicalForcedExcessToColdStorageHour,mechanicalCoolingPlantMap,mechanicalPlantCOPMultiplier,createMechanicalCoolingPlantState,createMechanicalCoolingPlantStateMap,mechanicalPlantAvailabilityFractions,mechanicalPlantAvailableCapacityW,advanceMechanicalCoolingPlantState,cloneMechanicalCoolingPlantState,predictMechanicalCoolingPlantMarginalPerformance,cloneColdStorageState,predictMechanicalForcedExcessStorageAcceptance,mechanicalCoolingPlantStateSnapshots,evaluateExplicitMechanicalPlantsHour,normalizeColdStorageSpec,createColdStorageState,coldStorageSOC,coldStorageTemperatureC,coldStorageStandingGain,coldStorageCharge,coldStorageDischarge,coldStorageSnapshot,coldProfileValue,dispatchColdStorageChargingHour,dispatchColdStorageServicesHour,resolveNamedColdSinkProfiles,resolveNamedColdSourceProfiles,dispatchGraphDirectColdSourcesHour,endogenousDirectColdSourceProfilesHour,freeCoolingResidualColdSourceProfilesHour,airsideHydronicConverterColdSourceProfilesHour,exhaustAirHydronicConverterColdSourceProfilesHour,exhaustRecoveryHydronicFirstReservationW,planHydronicFirstExhaustRecoveryHour,dispatchAirsideHydronicConvertersToColdStorageHour,mergeColdStorageChargeDispatch,createColdStorageStateMap,coldStorageSnapshots,validateColdStorageBindings,coldSourceChargingElectricityW,dispatchMechanicalColdSinksHour,validateHeatRecoverySystemAndStorageBindings,dispatchDynamicPhaseHeatRecoveryHour,dispatchStorageServicesHour,CACL2_MCA,calciumChlorideMCAProps,KFORMATE_PRODUCTS,potassiumFormateConstraints,productTableProps,KACETATE_PRODUCTS,potassiumAcetateConstraints,potassiumAcetateProductProps,GLYCOL_HIGH_MASS,glycolHighMassProps,thermalWorkerPreamble,saturationPressurePa,humidityRatioFromPv,vapourPressureFromHumidityRatio,saturationHumidityRatio,humidityRatioFromRH,dewPointFromHumidityRatio,moistAirEnthalpy_kJ_kgDA,dryAirDensity_kg_m3,condensateSpecificCooling_J_kg,normalizeHumidity,createHumidityState,coolingTerminalSupportsDehumidification,dehumidificationCapacityKgS,humidityHourDemand,processExhaustMoistureHour,processExhaustAnnualHour,normalizeProcessContaminants,createProcessContaminantState,advanceProcessContaminantState,applyHumidityRemoval,dtLog,emitterFactor,emitterCapacityW,surfaceOutputWm2,surfaceExcessK,floorSeriesResistance,floorRequiredMeanWaterC,floorHeatingCapacityW,floorRequiredMeanWaterCoolingC,floorCoolingCapacityW,heatingTerminalCapacityW,coolingTerminalCapacityW,heatPumpCOP,heatPumpCapacityFactor,coolingCOPAtReject,coolingCOP,condenserRecoveryState,effNTUCounterflow,lmtd,directHX,prandtlNumber,internalTubeNusselt,heatExchangerTubeSideFilm,directHXFromGeometry,brineFreezingPoint_C,assessFreezeMargin,convertGlycolConcentration,normalizeGlycolFluidSpec,resolveFluidProperties,hydronicScreen,heatExchangerCapacityRates,storageSensibleCapacity,colebrookFriction,frictionFactor,pipeHydraulics,hydronicFlowFromHeat,pv,netPresentCost,npvVsReference,humidifierPerformance,estimateHumidifierCost,automaticShadingHour,estimateAutomaticShadingCost,pvPowerFromIrradiance,dispatchPV,estimatePVCost,EXPERT_DEFAULTS_VERSION,EXPERT_DEFAULTS,ENVELOPE_OPTION_DEFAULTS,humidificationRequirement,humidifierPerformance,estimateHumidifierCost,automaticShadingHour,estimateAutomaticShadingCost,pvPowerFromIrradiance,dispatchPV,estimatePVCost,normalizeFreeCooling,freeCoolingHour,freeCoolingCapex,normalizeGroundCoupling,createGroundState,groundRecoveryStep,groundExchangeCapacityW,groundExchange,groundDirectHeatingHour,groundDirectCoolingHour,groundSnapshot,normalizePV,normalizeShading,normalizeHumidifier,normalizeLatentTerminal,powerLawInstalledCost,estimateComponentCost,interpolateDN,estimateHydronicPipeCost,estimateVRFCost,estimateControlsCost,envelopeGeometry,estimateEnvelopeHeatLoss,
  normalizeTankSpec,createTankState,tankSOC,tankTopTemperatureC,tankMeanTemperatureC,tankStandingLoss,tankCharge,tankDischarge,tankCapex,tankSnapshot,
  normalizeBuildingSpec,createBuildingState,building2R2CStep,hvacPowerForTarget,syntheticProfiles,programScheduleFractions,normalizeDHWDraw24,prepareProgramAnnualProject,programSensibleAirExchangeW,programRoomConstraintViolation,normalizeOperation,deliveryToMassFraction,ventilationAirHeatingCapacityW,ventilationAirCoolingCapacityW,heatingDeliverySplit,operationBounds,normalizeHydronicPipe,normalizeAirside,airsidePerformance,airsideCapex,normalizeFreeCooling,freeCoolingHour,freeCoolingCapex,normalizeGroundLongTerm,lookupAshraeBoreholeResistance,resolveEffectiveBoreholeResistance,erfApprox,erfIntegral,simpsonIntegral,convergedSimpsonIntegral,finiteLineSourceResponse,finiteLineSourceResponseConverged,rectangularBorefieldPositions,borefieldDistanceHistogram,solveLinearSystem,borefieldFLSInteractionMatrix,solveBoreholeLevelUBWT,generateBoreholeLevelUBWTFLSGFunction,eskilsonSegmentRatios,normalizeAxialSegmentRatios,borefieldSegmentGeometry,borefieldSegmentFLSInteractionMatrix,solveSegmentedUBWT,generateSegmentedUBWTSnapshotFLSResponse,generateSegmentedUBWTFLSGFunction,linearInterp1D,reconstructUBWTLoadHistory,interpResponseMatrix,generateTransientSegmentedUBWTFLSGFunction,assessSegmentedUBWTConvergence,generateUniformHeatExtractionFLSGFunction,meanFluidTemperatureFromWall,borefieldShortTermPeakOverlay,generateBorefieldGeometryCandidates,gFunctionInterpolate,borefieldWallTemperatureFromG,borefieldGFunctionSuperposition,borefieldLongTermScreen,normalizePV,normalizeShading,normalizeHumidifier,normalizeHeatingTerminal,normalizeCoolingTerminal,normalizeLatentTerminal,normalizeHeatPumpPlant,normalizePlantCycling,createPlantCyclingState,advancePlantCyclingState,plantCyclingSnapshot,normalizeReliability,normalizeSiteEnergyAvailability,assessSiteEnergyFeasibility,generateJointTopologyCandidates,jointDesignSignature,refineJointTopologyCandidates,coarseToFineJointSearch,enumerateIndexCombinations,enumerateHeatPumpPlantStages,hpPlantFailureStates,hpPlantCapacityAfterFailures,assessHeatPlantReliability,minimumBufferForCycling,generateHeatPumpPlantVariants,normalizeCandidate,legacyHeatRecoveryCapex,candidateCapex,simulateCandidate,thermalWorkerPreamble,onEvaluateCandidateCase,createCandidateEnsemble,runCandidateEnsemble,rankCandidates,scaledProfile,perturbProject,perturbDesign,defaultRobustnessScenarios,evaluateRobustnessScenario,robustnessAnalysis,pairDeltaNPC,switchingThreshold,alternativeSwitchingThresholds,bodBlock,bodDocumentModel,bodParagraphs,bodReportMarkdown,schematicSVG,makeDemoProject,demoDesigns,runBenchmarks,runSelfTests};

/* === END CANONICAL thermal-core-v0.71.js === */
global.ThermalCore = module.exports;
})(globalThis);
