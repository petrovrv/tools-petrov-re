/* tools.petrov.re shared lightweight CAD scene editor
 * Authoring contract aligned with the mature CFD editor:
 * select / move / rotate / scale modes, explicit placement, Esc rollback,
 * undo/redo, multi-selection, lock/hide, context-menu hooks and orbit/pan/zoom.
 * No external dependencies.
 */
(()=>{
  "use strict";
  const V={
    add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
    sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
    mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
    dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
    cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    len:a=>Math.hypot(a[0],a[1],a[2]),
    norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]}
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const clone=o=>JSON.parse(JSON.stringify(o));
  const rotZ=(p,a)=>{const c=Math.cos(a||0),s=Math.sin(a||0);return[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]]};
  const FACES=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
  function boxVerts(o){
    const p=o.pos||[0,0,0],s=o.size||[1,1,1],hx=s[0]/2,hy=s[1]/2,hz=s[2]/2,a=o.rotZ||0;
    return [[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]].map(q=>{const r=rotZ(q,a);return[p[0]+r[0],p[1]+r[1],p[2]+r[2]]});
  }
  function stableScene(scene){
    return {meta:clone(scene?.meta||{}),objects:(scene?.objects||[]).filter(o=>!o._dynamic&&!o._derived).map(clone)};
  }
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b)};

  class DiagramSceneEditor{
    constructor(canvas,opts={}){
      this.canvas=canvas;this.ctx=canvas.getContext("2d");this.opts=opts;this.scene={objects:[]};
      this.selected=null;this.selectedSet=new Set();this.hover=null;this.ghost=null;this.placement=null;this.drag=null;
      this.mode="select";this.pointer={x:0,y:0};this.planeZ=opts.planeZ??0;this.grid=opts.grid!==false;
      this.gridSize=opts.gridSize||30;this.gridStep=opts.gridStep||2;this.background=opts.background||"#eef5f7";
      this.cam={az:-.75,el:.52,dist:35,target:[0,0,2],...(opts.camera||{})};this.fov=(opts.fov||42)*Math.PI/180;
      this.history={undo:[],redo:[],current:null,limit:opts.historyLimit||80,suspend:0};
      this._bind();this.resize();this._resetHistory();this.render();
    }
    resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);this.W=Math.max(10,r.width);this.H=Math.max(10,r.height);const w=Math.round(this.W*dpr),h=Math.round(this.H*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.dpr=dpr;}
    setScene(scene){this.scene=scene||{objects:[]};this.selected=null;this.selectedSet.clear();this.drag=null;this.cancelPlacement(false);this._resetHistory();this.opts.onSelect?.(null);this.opts.onModeChange?.(this.mode);this.render();}
    setCamera(cam){Object.assign(this.cam,cam||{});this.render();}
    frame(){
      const objs=(this.scene?.objects||[]).filter(o=>!o._dynamic&&!o.uiHidden);
      if(!objs.length)return;
      let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const o of objs){for(const p of boxVerts(o)){for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}}}
      this.cam.target=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];this.cam.dist=Math.max(5,V.len(V.sub(hi,lo))*1.45);this.render();
    }
    setMode(m){
      m=["select","move","rotate","scale","orbit"].includes(m)?m:"select";
      if(this.drag)this.cancelCurrentOperation();
      if(this.placement)this.cancelPlacement();
      this.mode=m;this.opts.onModeChange?.(m);this.render();
    }
    startPlacement(factory,meta={}){
      this.cancelCurrentOperation();this.cancelPlacement(false);this.mode="select";
      this.placement={factory,meta};const q=this.screenToPlane(this.pointer.x,this.pointer.y,this.planeZ)||[0,0,this.planeZ];this.ghost=factory(q,true);
      this.opts.onPlacementChange?.(true,meta);this.opts.onModeChange?.("place");this.render();
    }
    cancelPlacement(){if(!this.placement&&!this.ghost)return false;this.placement=null;this.ghost=null;this.opts.onPlacementChange?.(false,null);this.opts.onModeChange?.(this.mode);this.render();return true;}
    cancelCurrentOperation(){
      if(this.placement)return this.cancelPlacement();
      if(this.drag?.kind==="transform"){
        this._restoreTransformStart(this.drag);this.drag=null;this.opts.onChange?.(this.scene,{reason:"transform-cancel"});this.render();return true;
      }
      if(this.drag){this.drag=null;this.render();return true;}
      return false;
    }
    select(id,additive=false){
      if(id==null){this.selectedSet.clear();this.selected=null;}
      else if(additive){if(this.selectedSet.has(id)){this.selectedSet.delete(id);if(this.selected===id)this.selected=this.selectedSet.values().next().value??null;}else{this.selectedSet.add(id);this.selected=id;}}
      else{this.selectedSet=new Set([id]);this.selected=id;}
      if(this.history?.current){this.history.current.selection=[...this.selectedSet].filter(q=>q>=0);this.history.current.primary=this.selected>=0?this.selected:null;}
      this.opts.onSelect?.(this.getSelected(),[...this.selectedSet]);this.render();
    }
    getSelected(){return (this.scene?.objects||[]).find(o=>o.id===this.selected)||null;}
    getSelectedObjects(){const s=this.selectedSet;return (this.scene?.objects||[]).filter(o=>s.has(o.id));}
    deleteSelected(){
      const ids=new Set([...this.selectedSet].filter(id=>{const o=this.scene.objects.find(q=>q.id===id);return o&&!o.locked&&!o._derived&&!o._dynamic;}));if(!ids.size)return;
      this.scene.objects=this.scene.objects.filter(o=>!ids.has(o.id));this.selectedSet.clear();this.selected=null;this.noteHistory();this.opts.onDelete?.([...ids]);this.opts.onChange?.(this.scene,{reason:"delete"});this.opts.onSelect?.(null,[]);this.render();
    }
    cloneSelected(offset=[.8,.8,0]){
      const src=this.getSelectedObjects().filter(o=>!o._derived&&!o._dynamic);if(!src.length)return[];
      let next=this.scene.objects.reduce((m,o)=>Math.max(m,Number(o.id)||0),0)+1;const ids=[];
      for(const o of src){const q=clone(o);q.id=next++;q.name=(o.name||o.type||"Object")+" copy";q.pos=(q.pos||[0,0,0]).slice();q.pos[0]+=offset[0]||0;q.pos[1]+=offset[1]||0;q.pos[2]+=offset[2]||0;this.scene.objects.push(q);ids.push(q.id);}
      this.selectedSet=new Set(ids);this.selected=ids[0]??null;this.noteHistory();this.opts.onChange?.(this.scene,{reason:"clone"});this.opts.onSelect?.(this.getSelected(),ids);this.render();return ids;
    }
    setHidden(id,v){const o=this.scene.objects.find(q=>q.id===id);if(!o||o._derived)return;o.uiHidden=!!v;this.noteHistory();this.opts.onChange?.(this.scene,{reason:"visibility"});this.render();}
    setLocked(id,v){const o=this.scene.objects.find(q=>q.id===id);if(!o||o._derived)return;o.locked=!!v;this.noteHistory();this.opts.onChange?.(this.scene,{reason:"lock"});this.render();}
    noteHistory(){if(this.history.suspend)return;const n=this._snapshot();if(!this.history.current){this.history.current=n;return;}if(!same(this.history.current.scene,n.scene)){this.history.undo.push(this.history.current);if(this.history.undo.length>this.history.limit)this.history.undo.shift();this.history.redo.length=0;this.history.current=n;}else{this.history.current.selection=n.selection;this.history.current.primary=n.primary;}this._historyUI();}
    undo(){const h=this.history;if(!h.undo.length)return;h.redo.push(this._snapshot());const s=h.undo.pop();this._restoreSnapshot(s);this.opts.onChange?.(this.scene,{reason:"undo"});}
    redo(){const h=this.history;if(!h.redo.length)return;h.undo.push(this._snapshot());const s=h.redo.pop();this._restoreSnapshot(s);this.opts.onChange?.(this.scene,{reason:"redo"});}
    _snapshot(){return{scene:stableScene(this.scene),selection:[...this.selectedSet].filter(id=>id>=0),primary:this.selected>=0?this.selected:null};}
    _resetHistory(){this.history.undo=[];this.history.redo=[];this.history.current=this._snapshot();this._historyUI();}
    _restoreSnapshot(s){
      this.history.suspend++;try{this.scene.meta=clone(s.scene.meta||{});this.scene.objects=clone(s.scene.objects||[]);this.opts.onRestore?.(this.scene);const valid=new Set(this.scene.objects.map(o=>o.id));this.selectedSet=new Set((s.selection||[]).filter(id=>valid.has(id)));this.selected=valid.has(s.primary)?s.primary:(this.selectedSet.values().next().value??null);this.history.current=this._snapshot();}finally{this.history.suspend--;}
      this.opts.onSelect?.(this.getSelected(),[...this.selectedSet]);this._historyUI();this.render();
    }
    _historyUI(){this.opts.onHistoryChange?.({undo:this.history.undo.length,redo:this.history.redo.length});}
    eye(){const a=this.cam.az,e=this.cam.el,d=this.cam.dist,t=this.cam.target;return[t[0]+d*Math.cos(e)*Math.cos(a),t[1]+d*Math.cos(e)*Math.sin(a),t[2]+d*Math.sin(e)]}
    basis(){const eye=this.eye(),f=V.norm(V.sub(this.cam.target,eye)),world=[0,0,1],r=V.norm(V.cross(f,world)),u=V.norm(V.cross(r,f));return{eye,f,r,u}}
    project(p){const {eye,f,r,u}=this.basis(),d=V.sub(p,eye),z=V.dot(d,f);if(z<=.05)return null;const aspect=this.W/Math.max(1,this.H),t=Math.tan(this.fov/2),nx=V.dot(d,r)/(z*t*aspect),ny=V.dot(d,u)/(z*t);return{x:(nx*.5+.5)*this.W,y:(.5-ny*.5)*this.H,z}}
    ray(sx,sy){const {eye,f,r,u}=this.basis(),aspect=this.W/Math.max(1,this.H),t=Math.tan(this.fov/2),nx=sx/this.W*2-1,ny=1-sy/this.H*2,dir=V.norm(V.add(f,V.add(V.mul(r,nx*t*aspect),V.mul(u,ny*t))));return{eye,dir}}
    screenToPlane(sx,sy,z=this.planeZ){const {eye,dir}=this.ray(sx,sy);if(Math.abs(dir[2])<1e-8)return null;const t=(z-eye[2])/dir[2];if(t<=0)return null;return V.add(eye,V.mul(dir,t));}
    _screen(ev){const r=this.canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
    _objectById(id){return this.scene.objects.find(o=>o.id===id)||null;}
    _beginTransform(e,id,p){
      const additive=e.shiftKey||e.ctrlKey||e.metaKey;if(!this.selectedSet.has(id))this.select(id,additive);const objs=this.getSelectedObjects().filter(o=>!o.locked&&!o._derived&&!o._dynamic);if(!objs.length)return;
      const primary=this._objectById(this.selected);if(!primary)return;const planeZ=primary.pos?.[2]??this.planeZ,plane=this.screenToPlane(p.x,p.y,planeZ);
      this.drag={kind:"transform",mode:this.mode,start:p,plane,planeZ,objects:objs.map(o=>({id:o.id,pos:(o.pos||[0,0,0]).slice(),size:(o.size||[1,1,1]).slice(),rotZ:o.rotZ||0})),moved:false};
      try{this.canvas.setPointerCapture(e.pointerId)}catch{}
    }
    _restoreTransformStart(d){for(const s of d.objects||[]){const o=this._objectById(s.id);if(!o)continue;o.pos=s.pos.slice();o.size=s.size.slice();o.rotZ=s.rotZ;this.opts.onObjectDrag?.(o,{mode:d.mode,rollback:true});}}
    _applyTransform(e,p){const d=this.drag;if(!d||d.kind!=="transform")return;const dx=p.x-d.start.x,dy=p.y-d.start.y;d.moved=d.moved||Math.hypot(dx,dy)>2;
      if(d.mode==="move"){
        const q=this.screenToPlane(p.x,p.y,d.planeZ);if(!q||!d.plane)return;const wx=q[0]-d.plane[0],wy=q[1]-d.plane[1],snap=this.opts.snap??0;
        for(const s of d.objects){const o=this._objectById(s.id);if(!o)continue;let x=s.pos[0]+wx,y=s.pos[1]+wy;if(snap>0&&!e.altKey){x=Math.round(x/snap)*snap;y=Math.round(y/snap)*snap;}o.pos[0]=x;o.pos[1]=y;this.opts.onObjectDrag?.(o,{mode:"move"});}
      }else if(d.mode==="rotate"){
        const da=dx*.008;for(const s of d.objects){const o=this._objectById(s.id);if(!o)continue;o.rotZ=s.rotZ+da;this.opts.onObjectDrag?.(o,{mode:"rotate"});}
      }else if(d.mode==="scale"){
        const f=clamp(Math.exp(dx*.006),.08,20),fz=clamp(Math.exp(-dy*.006),.08,20);for(const s of d.objects){const o=this._objectById(s.id);if(!o)continue;o.size[0]=Math.max(.02,s.size[0]*f);o.size[1]=Math.max(.02,s.size[1]*(e.shiftKey?f:1));o.size[2]=Math.max(.02,s.size[2]*fz);this.opts.onObjectDrag?.(o,{mode:"scale"});}
      }
      this.opts.onTransformPreview?.(this.scene,d.mode);this.render();
    }
    _bind(){const c=this.canvas;
      c.addEventListener("contextmenu",e=>{e.preventDefault();const p=this._screen(e),id=this.pick(p.x,p.y);if(id!=null&&!this.selectedSet.has(id))this.select(id);this.opts.onContextMenu?.(e,this.getSelected());});
      c.addEventListener("pointerdown",e=>{const p=this._screen(e);this.pointer=p;
        if(this.placement&&e.button===0){const q=this.screenToPlane(p.x,p.y,this.planeZ);if(q){const o=this.placement.factory(q,false);if(o){this.scene.objects.push(o);this.selected=o.id;this.selectedSet=new Set([o.id]);this.noteHistory();this.opts.onPlace?.(o);this.opts.onChange?.(this.scene,{reason:"place"});this.opts.onSelect?.(o,[o.id]);}if(!e.shiftKey)this.cancelPlacement();else this.ghost=this.placement.factory(q,true);this.render();}return;}
        const id=this.pick(p.x,p.y),add=e.shiftKey||e.ctrlKey||e.metaKey;
        if(e.button===0&&id!=null){if(this.mode==="select"){this.select(id,add);this.drag={kind:"selectClick",start:p,id};}else if(["move","rotate","scale"].includes(this.mode)){this._beginTransform(e,id,p);}return;}
        if((e.button===2||e.shiftKey)&&id==null){this.drag={kind:"pan",start:p,target:this.cam.target.slice(),moved:false};}
        else if(e.button===0&&id==null){this.drag={kind:"orbit",start:p,az:this.cam.az,el:this.cam.el,target:this.cam.target.slice(),moved:false};if(!add)this.select(null);}
        else if(e.button===2){this.drag={kind:"pan",start:p,target:this.cam.target.slice(),moved:false};}
        try{c.setPointerCapture?.(e.pointerId)}catch{}
      });
      c.addEventListener("pointermove",e=>{const p=this._screen(e);this.pointer=p;
        if(this.placement){const q=this.screenToPlane(p.x,p.y,this.planeZ);if(q)this.ghost=this.placement.factory(q,true);this.opts.onPlacementMove?.(this.ghost,q);this.render();return;}
        if(!this.drag){const id=this.pick(p.x,p.y);if(id!==this.hover){this.hover=id;this.render();}return;}
        if(this.drag.kind==="selectClick")return;
        if(this.drag.kind==="orbit"){const dx=p.x-this.drag.start.x,dy=p.y-this.drag.start.y;this.drag.moved=this.drag.moved||Math.hypot(dx,dy)>2;this.cam.az=this.drag.az-dx*.008;this.cam.el=clamp(this.drag.el+dy*.008,-1.45,1.45);this.render();}
        else if(this.drag.kind==="pan"){const dx=p.x-this.drag.start.x,dy=p.y-this.drag.start.y,s=this.cam.dist*.0018,ca=Math.cos(this.cam.az),sa=Math.sin(this.cam.az);this.drag.moved=this.drag.moved||Math.hypot(dx,dy)>2;this.cam.target=[this.drag.target[0]+(sa*dx+ca*Math.sin(this.cam.el)*dy)*s,this.drag.target[1]+(-ca*dx+sa*Math.sin(this.cam.el)*dy)*s,this.drag.target[2]+Math.cos(this.cam.el)*dy*s];this.render();}
        else if(this.drag.kind==="transform")this._applyTransform(e,p);
      });
      const end=e=>{if(this.drag?.kind==="transform"){const d=this.drag;if(d.moved){this.noteHistory();this.opts.onChange?.(this.scene,{reason:"transform",mode:d.mode});}else this._restoreTransformStart(d);}this.drag=null;try{c.releasePointerCapture?.(e.pointerId)}catch{};this.render();};
      c.addEventListener("pointerup",end);c.addEventListener("pointercancel",e=>{if(this.drag?.kind==="transform")this._restoreTransformStart(this.drag);this.drag=null;try{c.releasePointerCapture?.(e.pointerId)}catch{};this.render();});
      c.addEventListener("wheel",e=>{e.preventDefault();this.cam.dist=clamp(this.cam.dist*Math.exp(e.deltaY*.001),1,2000);this.render();},{passive:false});
      window.addEventListener("resize",()=>{this.resize();this.render();});
    }
    _overflowGeometry(o){const shape=o.openingShape||"circular",n=Math.max(1,Math.round(o.count||1)),along=(o.edge==="N"||o.edge==="S")?[1,0]:[0,1],D=Math.max(.02,(o.diameterMm||120)/1000),w=shape==="rectangular"?Math.max(.02,(o.widthMm||300)/1000):D,h=shape==="rectangular"?Math.max(.02,(o.heightMm||120)/1000):D,spacing=Math.max(w*1.25,.18),zBase=(o.roofTopZ??((o.pos?.[2]||0)-((o.thresholdMm||0)/1000+h/2)))+(o.thresholdMm||0)/1000;return{shape,n,along,w,h,spacing,zBase};}
    _objectScreenBounds(o){
      if(o.shape==="overflow"||o.type==="overflow"){const g=this._overflowGeometry(o),pts=[];for(let k=0;k<g.n;k++){const off=(k-(g.n-1)/2)*g.spacing,x=o.pos[0]+g.along[0]*off,y=o.pos[1]+g.along[1]*off;for(const zz of[g.zBase,g.zBase+g.h])for(const aa of[-g.w/2,g.w/2]){const p=this.project([x+g.along[0]*aa,y+g.along[1]*aa,zz]);if(p)pts.push(p);}}if(pts.length)return{x0:Math.min(...pts.map(p=>p.x))-8,x1:Math.max(...pts.map(p=>p.x))+8,y0:Math.min(...pts.map(p=>p.y))-8,y1:Math.max(...pts.map(p=>p.y))+8,z:Math.min(...pts.map(p=>p.z))};}
      if(o.shape==="drain"){const p=this.project(o.pos||[0,0,0]);if(p)return{x0:p.x-12,x1:p.x+12,y0:p.y-12,y1:p.y+12,z:p.z};}
      const vs=boxVerts(o).map(p=>this.project(p)).filter(Boolean);if(!vs.length)return null;return{x0:Math.min(...vs.map(p=>p.x))-5,x1:Math.max(...vs.map(p=>p.x))+5,y0:Math.min(...vs.map(p=>p.y))-5,y1:Math.max(...vs.map(p=>p.y))+5,z:Math.min(...vs.map(p=>p.z))};
    }
    pick(x,y){const hits=[];for(const o of(this.scene?.objects||[])){if(o._dynamic||o.uiHidden||o.pickable===false)continue;const b=this._objectScreenBounds(o);if(b&&x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1)hits.push({id:o.id,z:b.z});}hits.sort((a,b)=>a.z-b.z);return hits[0]?.id??null;}
    _drawGrid(ctx){if(!this.grid)return;const n=this.gridSize,st=this.gridStep;ctx.save();ctx.lineWidth=1;ctx.strokeStyle="rgba(90,120,140,.18)";for(let i=-n;i<=n;i+=st){for(const seg of[[[i,-n,0],[i,n,0]],[[-n,i,0],[n,i,0]]]){const a=this.project(seg[0]),b=this.project(seg[1]);if(!a||!b)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}ctx.restore();}
    _shade(base,faceIdx,alpha){if(Array.isArray(base)){const f=[.82,1,.92,.72,.88,.78][faceIdx]||.9;return`rgba(${Math.round(base[0]*f)},${Math.round(base[1]*f)},${Math.round(base[2]*f)},${alpha})`;}return base||`rgba(120,150,170,${alpha})`;}
    _selected(o){return this.selectedSet.has(o.id)}
    _drawBox(ctx,o,ghost=false){const verts=boxVerts(o),pv=verts.map(v=>this.project(v));if(pv.every(v=>!v))return;const eye=this.eye(),faces=[];for(let fi=0;fi<FACES.length;fi++){const inds=FACES[fi],pts=inds.map(i=>pv[i]);if(pts.some(p=>!p))continue;const wc=inds.map(i=>verts[i]).reduce((a,p)=>V.add(a,p),[0,0,0]).map(v=>v/inds.length);faces.push({fi,pts,depth:V.len(V.sub(wc,eye))});}faces.sort((a,b)=>b.depth-a.depth);const selected=this._selected(o),hover=o.id===this.hover;for(const f of faces){ctx.beginPath();ctx.moveTo(f.pts[0].x,f.pts[0].y);for(let k=1;k<f.pts.length;k++)ctx.lineTo(f.pts[k].x,f.pts[k].y);ctx.closePath();const alpha=ghost?.25:(o.alpha??.9);ctx.fillStyle=this._shade(o.color||[105,135,155],f.fi,alpha);ctx.fill();ctx.strokeStyle=selected?"#58bfff":hover?"#287da7":"rgba(20,40,55,.45)";ctx.lineWidth=selected?2.7:hover?1.8:1;ctx.stroke();}
      if((o.label||o.name)&&o.showLabel){const top=this.project([o.pos[0],o.pos[1],o.pos[2]+(o.size?.[2]||0)/2+.18]);if(top){ctx.fillStyle="#d7eaf5";ctx.font="11px system-ui";ctx.textAlign="center";ctx.fillText(o.label||o.name,top.x,top.y);}}
    }
    _drawDrain(ctx,o,ghost=false){const p=this.project([o.pos[0],o.pos[1],o.pos[2]+.03]);if(!p)return;const edge=this.project([o.pos[0]+(o.radius||.25),o.pos[1],o.pos[2]+.03]),rr=edge?Math.max(5,Math.abs(edge.x-p.x)):8;ctx.save();ctx.globalAlpha=ghost?.35:1;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fillStyle=o.color||"#263846";ctx.fill();ctx.strokeStyle=this._selected(o)?"#58bfff":"#071018";ctx.lineWidth=this._selected(o)?3:1.5;ctx.stroke();for(let a=0;a<Math.PI*2;a+=Math.PI/2){ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*rr*.25,p.y+Math.sin(a)*rr*.25);ctx.lineTo(p.x+Math.cos(a)*rr*.78,p.y+Math.sin(a)*rr*.78);ctx.stroke();}ctx.restore();}
    _drawOverflow(ctx,o,ghost=false){const g=this._overflowGeometry(o),selected=this._selected(o);ctx.save();ctx.globalAlpha=ghost?.35:1;for(let k=0;k<g.n;k++){const off=(k-(g.n-1)/2)*g.spacing,x=o.pos[0]+g.along[0]*off,y=o.pos[1]+g.along[1]*off,z=g.zBase+g.h/2,p=this.project([x,y,z]);if(!p)continue;ctx.fillStyle=ghost?"rgba(228,111,91,.22)":"#071018";ctx.strokeStyle=selected?"#58bfff":o.color||"#e46f5b";ctx.lineWidth=selected?3.4:2.6;if(g.shape==="rectangular"){const a=this.project([x-g.along[0]*g.w/2,y-g.along[1]*g.w/2,g.zBase]),b=this.project([x+g.along[0]*g.w/2,y+g.along[1]*g.w/2,g.zBase+g.h]);if(a&&b){const ww=Math.max(7,Math.hypot(b.x-a.x,b.y-a.y)),hh=Math.max(6,Math.abs(b.y-a.y)+g.h*18);ctx.fillRect(p.x-ww/2,p.y-hh/2,ww,hh);ctx.strokeRect(p.x-ww/2,p.y-hh/2,ww,hh);}}else{const pv=this.project([x,y,g.zBase+g.h]),rr=pv?Math.max(4,Math.abs(pv.y-p.y)):6;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();ctx.stroke();}}
      const lp=this.project([o.pos[0],o.pos[1],g.zBase+g.h+.12]);if(lp&&!ghost){ctx.font="10.5px ui-monospace,monospace";ctx.textAlign="left";ctx.fillStyle=selected?"#9ed9ff":"#87b8d2";const geom=g.shape==="rectangular"?`${g.n}×${Math.round(o.widthMm||300)}×${Math.round(o.heightMm||120)} mm`:`${g.n}×Ø${Math.round(o.diameterMm||120)} mm`;ctx.fillText(`${geom} · sill ${Math.round(o.thresholdMm||0)} mm`,lp.x+5,lp.y-3);}ctx.restore();}
    _drawWater(ctx,o){const s=o.size||[1,1,.01],a=o.rotZ||0,z=o.pos[2]+s[2],corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>{const q=rotZ([x*s[0],y*s[1],0],a);return this.project([o.pos[0]+q[0],o.pos[1]+q[1],z]);});if(corners.some(p=>!p))return;ctx.save();ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);for(let i=1;i<4;i++)ctx.lineTo(corners[i].x,corners[i].y);ctx.closePath();ctx.fillStyle=o.color||"rgba(53,156,220,.38)";ctx.fill();ctx.strokeStyle="rgba(25,100,160,.45)";ctx.stroke();ctx.restore();}
    render(){this.resize();const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.W,this.H);ctx.fillStyle=this.background;ctx.fillRect(0,0,this.W,this.H);this._drawGrid(ctx);this.opts.beforeDraw?.(ctx,this);const objs=[...(this.scene?.objects||[])].filter(o=>!o.uiHidden);const eye=this.eye();objs.sort((a,b)=>V.len(V.sub(b.pos||[0,0,0],eye))-V.len(V.sub(a.pos||[0,0,0],eye)));for(const o of objs){if(o.shape==="water")this._drawWater(ctx,o);else if(o.shape==="drain")this._drawDrain(ctx,o,false);else if(o.shape==="overflow"||o.type==="overflow")this._drawOverflow(ctx,o,false);else this._drawBox(ctx,o,false);}if(this.ghost){const o=this.ghost;if(o.shape==="drain")this._drawDrain(ctx,o,true);else if(o.shape==="overflow"||o.type==="overflow")this._drawOverflow(ctx,o,true);else this._drawBox(ctx,o,true);}this.opts.afterDraw?.(ctx,this);}
  }
  DiagramSceneEditor.vec=V;window.DiagramSceneEditor=DiagramSceneEditor;
})();
