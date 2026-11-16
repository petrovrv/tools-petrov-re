'use strict';

const A = window.ThermalWorkspaceAdapter; if(!A) throw new Error('ThermalWorkspaceAdapter v0.4 required');
const clone = x => JSON.parse(JSON.stringify(x));
const port = (id, kind, medium, direction, temperatureClass='low', fluid=null) => ({id,kind,medium,direction,temperatureClass,fluid:fluid||A.fluidSpecFromLegacy(medium)});
const node = (id, type, label, ports, properties={}) => ({id,type,label,ports,properties,meta:{}});

const paletteFactories = {
  heatPump: id => node(id,'heatPump','Heat pump',[
    port('s','hydronic_supply','water','out'), port('r','hydronic_return','water','in')
  ],{capacity_kW:40,minModulation_frac:0.25}),
  buffer: id => node(id,'buffer','Buffer',[
    port('in','hydronic_return','water','in'), port('out','hydronic_supply','water','out')
  ],{volume_m3:2}),
  hx: id => node(id,'heatExchanger','Heat exchanger',[
    port('priIn','hydronic_return','water','in'), port('priOut','hydronic_supply','water','out'),
    port('secIn','source_loop_return','brine','in','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'}), port('secOut','source_loop_supply','brine','out','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'})
  ],{duty_kW:80,approach_K:2}),
  terminalGroup: id => node(id,'terminalGroup','Terminal group',[
    port('in','hydronic_return','water','in')
  ],{design_kW:30,groupCount:1}),
  boiler: id => node(id,'boiler','Boiler',[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in')],{capacity_kW:80,efficiency:0.92}),
  chiller: id => node(id,'chiller','Chiller',[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in')],{capacity_kW:80,COP:4.0}),
  storage: id => node(id,'storage','Thermal storage',[port('in','hydronic_return','water','in'),port('out','hydronic_supply','water','out')],{volume_m3:5}),
  header: id => node(id,'header','Header / manifold',[port('in','hydronic_return','water','in'),port('out','hydronic_supply','water','out')],{}),
  radiantFloor: id => node(id,'radiantFloor','Radiant floor',[port('in','hydronic_return','water','in')],{design_kW:30}),
  airHandler: id => node(id,'airHandler','Air handler',[port('in','hydronic_return','water','in')],{design_kW:50}),
  borefield: id => node(id,'borefield','Borefield',[port('out','source_loop_supply','brine','out','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'}),port('in','source_loop_return','brine','in','low',{family:'aqueous_glycol',glycolType:'propylene',massFraction:0.30,concentrationBasis:'mass',phase:'liquid'})],{boreCount:12}),
  source: id => node(id,'source','Heat source',[port('out','source_loop_supply','water','out')],{capacity_kW:100}),
  sink: id => node(id,'sink','Heat sink',[port('in','source_loop_return','water','in')],{capacity_kW:100})
};

function initialGraph(){
  return A.normalizeGraph({
    schema:'thermal-workspace-studio-fixture/v0.1',
    nodes:[
      node('hpA','heatPump','HP A',[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in')],{capacity_kW:70}),
      node('hpB','heatPump','HP B',[port('s','hydronic_supply','water','out'),port('r','hydronic_return','water','in')],{capacity_kW:70}),
      node('hdr','header','Common header',[
        port('inA','hydronic_return','water','in'),port('inB','hydronic_return','water','in'),
        port('outA','hydronic_supply','water','out'),port('outB','hydronic_supply','water','out')
      ],{}),
      node('loadA','terminalGroup','Zone group A',[port('in','hydronic_return','water','in')],{design_kW:55}),
      node('loadB','terminalGroup','Zone group B',[port('in','hydronic_return','water','in')],{design_kW:55})
    ],
    edges:[
      {id:'e1',from:{nodeId:'hpA',portId:'s'},to:{nodeId:'hdr',portId:'inA'},medium:'water'},
      {id:'e2',from:{nodeId:'hpB',portId:'s'},to:{nodeId:'hdr',portId:'inB'},medium:'water'},
      {id:'e3',from:{nodeId:'hdr',portId:'outA'},to:{nodeId:'loadA',portId:'in'},medium:'water'},
      {id:'e4',from:{nodeId:'hdr',portId:'outB'},to:{nodeId:'loadB',portId:'in'},medium:'water'}
    ],
    failureDomains:[{id:'fd-header',label:'Shared header',nodeIds:['hdr'],kind:'commonHeader'}],
    view:{positions:{hpA:{x:130,y:170},hpB:{x:130,y:390},hdr:{x:500,y:280},loadA:{x:850,y:170},loadB:{x:850,y:390}}}
  });
}

class Controller {
  constructor(graph=initialGraph()){
    this.graph=A.normalizeGraph(graph);
    this.pending=null;
    this.failedDomains=[];
    this.selection={nodeIds:['hdr']};
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
    let id; do{id=type+(++this.counter)}while(this.graph.nodes.some(n=>n.id===id));
    this.graph=A.applyDiff(this.graph,{id:'palette-add',ops:[{type:'addNode',node:paletteFactories[type](id)},{type:'setPosition',nodeId:id,x:position.x,y:position.y}]});
    this.selection={nodeIds:[id]}; this._event('add',{type,nodeId:id,position}); return id;
  }
  connect(from,to,id){
    const v=A.validateConnection(this.graph,from,to); if(!v.ok) throw new Error(v.reason);
    const edge={id:id||('edge-'+(this.graph.edges.length+1)),from:clone(from),to:clone(to),medium:(this._port(from)||{}).medium||null};
    this.graph=A.applyDiff(this.graph,{id:'connect',ops:[{type:'addEdge',edge}]}); this._event('connect',{edgeId:edge.id,from,to}); return edge.id;
  }
  editProperty(nodeId,key,value){
    this.graph=A.applyDiff(this.graph,{id:'inspector-edit',ops:[{type:'setProperty',nodeId,key,value}]}); this._event('editProperty',{nodeId,key,value}); return value;
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
    const d=A.makeSplitHeaderToTrainsDiff(this.graph,{headerNodeId:'hdr',assignments:[
      {id:'A',edgeIds:['e1','e3'],failureDomainId:'fd-train-A',offsetY:-75},
      {id:'B',edgeIds:['e2','e4'],failureDomainId:'fd-train-B',offsetY:75}
    ]});
    return this.preview(d);
  }
  snapshot(){ return {graph:clone(this.graph),selection:clone(this.selection),pending:clone(this.pending),failedDomains:clone(this.failedDomains),gesture:clone(this.gesture),lastConnectionRefusal:clone(this.lastConnectionRefusal),diagnostics:this.diagnostics()}; }
}

window.ThermalStudioController={
  schema:'thermal-workspace-studio-controller/v0.4',
  diagramUIContract:{layout:'studio',regions:['palette','stage','detail','dock'],authoritativeState:'engineeringGraph',projectionAdapter:'ThermalWorkspaceAdapter/v0.4'},
  paletteTypes:Object.keys(paletteFactories),
  initialGraph, Controller
};
