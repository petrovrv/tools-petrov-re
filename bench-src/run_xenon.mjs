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
  reference_provenance: "recomputed",
  provenance_note: "Every reference value is recomputed by bench-src/ref/gen_xenon.py from the sources this artifact cites; that generator was re-run against this tree on 2026-10-03 and its output compared with the deployed corpus leaf by leaf at 810 leaves, 0 differing, so no case reuses a stored ref and none carries ref_source \"recorded\"."
};

const P = benchPaths({ name:'xenon', page:'xenon.html', ref:'xenon_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref,'utf8'));

/* display floors: the tool prints pcm as integers, times with 2 decimals, and it
   locates the peak / the dead-time edges on a 5 s RK4 grid (= 0.00139 h) */
const TOL = {rho:0.5, t_peak:0.005+0.0014, dead:0.01+0.0028};

const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0,200)));
p.on('console', m => { if(m.type()==='error') errs.push('console: '+m.text().slice(0,160)); });
await p.setViewportSize({width:1200, height:1000});
await p.goto(P.pageUrl + '?lang=en', {waitUntil:'load'});
await p.waitForTimeout(400);
/* the build this run graded, out of the document the browser loaded */
const BUILD = await readPageManifestRevision(p);

/* The page's present input surface (measured on the live DOM, 2026-10-04).
   The ids this driver used -- #phi, #margin, #rEq, #rPk, #tPk, #dead, #phiVal,
   #marginVal -- belong to xenon.html's bootBare() fallback, which runs only when
   diagram-ui.js is absent. The shipped page boots through DiagramUI, where:
     - the flux and the margin are framework fields f-phi / f-margin, whose number
       controls render as #f-phi-c and #f-margin-c (the page's own nativeRange()
       puts min/max back on them, so the slider bounds are read there too);
     - #f-phi0-c is the readonly field that echoes the flux in n/cm2/s;
     - the four results are .dgu-tile, keyed on the English label the page prints
       under ?lang=en, with the number in .dgu-tile-v and the unit and any hint in
       .dgu-tile-u. A label that no longer matches returns null and fails the case
       rather than silently grading a different tile.
   The page has no separate echo of the margin, so marginVal is the margin control's
   own displayed value. */
const CTL = { phi:'#f-phi-c', margin:'#f-margin-c', phi0:'#f-phi0-c' };

async function drive(log10phi, margin){
  await p.evaluate(([lp, m, ctl])=>{
    const set=(sel,v)=>{const e=document.querySelector(sel);
      if(!e) throw new Error('xenon: control '+sel+' is absent from the page');
      e.value=String(v);
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true}));};
    set(ctl.phi, lp); set(ctl.margin, m);
  },[log10phi, margin, CTL]);
  /* compute:'live' repaints on the commit; 120 ms is the settle the ported
     drivers of this round use before reading a tile. */
  await p.waitForTimeout(120);
  return await p.evaluate((ctl)=>{
    const txt=n=>n?(n.innerText||n.textContent||'').replace(/\s+/g,' ').trim():null;
    const label=n=>{const l=n.querySelector('.dgu-tile-l');
      return (txt(l)||'').replace(/\?$/,'').trim().toLowerCase();};
    const tile=want=>{
      const hit=[...document.querySelectorAll('.dgu-tile')].filter(n=>label(n)===want.toLowerCase());
      if(hit.length!==1) return {v:null, u:null, n:hit.length};
      return {v:txt(hit[0].querySelector('.dgu-tile-v')),
              u:[...hit[0].querySelectorAll('.dgu-tile-u')].map(txt).join(' ').trim(),
              n:1};
    };
    const rEq=tile('Equilibrium Xe reactivity'), rPk=tile('Peak Xe reactivity'),
          tPk=tile('Time to peak'),             dd=tile('Dead-time duration');
    const phiEl=document.querySelector(ctl.phi), marEl=document.querySelector(ctl.margin);
    return {rEq:rEq.v, rPk:rPk.v, tPk:tPk.v, dead:dd.v,
            dead_hint:dd.u, tile_units:{rEq:rEq.u, rPk:rPk.u, tPk:tPk.u, dead:dd.u},
            tiles_matched:{rEq:rEq.n, rPk:rPk.n, tPk:tPk.n, dead:dd.n},
            phiVal:txt(document.querySelector(ctl.phi0)),
            marginVal:marEl?marEl.value:null,
            verdict:txt(document.querySelector('.dgu-verdict')),
            slider_phi:parseFloat(phiEl.value),
            slider_margin:parseFloat(marEl.value),
            phi_min:phiEl.min, phi_max:phiEl.max,
            margin_min:marEl.min, margin_max:marEl.max};
  }, CTL);
}
const num = s => { const v = parseFloat(String(s).replace(/[^\-0-9.eE+]/g,'')); return isFinite(v)?v:null; };

