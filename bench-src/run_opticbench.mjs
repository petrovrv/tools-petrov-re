// Benchmark driver for opticbench.html (Optical Bench 3D).
// Reference: bench-src/ref/gen_opticbench.py (independent Python: SCHOTT Sellmeier, exact meridional ray trace through spheres/conics/planes,
// Fresnel power coefficients, prism minimum deviation, grating equation, Malus and Jones half-wave plate, thick-lens afocal spacing) -> ref/opticbench_ref.json.
// Every case loads a scene (or a preset) INTO THE PAGE through its state and reads what the page computed (window.__opticbench.last).
// Run: BENCH_BASE=http://127.0.0.1:8797 node --import file:///C:/Users/Admin/aiwb-site/ops/pw-register.mjs bench-src/run_opticbench.mjs
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
import { benchPaths } from './benchpaths.mjs';

const PROVENANCE = { reference_provenance: 'recomputed', provenance_note: 'Expected values were computed by bench-src/ref/gen_opticbench.py, an independent Python implementation written from Born & Wolf (Principles of Optics, §1.5, §3.2), Hecht (Optics, ch. 4 and 8) and Smith (Modern Optical Engineering, ch. 2-4, 10) with the SCHOTT data-sheet Sellmeier coefficients of N-BK7 and N-SF11; it traces meridional rays exactly and uses closed-form Fresnel, prism, grating and Jones results, not the page code. Catalogue lens prescriptions are data read from _opt/core/stock.json (Thorlabs public pages).' };
const P = benchPaths({ name: 'opticbench', page: 'opticbench.html', ref: 'opticbench_ref.json' });
const ref = JSON.parse(fs.readFileSync(P.ref, 'utf8'));

const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e && e.message || e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.setItem('diagram_learn_opticbench', '1'); } catch (e) {} });
for (let attempt = 1; ; attempt++) {
  try { await p.goto(P.pageUrl + (P.pageUrl.includes('?') ? '&' : '?') + 'lang=en', { waitUntil: 'commit', timeout: 90000 }); break; }
  catch (e) { if (attempt >= 3) throw e; }
}
await p.waitForFunction(() => window.__diagramReady && window.__opticbench && window.__opticbench.last, null, { timeout: 240000 });
const BUILD = await readPageManifestRevision(p);

const results = [];
for (const c of ref) {
  let g = null;
  try {
    g = await p.evaluate(([c]) => {
      const M = window.__opticbench, s = M.state, ui = M.ui;
      if (c.kind === 'aha') {
        DiagramUI.current.example(c.preset);
        const L = M.last;
        return { err: L.err || null, pristine: L.pristine, ok: L.check && L.check.ok, detail: L.check && L.check.detail, verdict: ((document.querySelector('.dgu-verdict') || {}).textContent || '').trim() };
      }
      if (c.kind === 'mindev') {
        /* golden-section search of the prism rotation that minimises the deviation, every evaluation through the page solver */
        const base = JSON.parse(JSON.stringify(c.scene));
        const dev = rz => { base[1].pose.rz = rz; const L = M.solve({ elements: base, ghosts: false }); const h = (L.res.hits.SC || []).filter(q => q.via && q.via.join() === 'P,P')[0] || (L.res.hits.SC || [])[0]; return h ? Math.atan2(h.d[1], h.d[0]) * 180 / Math.PI : 999; };
        let z0 = -40, v0 = 1e9; for (let z = -45; z <= 0; z += 1) { const v = dev(z); if (v < v0) { v0 = v; z0 = z; } }
        let a = z0 - 1.5, b = z0 + 1.5; const gr = (Math.sqrt(5) - 1) / 2;
        for (let i = 0; i < 90; i++) { const c1 = b - gr * (b - a), c2 = a + gr * (b - a); if (dev(c1) < dev(c2)) b = c2; else a = c1; }
        return { dev_deg: dev((a + b) / 2) };
      }
      s.elements = JSON.parse(JSON.stringify(c.scene)); s.ghosts = !!c.ghosts; s.preset = ''; s.sel = ''; s.box = null;
      ui.sync(); ui.run();
      const L = M.last;
      if (!L || L.err) return { err: L ? L.err : 'none' };
      const r = {};
      if (c.kind === 'grating') { r.sines = (L.res.hits.SC || []).map(h => h.d[1]).sort((x, y) => x - y); return r; }
      const d = L.dets.filter(x => x.id === c.det)[0];
      if (!d) return { err: 'no detector ' + c.det };
      r.share = d.P / L.res.sourcePower;
      if (c.firstHit) { const h = (L.res.hits[c.det] || []).filter(q => q.d[0] < 0)[0]; r.abs_cx = h ? Math.abs(h.x) : null; }
      else { r.cx = d.cx; r.abs_cx = Math.abs(d.cx); r.rms = d.rms; }
      if (c.kind === 'paths') { const ps = d.paths.filter(q => q.P > 1e-9); r.dOPL = ps.length === 2 ? Math.abs(ps[0].opl - ps[1].opl) : null; r.P_each = ps.length === 2 ? Math.max(ps[0].P, ps[1].P) / L.res.sourcePower : null; r.P_min = ps.length === 2 ? Math.min(ps[0].P, ps[1].P) / L.res.sourcePower : null; }
      r.tile = Array.from(document.querySelectorAll('.dgu-tile-v')).slice(0, 2).map(t => t.textContent.trim());
      return r;
    }, [c]);
  } catch (e) { g = { err: String(e && e.message || e) }; }
  const cmp = {};
  let pass = !!g && !g.err;
  function chk(k, ok, got, exp) { cmp[k] = { got, exp, ok: !!ok }; if (!ok) pass = false; }
  if (pass) {
    const src = c.kind === 'aha' ? (g.detail || {}) : g;
    if (c.kind === 'aha') { chk('page claim check ok', g.ok === true, g.ok, true); chk('preset loaded unchanged', g.pristine === true, g.pristine, true); chk('verdict shown', /reproduced/.test(g.verdict), g.verdict.slice(0, 60), 'Preset claim reproduced…'); }
    for (const [k, e] of Object.entries(c.expect)) {
      const v = src[k], tol = c.tol[k];
      if (Array.isArray(e)) chk(k, Array.isArray(v) && v.length === e.length && v.every((x, i) => Math.abs(x - e[i]) <= tol), v, e);
      else if (typeof e === 'boolean') chk(k, v === e, v, e);
      else chk(k, typeof v === 'number' && Math.abs(v - e) <= tol, v, e);
    }
    for (const [k, [lo, hi]] of Object.entries(c.bounds || {})) chk(k + ' in [' + lo + ', ' + hi + ']', src[k] >= lo && src[k] <= hi, src[k], [lo, hi]);
    if (c.kind === 'paths') chk('arms carry equal power', Math.abs(g.P_each - g.P_min) < 1e-12, [g.P_each, g.P_min], 'equal');
  }
  results.push({ id: c.id, kind: c.kind, note: c.note, cmp, err: g && g.err || null, pass: pass && Object.values(cmp).every(v => v.ok) });
}
await browser.close();

