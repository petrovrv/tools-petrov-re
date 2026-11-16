'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.ThermalWorkspaceAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){

  const PORT_COMPAT={
    hydronic_supply:['hydronic_return','hydronic_in','hydronic_supply'],
    hydronic_return:['hydronic_supply','hydronic_out','hydronic_return'],
    hydronic_in:['hydronic_supply','hydronic_out'],
    hydronic_out:['hydronic_return','hydronic_in'],
    source_loop_supply:['source_loop_return','source_loop_in'],
    source_loop_return:['source_loop_supply','source_loop_out'],
    source_loop_in:['source_loop_supply','source_loop_out'],
    source_loop_out:['source_loop_return','source_loop_in'],
    electric_out:['electric_in'],
    electric_in:['electric_out'],
    fuel_out:['fuel_in'],
    fuel_in:['fuel_out'],
    control_out:['control_in'],
    control_in:['control_out']
  };

  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  const FLUID_FAMILIES={
    water:{phase:'liquid'},
    aqueous_glycol:{phase:'liquid'},
    aqueous_brine:{phase:'liquid'},
    steam:{phase:'vapor'},
    refrigerant:{phase:'unspecified'},
    air:{phase:'gas'},
    thermal_oil:{phase:'liquid'},
    phase_change_slurry:{phase:'two-phase'}
  };

  function fluidSpecFromLegacy(medium){
    if(!medium) return null;
    if(medium==='water') return {family:'water',phase:'liquid'};
    if(medium==='brine') return {family:'aqueous_brine',solute:'unspecified',massFraction:null,concentrationBasis:null,phase:'liquid',legacy:'brine'};
    if(medium==='air') return {family:'air',phase:'gas'};
    if(medium==='refrigerant') return {family:'refrigerant',refrigerantId:null,phase:'unspecified'};
    if(medium==='steam') return {family:'steam',phase:'vapor'};
    if(medium==='thermal_oil') return {family:'thermal_oil',fluidId:null,phase:'liquid'};
    return null;
  }

  function normalizeFluidSpec(spec,legacyMedium){
    let f=spec?clone(spec):fluidSpecFromLegacy(legacyMedium);
    if(!f) return null;
    if(f.family==='glycol') f.family='aqueous_glycol';
    if(f.family==='brine') f.family='aqueous_brine';
    if(f.family==='water' && f.phase==='vapor') f.family='steam';
    if(!f.phase && FLUID_FAMILIES[f.family]) f.phase=FLUID_FAMILIES[f.family].phase;
    if(f.concentration!=null && f.massFraction==null && f.volumeFraction==null){
      if(f.concentrationBasis==='mass') f.massFraction=+f.concentration;
      else if(f.concentrationBasis==='volume') f.volumeFraction=+f.concentration;
    }
    return f;
  }

  function fluidCompatibility(a,b){
    if(!a||!b) return {ok:true,unresolved:true};
    if(a.family!==b.family) return {ok:false,reason:'fluid-family-mismatch'};
    if(a.phase&&b.phase&&a.phase!=='unspecified'&&b.phase!=='unspecified'&&a.phase!==b.phase) return {ok:false,reason:'fluid-phase-mismatch'};
    if(a.family==='aqueous_glycol'){
      if(a.glycolType&&b.glycolType&&a.glycolType!==b.glycolType) return {ok:false,reason:'glycol-type-mismatch'};
      const am=a.massFraction, bm=b.massFraction, av=a.volumeFraction, bv=b.volumeFraction;
      if(Number.isFinite(am)&&Number.isFinite(bm)&&Math.abs(am-bm)>1e-9) return {ok:false,reason:'fluid-concentration-mismatch'};
      if(Number.isFinite(av)&&Number.isFinite(bv)&&Math.abs(av-bv)>1e-9) return {ok:false,reason:'fluid-concentration-mismatch'};
      if((Number.isFinite(am)&&Number.isFinite(bv))||(Number.isFinite(av)&&Number.isFinite(bm))) return {ok:false,reason:'fluid-concentration-basis-mismatch'};
    }
    if(a.family==='aqueous_brine'){
      if(a.solute&&b.solute&&a.solute!=='unspecified'&&b.solute!=='unspecified'&&a.solute!==b.solute) return {ok:false,reason:'brine-solute-mismatch'};
      if(Number.isFinite(a.massFraction)&&Number.isFinite(b.massFraction)&&Math.abs(a.massFraction-b.massFraction)>1e-9) return {ok:false,reason:'fluid-concentration-mismatch'};
    }
    if(a.family==='refrigerant'&&a.refrigerantId&&b.refrigerantId&&a.refrigerantId!==b.refrigerantId) return {ok:false,reason:'refrigerant-mismatch'};
    if(a.family==='thermal_oil'&&a.fluidId&&b.fluidId&&a.fluidId!==b.fluidId) return {ok:false,reason:'thermal-oil-mismatch'};
    return {ok:true};
  }

  function fluidLabel(spec){
    const f=normalizeFluidSpec(spec);
    if(!f) return 'unspecified';
    if(f.family==='water') return 'Water';
    if(f.family==='steam') return 'Steam';
    if(f.family==='aqueous_glycol'){
      const t=f.glycolType==='propylene'?'PG':f.glycolType==='ethylene'?'EG':'glycol';
      const x=Number.isFinite(f.massFraction)?Math.round(f.massFraction*100)+' wt%':Number.isFinite(f.volumeFraction)?Math.round(f.volumeFraction*100)+' vol%':'';
      return (x?x+' ':'')+t;
    }
    if(f.family==='aqueous_brine'){
      const x=Number.isFinite(f.massFraction)?Math.round(f.massFraction*100)+' wt% ':'';
      return x+(f.solute||'brine');
    }
    if(f.family==='refrigerant') return f.refrigerantId||'Refrigerant';
    if(f.family==='air') return 'Air';
    if(f.family==='thermal_oil') return f.fluidId||'Thermal oil';
    if(f.family==='phase_change_slurry') return f.slurryId||'Phase-change slurry';
    return f.family;
  }

  function byId(a,id){ return a.find(x=>x.id===id); }

  function normalizeGraph(g){
    const graph=clone(g||{});
    graph.nodes=Array.isArray(graph.nodes)?graph.nodes:[];
    graph.edges=Array.isArray(graph.edges)?graph.edges:[];
    graph.failureDomains=Array.isArray(graph.failureDomains)?graph.failureDomains:[];
    graph.view=graph.view||{positions:{}};
    graph.view.positions=graph.view.positions||{};
    for(const n of graph.nodes){
      n.ports=Array.isArray(n.ports)?n.ports:[];
      for(const p of n.ports){ p.fluid=normalizeFluidSpec(p.fluid,p.medium); }
      n.properties=n.properties||{};
      n.meta=n.meta||{};
    }
    return graph;
  }

  function getNode(graph,id){ return byId(graph.nodes,id); }
  function getPort(graph,nodeId,portId){
    const n=getNode(graph,nodeId); return n&&byId(n.ports,portId);
  }

  function portCompatible(a,b){
    if(!a||!b) return {ok:false,reason:'missing-port'};
    const hydraulicFamilies=new Set(['water','aqueous_glycol','aqueous_brine','thermal_oil','phase_change_slurry']);
    const af=normalizeFluidSpec(a.fluid,a.medium), bf=normalizeFluidSpec(b.fluid,b.medium);
    if(a.medium && b.medium && a.medium!==b.medium){
      const bothHydraulic=af&&bf&&hydraulicFamilies.has(af.family)&&hydraulicFamilies.has(bf.family);
      if(!bothHydraulic) return {ok:false,reason:'medium-mismatch'};
    }
    const fc=fluidCompatibility(af,bf); if(!fc.ok) return fc;
    const allowed=PORT_COMPAT[a.kind]||[];
    if(!allowed.includes(b.kind)) return {ok:false,reason:'kind-mismatch'};
    if(a.direction==='out'&&b.direction==='out') return {ok:false,reason:'direction-mismatch'};
    if(a.direction==='in'&&b.direction==='in') return {ok:false,reason:'direction-mismatch'};
    if(a.temperatureClass&&b.temperatureClass&&a.temperatureClass!==b.temperatureClass){
      const hydraulic=af&&hydraulicFamilies.has(af.family);
      if(!hydraulic) return {ok:false,reason:'temperature-class-mismatch'};
    }
    return {ok:true};
  }

  function validateConnection(graph,from,to){
    if(from.nodeId===to.nodeId) return {ok:false,reason:'self-loop'};
    const fp=getPort(graph,from.nodeId,from.portId), tp=getPort(graph,to.nodeId,to.portId);
    if(!fp||!tp) return {ok:false,reason:'missing-port'};
    const c=portCompatible(fp,tp);
    if(!c.ok) return c;
    const duplicate=graph.edges.some(e=>e.from.nodeId===from.nodeId&&e.from.portId===from.portId&&e.to.nodeId===to.nodeId&&e.to.portId===to.portId);
    if(duplicate) return {ok:false,reason:'duplicate-edge'};
    return {ok:true};
  }

  function applyDiff(graph,diff){
    const g=normalizeGraph(graph);
    const d=clone(diff||{});
    const ops=Array.isArray(d.ops)?d.ops:[];
    for(const op of ops){
      if(op.type==='addNode'){
        if(getNode(g,op.node.id)) throw new Error('duplicate node '+op.node.id);
        g.nodes.push(clone(op.node));
      } else if(op.type==='removeNode'){
        g.nodes=g.nodes.filter(n=>n.id!==op.nodeId);
        g.edges=g.edges.filter(e=>e.from.nodeId!==op.nodeId&&e.to.nodeId!==op.nodeId);
      } else if(op.type==='addEdge'){
        const v=validateConnection(g,op.edge.from,op.edge.to);
        if(!v.ok) throw new Error('invalid edge '+v.reason);
        g.edges.push(clone(op.edge));
      } else if(op.type==='removeEdge'){
        g.edges=g.edges.filter(e=>e.id!==op.edgeId);
      } else if(op.type==='setProperty'){
        const n=getNode(g,op.nodeId); if(!n) throw new Error('missing node '+op.nodeId);
        n.properties[op.key]=clone(op.value);
      } else if(op.type==='setPosition'){
        g.view.positions[op.nodeId]={x:+op.x,y:+op.y};
      } else if(op.type==='lock'){
        const n=getNode(g,op.nodeId); if(!n) throw new Error('missing node '+op.nodeId);
        n.meta.locked=!!op.value;
      } else if(op.type==='addFailureDomain'){
        if(byId(g.failureDomains,op.domain.id)) throw new Error('duplicate failure domain '+op.domain.id);
        g.failureDomains.push(clone(op.domain));
      } else if(op.type==='removeFailureDomain'){
        g.failureDomains=g.failureDomains.filter(d=>d.id!==op.domainId);
      } else if(op.type==='setFailureDomainNodes'){
        const d=byId(g.failureDomains,op.domainId); if(!d) throw new Error('missing failure domain '+op.domainId);
        d.nodeIds=(op.nodeIds||[]).slice();
      } else throw new Error('unknown op '+op.type);
    }
    return g;
  }


  const GLYPH_LIBRARY={
    heatPump:{kind:'heat-pump',body:'rounded',symbol:'compressor',category:'generatorConverter',size:{w:136,h:54}},
    chiller:{kind:'chiller',body:'rounded',symbol:'snowflake-compressor',category:'generatorConverter',size:{w:136,h:54}},
    boiler:{kind:'boiler',body:'rounded',symbol:'flame',category:'generatorConverter',size:{w:136,h:54}},
    heatExchanger:{kind:'heat-exchanger',body:'box',symbol:'plate-x',category:'coreComponent',size:{w:136,h:54}},
    buffer:{kind:'buffer-tank',body:'tank',symbol:'strata',category:'coreComponent',size:{w:108,h:64}},
    storage:{kind:'storage-tank',body:'tank',symbol:'strata',category:'coreComponent',size:{w:108,h:64}},
    pump:{kind:'pump',body:'circle',symbol:'impeller',category:'coreComponent',size:{w:72,h:54}},
    header:{kind:'header',body:'header',symbol:'manifold',category:'distributionBus',size:{w:72,h:70}},
    terminalGroup:{kind:'terminal-group',body:'box',symbol:'coil',category:'terminalGroup',size:{w:136,h:54}},
    radiantFloor:{kind:'radiant-floor',body:'box',symbol:'serpentine',category:'terminalGroup',size:{w:136,h:54}},
    airHandler:{kind:'air-handler',body:'box',symbol:'fan-coil',category:'terminalGroup',size:{w:136,h:54}},
    borefield:{kind:'borefield',body:'ground',symbol:'u-tubes',category:'sourceSink',size:{w:136,h:64}},
    source:{kind:'source',body:'source',symbol:'source',category:'sourceSink',size:{w:116,h:54}},
    sink:{kind:'sink',body:'sink',symbol:'sink',category:'sourceSink',size:{w:116,h:54}}
  };

  function glyphDescriptor(nodeOrType){
    const t=typeof nodeOrType==='string'?nodeOrType:(nodeOrType&&nodeOrType.type);
    const base=GLYPH_LIBRARY[t]||{kind:'generic-equipment',body:'rounded',symbol:'generic',category:'coreComponent',size:{w:136,h:54}};
    const out=clone(base); out.type=t||'unknown'; return out;
  }

  function edgeFluid(graph,edge){
    const p=getPort(graph,edge.from.nodeId,edge.from.portId)||getPort(graph,edge.to.nodeId,edge.to.portId);
    return p?normalizeFluidSpec(p.fluid,p.medium):fluidSpecFromLegacy(edge.medium);
  }

  function edgeStyle(graph,edge){
    const f=edgeFluid(graph,edge), family=f&&f.family||edge.medium||'unspecified';
    const style={family,pattern:'solid',weight:'normal'};
    if(family==='steam') style.weight='heavy';
    if(family==='refrigerant') style.pattern='double';
    if(family==='air') style.pattern='wide';
    if(family==='electricity'||edge.medium==='electricity') style.pattern='dashed';
    if(family==='gas'||edge.medium==='gas'||edge.medium==='fuel') style.pattern='dash-dot';
    return style;
  }

  function nodeBox(graph,nodeId,margin=10){
    const g=normalizeGraph(graph), n=getNode(g,nodeId); if(!n) return null;
    const pos=g.view.positions[nodeId]; if(!pos) return null;
    const sz=glyphDescriptor(n).size||{w:136,h:54};
    return {left:pos.x-sz.w/2-margin,right:pos.x+sz.w/2+margin,top:pos.y-sz.h/2-margin,bottom:pos.y+sz.h/2+margin,nodeId};
  }

  function segmentHitsBox(a,b,box){
    if(Math.abs(a.x-b.x)<1e-9){ const x=a.x,y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y); return x>box.left&&x<box.right&&y1>box.top&&y0<box.bottom; }
    if(Math.abs(a.y-b.y)<1e-9){ const y=a.y,x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x); return y>box.top&&y<box.bottom&&x1>box.left&&x0<box.right; }
    return false;
  }

  function routeOrthogonalAvoiding(a,b,obstacles=[],options={}){
    const clearance=options.clearance==null?36:+options.clearance;
    if(!a||!b) return [];
    const candidates=[];
    const add=pts=>{ candidates.push(pts.filter((p,i)=>i===0||p.x!==pts[i-1].x||p.y!==pts[i-1].y)); };
    if(Math.abs(a.y-b.y)<1e-9) add([{x:a.x,y:a.y},{x:b.x,y:b.y}]);
    if(Math.abs(a.x-b.x)<1e-9) add([{x:a.x,y:a.y},{x:b.x,y:b.y}]);
    const xs=[(a.x+b.x)/2,a.x+(b.x>=a.x?clearance:-clearance),b.x-(b.x>=a.x?clearance:-clearance)];
    const ys=[(a.y+b.y)/2,a.y+(b.y>=a.y?clearance:-clearance),b.y-(b.y>=a.y?clearance:-clearance)];
    for(const o of obstacles){ xs.push(o.left-clearance,o.right+clearance); ys.push(o.top-clearance,o.bottom+clearance); }
    for(const x of [...new Set(xs.map(x=>Math.round(x*1000)/1000))]) add([{x:a.x,y:a.y},{x,y:a.y},{x,y:b.y},{x:b.x,y:b.y}]);
    for(const y of [...new Set(ys.map(y=>Math.round(y*1000)/1000))]) add([{x:a.x,y:a.y},{x:a.x,y},{x:b.x,y},{x:b.x,y:b.y}]);
    let best=null;
    for(const pts of candidates){
      let hits=0; for(let i=0;i<pts.length-1;i++) for(const o of obstacles) if(segmentHitsBox(pts[i],pts[i+1],o)) hits++;
      const len=pts.slice(1).reduce((acc,p,i)=>acc+Math.abs(p.x-pts[i].x)+Math.abs(p.y-pts[i].y),0);
      const bends=Math.max(0,pts.length-2);
      const score=hits*1e9+len+bends*0.01;
      if(!best||score<best.score) best={score,pts};
    }
    return best?best.pts:routeOrthogonal(a,b,options);
  }

  function defaultPosition(i){ return {x:120+(i%4)*220,y:120+Math.floor(i/4)*170}; }
  function graphToScene(graph,results){
    const g=normalizeGraph(graph), r=results||{};
    const points=[],segments=[],decorations=[];
    g.nodes.forEach((n,i)=>{
      const p=g.view.positions[n.id]||defaultPosition(i);
      const glyph=glyphDescriptor(n);
      points.push({id:n.id,x:p.x,y:p.y,kind:'node',hitRadius:Math.max(glyph.size.w,glyph.size.h)/2,data:{nodeId:n.id,type:n.type,label:n.label||n.id,glyph}});
      const co=buildCallout(n,r[n.id]);
      decorations.push({id:'callout:'+n.id,kind:'callout',anchor:n.id,x:p.x+36,y:p.y-28,text:co.lines,status:co.status});
      n.ports.forEach((port,pi)=>{
        const side=port.direction==='in'?-1:1;
        points.push({id:n.id+':'+port.id,x:p.x+side*42,y:p.y+(pi-(n.ports.length-1)/2)*18,kind:'port',hitRadius:12,data:{nodeId:n.id,portId:port.id,portKind:port.kind,medium:port.medium,fluid:clone(port.fluid),fluidLabel:fluidLabel(port.fluid)}});
      });
    });
    for(const e of g.edges){
      const a=points.find(p=>p.id===e.from.nodeId+':'+e.from.portId), b=points.find(p=>p.id===e.to.nodeId+':'+e.to.portId);
      if(a&&b){
        const obstacles=g.nodes.filter(n=>n.id!==e.from.nodeId&&n.id!==e.to.nodeId).map(n=>nodeBox(g,n.id,10)).filter(Boolean);
        const route=routeOrthogonalAvoiding(a,b,obstacles);
        const fluid=edgeFluid(g,e);
        segments.push({id:e.id,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},route,kind:'edge',data:{edgeId:e.id,medium:e.medium||null,fluid,fluidLabel:fluidLabel(fluid),style:edgeStyle(g,e)}});
      }
    }
    return {points,segments,decorations};
  }

  function buildCallout(node,result){
    const lines=[node.label||node.id];
    const p=node.properties||{};
    if(Number.isFinite(p.capacity_W)) lines.push((p.capacity_W/1000).toFixed(0)+' kW');
    if(result){
      if(Number.isFinite(result.load_W)) lines.push((result.load_W/1000).toFixed(0)+' kW now');
      if(Number.isFinite(result.cop)) lines.push('COP '+result.cop.toFixed(2));
      if(Number.isFinite(result.flow_m3_s)) lines.push((result.flow_m3_s*3600).toFixed(1)+' m³/h');
      if(Number.isFinite(result.supply_C)&&Number.isFinite(result.return_C)) lines.push(result.supply_C.toFixed(1)+'/'+result.return_C.toFixed(1)+' °C');
    }
    return {lines,status:node.meta&&node.meta.locked?'locked':'normal'};
  }

  function inspectorFields(graph,selection){
    const ids=(selection&&selection.nodeIds)||[];
    if(ids.length!==1) return [];
    const n=getNode(graph,ids[0]); if(!n) return [];
    const fields=[{key:'label',type:'text',label:'Label',value:n.label||n.id}];
    for(const [k,v] of Object.entries(n.properties||{})){
      if(typeof v==='number') fields.push({key:'properties.'+k,type:'number',label:k,value:v});
      else if(typeof v==='boolean') fields.push({key:'properties.'+k,type:'toggle',label:k,value:v});
      else if(typeof v==='string') fields.push({key:'properties.'+k,type:'text',label:k,value:v});
    }
    fields.push({key:'meta.locked',type:'toggle',label:'Lock against optimizer',value:!!(n.meta&&n.meta.locked)});
    return fields;
  }

  function failureOverlay(graph,failedDomainIds){
    const failed=new Set(failedDomainIds||[]), affected=new Set(), causes={};
    for(const d of graph.failureDomains||[]){
      if(!failed.has(d.id)) continue;
      for(const nid of d.nodeIds||[]){ affected.add(nid); (causes[nid]||(causes[nid]=[])).push(d.id); }
    }
    const edgeIds=[];
    for(const e of graph.edges||[]) if(affected.has(e.from.nodeId)||affected.has(e.to.nodeId)) edgeIds.push(e.id);
    return {failedNodeIds:[...affected],failedEdgeIds:edgeIds,causes};
  }



  function uniqueId(graph,base,kind){
    const used=new Set(kind==='edge'?graph.edges.map(x=>x.id):kind==='domain'?(graph.failureDomains||[]).map(x=>x.id):graph.nodes.map(x=>x.id));
    if(!used.has(base)) return base;
    let i=2; while(used.has(base+'-'+i)) i++; return base+'-'+i;
  }

  function cloneNodeWithId(node,id){
    const n=clone(node); n.id=id; n.label=(node.label||node.id)+' '+id.split(':').pop(); return n;
  }

  function replaceEndpoint(edge,oldNodeId,newNodeId){
    const e=clone(edge);
    if(e.from.nodeId===oldNodeId) e.from.nodeId=newNodeId;
    if(e.to.nodeId===oldNodeId) e.to.nodeId=newNodeId;
    return e;
  }

  // Replace one common header/collector with several independent header clones.
  // assignments: [{id:'A', edgeIds:[...], failureDomainId:'train-A'}]
  // Every edge incident to the shared header must be assigned exactly once.
  function makeSplitHeaderToTrainsDiff(graph,spec){
    const g=normalizeGraph(graph), header=getNode(g,spec.headerNodeId);
    if(!header) throw new Error('missing header '+spec.headerNodeId);
    const incident=g.edges.filter(e=>e.from.nodeId===header.id||e.to.nodeId===header.id);
    const assigned=new Map();
    for(const a of spec.assignments||[]) for(const eid of a.edgeIds||[]){
      if(assigned.has(eid)) throw new Error('edge assigned twice '+eid);
      assigned.set(eid,a);
    }
    for(const e of incident) if(!assigned.has(e.id)) throw new Error('unassigned incident edge '+e.id);
    for(const eid of assigned.keys()) if(!incident.some(e=>e.id===eid)) throw new Error('assigned edge not incident '+eid);
    const ops=[];
    // Remove shared node first; its incident edges disappear automatically.
    ops.push({type:'removeNode',nodeId:header.id});
    const pos=g.view.positions[header.id]||{x:0,y:0};
    const created=[];
    (spec.assignments||[]).forEach((a,i)=>{
      const nid=uniqueId(g,header.id+':'+(a.id||('train'+(i+1))),'node');
      const n=cloneNodeWithId(header,nid); n.meta=n.meta||{}; n.meta.topologyRole='trainHeader';
      ops.push({type:'addNode',node:n});
      ops.push({type:'setPosition',nodeId:nid,x:pos.x+(a.offsetX!=null?a.offsetX:0),y:pos.y+(a.offsetY!=null?a.offsetY:(i-(spec.assignments.length-1)/2)*110)});
      for(const eid of a.edgeIds||[]){
        const old=incident.find(e=>e.id===eid), ne=replaceEndpoint(old,header.id,nid);
        ne.id=uniqueId({...g,edges:g.edges.concat(created.map(x=>x.edge))},old.id+':'+(a.id||i+1),'edge');
        created.push({edge:ne});
        ops.push({type:'addEdge',edge:ne});
      }
      if(a.failureDomainId){
        const did=uniqueId(g,a.failureDomainId,'domain');
        ops.push({type:'addFailureDomain',domain:{id:did,label:a.failureDomainLabel||did,nodeIds:[nid],kind:'train'}});
      }
    });
    // Remove the old header from every existing failure domain; drop empty domains.
    for(const d of g.failureDomains||[]){
      if(!(d.nodeIds||[]).includes(header.id)) continue;
      const left=(d.nodeIds||[]).filter(id=>id!==header.id);
      if(left.length) ops.push({type:'setFailureDomainNodes',domainId:d.id,nodeIds:left});
      else ops.push({type:'removeFailureDomain',domainId:d.id});
    }
    return {id:spec.id||'split-header-to-trains',summary:spec.summary||'Replace common header with independent train headers',ops};
  }

  // Merge several equivalent train headers back to one common header.
  // Port IDs must be compatible because incident edges are rewired by port ID.
  function makeMergeTrainHeadersDiff(graph,spec){
    const g=normalizeGraph(graph), ids=(spec.headerNodeIds||[]).slice();
    if(ids.length<2) throw new Error('need at least two train headers');
    const headers=ids.map(id=>getNode(g,id)); if(headers.some(x=>!x)) throw new Error('missing train header');
    const template=spec.newHeader?clone(spec.newHeader):clone(headers[0]);
    template.id=spec.newHeaderId||ids[0].split(':')[0]; template.label=spec.label||'Common header';
    template.meta=template.meta||{}; template.meta.topologyRole='sharedHeader';
    const pos=ids.map(id=>g.view.positions[id]).filter(Boolean);
    const x=spec.x!=null?spec.x:(pos.length?pos.reduce((a,p)=>a+p.x,0)/pos.length:0);
    const y=spec.y!=null?spec.y:(pos.length?pos.reduce((a,p)=>a+p.y,0)/pos.length:0);
    const incident=g.edges.filter(e=>ids.includes(e.from.nodeId)||ids.includes(e.to.nodeId));
    const ops=ids.map(nodeId=>({type:'removeNode',nodeId}));
    ops.push({type:'addNode',node:template},{type:'setPosition',nodeId:template.id,x,y});
    for(const old of incident){
      const from=ids.includes(old.from.nodeId)?template.id:old.from.nodeId;
      const to=ids.includes(old.to.nodeId)?template.id:old.to.nodeId;
      // Do not recreate an edge entirely internal to the merged headers.
      if(from===template.id&&to===template.id) continue;
      const ne=clone(old); ne.id=uniqueId(g,old.id+':merged','edge'); ne.from.nodeId=from; ne.to.nodeId=to;
      ops.push({type:'addEdge',edge:ne});
    }
    for(const d of g.failureDomains||[]){
      const left=(d.nodeIds||[]).filter(id=>!ids.includes(id));
      if(left.length!==(d.nodeIds||[]).length){
        if(left.length) ops.push({type:'setFailureDomainNodes',domainId:d.id,nodeIds:left});
        else ops.push({type:'removeFailureDomain',domainId:d.id});
      }
    }
    if(spec.failureDomainId) ops.push({type:'addFailureDomain',domain:{id:spec.failureDomainId,label:spec.failureDomainLabel||spec.failureDomainId,nodeIds:[template.id],kind:'commonHeader'}});
    return {id:spec.id||'merge-trains-to-header',summary:spec.summary||'Merge train headers into one common header',ops};
  }

  // Insert HX, buffer, pump or other two-port component into an existing edge.
  function makeInsertInlineNodeDiff(graph,spec){
    const g=normalizeGraph(graph), e=byId(g.edges,spec.edgeId); if(!e) throw new Error('missing edge '+spec.edgeId);
    if(getNode(g,spec.node.id)) throw new Error('duplicate node '+spec.node.id);
    const n=clone(spec.node), inPort=byId(n.ports||[],spec.inPortId), outPort=byId(n.ports||[],spec.outPortId);
    if(!inPort||!outPort) throw new Error('missing inline ports');
    const e1={id:uniqueId(g,e.id+':a','edge'),from:clone(e.from),to:{nodeId:n.id,portId:spec.inPortId},medium:e.medium};
    const temp=normalizeGraph(g); temp.nodes.push(n); temp.edges=temp.edges.filter(x=>x.id!==e.id);
    let v=validateConnection(temp,e1.from,e1.to); if(!v.ok) throw new Error('invalid upstream '+v.reason);
    temp.edges.push(e1);
    const e2={id:uniqueId(temp,e.id+':b','edge'),from:{nodeId:n.id,portId:spec.outPortId},to:clone(e.to),medium:e.medium};
    v=validateConnection(temp,e2.from,e2.to); if(!v.ok) throw new Error('invalid downstream '+v.reason);
    const ops=[{type:'removeEdge',edgeId:e.id},{type:'addNode',node:n},{type:'addEdge',edge:e1},{type:'addEdge',edge:e2}];
    if(spec.position) ops.splice(2,0,{type:'setPosition',nodeId:n.id,x:spec.position.x,y:spec.position.y});
    return {id:spec.id||'insert-inline-node',summary:spec.summary||('Insert '+(n.label||n.id)),ops};
  }

  function makeBypassInlineNodeDiff(graph,spec){
    const g=normalizeGraph(graph), n=getNode(g,spec.nodeId); if(!n) throw new Error('missing node '+spec.nodeId);
    const incoming=g.edges.filter(e=>e.to.nodeId===n.id), outgoing=g.edges.filter(e=>e.from.nodeId===n.id);
    if(incoming.length!==1||outgoing.length!==1) throw new Error('bypass requires exactly one incoming and one outgoing edge');
    const edge={id:uniqueId(g,(spec.edgeId||('bypass:'+n.id)),'edge'),from:clone(incoming[0].from),to:clone(outgoing[0].to),medium:incoming[0].medium||outgoing[0].medium};
    const temp=normalizeGraph(g); temp.nodes=temp.nodes.filter(x=>x.id!==n.id); temp.edges=temp.edges.filter(e=>e.from.nodeId!==n.id&&e.to.nodeId!==n.id);
    const v=validateConnection(temp,edge.from,edge.to); if(!v.ok) throw new Error('invalid bypass '+v.reason);
    return {id:spec.id||'bypass-inline-node',summary:spec.summary||('Bypass '+(n.label||n.id)),ops:[{type:'removeNode',nodeId:n.id},{type:'addEdge',edge}]};
  }

  // Clone a selected train, preserving only internal edges. Shared/common-cause domains are not copied;
  // a fresh train domain may be supplied explicitly.
  function makeDuplicateTrainDiff(graph,spec){
    const g=normalizeGraph(graph), ids=new Set(spec.nodeIds||[]); if(!ids.size) throw new Error('empty train');
    const suffix=spec.suffix||'copy', map={}; const ops=[];
    for(const id of ids){
      const n=getNode(g,id); if(!n) throw new Error('missing train node '+id);
      const nid=uniqueId(g,id+':'+suffix,'node'); map[id]=nid;
      const nn=cloneNodeWithId(n,nid); nn.meta=nn.meta||{}; nn.meta.failureDomainId=spec.failureDomainId||null;
      ops.push({type:'addNode',node:nn});
      const p=g.view.positions[id]; if(p) ops.push({type:'setPosition',nodeId:nid,x:p.x+(spec.offsetX==null?80:spec.offsetX),y:p.y+(spec.offsetY==null?80:spec.offsetY)});
    }
    for(const e of g.edges){
      if(!ids.has(e.from.nodeId)||!ids.has(e.to.nodeId)) continue;
      const ne=clone(e); ne.id=uniqueId(g,e.id+':'+suffix,'edge'); ne.from.nodeId=map[e.from.nodeId]; ne.to.nodeId=map[e.to.nodeId];
      ops.push({type:'addEdge',edge:ne});
    }
    if(spec.failureDomainId) ops.push({type:'addFailureDomain',domain:{id:spec.failureDomainId,label:spec.failureDomainLabel||spec.failureDomainId,nodeIds:Object.values(map),kind:'train'}});
    return {id:spec.id||'duplicate-train',summary:spec.summary||'Duplicate independent train',nodeMap:map,ops};
  }


  function routeOrthogonal(a,b,options={}){
    const clearance=options.clearance==null?36:+options.clearance;
    if(!a||!b) return [];
    if(Math.abs(a.y-b.y)<1e-9) return [{x:a.x,y:a.y},{x:b.x,y:b.y}];
    let midX=(a.x+b.x)/2;
    if(Math.abs(b.x-a.x)<clearance*2) midX=a.x+(b.x>=a.x?clearance:-clearance);
    return [{x:a.x,y:a.y},{x:midX,y:a.y},{x:midX,y:b.y},{x:b.x,y:b.y}];
  }

  function autoLayout(graph,options={}){
    const g=normalizeGraph(graph), gapX=options.gapX||240, gapY=options.gapY||110, x0=options.x0||130, y0=options.y0||90;
    const indeg=new Map(g.nodes.map(n=>[n.id,0])), out=new Map(g.nodes.map(n=>[n.id,[]]));
    for(const e of g.edges){ if(indeg.has(e.to.nodeId)&&out.has(e.from.nodeId)){ indeg.set(e.to.nodeId,indeg.get(e.to.nodeId)+1); out.get(e.from.nodeId).push(e.to.nodeId); } }
    const rank=new Map(g.nodes.map(n=>[n.id,0]));
    const q=[...g.nodes.filter(n=>indeg.get(n.id)===0).map(n=>n.id)].sort();
    const seen=new Set();
    while(q.length){ const id=q.shift(); if(seen.has(id)) continue; seen.add(id); for(const v of (out.get(id)||[]).slice().sort()){ rank.set(v,Math.max(rank.get(v)||0,(rank.get(id)||0)+1)); indeg.set(v,indeg.get(v)-1); if(indeg.get(v)===0) q.push(v); } q.sort(); }
    for(const n of g.nodes.filter(n=>!seen.has(n.id)).sort((a,b)=>a.id.localeCompare(b.id))) rank.set(n.id,rank.get(n.id)||0);
    const cols=new Map(); for(const n of g.nodes){ const r=rank.get(n.id)||0; if(!cols.has(r)) cols.set(r,[]); cols.get(r).push(n); }
    const predecessors=new Map(g.nodes.map(n=>[n.id,[]])); for(const e of g.edges) if(predecessors.has(e.to.nodeId)) predecessors.get(e.to.nodeId).push(e.from.nodeId);
    const placedY=new Map(), ops=[];
    for(const [r,nodes] of [...cols.entries()].sort((a,b)=>a[0]-b[0])){
      nodes.sort((a,b)=>{
        const pa=(predecessors.get(a.id)||[]).map(id=>placedY.get(id)).filter(Number.isFinite);
        const pb=(predecessors.get(b.id)||[]).map(id=>placedY.get(id)).filter(Number.isFinite);
        const ya=pa.length?pa.reduce((x,y)=>x+y,0)/pa.length:Infinity, yb=pb.length?pb.reduce((x,y)=>x+y,0)/pb.length:Infinity;
        return ya-yb||a.id.localeCompare(b.id);
      });
      let cursor=y0;
      for(const n of nodes){
        if(n.meta&&n.meta.layoutLocked&&g.view.positions[n.id]){ placedY.set(n.id,g.view.positions[n.id].y); continue; }
        const gy=glyphDescriptor(n), h=(gy.size&&gy.size.h)||54, y=cursor+h/2;
        ops.push({type:'setPosition',nodeId:n.id,x:x0+r*gapX,y}); placedY.set(n.id,y); cursor=y+h/2+gapY;
      }
    }
    return {id:'auto-layout',summary:'Deterministic rank/barycentric layout',ops};
  }

  function diagnoseGraph(graph){
    const g=normalizeGraph(graph), issues=[];
    const nodeIds=new Set(g.nodes.map(n=>n.id));
    for(const e of g.edges){
      if(!nodeIds.has(e.from.nodeId)||!nodeIds.has(e.to.nodeId)) issues.push({severity:'error',code:'dangling-edge',edgeId:e.id});
      else {
        const v=validateConnection({...g,edges:g.edges.filter(x=>x.id!==e.id)},e.from,e.to);
        if(!v.ok) issues.push({severity:'error',code:'invalid-edge-'+v.reason,edgeId:e.id});
      }
    }
    const connected=new Set();
    g.edges.forEach(e=>{connected.add(e.from.nodeId);connected.add(e.to.nodeId);});
    for(const n of g.nodes) if(!connected.has(n.id) && n.type!=='annotation') issues.push({severity:'warn',code:'isolated-node',nodeId:n.id});
    for(const n of g.nodes) for(const p of n.ports||[]){ const f=normalizeFluidSpec(p.fluid,p.medium); if((f&&f.family==='aqueous_glycol'&&!f.glycolType)||(f&&f.family==='aqueous_brine'&&(!f.solute||f.solute==='unspecified'))||(f&&f.family==='refrigerant'&&!f.refrigerantId)) issues.push({severity:'warn',code:'unresolved-fluid-spec',nodeId:n.id,portId:p.id,family:f.family}); }
    const commonDomains=(g.failureDomains||[]).filter(d=>(d.nodeIds||[]).length>1);
    for(const d of commonDomains) issues.push({severity:'info',code:'common-failure-domain',domainId:d.id,nodeIds:d.nodeIds.slice()});
    return issues;
  }

  return {FLUID_FAMILIES,GLYPH_LIBRARY,fluidSpecFromLegacy,normalizeFluidSpec,fluidCompatibility,fluidLabel,glyphDescriptor,edgeFluid,edgeStyle,normalizeGraph,portCompatible,validateConnection,applyDiff,graphToScene,buildCallout,inspectorFields,failureOverlay,diagnoseGraph,routeOrthogonal,routeOrthogonalAvoiding,autoLayout,makeSplitHeaderToTrainsDiff,makeMergeTrainHeadersDiff,makeInsertInlineNodeDiff,makeBypassInlineNodeDiff,makeDuplicateTrainDiff};
});
