from pathlib import Path
import json, re, math, asyncio, statistics, datetime
from playwright.async_api import async_playwright

HTML_PATH=Path('/mnt/data/debrisrunout.html')
RUNTIME_PATH=Path('/mnt/data/diagram-scene3d.js')
html=HTML_PATH.read_text(encoding='utf-8')
runtime=RUNTIME_PATH.read_text(encoding='utf-8')

stub="""<script>window.Diagram={init:(x)=>{window.__diagramCfg=x},setDocumentLang:(l)=>{document.documentElement.lang=l},ready:()=>{},whenReady:()=>Promise.resolve()};</script>"""
html=html.replace('<script src="site-disclaimer.js" defer></script>', stub)
html=html.replace('<script src="diagram-scene3d.js"></script>', '<script>'+runtime.replace('</script>','<\\/script>')+'</script>')
html=html.replace('<script src="diagram-common.js" defer></script>', '')

hook=r'''
window.__debrisBench={
  api:()=>({sceneApi:window.DiagramScene3D?.api,sceneVersion:window.DiagramScene3D?.version||null}),
  manifest:()=>JSON.parse(document.getElementById('diagram-tool-manifest').textContent),
  presets:()=>PRESETS.map(p=>p[0]),
  palette:()=>placementItemsP8().map(p=>p.kind),
  phase4:()=>phase4SelfCheck(),
  barrierEnergy:(bar,d)=>barrierEnergyAtDeflection(bar,d),
  barrierDeflection:(bar,E)=>barrierDeflectionForEnergy(bar,E),
  barrierCapacity:(bar)=>barrierEffectiveCapacityJ(bar),
  impulse:(b,cp,n,c,pen)=>{const q=clone(b);const r=resolveImpulse(q,cp,n,c,pen);return {body:q,result:r}},
  setScene:(s)=>{scene=clone(s);ensureDefaults(scene);resetMotion(false);if(typeof syncSharedAfterLegacyMutationP8==='function')syncSharedAfterLegacyMutationP8('bench');return clone(scene)},
  getScene:()=>clone(scene),
  runDet:(s,dt,tmax,g)=>{scene=clone(s);ensureDefaults(scene);resetMotion(false);$('dt').value=dt;$('tmax').value=tmax;$('gravity').value=g;startRun();if(raf){cancelAnimationFrame(raf);raf=0}let n=0;while(sim&&!sim.done&&n++<1000000)step();return {n,sim:clone({...sim,bodies:sim?.bodies?.map(b=>({...b,barrierCross:[...b.barrierCross]})),tethers:sim?.tethers?.map(t=>({...t}))})}},
  headless:(s,dt,tmax,g,seed=1,assessmentR=45,minE=0,minM=0,pCfg=null)=>simulateHeadless(clone(s),dt,tmax,g,false,mulberry32(seed),assessmentR,minE,minM,pCfg),
  sampleRunouts:(s,N,seed,dt,tmax,g)=>{const rng=mulberry32(seed),a=[];for(let i=0;i<N;i++){const sc=sampleScene(clone(s),rng);a.push(simulateHeadless(sc,dt,tmax,g,false,rng,45,0,0,null).runout)}a.sort((x,y)=>x-y);return {r50:percentile(a,50),r90:percentile(a,90),r99:percentile(a,99),vals:a}},
  fragmentChecks:(count=100)=>{let max={massRel:0,pRel:0,lRel:0,energyExcess:0},made=0;for(let k=0;k<count;k++){const o=obj('debris',0,10);Object.assign(o,{mass:800,width:2.2,height:.28,shape:'rectangle',material:'concrete',vx0:7,vz0:-15,omega0:1.3,fragEnabled:true,fragModel:'rc',fragQ50:20,fragQSigma:.4,fragMaxFragments:6,fragMaxGeneration:2,fragMinMass:2,fragWeibullK:1.35,fragEjectFrac:.25,fragApertureDeg:100,rebarTetherEnabled:false});ensureDefaults({objects:[o],terrain:[{id:'a',x:-10,z:0,material:'concrete'},{id:'b',x:10,z:0,material:'concrete'}]});const b=createBody(o),hit={impact:160000,loss:90000,hit:{normal:{x:0,z:1}}},fr=splitBody(b,o,hit,mulberry32(1000+k),true);if(!fr)continue;made++;for(const q of Object.keys(max))max[q]=Math.max(max[q],fr.checks[q]||0)}return {made,max}},
  editorState:()=>({paletteCount:document.querySelectorAll('#palette .tool').length,presetCount:document.querySelectorAll('#preset option').length,treeCount:document.querySelectorAll('#objList .scene3d-tree-row').length,toolbarCount:document.querySelectorAll('#authoringBar button').length,view3d:document.querySelector('#view3d')?.classList.contains('on')||false}),
  loadPresetKey:(key)=>{const p=document.querySelector('#preset');p.value=key;renderPresets();loadPreset();return {key,objects:scene.objects.map(o=>o.kind),terrain:scene.terrain.length}},
  editTowerHeight:(h)=>{const t=scene.objects.find(o=>o.kind==='coolingTower');if(!t)return null;sharedHistory.beforeMutation();const before=t.h;t.h=h;sharedHistory.checkpoint();sharedChangedP8();return {before,after:t.h,canUndo:sharedHistory.canUndo()}},
  undoShared:()=>{sharedHistory.undo();return scene.objects.find(o=>o.kind==='coolingTower')?.h??null},
  redoShared:()=>{sharedHistory.redo();return scene.objects.find(o=>o.kind==='coolingTower')?.h??null},
  workflow:()=>({guide:!!document.querySelector('#guideBtn'),guidePanel:!!document.querySelector('#guidePanel'),guideSteps:typeof GUIDE_P9!=='undefined'?GUIDE_P9.length:0,resultsTab:!!document.querySelector('#editorTabs [data-v=results]'),engineeringDash:!!document.querySelector('#engineeringDash'),resultsButton:!!document.querySelector('#resultsBtn'),planModes:[...document.querySelectorAll('#planFieldMode option')].map(o=>o.value),rainbow:[spectralP9(0,1),spectralP9(.5,1),spectralP9(1,1)]}),
  ensembleState:()=>({running:ensembleRunning,partial:!!ensemble?.partial,n:ensemble?.N||0,target:ensemble?.targetN||0,hud:document.querySelector('#ensembleLiveHud')?.classList.contains('on')||false,progress:parseFloat(document.querySelector('#ensembleProgress')?.style.width)||0,r90:ensemble?.quantiles?.r90??null,cloud:ensemble?.cloud?.length||0,status:document.querySelector('#ensembleStatus')?.textContent||'',button:document.querySelector('#ensembleBtn')?.classList.contains('running')||false}),
  gpuContract:()=>({select:!!document.querySelector('#computeBackend'),options:[...document.querySelectorAll('#computeBackend option')].map(o=>o.value),max:document.querySelector('#samples')?.max,status:document.querySelector('#gpuBackendStatus')?.textContent||'',contract:typeof GPU_WGSL_P12==='string'&&GPU_WGSL_P12.includes('@compute @workgroup_size(64)')&&GPU_WGSL_P12.includes('global_invocation_id')&&String(gpuRunBatchP12).includes('dispatchWorkgroups')&&typeof gpuRuntimeSelfCheckP12==='function',gpu:!!navigator.gpu})
};
'''
pos=html.rfind('})();')
if pos<0: raise RuntimeError('IIFE end not found')
html=html[:pos]+hook+html[pos:]