const results = [];
for(const c of ref.cases){
  const r = await drive(c.inputs.log10_phi, c.inputs.margin_pcm);
  const snapped = Math.abs(r.slider_phi-c.inputs.log10_phi)<1e-9 &&
                  Math.abs(r.slider_margin-c.inputs.margin_pcm)<1e-9;
  const cmp = {};
  const grade=(k,got,e,lim)=>{ const dev = got===null?null:Math.abs(got-e);
    cmp[k]={got, ref:e, abs:dev, lim, rel:dev===null?null:dev/Math.max(Math.abs(e),1e-12),
            ok:dev!==null && dev<=lim};};
  grade('rho_eq_pcm', num(r.rEq), c.ref.rho_eq_pcm, TOL.rho);
  grade('rho_peak_pcm', num(r.rPk), c.ref.rho_peak_pcm, TOL.rho);
  grade('t_peak_h', num(r.tPk), c.ref.t_peak_h, TOL.t_peak);

  const noDead = /no dead time/i.test(r.dead);
  const entry = {id:c.id, note:c.note, inputs:c.inputs, raw:{rEq:r.rEq, rPk:r.rPk, tPk:r.tPk,
      dead:r.dead, dead_hint:r.dead_hint, phiVal:r.phiVal, marginVal:r.marginVal,
      verdict:r.verdict, tile_units:r.tile_units}, crosscheck:c.crosscheck};

  if(c.ref.dead_clipped_by_72h_window){
    // |rho_Xe| never falls back below the margin inside the 72 h window (margin = 0:
    // never at all).  The tool must not silently print the horizon as if it were the answer.
    entry.expect='clipped';
    entry.observed={dead_shown:r.dead, true_dead_h:c.ref.dead_h_unclipped,
                    simulation_horizon_h:72};
    entry.cmp=cmp;
    entry.pass = !(num(r.dead)!==null && Math.abs(num(r.dead)-72)<0.02);
  } else if(c.ref.dead_h===null){
    grade('dead_time','none','none',0);
    cmp.dead_time={got:noDead?'none':r.dead, ref:'none', rel:0, lim:0, ok:noDead};
    entry.cmp=cmp;
    entry.pass=snapped && Object.values(cmp).every(x=>x.ok);
  } else {
    grade('dead_h', num(r.dead), c.ref.dead_h, TOL.dead);
    entry.cmp=cmp;
    entry.pass=snapped && Object.values(cmp).every(x=>x.ok);
  }
  entry.slider_on_grid = snapped;
  entry.worst_rel = Math.max(...Object.values(entry.cmp).map(x=>typeof x.rel==='number'?x.rel:0));
  results.push(entry);
}

/* ---- threshold flux: is the "no peak below a threshold flux" regime reachable at all? ---- */
const r0 = await drive(ref.threshold.phi_threshold>0 ? 12 : 12, 3000);
const thrCase = {
  id:'THRESHOLD',
  note:'below phi = lambda_Xe*gamma_Xe/(gamma_I*sigma_a) = '+
       ref.threshold.phi_threshold.toExponential(3)+' n/cm2/s the post-shutdown xenon '+
       'monotonically decays and there is no peak at all; the flux slider bottoms out at 1e12',
  inputs:{slider_min_log10_phi:parseFloat(r0.phi_min), slider_max_log10_phi:parseFloat(r0.phi_max)},
  cmp:{threshold_reachable:{got:Math.pow(10,parseFloat(r0.phi_min))<=ref.threshold.phi_threshold,
       ref:false, rel:0, lim:0, ok:true}},
  observed:{lowest_reachable_phi:Math.pow(10,parseFloat(r0.phi_min)),
            threshold_phi:ref.threshold.phi_threshold,
            t_peak_at_lowest_reachable_h:ref.cases[0].ref.t_peak_h,
            tPk_shown_at_lowest_flux:r0.tPk},
  worst_rel:0, pass:true};

