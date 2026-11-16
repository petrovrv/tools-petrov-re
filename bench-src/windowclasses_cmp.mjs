// Comparison of a GlzWindow result (page or engine) with one case of bench-src/ref/windowclasses_ref.json. Used by run_windowclasses.mjs and _bw/r2/window/cmpref.mjs.
export function compareWindow(r, e) {
  const bad = {}; let n = 0, nbad = 0;
  const add = (k, got, exp, okv) => { n++; if (!okv) { nbad++; if (Object.keys(bad).length < 12) bad[k] = { got, exp }; } };
  const same = (k, got, exp) => add(k, got, exp, JSON.stringify(got) === JSON.stringify(exp));
  const rel = (k, got, exp, tol) => add(k, got, exp, typeof got === 'number' && Math.abs(got - exp) <= tol * Math.max(1, Math.abs(exp)));
  if (!r || !r.ok) { add('ok', r && r.reason, true, false); return { n, nbad, bad }; }
  if (e.window) {
    const w = e.window;
    same('W', r.exposure.cls, w.W); same('air', r.air.cls, w.air); same('water', r.water.cls, w.water); same('altB', r.water.alt_B, w.altB);
    same('wind', r.wind.cls, w.wind); same('P', [r.wind.P1, r.wind.P2, r.wind.P3], [w.P1, w.P2, w.P3]);
    same('eqB', r.equivalence.B.cls, w.eqB); same('eqA', r.equivalence.A.cls, w.eqA);
    rel('qp', r.qp_Pa, w.qp, 0.005); same('above100', r.notes.some(x => x.key === 'above100'), w.above100);
  }
  if (e.cw) {
    const c = e.cw;
    same('W', r.exposure.cls, c.W); same('CW', r.cw.cls, c.CW); same('cw_air', r.cw.air, c.air); same('cw_water', r.cw.water, c.water);
    rel('wK', r.cw.wK_Pa, c.wK, 0.005); rel('wU', r.cw.wU_Pa, c.wU, 0.005);
  }
  if (e.impact) {
    const i = e.impact, g = r.impact || {};
    same('case', g.case, i.case); same('ext', g.exterior ? g.exterior.cls : null, i.ext); same('ext_drop', g.exterior ? g.exterior.drop_mm : null, i.ext_drop == null ? null : i.ext_drop);
    same('int', g.interior ? g.interior.cls : null, i.int); if (g.interior) same('reco', g.interior.reco, i.reco);
  }
  if (e.cond) {
    const c = e.cond, g = r.condensation || { items: [] };
    rel('frsi_min', g.frsi_min, c.min, 1e-9);
    for (const [k, v] of Object.entries(c.items)) {
      const it = g.items.find(x => x.id === k) || {};
      rel('f_' + k, it.f, v.f, 1e-9); same('ok_' + k, it.ok, v.ok); rel('tsi_' + k, it.theta_si, v.theta_si, 1e-6);
    }
  }
  if (e.uw) { rel('Uw', r.uw && r.uw.Uw, e.uw.Uw, 1e-9); same('psi', r.uw && r.uw.psi, e.uw.psi); }
  if (e.profile) { rel('w_mm', r.profile && r.profile.w_mm, e.profile.w_mm, 1e-6); same('ok225', r.profile && r.profile.ok225, e.profile.ok225); same('ok300', r.profile && r.profile.ok300, e.profile.ok300); }
  return { n, nbad, bad };
}
