/* Thermal System Optimizer terminal-family screening priors v0.1
 * D150: explicit editable terminal economics/performance used by browser candidate search.
 * These are project screening priors, not independent market benchmarks.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ThermalFamilyPriors=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SCHEMA='thermal-optimizer/family-priors/v0.1';
const BASIS={currency:'EUR_2026_order_of_magnitude',region:'BE_NW_Europe',vatExcluded:true,confidence:'screening_only',kind:'project-engineering-prior',
  note:'Editable order-of-magnitude priors for topology screening. Replace with project quotations before investment decisions.'};
const DEFAULTS={
 heating:{
  radiator:{cost:{mid_EUR_m2:55,rangeFactor:[0.60,1.65],serviceLife_y:[20,35]},performance:{supply_C:45,return_C:35,exponent:1.3,oversizeFactor:1.10}},
  floor:{cost:{mid_EUR_m2:75,rangeFactor:[0.65,1.55],serviceLife_y:[30,50]},performance:{supply_C:35,return_C:30,coveringR_m2K_W:0.04,spacing_m:0.15,surfaceLimit_C:29}},
  airPlusLocalCoils:{cost:{mid_EUR_m2:45,rangeFactor:[0.60,1.75],serviceLife_y:[15,25]},performance:{airFraction:0.45,localCoilFraction:0.70,supplyAirMax_C:40,oversizeFactor:1.10}}
 },
 cooling:{
  fanCoil:{cost:{mid_EUR_m2:50,rangeFactor:[0.60,1.70],serviceLife_y:[15,25]},performance:{supply_C:7,return_C:12,nominalOversizeFactor:1.00,designSpecificAirflow_m3_s_per_kW:1/12,coilADP_C:6,bypassFactor:0.10}},
  ceiling:{cost:{mid_EUR_m2:105,rangeFactor:[0.60,1.70],serviceLife_y:[25,40]},performance:{supply_C:16,return_C:19,surfaceMin_C:17,dewpointMargin_K:2,maxFlux_W_m2:75,waterToSurfaceApproach_K:1.5}},
  tabs:{cost:{mid_EUR_m2:65,rangeFactor:[0.55,1.85],serviceLife_y:[30,50]},performance:{supply_C:17,return_C:20,surfaceMin_C:18,dewpointMargin_K:2,maxFlux_W_m2:50,waterToSurfaceApproach_K:1.5}},
  floor:{cost:{mid_EUR_m2:75,rangeFactor:[0.65,1.65],serviceLife_y:[30,50]},performance:{supply_C:18,return_C:21,coveringR_m2K_W:0.04,spacing_m:0.15,surfaceMin_C:19,dewpointMargin_K:2,maxFlux_W_m2:35}}
 }
};
const clone=x=>JSON.parse(JSON.stringify(x));
const finite=(v,n,{min=null,max=null}={})=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(n+' must be finite');if(min!=null&&x<min)throw new Error(n+' must be >= '+min);if(max!=null&&x>max)throw new Error(n+' must be <= '+max);return x;};
function mergeDeep(a,b){const o=clone(a);for(const [k,v] of Object.entries(b||{})){if(v&&typeof v==='object'&&!Array.isArray(v)&&o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k]))o[k]=mergeDeep(o[k],v);else o[k]=clone(v);}return o;}
function validateFamily(kind,name,spec){
 if(!spec||!spec.cost||!spec.performance)throw new Error(`${kind}.${name} prior incomplete`);
 spec.cost.mid_EUR_m2=finite(spec.cost.mid_EUR_m2,`${kind}.${name}.cost.mid_EUR_m2`,{min:0});
 const rf=spec.cost.rangeFactor;if(!Array.isArray(rf)||rf.length!==2||!(+rf[0]>0)||!(+rf[1]>=+rf[0]))throw new Error(`${kind}.${name}.cost.rangeFactor invalid`);
 return spec;
}
function normalize(overrides={}){
 const x=mergeDeep(DEFAULTS,overrides);
 for(const [k,s] of Object.entries(x.heating))validateFamily('heating',k,s);
 for(const [k,s] of Object.entries(x.cooling))validateFamily('cooling',k,s);
 return{schema:SCHEMA,basis:{...BASIS},heating:x.heating,cooling:x.cooling,overridesApplied:Object.keys(overrides||{}).length>0};
}
function terminalCost(priors,kind,name,floorArea_m2){const p=priors?.[kind]?.[name];if(!p)throw new Error(`unknown ${kind} terminal family ${name}`);const area=finite(floorArea_m2,'floorArea_m2',{min:0}),mid=p.cost.mid_EUR_m2*area,rf=p.cost.rangeFactor;return{schema:SCHEMA,kind,name,driver:'conditionedFloorArea_m2',floorArea_m2:area,low:mid*rf[0],mid,high:mid*rf[1],currency:'EUR',serviceLife_y:p.cost.serviceLife_y,basis:{...BASIS}};}
function parseOverrides(v){if(v==null||v==='')return{};if(typeof v==='object')return v;const x=JSON.parse(String(v));if(!x||Array.isArray(x)||typeof x!=='object')throw new Error('familyPriorOverrides must be a JSON object');return x;}
return{schema:SCHEMA,basis:BASIS,defaults:clone(DEFAULTS),normalize,terminalCost,parseOverrides};
});

