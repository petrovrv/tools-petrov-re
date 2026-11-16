'use strict';

const A = window.ThermalWorkspaceAdapter; if(!A) throw new Error('ThermalWorkspaceAdapter v0.5 required');
const clone = x => JSON.parse(JSON.stringify(x));
const port = (id, kind, medium, direction, temperatureClass='low', fluid=null) => ({id,kind,medium,direction,temperatureClass,fluid:fluid||A.fluidSpecFromLegacy(medium)});
const anySourceFluid={family:'any',phase:'unspecified'};
const node = (id, type, label, ports, properties={}, meta={}) => ({id,type,label,ports,properties,meta});
const LANGS=['en','uk','de','nl','fr','es','pl'];
const TYPE_NAMES={
  heatPump:['Heat pump','Тепловий насос','Wärmepumpe','Warmtepomp','Pompe à chaleur','Bomba de calor','Pompa ciepła'],
  buffer:['Buffer','Буфер','Puffer','Buffer','Ballon tampon','Depósito de inercia','Bufor'],
  hx:['Heat exchanger','Теплообмінник','Wärmetauscher','Warmtewisselaar','Échangeur de chaleur','Intercambiador de calor','Wymiennik ciepła'],
  heatExchanger:['Heat exchanger','Теплообмінник','Wärmetauscher','Warmtewisselaar','Échangeur de chaleur','Intercambiador de calor','Wymiennik ciepła'],
  terminalGroup:['Terminal group','Група терміналів','Übergabegruppe','Afgiftesysteemgroep','Groupe de terminaux','Grupo de terminales','Grupa odbiorników'],
  boiler:['Boiler','Котел','Kessel','Ketel','Chaudière','Caldera','Kocioł'],
  chiller:['Chiller','Холодильна машина','Kältemaschine','Koelmachine','Groupe froid','Enfriadora','Agregat chłodniczy'],
  storage:['Thermal storage','Тепловий акумулятор','Wärmespeicher','Thermische opslag','Stockage thermique','Almacenamiento térmico','Magazyn ciepła'],
  header:['Header / manifold','Колектор','Verteiler / Sammler','Verdeler / collector','Collecteur','Colector','Rozdzielacz'],
  radiantFloor:['Radiant floor','Промениста підлога','Flächenheizung','Vloerverwarming','Plancher rayonnant','Suelo radiante','Ogrzewanie podłogowe'],
  airHandler:['Air handler','Вентиляційна установка','Lüftungsgerät','Luchtbehandelingskast','Centrale de traitement d’air','Unidad de tratamiento de aire','Centrala wentylacyjna'],
  borefield:['Borefield','Поле свердловин','Sondenfeld','Boorveld','Champ de sondes','Campo de sondeos','Pole odwiertów'],
  airSource:['Outdoor air','Зовнішнє повітря','Außenluft','Buitenlucht','Air extérieur','Aire exterior','Powietrze zewnętrzne'],
  source:['Heat source','Джерело тепла','Wärmequelle','Warmtebron','Source thermique','Fuente térmica','Źródło ciepła'],
  sink:['Heat sink','Теплоприймач','Wärmesenke','Warmteput','Puits thermique','Sumidero térmico','Odbiornik ciepła'],
  lake:['Lake','Озеро','See','Meer','Lac','Lago','Jezioro'],
  settlement:['Settlement','Населений пункт','Ortschaft','Nederzetting','Localité','Núcleo urbano','Miejscowość']
};
const normLang=l=>LANGS.includes(String(l||'').toLowerCase())?String(l).toLowerCase():'en';
const typeLabel=(type,lang='en')=>{const a=TYPE_NAMES[type]||[String(type)];return a[LANGS.indexOf(normLang(lang))]||a[0]};
const autoLabel=(type,index,lang)=>typeLabel(type,lang)+' '+index;
const autoMeta=(type,index)=>({autoLabel:{type,index},customLabel:false});