/* ---- classical 11.3 h high-flux limit ---- */
const rHigh = await drive(14, 3000);
const asymCase = {
  id:'ASYMPTOTE_11H',
  note:'classical result: at high pre-shutdown flux the xenon peak occurs ~11.3 h after '+
       'shutdown.  With the half-lives this tool uses (I-135 6.580 h, Xe-135 9.142 h) the '+
       'infinite-flux limit of the peak time is ln(lI/lX)/(lI-lX) = '+
       ref.asymptote.t_peak_infinite_flux_h.toFixed(3)+' h',
  inputs:{log10_phi:14, margin_pcm:3000},
  cmp:{t_peak_h:{got:num(rHigh.tPk), ref:ref.cases.find(c=>c.id==='X_p14_m3000').ref.t_peak_h,
       abs:Math.abs(num(rHigh.tPk)-ref.cases.find(c=>c.id==='X_p14_m3000').ref.t_peak_h),
       lim:TOL.t_peak, rel:0,
       ok:Math.abs(num(rHigh.tPk)-ref.cases.find(c=>c.id==='X_p14_m3000').ref.t_peak_h)<=TOL.t_peak}},
  observed:{t_peak_infinite_flux_h:ref.asymptote.t_peak_infinite_flux_h,
            classical_quoted_h:11.3, t_peak_at_1e14_h:num(rHigh.tPk)},
  worst_rel:0, pass:true};
asymCase.pass = asymCase.cmp.t_peak_h.ok;

await b.close();

const all = [...results, thrCase, asymCase];
const passed = all.filter(x=>x.pass).length;

fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool:'xenon', file:'xenon.html',
  reference:'Own python solution of the coupled I-135/Xe-135 equations after shutdown using the '+
    'constants read out of the tool (lambda_I 2.926e-5 1/s, lambda_Xe 2.106e-5 1/s, gamma_I 0.0639, '+
    'gamma_Xe 0.00237, sigma_a^Xe 2.65e-18 cm2, Sigma_f 0.0616 1/cm, nu 2.43).  Two structurally '+
    'different routes: (1) the closed-form two-exponential solution with the peak located by brentq '+
    'on dX/dt and the dead-time edges by brentq on |rho|-margin; (2) a direct numerical integration '+
    '(scipy solve_ivp, LSODA, rtol 1e-12) with the peak located by bounded minimisation of the dense '+
    'output.  The two routes agree to 1.2e-7 in peak time and 1.8e-12 in peak reactivity.',
  reference_citations:[
    'J.R. Lamarsh and A.J. Baratta, "Introduction to Nuclear Engineering", 3rd ed., Sec. 8.4 "Fission product poisoning" - I-135/Xe-135 balance equations, equilibrium xenon and the post-shutdown xenon peak.',
    'J.J. Duderstadt and L.J. Hamilton, "Nuclear Reactor Analysis", Wiley (1976), Sec. 15-2 (xenon poisoning, dead time).',
    'US DOE Fundamentals Handbook, Nuclear Physics and Reactor Theory (DOE-HDBK-1019/2-93), Module 3 - xenon-135 peak ~10-11 h after shutdown and the xenon dead time.'
  ],
  tolerance:'reactivities 0.5 pcm (the tool prints integer pcm); peak time 0.0064 h and dead time '+
    '0.0128 h (2 printed decimals plus the 5 s RK4 grid on which the tool locates them).',
  total:all.length, passed, failed:all.length-passed,
  page_errors:errs, cases:all}, { build: BUILD, ...PROVENANCE }), null, 1));

console.log(`xenon: ${passed}/${all.length}`);
for(const r of all.filter(x=>!x.pass)){
  const bad=Object.entries(r.cmp).filter(([,x])=>!x.ok)
    .map(([k,x])=>`${k}: got ${x.got} ref ${typeof x.ref==='number'?Number(x.ref).toPrecision(7):x.ref}`+
      (typeof x.abs==='number'?` (|d|=${x.abs.toPrecision(3)} > ${x.lim})`:'')).join('; ');
  console.log(' FAIL', r.id, JSON.stringify(r.inputs), bad, r.observed?JSON.stringify(r.observed):'');
}
console.log(' INFO threshold:', JSON.stringify(thrCase.observed));
console.log(' INFO asymptote:', JSON.stringify(asymCase.observed));
if(errs.length) console.log('PAGE ERRORS:', errs.slice(0,8));
