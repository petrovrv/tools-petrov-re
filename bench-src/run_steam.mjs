import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

/* AGENTS §5: where this artifact's reference values come from, and the page build
   the run was executed against. The build is the manifest_revision read out of the
   live DOM of the page this run loaded, so the artifact names the build it graded and
   not whichever page happens to sit beside the driver; stampProvenance() writes it
   together with reference_provenance, provenance_note and run_at, and refuses to
   write anything without it. Every path resolves through benchPaths() against this
   driver's own tree. */
const PROVENANCE = {
  reference_provenance: "recorded",
  provenance_note: "No generator for this corpus exists anywhere in this tree, so its stored reference values cannot be re-derived here and are reused as stored, which AGENTS \u00a75 classes as a regression reference; its values are the published IAPWS verification tables and tracing them needs a generator that reads those tables."
};

const TOL = 2e-3;
const P = benchPaths({ name:'steam_tables', page:'steam_tables.html',
                       ref:'steam_tables_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref,'utf8'));
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,160)));
await p.goto(P.pageUrl + '?lang=en', {waitUntil:'load'});
await p.waitForTimeout(600);
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(p);

/* The page's input surface, measured in the live DOM of the build this driver drives
   (bench-src/HARNESS-CONTRACT.md is the module contract; the inventory is in PORT-B.md).
   The ten ids this function used to address occur 0 times in the page. The framework now
   owns the controls: a field declared `id:'f-k1'` renders its control as `#f-k1-c` inside
   `[data-dgu-field="f-k1"]`, the two unit choices are `type:'segmented'` composites whose
   options are `button[data-value]`, the compute action is the primary button in the page's
   own `.st-actions` row, and the eight computed properties are `.dgu-tile` readouts whose
   `.dgu-tile-l` carries the same `key \u00b7 name` label the old table's first column did.
   The region moved to `.dgu-verdict` and the out-of-envelope refusal to the app state line
   in its error class. Transport, reference, tolerance and case set are unchanged. */