const CATEGORY={airSource:'source',borefield:'source',source:'source',sink:'source',lake:'site',settlement:'site',heatPump:'generator',boiler:'generator',chiller:'generator',hx:'converter',heatExchanger:'converter',buffer:'storage',storage:'storage',header:'distribution',terminalGroup:'terminal',radiantFloor:'terminal',airHandler:'terminal'};
const categoryForType=type=>CATEGORY[type]||'component';
const f=(key,label,options={})=>({key,label,...options});
const ECON_FIELDS=[
  f('capex_EUR','Installed cost',{type:'number',unit:'€',group:'economics',min:0}),
  f('maintenance_EUR_y','Maintenance',{type:'number',unit:'€/y',group:'economics',min:0}),
  f('serviceLife_y','Service life',{type:'number',unit:'y',group:'economics',min:1})
];
const ARRANGEMENT_FIELDS=[
  f('arrangementRole','Sequence role',{type:'select',group:'controls',options:['lead','lag','standby','independent']}),
  f('priorityOrder','Dispatch priority',{type:'number',group:'controls',min:1,step:1}),
  f('trainId','Plant train',{type:'text',group:'controls'})
];
const SCHEMAS={
  heatPump:[f('service','Service',{type:'select',group:'design',options:['heating','cooling','reversible']}),f('heatingCapacity_kW','Heating capacity',{type:'number',unit:'kW',group:'design'}),f('coolingCapacity_kW','Cooling capacity',{type:'number',unit:'kW',group:'design'}),f('heatingSupply_C','Heating supply',{type:'number',unit:'°C',group:'temperatures'}),f('heatingReturn_C','Heating return',{type:'number',unit:'°C',group:'temperatures'}),f('coolingSupply_C','Cooling supply',{type:'number',unit:'°C',group:'temperatures'}),f('coolingReturn_C','Cooling return',{type:'number',unit:'°C',group:'temperatures'}),f('sourceDesignIn_C','Source design inlet',{type:'number',unit:'°C',group:'temperatures'}),f('sourceDesignOut_C','Source design outlet',{type:'number',unit:'°C',group:'temperatures'}),f('COP_design','Design COP',{type:'number',group:'performance'}),f('EER_design','Design EER',{type:'number',group:'performance'}),f('minModulation_frac','Minimum modulation',{type:'number',unit:'fraction',group:'performance',min:0,max:1}),...ARRANGEMENT_FIELDS,...ECON_FIELDS],
  chiller:[f('coolingCapacity_kW','Cooling capacity',{type:'number',unit:'kW',group:'design'}),f('coolingSupply_C','Chilled-water supply',{type:'number',unit:'°C',group:'temperatures'}),f('coolingReturn_C','Chilled-water return',{type:'number',unit:'°C',group:'temperatures'}),f('sourceDesignIn_C','Condenser inlet',{type:'number',unit:'°C',group:'temperatures'}),f('sourceDesignOut_C','Condenser outlet',{type:'number',unit:'°C',group:'temperatures'}),f('EER_design','Design EER',{type:'number',group:'performance'}),...ARRANGEMENT_FIELDS,...ECON_FIELDS],
  boiler:[f('heatingCapacity_kW','Heating capacity',{type:'number',unit:'kW',group:'design'}),f('heatingSupply_C','Heating supply',{type:'number',unit:'°C',group:'temperatures'}),f('heatingReturn_C','Heating return',{type:'number',unit:'°C',group:'temperatures'}),f('efficiency','Efficiency',{type:'number',group:'performance',min:0,max:1}),f('fuel','Fuel',{type:'select',group:'design',options:['naturalGas','deliveredFuel','electricity']}),...ARRANGEMENT_FIELDS,...ECON_FIELDS],
  header:[f('connectionMode','Connection method',{type:'select',group:'topology',options:['parallel','series','cascade','independentTrains']}),f('dispatchStrategy','Dispatch strategy',{type:'select',group:'controls',options:['automatic','fixedPriority','outdoorReset','loadBased']}),f('rotationMode','Lead/lag rotation',{type:'select',group:'controls',options:['runtimeBalance','fixed','weekly','none']})],
  hx:[f('duty_kW','Design duty',{type:'number',unit:'kW',group:'design'}),f('approach_K','Minimum approach',{type:'number',unit:'K',group:'temperatures'}),f('primaryIn_C','Primary inlet',{type:'number',unit:'°C',group:'temperatures'}),f('primaryOut_C','Primary outlet',{type:'number',unit:'°C',group:'temperatures'}),f('secondaryIn_C','Secondary inlet',{type:'number',unit:'°C',group:'temperatures'}),f('secondaryOut_C','Secondary outlet',{type:'number',unit:'°C',group:'temperatures'}),f('barrier','Isolation barrier',{type:'select',group:'design',options:['singleWall','doubleWall','intermediateLoop']}),...ECON_FIELDS],
  heatExchanger:[],
  airSource:[f('climateLinked','Use project climate',{type:'boolean',group:'source'}),f('designWinter_C','Winter design temperature',{type:'number',unit:'°C',group:'temperatures'}),f('designSummer_C','Summer design temperature',{type:'number',unit:'°C',group:'temperatures'}),f('monthlyTemperature_C','Monthly temperatures',{type:'text',unit:'°C',group:'seasonality'}),f('availableCapacity_kW','Available capacity',{type:'number',unit:'kW',group:'source'}),...ECON_FIELDS],
  borefield:[f('boreCount','Bore count',{type:'number',group:'source',min:1,step:1}),f('boreDepth_m','Bore depth',{type:'number',unit:'m',group:'source'}),f('undisturbedTemp_C','Undisturbed ground',{type:'number',unit:'°C',group:'temperatures'}),f('minFluidTemp_C','Minimum fluid temperature',{type:'number',unit:'°C',group:'temperatures'}),f('maxFluidTemp_C','Maximum fluid temperature',{type:'number',unit:'°C',group:'temperatures'}),f('costPerMetre_EUR','Drilling cost',{type:'number',unit:'€/m',group:'economics'}),...ECON_FIELDS],
  lake:[f('kind','Water-body type',{type:'select',group:'source',options:['lake','reservoir','river','rawWaterMain']}),f('monthlyTemperature_C','Monthly temperatures',{type:'text',unit:'°C',group:'seasonality'}),f('availableCapacity_kW','Available capacity',{type:'number',unit:'kW',group:'source'}),f('minTemperature_C','Minimum source temperature',{type:'number',unit:'°C',group:'temperatures'}),f('minOutlet_C','Minimum allowed outlet',{type:'number',unit:'°C',group:'temperatures'}),f('externalityNote','Externality / agreement',{type:'text',group:'source'}),...ECON_FIELDS],
  source:[f('kind','Source type',{type:'text',group:'source'}),f('monthlyTemperature_C','Monthly temperatures',{type:'text',unit:'°C',group:'seasonality'}),f('availableCapacity_kW','Available capacity',{type:'number',unit:'kW',group:'source'}),f('minimumReturn_C','Minimum return',{type:'number',unit:'°C',group:'temperatures'}),...ECON_FIELDS],
  buffer:[f('volume_m3','Volume',{type:'number',unit:'m³',group:'design'}),f('designHot_C','Hot design temperature',{type:'number',unit:'°C',group:'temperatures'}),f('designCold_C','Cold design temperature',{type:'number',unit:'°C',group:'temperatures'}),...ECON_FIELDS],
  storage:[f('volume_m3','Volume',{type:'number',unit:'m³',group:'design'}),f('usableDeltaT_K','Usable temperature difference',{type:'number',unit:'K',group:'temperatures'}),f('standingLoss_pct_day','Standing loss',{type:'number',unit:'%/day',group:'performance'}),...ECON_FIELDS],
  terminalGroup:[f('design_kW','Design load',{type:'number',unit:'kW',group:'design'}),f('heatingSupply_C','Heating supply',{type:'number',unit:'°C',group:'temperatures'}),f('heatingReturn_C','Heating return',{type:'number',unit:'°C',group:'temperatures'}),f('coolingSupply_C','Cooling supply',{type:'number',unit:'°C',group:'temperatures'}),f('coolingReturn_C','Cooling return',{type:'number',unit:'°C',group:'temperatures'}),f('groupCount','Terminal groups',{type:'number',group:'design',min:1,step:1}),...ECON_FIELDS],
  radiantFloor:[f('design_kW','Design load',{type:'number',unit:'kW',group:'design'}),f('heatingSupply_C','Heating supply',{type:'number',unit:'°C',group:'temperatures'}),f('coolingSupply_C','Cooling supply',{type:'number',unit:'°C',group:'temperatures'}),...ECON_FIELDS],
  airHandler:[f('design_kW','Coil design load',{type:'number',unit:'kW',group:'design'}),f('airFlow_m3_h','Design airflow',{type:'number',unit:'m³/h',group:'design'}),f('heatingSupply_C','Heating-water supply',{type:'number',unit:'°C',group:'temperatures'}),f('coolingSupply_C','Chilled-water supply',{type:'number',unit:'°C',group:'temperatures'}),...ECON_FIELDS],
  settlement:[],sink:[]
};
SCHEMAS.heatExchanger=SCHEMAS.hx;
const propertySchema=(type)=>clone(SCHEMAS[type]||[]);

