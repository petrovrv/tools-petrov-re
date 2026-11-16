// runCase: executes one validation case against the FrameFEM page (2026-10-17, r14).
// python_export_* cases: emit Python, run with python3, check self-test output.
// Other cases: run analyze(), extract quantities, compare with tolerances; returns {case, worst}.
export async function runCase(page, c, P, EXTRACT, TOL, execFileSync, fs) {
  const { id, note, inputs } = c;
  if (id.startsWith('python_export_')) {
    const code = await page.evaluate(inp => {
      const st = window.__framefem.state;
      Object.keys(st).forEach(k => delete st[k]);
      Object.assign(st, JSON.parse(JSON.stringify(inp)));
      window.__framefem.ui.run();
      return window.Diagram.python.emit();
    }, inputs);
    let got;
    if (!code) got = 'no python export';
    else {
      const f = P.scratch('py') + '/' + id + '.py';
      fs.writeFileSync(f, code);
      let out, status;
      try { out = execFileSync('python3', [f], { timeout: 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); status = 0; }
      catch (e) { status = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
      got = status === 0 && out.includes('self-test: OK') ? 'self-test: OK' : (out.trim().split(/\r?\n/).filter(Boolean).pop() || 'no output');
    }
    const cmp = { python_selftest: { got, ref: 'self-test: OK', ok: got === 'self-test: OK', rule: 'generated Python exits 0 and prints self-test: OK' } };
    return { case: { id, note, inputs, cmp, errors: [], warnings: [], pass: cmp.python_selftest.ok }, worst: null };
  }
  const res = await page.evaluate(inp => {
    try {
      const r = window.__framefem.analyze(JSON.parse(JSON.stringify(inp)));
      for (const k of ['geoms', 'sp', 'csr', 'massCSR', 'geoCSR', 'path', 'reference']) delete r[k];
      return { r: JSON.parse(JSON.stringify(r)) };
    } catch (e) { return { thrown: String(e && e.message || e) }; }
  }, inputs);
  const cmp = {}; let worst = null;
  for (const [q, e] of Object.entries(c.expect || {})) {
    if (res.thrown) { cmp[q] = { got: null, ref: e.ref, ok: false }; continue; }
    let got;
    try { got = EXTRACT[id]?.[q]?.(res.r, inputs); } catch { got = null; }
    if (TOL.isCategorical(id, q)) { cmp[q] = { got, ref: e.ref, ok: !!TOL.categorical(id, q, got, res.r), rule: TOL.rule(id, q) }; continue; }
    const { tolAbs, tolRel } = TOL.numeric(id, q, e.ref);
    const d = Math.abs(got - e.ref), rel = e.ref !== 0 ? d / Math.abs(e.ref) : d;
    const ok = typeof got === 'number' && Number.isFinite(got) && d <= Math.max(tolAbs, tolRel * Math.abs(e.ref));
    cmp[q] = { got, ref: e.ref, unit: e.unit, abs: d, rel, tol_abs: tolAbs, tol_rel: tolRel, ok };
    if (e.ref !== 0 && Number.isFinite(rel) && (!worst || rel > worst.rel)) worst = { rel, metric: id + ':' + q };
  }
  return {
    case: { id, note, inputs, cmp, errors: res.thrown ? [res.thrown] : (res.r.errors || []), warnings: res.r?.warnings || [], pass: !res.thrown && Object.values(cmp).every(x => x.ok) },
    worst
  };
}