# structural checks outside browser
results=[]
def add(name, passed, value=None, tolerance=None, note=None, group='framework'):
    results.append({'id':name,'group':group,'passed':bool(passed),'value':value,'tolerance':tolerance,'note':note})

# manifest parse and head placement
m=re.search(r'<script id="diagram-tool-manifest" type="application/json">(.*?)</script>', html, re.S)
manifest=json.loads(m.group(1))
add('manifest-parse', True, manifest['schema'], 'exact v2')
add('manifest-first-256k', html.find('diagram-tool-manifest') < 256*1024, html.find('diagram-tool-manifest'), '<262144 bytes')
add('scene-editor-contract', manifest.get('scene_editor',{}).get('api')=='tools.petrov.re/scene-editor/v1', manifest.get('scene_editor',{}).get('api'), 'exact API')
add('six-catalog-languages', manifest.get('catalog_languages')==['en','uk','de','nl','fr','es'], manifest.get('catalog_languages'), 'exact six-language order')

async def main():
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-gpu'])
    page=await browser.new_page(viewport={'width':1500,'height':1000})
    errors=[]
    page.on('pageerror', lambda e: errors.append('pageerror:'+str(e)))
    page.on('console', lambda msg: errors.append('console:'+msg.text) if msg.type=='error' else None)
    await page.set_content(html, wait_until='load', timeout=60000)
    await page.wait_for_function('window.__debrisBench && document.querySelectorAll("#preset option").length>0', timeout=30000)
    await page.wait_for_timeout(200)
    api=await page.evaluate('__debrisBench.api()')
    add('runtime-api', api['sceneApi']=='tools.petrov.re/scene-editor/v1', api, 'API v1', group='editor')
    st=await page.evaluate('__debrisBench.editorState()')
    add('palette-count', st['paletteCount']==9, st['paletteCount'], '9', group='editor')
    add('preset-count', st['presetCount']==10, st['presetCount'], '10', group='editor')
    add('authoring-toolbar', st['toolbarCount']>=6, st['toolbarCount'], '>=6', group='editor')
    presets=await page.evaluate('__debrisBench.presets()')
    # load all presets and ensure finite objects; tower presence where expected
    preset_details=[]
    for key in presets:
      d=await page.evaluate('(k)=>__debrisBench.loadPresetKey(k)', key)
      preset_details.append(d)
      ok=d['terrain']>=2 and len(d['objects'])>0
      add('preset-'+key, ok, {'objects':len(d['objects']),'terrain':d['terrain']}, 'non-empty scene', group='editor')
    tower_expected={'cooling','coolingBare','coolingShellSurf'}
    for d in preset_details:
      if d['key'] in tower_expected:
        add('tower-present-'+d['key'], 'coolingTower' in d['objects'], d['objects'], 'contains coolingTower', group='editor')
    # undo/redo property mutation on cooling preset
    await page.evaluate("__debrisBench.loadPresetKey('cooling')")
    er=await page.evaluate('__debrisBench.editTowerHeight(96)')
    u=await page.evaluate('__debrisBench.undoShared()')
    r=await page.evaluate('__debrisBench.redoShared()')
    add('history-tower-edit', er and abs(er['before']-92)<1e-9 and abs(er['after']-96)<1e-9 and abs(u-92)<1e-9 and abs(r-96)<1e-9, {'edit':er,'undo':u,'redo':r}, '92→96→92→96 m', group='editor')

    # phase4 algebraic checks
    p4=await page.evaluate('__debrisBench.phase4()')
    add('barrier-inverse', p4['barrierInverseRelative']<1e-10, p4['barrierInverseRelative'], '<1e-10', group='physics')
    add('tether-momentum', p4['tetherMomentumRelative']<1e-12, p4['tetherMomentumRelative'], '<1e-12', group='physics')
    add('tether-rupture', p4['rupture'] is True, p4['rupture'], 'true', group='physics')

    # normal restitution at COM: vn_after = -e_eff vn
    impulse=await page.evaluate('''()=>__debrisBench.impulse({mass:10,I:2,x:0,z:0,vx:0,vz:-8,omega:0},{x:0,z:0},{x:0,z:1},{e0:.6,mu:0,vDep:0,softness:0},0)''')
    expected=4.8
    add('normal-restitution', abs(impulse['body']['vz']-expected)<1e-12, impulse['body']['vz'], 'abs <=1e-12 vs 4.8 m/s', group='physics')
    # impact energy effective mass at COM = 0.5 m v^2
    add('impact-energy', abs(impulse['result']['impact']-320)<1e-10, impulse['result']['impact'], 'abs <=1e-10 vs 320 J', group='physics')

    # free fall & lateral ballistic full deterministic solver
    scene_free={
      'name':'bench-free','backdrop':'none',
      'terrain':[{'id':'t1','x':-100,'z':-1000,'material':'concrete'},{'id':'t2','x':200,'z':-1000,'material':'concrete'}],
      'objects':[{'id':1,'kind':'debris','name':'body','x':0,'y0':2,'z':100,'angle':0.2,'azimuthDeg':30,'vx0':10,'vz0':3,'omega0':0.7,'mass':100,'width':1,'height':1,'shape':'rectangle','material':'steel','eScale':1,'muScale':1,'fragEnabled':False}]
    }
    det=await page.evaluate('(a)=>__debrisBench.runDet(a.s,a.dt,a.t,a.g)', {'s':scene_free,'dt':0.001,'t':1.0,'g':9.81})
    b=det['sim']['bodies'][0]; t=det['sim']['t']
    ex=10*math.cos(math.radians(30))*t
    ey=2+10*math.sin(math.radians(30))*t
    evz=3-9.81*t
    ez_cont=100+3*t-.5*9.81*t*t
    # semi-implicit z has known 0.5*g*t*dt error
    add('ballistic-x', abs(b['x']-ex)<2e-10, b['x']-ex, 'abs <=2e-10 m', group='physics')
    add('ballistic-y', abs(b['y']-ey)<2e-10, b['y']-ey, 'abs <=2e-10 m', group='physics')
    add('freefall-vz', abs(b['vz']-evz)<2e-10, b['vz']-evz, 'abs <=2e-10 m/s', group='physics')
    add('freefall-z-continuous', abs(b['z']-ez_cont)<0.0051, b['z']-ez_cont, 'abs <=5.1 mm at dt=1 ms', group='physics')
    add('free-rotation', abs(b['angle']-(0.2+0.7*t))<2e-10, b['angle']-(0.2+0.7*t), 'abs <=2e-10 rad', group='physics')

    # first-order convergence of semi-implicit z error
    d1=await page.evaluate('(a)=>__debrisBench.runDet(a.s,a.dt,a.t,a.g)', {'s':scene_free,'dt':0.004,'t':1.0,'g':9.81})
    d2=await page.evaluate('(a)=>__debrisBench.runDet(a.s,a.dt,a.t,a.g)', {'s':scene_free,'dt':0.002,'t':1.0,'g':9.81})
    z1=d1['sim']['bodies'][0]['z'];z2=d2['sim']['bodies'][0]['z'];
    e1=abs(z1-ez_cont);e2=abs(z2-ez_cont);ratio=e1/e2 if e2 else 999
    add('freefall-convergence', 1.95<ratio<2.05, ratio, '1.95 < e(dt)/e(dt/2) < 2.05', group='physics')

    # fragmentation invariants, many forced splits
    fc=await page.evaluate('__debrisBench.fragmentChecks(200)')
    add('fragment-mass-conservation', fc['made']==200 and fc['max']['massRel']<2e-15, fc, '200 splits; rel <2e-15', group='physics')
    add('fragment-linear-momentum', fc['max']['pRel']<2e-13, fc['max']['pRel'], '<2e-13', group='physics')
    add('fragment-angular-momentum', fc['max']['lRel']<2e-11, fc['max']['lRel'], '<2e-11', group='physics')
    add('fragment-energy-budget', fc['max']['energyExcess']<2e-13, fc['max']['energyExcess'], '<2e-13', group='physics')

    # barrier inverse against independently evaluated analytic formula in Python, several points
    bar={'responseModel':'bilinear','stiffnessKNm':1500,'yieldForceKN':220,'hardeningRatio':.04,'maxDeflection':.8,'capacityKJ':250}
    for idx,d in enumerate([.01,.10,.1466666667,.25,.55,.80]):
      Ejs=await page.evaluate('(x)=>__debrisBench.barrierEnergy(x.bar,x.d)', {'bar':bar,'d':d})
      k=bar['stiffnessKNm']*1000; Fy=bar['yieldForceKN']*1000; dy=Fy/k; kp=bar['hardeningRatio']*k
      if d<=dy: Epy=.5*k*d*d
      else:
        x=d-dy; Epy=.5*k*dy*dy+Fy*x+.5*kp*x*x
      add(f'barrier-energy-{idx+1}', abs(Ejs-Epy)<=1e-8*max(1,Epy), {'js':Ejs,'py':Epy,'d':d}, 'rel <=1e-8', group='physics')

    # Monte Carlo reproducibility same seed; different seed should differ
    await page.evaluate("__debrisBench.loadPresetKey('fragDrop')")
    sc=await page.evaluate('__debrisBench.getScene()')
    mc1=await page.evaluate('(a)=>__debrisBench.sampleRunouts(a.s,80,a.seed,.01,6,9.81)', {'s':sc,'seed':73193})
    mc2=await page.evaluate('(a)=>__debrisBench.sampleRunouts(a.s,80,a.seed,.01,6,9.81)', {'s':sc,'seed':73193})
    mc3=await page.evaluate('(a)=>__debrisBench.sampleRunouts(a.s,80,a.seed,.01,6,9.81)', {'s':sc,'seed':73194})
    same=mc1['vals']==mc2['vals']
    diff=mc1['vals']!=mc3['vals']
    add('monte-carlo-reproducible', same, {'r90':mc1['r90'],'r99':mc1['r99']}, 'same seed bitwise-identical sorted runouts', group='stochastic')
    add('monte-carlo-seed-sensitive', diff, {'seed1_r90':mc1['r90'],'seed2_r90':mc3['r90']}, 'different seed changes sample', group='stochastic')

    # finite barrier Y span: same fast body within span hits; far outside span should not hit/cross state
    base_bar={
      'name':'bar','backdrop':'none','terrain':[{'id':'t1','x':-20,'z':0,'material':'concrete'},{'id':'t2','x':100,'z':0,'material':'concrete'}],
      'objects':[
        {'id':1,'kind':'debris','name':'projectile','x':0,'y0':0,'z':3,'angle':0,'azimuthDeg':0,'vx0':20,'vz0':0,'omega0':0,'mass':50,'width':.5,'height':.5,'shape':'circle','material':'steel','eScale':1,'muScale':1,'fragEnabled':False},
        {'id':2,'kind':'barrier','name':'barrier','x':10,'yCenter':0,'spanY':4,'h':5,'w':.3,'material':'steel','capacityKJ':1000,'responseModel':'rigid'}
      ]}
    hit=await page.evaluate('(s)=>__debrisBench.headless(s,.002,1,9.81,1,45,0,0,null)', base_bar)
    base_bar2=json.loads(json.dumps(base_bar));base_bar2['objects'][0]['y0']=10
    miss=await page.evaluate('(s)=>__debrisBench.headless(s,.002,1,9.81,1,45,0,0,null)', base_bar2)
    # barrier state key serialized as "2"
    hst=hit['barriers'].get('2') or hit['barriers'].get(2)
    mst=miss['barriers'].get('2') or miss['barriers'].get(2)
    add('barrier-y-span-hit', bool(hst and hst['hit']), hst, 'inside Y span -> hit', group='physics')
    add('barrier-y-span-miss', bool(mst is not None and not mst.get('hit',False)), mst, 'outside Y span -> no hit', group='physics')

    # guided/results/rainbow workflow
    wf=await page.evaluate('__debrisBench.workflow()')
    add('guided-workflow-ui', wf['guide'] and wf['guidePanel'] and wf['guideSteps']==7, wf, 'Guide button + panel + 7 steps', group='workflow')
    add('engineering-result-ui', wf['resultsTab'] and wf['engineeringDash'] and wf['resultsButton'], wf, 'results button + tab + dashboard', group='workflow')
    add('plan-field-modes', wf['planModes']==['transit','landing','energy','height'], wf['planModes'], 'four hazard field modes', group='workflow')
    rainbow=wf['rainbow']; add('rainbow-colormap', len(set(rainbow))==3 and all(x.startswith('rgba(') for x in rainbow), rainbow, 'three distinct spectral endpoints/midpoint', group='workflow')

    # live streaming + cancellation on a deliberately nontrivial CPU ensemble
    await page.evaluate("__debrisBench.loadPresetKey('cooling')")
    await page.select_option('#computeBackend','cpu')
    await page.fill('#samples','200'); await page.fill('#tmax','8')
    await page.click('#ensembleBtn')
    partial=False
    try:
      await page.wait_for_function("(()=>{const x=window.__debrisBench?.ensembleState?.();return !!(x&&x.running&&x.partial&&x.n>0&&x.n<x.target)})()", timeout=12000)
      partial=True
    except Exception:
      partial=False
    live=await page.evaluate('__debrisBench.ensembleState()')
    add('live-ensemble-streaming', partial and live['running'] and live['partial'] and 0<live['progress']<100 and live['r90'] is not None, live, 'partial ensemble visible before completion; 0<progress<100; provisional R90', group='workflow')
    if live['running']:
      await page.click('#ensembleBtn')
      await page.wait_for_function("!window.__debrisBench.ensembleState().running", timeout=12000)
    cancel=await page.evaluate('__debrisBench.ensembleState()')
    add('ensemble-cancel-ui', (not cancel['running']) and (not cancel['button']) and ('cancel' in cancel['status'].lower() or 'скас' in cancel['status'].lower() or 'abgeb' in cancel['status'].lower()), cancel, 'cancel returns control and clears running state', group='workflow')

    # WebGPU v1 contract. CI browser is intentionally launched with GPU disabled, so this checks
    # capability detection/fallback; real shader compilation is guarded by the runtime GPU self-check.
    gpuui=await page.evaluate('__debrisBench.gpuContract()')
    add('webgpu-backend-contract', gpuui['select'] and gpuui['options']==['auto','gpu','cpu'] and gpuui['max']=='65536' and gpuui['contract'], gpuui, 'backend selector; N<=65536; WGSL compute/dispatch/self-check contract', group='gpu')
    await page.select_option('#computeBackend','gpu'); await page.fill('#samples','50'); await page.click('#ensembleBtn'); await page.wait_for_timeout(250)
    gpuerr=await page.evaluate('(()=>{const x=__debrisBench.ensembleState(),g=__debrisBench.gpuContract();return {...x,gpu:g.gpu}})()')
    add('webgpu-unavailable-graceful', (not gpuerr['gpu']) and (not gpuerr['running']) and ('webgpu' in gpuerr['status'].lower()), gpuerr, 'no navigator.gpu -> explicit visible error, no stuck run', group='gpu')

    # no browser errors
    unexpected_errors=[e for e in errors if 'WebGPU unavailable' not in e]
    add('browser-errors', len(unexpected_errors)==0, unexpected_errors, '0 unexpected errors', group='editor')
    await browser.close()

asyncio.run(main())

passed=sum(1 for r in results if r['passed'])
failed=[r for r in results if not r['passed']]
artifact={
 'schema':'tools.petrov.re/benchmark-artifact/v1',
 'tool':'debrisrunout',
 'run_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'harness':'Playwright/Chromium browser execution with independent Python analytic references for ballistic motion and bilinear barrier energy; direct implementation invariants for fragmentation/tethers; editor regression after scene-editor migration.',
 'environment':{'chromium':'system /usr/bin/chromium','scene_editor_api':'tools.petrov.re/scene-editor/v1'},
 'cases':len(results),'passed':passed,'failed':len(failed),
 'results':results
}
Path('/mnt/data/debrisrunout_benchmark_raw.json').write_text(json.dumps(artifact,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'cases':len(results),'passed':passed,'failed':len(failed),'failed_cases':failed},ensure_ascii=False,indent=2))