const paletteFactories = {
  heatPump: (id,index,lang) => node(id,'heatPump',autoLabel('heatPump',index,lang),[
    port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in'),
    port('sourceIn','source_loop_in',null,'in','low',anySourceFluid),port('sourceOut','source_loop_out',null,'out','low',anySourceFluid)
  ],{service:'reversible',heatingCapacity_kW:80,coolingCapacity_kW:70,heatingSupply_C:45,heatingReturn_C:35,coolingSupply_C:7,coolingReturn_C:12,sourceDesignIn_C:5,sourceDesignOut_C:2,COP_design:4,EER_design:4.5,minModulation_frac:0.25,arrangementRole:'lead',priorityOrder:1,trainId:'A',capex_EUR:65000,maintenance_EUR_y:1800,serviceLife_y:20},autoMeta('heatPump',index)),
  buffer: (id,index,lang) => node(id,'buffer',autoLabel('buffer',index,lang),[
    port('in','hydronic_return','water','in'), port('out','hydronic_supply','water','out')
  ],{volume_m3:2},autoMeta('buffer',index)),
  hx: (id,index,lang) => node(id,'heatExchanger',autoLabel('hx',index,lang),[
    port('priIn','source_loop_in','water','in'), port('priOut','source_loop_out','water','out'),
    port('secIn','source_loop_return','brine','in','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'}), port('secOut','source_loop_supply','brine','out','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'})
  ],{duty_kW:80,approach_K:2,primaryIn_C:4,primaryOut_C:3.5,secondaryIn_C:2,secondaryOut_C:5,barrier:'doubleWall',capex_EUR:22000,maintenance_EUR_y:600,serviceLife_y:20},autoMeta('hx',index)),
  terminalGroup: (id,index,lang) => node(id,'terminalGroup',autoLabel('terminalGroup',index,lang),[
    port('supplyIn','hydronic_supply','water','in'),port('returnOut','hydronic_return','water','out')
  ],{design_kW:30,heatingSupply_C:45,heatingReturn_C:35,coolingSupply_C:7,coolingReturn_C:12,groupCount:1,capex_EUR:12000,maintenance_EUR_y:400,serviceLife_y:20},autoMeta('terminalGroup',index)),
  boiler: (id,index,lang) => node(id,'boiler',autoLabel('boiler',index,lang),[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in')],{heatingCapacity_kW:80,heatingSupply_C:70,heatingReturn_C:50,efficiency:0.92,fuel:'naturalGas',arrangementRole:'lag',priorityOrder:2,trainId:'A',capex_EUR:25000,maintenance_EUR_y:1200,serviceLife_y:20},autoMeta('boiler',index)),
  chiller: (id,index,lang) => node(id,'chiller',autoLabel('chiller',index,lang),[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in'),port('sourceIn','source_loop_in',null,'in','low',anySourceFluid),port('sourceOut','source_loop_out',null,'out','low',anySourceFluid)],{coolingCapacity_kW:80,coolingSupply_C:7,coolingReturn_C:12,sourceDesignIn_C:25,sourceDesignOut_C:30,EER_design:4,arrangementRole:'lead',priorityOrder:1,trainId:'C',capex_EUR:55000,maintenance_EUR_y:1800,serviceLife_y:20},autoMeta('chiller',index)),
  storage: (id,index,lang) => node(id,'storage',autoLabel('storage',index,lang),[port('in','hydronic_return','water','in'),port('out','hydronic_supply','water','out')],{volume_m3:5},autoMeta('storage',index)),
  header: (id,index,lang) => node(id,'header',autoLabel('header',index,lang),[
    port('genSupplyInA','hydronic_supply','water','in'),port('genSupplyInB','hydronic_supply','water','in'),
    port('genReturnOutA','hydronic_return','water','out'),port('genReturnOutB','hydronic_return','water','out'),
    port('loadSupplyOutA','hydronic_supply','water','out'),port('loadSupplyOutB','hydronic_supply','water','out'),
    port('loadReturnInA','hydronic_return','water','in'),port('loadReturnInB','hydronic_return','water','in')
  ],{connectionMode:'parallel',dispatchStrategy:'automatic',rotationMode:'runtimeBalance'},autoMeta('header',index)),
  radiantFloor: (id,index,lang) => node(id,'radiantFloor',autoLabel('radiantFloor',index,lang),[port('supplyIn','hydronic_supply','water','in'),port('returnOut','hydronic_return','water','out')],{design_kW:30},autoMeta('radiantFloor',index)),
  airHandler: (id,index,lang) => node(id,'airHandler',autoLabel('airHandler',index,lang),[port('supplyIn','hydronic_supply','water','in'),port('returnOut','hydronic_return','water','out')],{design_kW:50},autoMeta('airHandler',index)),
  borefield: (id,index,lang) => node(id,'borefield',autoLabel('borefield',index,lang),[port('out','source_loop_supply','brine','out','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'}),port('in','source_loop_return','brine','in','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'})],{boreCount:12,boreDepth_m:120,undisturbedTemp_C:9,minFluidTemp_C:-2,maxFluidTemp_C:32,costPerMetre_EUR:65,capex_EUR:110000,maintenance_EUR_y:900,serviceLife_y:50},autoMeta('borefield',index)),
  airSource: (id,index,lang) => node(id,'airSource',autoLabel('airSource',index,lang),[port('out','source_loop_supply','air','out','low',{family:'air',phase:'gas'}),port('in','source_loop_return','air','in','low',{family:'air',phase:'gas'})],{climateLinked:true,designWinter_C:-8,designSummer_C:32,monthlyTemperature_C:'',availableCapacity_kW:500,capex_EUR:0,maintenance_EUR_y:0,serviceLife_y:50},autoMeta('airSource',index)),
  source: (id,index,lang) => node(id,'source',autoLabel('source',index,lang),[port('out','source_loop_supply','water','out'),port('in','source_loop_return','water','in')],{kind:'processLoop',monthlyTemperature_C:'',availableCapacity_kW:100,minimumReturn_C:5,capex_EUR:15000,maintenance_EUR_y:600,serviceLife_y:25},autoMeta('source',index)),
  sink: (id,index,lang) => node(id,'sink',autoLabel('sink',index,lang),[port('in','source_loop_return','water','in')],{capacity_kW:100},autoMeta('sink',index)),
  lake: (id,index,lang) => node(id,'lake',autoLabel('lake',index,lang),[port('out','source_loop_supply','water','out'),port('in','source_loop_return','water','in')],{kind:'lake',monthlyTemperature_C:'3,3,4,7,12,17,20,19,14,9,5,3',availableCapacity_kW:500,minTemperature_C:2,minOutlet_C:1.5,externalityNote:'Confirm permits, ecology and discharge temperature',capex_EUR:60000,maintenance_EUR_y:1200,serviceLife_y:40},autoMeta('lake',index)),
  settlement: (id,index,lang) => node(id,'settlement',autoLabel('settlement',index,lang),[],{kind:'settlement'},autoMeta('settlement',index))
};

function initialGraph(lang='en'){
  lang=normLang(lang);
  const air=paletteFactories.airSource('air1',1,lang),hp=paletteFactories.heatPump('hp1',1,lang),boiler=paletteFactories.boiler('boiler1',1,lang),hdr=paletteFactories.header('hdr1',1,lang),loadA=paletteFactories.terminalGroup('load1',1,lang),loadB=paletteFactories.radiantFloor('floor1',1,lang);
  return A.normalizeGraph({
    schema:'thermal-workspace-studio-fixture/v0.2',
    nodes:[air,hp,boiler,hdr,loadA,loadB],
    edges:[
      {id:'source-supply',from:{nodeId:'air1',portId:'out'},to:{nodeId:'hp1',portId:'sourceIn'},medium:'air'},
      {id:'source-return',from:{nodeId:'hp1',portId:'sourceOut'},to:{nodeId:'air1',portId:'in'},medium:'air'},
      {id:'hp-supply',from:{nodeId:'hp1',portId:'s'},to:{nodeId:'hdr1',portId:'genSupplyInA'},medium:'water'},
      {id:'hp-return',from:{nodeId:'hdr1',portId:'genReturnOutA'},to:{nodeId:'hp1',portId:'r'},medium:'water'},
      {id:'boiler-supply',from:{nodeId:'boiler1',portId:'s'},to:{nodeId:'hdr1',portId:'genSupplyInB'},medium:'water'},
      {id:'boiler-return',from:{nodeId:'hdr1',portId:'genReturnOutB'},to:{nodeId:'boiler1',portId:'r'},medium:'water'},
      {id:'load-supply',from:{nodeId:'hdr1',portId:'loadSupplyOutA'},to:{nodeId:'load1',portId:'supplyIn'},medium:'water'},
      {id:'load-return',from:{nodeId:'load1',portId:'returnOut'},to:{nodeId:'hdr1',portId:'loadReturnInA'},medium:'water'},
      {id:'floor-supply',from:{nodeId:'hdr1',portId:'loadSupplyOutB'},to:{nodeId:'floor1',portId:'supplyIn'},medium:'water'},
      {id:'floor-return',from:{nodeId:'floor1',portId:'returnOut'},to:{nodeId:'hdr1',portId:'loadReturnInB'},medium:'water'}
    ],
    failureDomains:[{id:'fd-header',label:'Shared header',nodeIds:['hdr1'],kind:'commonHeader'}],
    view:{positions:{air1:{x:120,y:150},hp1:{x:370,y:150},boiler1:{x:370,y:360},hdr1:{x:650,y:255},load1:{x:920,y:150},floor1:{x:920,y:360}}}
  });
}

class Controller {
  constructor(graph=null,options={}){
    this.lang=normLang(options.lang);
    this.graph=A.normalizeGraph(graph||initialGraph(this.lang));
    this.pending=null;
    this.failedDomains=[];
    this.selection={nodeIds:['hdr1']};
    this.counter=0;
    this.eventLog=[];
    this.gesture={mode:'idle'};
    this.lastConnectionRefusal=null;
  }
  _event(type,payload={}){ const e={seq:this.eventLog.length+1,type,payload:clone(payload)}; this.eventLog.push(e); return e; }
  _port(ref){ const n=this.graph.nodes.find(n=>n.id===ref.nodeId); return n && (n.ports||[]).find(p=>p.id===ref.portId); }
  select(nodeId, options={}){
    if(!this.graph.nodes.some(n=>n.id===nodeId)) throw new Error('missing node '+nodeId);
    const cur=new Set(this.selection.nodeIds||[]);
    if(options.add) cur.add(nodeId);
    else if(options.toggle){ if(cur.has(nodeId)) cur.delete(nodeId); else cur.add(nodeId); }
    else { cur.clear(); cur.add(nodeId); }
    this.selection={nodeIds:[...cur]}; this._event('select',{nodeId,options,selection:this.selection.nodeIds}); return clone(this.selection);
  }
  selectMany(nodeIds){
    const ids=[...new Set(nodeIds||[])];
    const missing=ids.filter(id=>!this.graph.nodes.some(n=>n.id===id));
    if(missing.length) throw new Error('missing node '+missing[0]);
    this.selection={nodeIds:ids}; this._event('selectMany',{nodeIds:ids}); return clone(this.selection);
  }
  add(type, position={x:650,y:500}){
    if(!paletteFactories[type]) throw new Error('unknown palette type '+type);
    let index=this.graph.nodes.filter(n=>(n.meta?.autoLabel?.type||n.type)===type).length+1,id=type+index;
    while(this.graph.nodes.some(n=>n.id===id)){index++;id=type+index;}
    this.graph=A.applyDiff(this.graph,{id:'palette-add',ops:[{type:'addNode',node:paletteFactories[type](id,index,this.lang)},{type:'setPosition',nodeId:id,x:position.x,y:position.y}]});
    this.selection={nodeIds:[id]}; this._event('add',{type,nodeId:id,position}); return id;
  }
  connect(from,to,id){
    const fp=this._port(from),tp=this._port(to);if(fp?.direction==='in'&&tp?.direction==='out'){const x=from;from=to;to=x;}
    const v=A.validateConnection(this.graph,from,to); if(!v.ok) throw new Error(v.reason);
    const edge={id:id||('edge-'+(this.graph.edges.length+1)),from:clone(from),to:clone(to),medium:(this._port(from)||{}).medium||(this._port(to)||{}).medium||null};
    this.graph=A.applyDiff(this.graph,{id:'connect',ops:[{type:'addEdge',edge}]}); this._event('connect',{edgeId:edge.id,from,to}); return edge.id;
  }
  editProperty(nodeId,key,value){
    this.graph=A.applyDiff(this.graph,{id:'inspector-edit',ops:[{type:'setProperty',nodeId,key,value}]}); this._event('editProperty',{nodeId,key,value}); return value;
  }
  editLabel(nodeId,value){
    this.graph=A.applyDiff(this.graph,{id:'label-edit',ops:[{type:'setLabel',nodeId,value,custom:true}]});
    this._event('editLabel',{nodeId,value}); return value;
  }
  relocalize(lang){
    this.lang=normLang(lang);const ops=[];
    for(const n of this.graph.nodes){const a=n.meta?.autoLabel;if(a&&!n.meta?.customLabel)ops.push({type:'setLabel',nodeId:n.id,value:autoLabel(a.type,a.index,this.lang),custom:false});}
    if(ops.length)this.graph=A.applyDiff(this.graph,{id:'relocalize-default-labels',ops});
    this._event('relocalize',{lang:this.lang,count:ops.length});return ops.length;
  }
  loadGraph(graph){
    this.graph=A.normalizeGraph(graph);this.selection={nodeIds:[]};this.pending=null;this.failedDomains=[];this.gesture={mode:'idle'};this.lastConnectionRefusal=null;
    this.relocalize(this.lang);this._event('loadGraph',{nodes:this.graph.nodes.length,edges:this.graph.edges.length});return clone(this.graph);
  }
  preview(diff){
    if(this.pending) throw new Error('pending-diff-exists');
    this.pending={diff:clone(diff),before:clone(this.graph),after:A.applyDiff(this.graph,diff)};
    this._event('preview',{diffId:diff.id||null}); return clone(this.pending);
  }
  accept(){
    if(!this.pending) return false;
    const id=this.pending.diff.id||null; this.graph=this.pending.after; this.pending=null; this.selection={nodeIds:[]}; this._event('accept',{diffId:id}); return true;
  }
  reject(){
    if(!this.pending) return false;
    const id=this.pending.diff.id||null; this.pending=null; this._event('reject',{diffId:id}); return true;
  }

  beginEdge(from, pointer=null){
    const p=this._port(from); if(!p) throw new Error('missing-port');
    this.gesture={mode:'edge',from:clone(from),pointer:pointer?clone(pointer):null,target:null,validation:null};
    this.lastConnectionRefusal=null; this._event('edgeBegin',{from,pointer}); return clone(this.gesture);
  }
  updateEdgeGesture(target=null, pointer=null){
    if(this.gesture.mode!=='edge') throw new Error('no-edge-gesture');
    let validation=null;
    if(target){ validation=A.validateConnection(this.graph,this.gesture.from,target); }
    this.gesture={...this.gesture,pointer:pointer?clone(pointer):this.gesture.pointer,target:target?clone(target):null,validation:validation?clone(validation):null};
    if(validation && !validation.ok) this.lastConnectionRefusal={reason:validation.reason,from:clone(this.gesture.from),to:clone(target)};
    else if(validation && validation.ok) this.lastConnectionRefusal=null;
    this._event('edgePreview',{target,pointer,validation}); return clone(this.gesture);
  }
  commitEdge(target=null,id=null){
    if(this.gesture.mode!=='edge') throw new Error('no-edge-gesture');
    const to=target||this.gesture.target; if(!to) throw new Error('missing-target');
    const v=A.validateConnection(this.graph,this.gesture.from,to);
    if(!v.ok){ this.lastConnectionRefusal={reason:v.reason,from:clone(this.gesture.from),to:clone(to)}; this.gesture={...this.gesture,target:clone(to),validation:clone(v)}; this._event('edgeRefused',this.lastConnectionRefusal); return {ok:false,reason:v.reason}; }
    const edgeId=this.connect(this.gesture.from,to,id); this.gesture={mode:'idle'}; this.lastConnectionRefusal=null; this._event('edgeCommit',{edgeId}); return {ok:true,edgeId};
  }
  cancelGesture(){ const prev=clone(this.gesture); this.gesture={mode:'idle'}; this._event('gestureCancel',{previous:prev.mode}); return prev; }
  moveNode(nodeId,x,y){
    if(!this.graph.nodes.some(n=>n.id===nodeId)) throw new Error('missing node '+nodeId);
    this.graph=A.applyDiff(this.graph,{id:'move-node',ops:[{type:'setPosition',nodeId,x:+x,y:+y}]});
    this._event('moveNode',{nodeId,x:+x,y:+y}); return clone(this.graph.view.positions[nodeId]);
  }
  moveSelection(dx,dy){
    const ids=this.selection.nodeIds||[]; if(!ids.length) return [];
    const selectedPositions=ids.map(id=>(this.graph.view.positions||{})[id]||{x:0,y:0});
    const minX=Math.min(...selectedPositions.map(p=>+p.x)),maxX=Math.max(...selectedPositions.map(p=>+p.x));
    const minY=Math.min(...selectedPositions.map(p=>+p.y)),maxY=Math.max(...selectedPositions.map(p=>+p.y));
    dx=Math.max(88-minX,Math.min(1012-maxX,+dx));
    dy=Math.max(38-minY,Math.min(562-maxY,+dy));
    const ops=[]; const moved=[];
    for(const id of ids){ const p=(this.graph.view.positions||{})[id]||{x:0,y:0}; const np={x:+p.x+(+dx),y:+p.y+(+dy)}; ops.push({type:'setPosition',nodeId:id,x:np.x,y:np.y}); moved.push({nodeId:id,...np}); }
    this.graph=A.applyDiff(this.graph,{id:'move-selection',ops}); this._event('moveSelection',{dx:+dx,dy:+dy,nodeIds:ids}); return moved;
  }
  editSelectedProperty(key,value){
    const ids=this.selection.nodeIds||[]; if(!ids.length) return 0;
    this.graph=A.applyDiff(this.graph,{id:'group-edit',ops:ids.map(nodeId=>({type:'setProperty',nodeId,key,value}))});
    this._event('groupEdit',{nodeIds:ids,key,value}); return ids.length;
  }
  groupInspector(){
    const ids=this.selection.nodeIds||[]; const nodes=ids.map(id=>this.graph.nodes.find(n=>n.id===id)).filter(Boolean);
    if(!nodes.length) return {nodeIds:[],commonProperties:{},mixedProperties:[]};
    const keys=[...new Set(nodes.flatMap(n=>Object.keys(n.properties||{})))]; const commonProperties={}; const mixedProperties=[];
    for(const k of keys){ const vals=nodes.map(n=>(n.properties||{})[k]); const same=vals.every(v=>JSON.stringify(v)===JSON.stringify(vals[0])); if(same) commonProperties[k]=clone(vals[0]); else mixedProperties.push(k); }
    return {nodeIds:ids.slice(),commonProperties,mixedProperties};
  }
  connectionFeedback(){
    if(this.gesture.mode==='edge') return {mode:'edge',from:clone(this.gesture.from),target:clone(this.gesture.target),validation:clone(this.gesture.validation),refusal:clone(this.lastConnectionRefusal)};
    return {mode:'idle',refusal:clone(this.lastConnectionRefusal)};
  }

  autoLayout(options={}){
    const diff=A.autoLayout(this.graph,options); this.graph=A.applyDiff(this.graph,diff); this._event('autoLayout',{options}); return clone(this.graph.view.positions);
  }
  toggleFailure(domainId){
    const i=this.failedDomains.indexOf(domainId); if(i>=0)this.failedDomains.splice(i,1); else this.failedDomains.push(domainId);
    this._event('toggleFailure',{domainId,active:this.failedDomains.includes(domainId)}); return this.failureOverlay();
  }
  failureOverlay(){ return A.failureOverlay(this.graph,this.failedDomains); }
  scene(results={}){ return A.graphToScene(this.graph,results); }
  inspector(){ return A.inspectorFields(this.graph,this.selection); }
  diagnostics(){ return A.diagnoseGraph(this.graph); }
  splitHeaderPreview(){
    const header=this.graph.nodes.find(n=>n.type==='header');
    if(!header)throw new Error('header node required');
    const incident=this.graph.edges.filter(e=>e.from.nodeId===header.id||e.to.nodeId===header.id);
    const a=incident.filter(e=>['genSupplyInA','genReturnOutA','loadSupplyOutA','loadReturnInA'].includes(e.from.nodeId===header.id?e.from.portId:e.to.portId)).map(e=>e.id);
    const b=incident.filter(e=>['genSupplyInB','genReturnOutB','loadSupplyOutB','loadReturnInB'].includes(e.from.nodeId===header.id?e.from.portId:e.to.portId)).map(e=>e.id);
    const d=A.makeSplitHeaderToTrainsDiff(this.graph,{headerNodeId:header.id,assignments:[
      {id:'A',edgeIds:a,failureDomainId:'fd-train-A',offsetY:-75},
      {id:'B',edgeIds:b,failureDomainId:'fd-train-B',offsetY:75}
    ]});
    return this.preview(d);
  }
  snapshot(){ return {graph:clone(this.graph),selection:clone(this.selection),pending:clone(this.pending),failedDomains:clone(this.failedDomains),gesture:clone(this.gesture),lastConnectionRefusal:clone(this.lastConnectionRefusal),diagnostics:this.diagnostics()}; }
}

window.ThermalStudioController={
  schema:'thermal-workspace-studio-controller/v0.6',
  diagramUIContract:{layout:'studio',regions:['palette','stage','detail','dock'],authoritativeState:'engineeringGraph',projectionAdapter:'ThermalWorkspaceAdapter/v0.5'},
  paletteTypes:Object.keys(paletteFactories),
  typeLabel,autoLabel,categoryForType,propertySchema,initialGraph, Controller
};