const total = results.length, passed = results.filter(r => r.pass).length, failed = total - passed;
fs.writeFileSync(P.out, JSON.stringify(stampProvenance({
  tool: 'opticbench', file: 'opticbench.html',
  reference: 'bench-src/ref/gen_opticbench.py — independent Python implementation (SCHOTT Sellmeier; exact meridional trace through spheres, conics and planes; Fresnel Rs/Rp; incoherent plate; prism minimum deviation; grating equation; Malus; Jones half-wave plate; thick-lens afocal spacing; dense-pupil RMS of a spherical mirror)',
  reference_citations: [
    'M. Born, E. Wolf, Principles of Optics, 7th ed., Cambridge 1999, §1.5.2 (Fresnel formulae), §1.5.3 (Brewster), §3.2 (ray tracing)',
    'E. Hecht, Optics, 5th ed., Pearson 2017, §4.6 (Fresnel), §5.5 (prisms, minimum deviation), §8.2-8.7 (Malus, retarders), §10.2.8 (grating equation)',
    'W. J. Smith, Modern Optical Engineering, 4th ed., McGraw-Hill 2008, ch. 2-4 (paraxial matrices, thick lenses), ch. 10 (exact ray trace)',
    'SCHOTT optical glass data sheets N-BK7 and N-SF11 (Sellmeier coefficients), via refractiveindex.info, read 2026-11-13',
    'Thorlabs public catalogue pages for LA1509, LA1131, LA1433, LC1715 (R, CT, glass), read 2026-11-13 (_opt/core/stock.json)'
  ],
  tolerance: 'Exact geometric cases (plate shift, thin-lens image, mirror and LA1509 ray heights, Fresnel shares without ghosts, Malus, half-wave plate, fibre acceptance, Michelson ΔOPL, grating sines) 1e-9 to 1e-12 absolute; minimum deviation 1e-6°; plate with ghost reflections 5e-6 against the infinite incoherent sum (Brewster s 5e-4): the page follows multiple reflections only down to 1e-4 of the mean ray power; preset claims: page check true, values within 2e-3 relative (spot RMS ratio), 0.1 mm (afocal spacing), 5e-3° (prism spectrum), 0.6 µm (sphere RMS: 91 sampled rays vs a dense pupil), 0.06 (fibre share: 61 sampled rays vs a continuous Gaussian)',
  total, passed, failed,
  page_errors: errs,
  cases: results
}, { build: BUILD, ...PROVENANCE }), null, 1));
console.log(`opticbench: ${passed}/${total} passed`);
for (const r of results.filter(r => !r.pass)) console.log('FAIL', r.id, r.err || '', JSON.stringify(Object.fromEntries(Object.entries(r.cmp).filter(([, v]) => !v.ok))).slice(0, 600));
if (errs.length) console.log('page errors: ' + errs.length, errs.slice(0, 3));
process.exitCode = failed || errs.length ? 1 : 0;