async function compute(T_C, p_MPa){
  return await p.evaluate(async ([T,P])=>{
    const ctl=f=>document.getElementById(f+'-c');
    const set=(f,v)=>{const e=ctl(f); if(!e) return false; e.value=String(v);
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    const seg=(f,v)=>{const w=document.querySelector('[data-dgu-field="'+f+'"] .dgu-seg');
      const b=w?[...w.children].find(x=>x.dataset.value===String(v)):null;
      if(b) b.click(); return !!b;};
    set('f-k1','T'); await new Promise(r=>setTimeout(r,30));
    seg('f-tu','C'); set('f-v1',String(T));
    set('f-k2','p'); await new Promise(r=>setTimeout(r,30));
    seg('f-pu','MPa'); set('f-v2',String(P));
    /* `variant:'primary'` is the compute action in every language, so the click does not
       depend on the label */
    const go=document.querySelector('.st-actions button.dgu-btn.primary');
    if(go) go.click();
    await new Promise(r=>setTimeout(r,60));
    const out={};
    for(const n of document.querySelectorAll('.dgu-tile')){
      const key=(((n.querySelector('.dgu-tile-l')||{}).textContent)||'').split('\u00b7')[0].trim();
      const val=parseFloat(String(((n.querySelector('.dgu-tile-v')||{}).textContent)||'').replace(/\s|,/g,''));
      if(key && isFinite(val)) out[key]=val;
    }
    const vd=document.querySelector('.dgu-verdict');
    const st=document.querySelector('.dgu-state');
    return {out, region: vd?vd.innerText:'',
            msg: (st && /\berror\b/.test(st.className)) ? st.innerText : ''};
  },[T_C,p_MPa]);
}

const QTY = ['v','rho','h','u','s'];
const results=[];
for(const c of ref){
  const r = await compute(c.T_C, c.p_MPa);
  const inputs = {T_C:c.T_C, p_MPa:c.p_MPa};
  const base = {id:c.id, note:c.note, inputs, region:r.region.trim(), msg:r.msg.trim().slice(0,200)};
  if(c.citation) base.citation = c.citation;

  if(c.expect === 'refuse'){
    // Out of the IF97 validity envelope: the tool must refuse — a message and NO numbers.
    const numeric = QTY.filter(k=>r.out[k]!==undefined && isFinite(r.out[k]));
    const refused = numeric.length===0 && r.msg.trim().length>0;
    results.push({...base, expect:'refuse',
      cmp:{refusal:{got:refused?'refused':(numeric.length?('printed '+numeric.join(',')):'silent'),
                    ref:'refused', rel:refused?0:1, ok:refused}},
      worst_rel: refused?0:1, pass: refused});
    continue;
  }

  // Reference disagreement guard (HARNESS rule): never call the tool wrong where the two
  // independent references themselves differ by more than the tolerance.
  const devs = Object.entries(c.crosscheck||{}).filter(([k])=>k.startsWith('dev_')).map(([,v])=>v);
  const refSpread = devs.length ? Math.max(...devs) : 0;
  const flagged = refSpread > TOL;

  const cmp = {};
  for(const k of QTY){
    const g = r.out[k], e = c.ref[k];
    if(g===undefined||!isFinite(g)){ cmp[k]={got:null,ref:e,rel:null,ok:false,reason:'missing'}; continue; }
    const rel = Math.abs(g-e)/Math.max(Math.abs(e),1e-12);
    cmp[k]={got:g, ref:e, rel, ok: rel<=TOL};
  }
  const worst = Math.max(...Object.values(cmp).map(x=>x.rel===null?Infinity:x.rel));
  results.push({...base, expect:'value', if97_region:c.region, crosscheck:c.crosscheck,
    reference_disagreement: flagged ? refSpread : undefined,
    cmp, worst_rel:worst, pass: flagged ? true : worst<=TOL});
}
await b.close();

const graded  = results.filter(r=>r.reference_disagreement===undefined);
const flagged = results.filter(r=>r.reference_disagreement!==undefined);
const pass = graded.filter(r=>r.pass).length;

fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool:'steam-tables', file:'steam_tables.html',
  reference:'IAPWS-IF97 (R7-97) evaluated by python-iapws 1.5.5, cross-checked point-by-point against CoolProp 8.0.0 (IF97 backend); the region 1/2/3/5 verification points of R7-97 itself are included verbatim.',
  reference_citations:[
    'IAPWS R7-97 (2012), Revised Release on the IAPWS Industrial Formulation 1997 for the Thermodynamic Properties of Water and Steam — Table 5 (region 1), Table 15 (region 2), Table 33 (region 3), Table 42 (region 5), Eq. 5/6 (B23 boundary).',
    'python-iapws 1.5.5 (independent IF97 implementation).',
    'CoolProp 8.0.0, AbstractState("IF97","Water") (independent IF97 implementation).'
  ],
  tolerance:`relative ${TOL} on v, rho, h, u, s (the tool prints 4 significant digits for values below 1, so ~5e-4 is the display floor). Out-of-range cases pass only if the tool shows a message and prints no numbers. Cases where the two references disagree by more than ${TOL} are flagged, not graded.`,
  total:graded.length, passed:pass, failed:graded.length-pass,
  flagged_reference_disagreement: flagged.map(f=>({id:f.id, spread:f.reference_disagreement})),
  page_errors:errs, cases:results}, { build: BUILD, ...PROVENANCE }), null, 1));

console.log(`steam_tables: ${pass}/${graded.length} passed (${flagged.length} flagged for reference disagreement, not graded)`);
for(const r of graded.filter(r=>!r.pass))
  console.log(' FAIL', r.id, 'T='+r.inputs.T_C+'C p='+r.inputs.p_MPa+'MPa region='+r.region,
    Object.entries(r.cmp).filter(([,x])=>!x.ok).map(([k,x])=>`${k}: got ${x.got} ref ${typeof x.ref==='number'?Number(x.ref).toPrecision(7):x.ref} rel ${x.rel===null?'n/a':x.rel.toExponential(2)}`).join('; '),
    r.msg?('| msg: '+r.msg.slice(0,80)):'');
if(errs.length) console.log('PAGE ERRORS:', errs.slice(0,5));
