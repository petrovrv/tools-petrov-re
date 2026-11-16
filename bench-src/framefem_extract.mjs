// framefem_extract.mjs — quantity extractors and tolerances for run_framefem.mjs (2026-10-17, r14).
// Each extractor reads one graded figure out of the result framefem.html's analyze() returned.
const abs=Math.abs;
const ni=(inp,id)=>{const i=inp.nodes.findIndex(n=>n.id===id);if(i<0)throw new Error(`node ${id} not found`);return i};
const u=(r,inp,node,k)=>r.active.u[3*ni(inp,node)+k];
const R=(r,inp,node,k)=>r.active.R[3*ni(inp,node)+k];
const q=(r,mem,i)=>r.active.members[mem].q[i];
const A=i=>i.nodes[0].id,B=i=>i.nodes.at(-1).id,E1=i=>i.members[0].id,EL=i=>i.members.at(-1).id;
const S=r=>r.summary,err=r=>r.errors?.[0]||'';

const R_A=(r,i)=>R(r,i,A(i),1),R_B=(r,i)=>R(r,i,B(i),1);
const Mmax=r=>S(r).max_abs_M_Nm,Vmax=r=>S(r).max_abs_V_N,Nmax=r=>S(r).max_abs_N_N,dmax=r=>S(r).max_translation_m;
const R_M=(r,i)=>abs(R(r,i,A(i),2)),tip_v=(r,i)=>abs(u(r,i,B(i),1)),tip_theta=(r,i)=>abs(u(r,i,B(i),2));
const tipx=(r,i)=>u(r,i,B(i),0);
const M_A=(r,i)=>q(r,E1(i),2),M_B=(r,i)=>q(r,E1(i),5);
const f=n=>r=>r.modes[n].frequency_hz,f1=f(0),f2=f(1),f3=f(2);
const hingeA=(r,i)=>r.modes?.[0]?.hingeRotations?.[E1(i)]?.['2'];
const hingeB=(r,i)=>r.modes?.[0]?.hingeRotations?.[EL(i)]?.['5'];
const factor1=r=>r.modes[0].factor,P=r=>r.modes[0].participation;
const amp=r=>r.amplification,diagnosis=err;

export const EXTRACT={
  ss_udl:{R_A,R_B,Mmax,Vmax,delta_max:dmax},
  ss_point_center:{R_A,R_B,Mmax,Vmax,delta_max:dmax},
  ss_point_offset:{R_A,R_B,Mmax,Vmax},
  cantilever_tip_force:{R_y:R_A,R_M,tip_v,tip_theta,Mmax},
  cantilever_tip_moment:{R_M,tip_v,tip_theta,Mmax},
  axial_tension:{tip_u:tipx,Nmax,R_x:(r,i)=>abs(R(r,i,A(i),0))},
  axial_ground_spring:{tip_u:tipx,bar_N:(r,i)=>abs(q(r,E1(i),0)),spring_share:(r,i)=>i.nodes.at(-1).kx*tipx(r,i)},
  thermal_free:{tip_u:tipx,Nmax,R_x:(r,i)=>R(r,i,A(i),0)},
  thermal_restrained:{Nmax,R_Ax:(r,i)=>abs(R(r,i,A(i),0)),R_Bx:(r,i)=>abs(R(r,i,B(i),0))},
  inclined_axial:{ux:tipx,uy:(r,i)=>u(r,i,B(i),1),Nmax,Mmax},
  linear_combination:{R_A,Mmax,delta:dmax},
  mesh_split_udl:{R_A,R_B,Mmax,delta:dmax},
  ss_end_moment:{R_A,R_B,Mmax},
  stable_zero_load:{max_u:dmax,max_N:Nmax,max_M:Mmax},
  mechanism_rejected:{singular:err},
  released_ss_udl:{R_A,R_B,M_A,M_B,Mmax,delta:dmax},
  released_fixed_pinned_udl:{R_A,R_B,M_A,M_B},
  modal_cantilever:{f1,f2,f3},
  modal_simply_supported:{f1,f2},
  modal_released_simply_supported:{f1,f2,hingeA,hingeB},
  modal_nodal_mass_sdof:{f1,mass:r=>r.physicalMass},
  modal_participation_sdof:{active_mass_x:r=>r.activeMassX,effective_mass_x:r=>P(r).effective_mass_x_kg,ratio_x:r=>P(r).effective_mass_ratio_x,gamma_sq:r=>P(r).gamma_x**2},
  modal_zero_mass_rejected:{mass_error:err},
  buckling_pinned_column:{factor1,scaled_Pcr:r=>factor1(r)*r.maxReferenceCompression},
  buckling_cantilever_column:{factor1},
  buckling_thermal_column:{reference_N:r=>r.maxReferenceCompression,factor1},
  buckling_tension_rejected:{diagnosis},
  buckling_pinned_column_releases:{factor1,hingeA,hingeB},
  secondorder_zero_prestress:{tip_v,amplification:amp},
  secondorder_guided_column:{tip_x:tipx,amp},
  secondorder_beyond_critical_rejected:{diagnosis},
  secondorder_fixed_pinned_release:{tip_x:tipx,hinge_rotation:(r,i)=>r.active.augmentedU[3*i.nodes.length]},
};

const FORCE=new Set(['bar_N','spring_share','max_N','max_M','reference_N']);
const isForce=q=>/^(R_|M|N|V)/.test(q)||FORCE.has(q);
const isModalF=(id,q)=>/^modal_(cantilever|simply_supported|released_simply_supported)$/.test(id)&&/^f\d+$/.test(q);
const CAT=new Set(['singular','mass_error','diagnosis']);
const isCat=q=>/^hinge/.test(q)||CAT.has(q);

export const TOL={
  statement:'Pass if |got-ref| <= max(tolAbs, tolRel*|ref|). Modal FE frequencies rel 8e-4; SDOF modal rel 1e-12/abs 1e-9; buckling factor rel 8e-5, reference N rel 1e-9; second-order rel 4e-9/abs 1e-15; static rel 2e-9, abs 1e-12 (1e-6 for force/moment when ref=0). Categorical: hinge rotations finite and nonzero; rejections require ok=false and matching diagnostic.',
  numeric(id,q,ref){
    if(isModalF(id,q))return{tolAbs:0,tolRel:8e-4};
    if(id.endsWith('_sdof'))return{tolAbs:1e-9,tolRel:1e-12};
    if(id.startsWith('buckling_')){
      if(q==='reference_N')return{tolAbs:0,tolRel:1e-9};
      if(q==='factor1'||q==='scaled_Pcr')return{tolAbs:0,tolRel:8e-5};
    }
    if(id.startsWith('secondorder_'))return{tolAbs:1e-15,tolRel:4e-9};
    return{tolAbs:ref===0?(isForce(q)?1e-6:1e-12):1e-12,tolRel:2e-9};
  },
  isCategorical:(id,q)=>isCat(q),
  categorical(id,q,got,r){
    if(/^hinge/.test(q))return typeof got==='number'&&Number.isFinite(got)&&abs(got)>1e-9;
    const s=String(got??'');
    if(q==='singular')return r.ok===false&&/singular/i.test(s);
    if(q==='mass_error')return r.ok===false&&/mass/i.test(s);
    if(q==='diagnosis')return r.ok===false&&(id.startsWith('buckling_')?/no positive buckling eigenvalue/i:/positive-definite tangent/i).test(s);
    return null;
  },
  rule(id,q){
    if(/^hinge/.test(q))return'finite and |value| > 1e-9';
    if(q==='singular')return'ok=false and error matches /singular/i';
    if(q==='mass_error')return'ok=false and error matches /mass/i';
    if(q==='diagnosis')return id.startsWith('buckling_')?'ok=false and error matches /no positive buckling eigenvalue/i':'ok=false and error matches /positive-definite tangent/i';
    const t=TOL.numeric(id,q,NaN),z=TOL.numeric(id,q,0);
    return z.tolAbs!==t.tolAbs?`|d| <= max(${t.tolAbs}, ${t.tolRel}*|ref|); abs ${z.tolAbs} if ref=0`:`|d| <= max(${t.tolAbs}, ${t.tolRel}*|ref|)`;
  },
};

export {u,R,q,abs};
