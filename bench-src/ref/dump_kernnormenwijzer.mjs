/* dumps the data structures kernnormenwijzer.html defines, so the python reference can
   be computed over them.  The reference LOGIC is written independently; only the data
   under test is read here. */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
/* PORTED COPY, coordinator, 2026-10-16.
   The delivered dumper hardcodes absolute paths under a machine root that does not exist
   in this programme, so the documented re-dump procedure could not run anywhere and the
   corpus it feeds went stale silently: kernnormenwijzer's page serves 468 register
   documents against 453 in the committed dump. Same defect genpaths.py removed from 31
   python generators; the two .mjs dumpers in ref/ were missed because that port covered
   .py only.

   Only path resolution is changed. The page comes from --page (a file path or url) or
   from --base plus the page name; the dump goes to --out. The data block below is the
   delivered one, byte for byte. */
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PAGE = flag('page', null);
const BASE = flag('base', null);
const OUT  = flag('out', null);
if (!OUT || (!PAGE && !BASE)) { console.error('usage: node <dumper> (--base http://host:port | --page <path-or-url>) --out <data.json>'); process.exit(2); }
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto((PAGE && /^(file|https?):/.test(PAGE) ? PAGE : PAGE ? 'file://' + PAGE : BASE + '/kernnormenwijzer.html') + '?lang=en', { waitUntil: 'load' });
await p.waitForTimeout(800);
const d = await p.evaluate(() => ({
  LANGS, DEF, CATS, CATT, ACCS, STATUS, GEOS, DEPTH, DEPTHT, ORGN, CLUSTERS, AREAS,
  OBJ, STAGE, SITEF, FORM, NOV, ROLE, SC, FKEYS: FKEYS.map(f => [f[0], f[1], f[2] ? f[2].map(x => x[0]) : null, f[3]]),
  FEXP, DOCS, T, STUDIES, ST, BODIES, BT, ITEMS, CODEGRID, SCEN, SCT, UI, EUMEM, BANNED
}));
fs.writeFileSync(OUT, JSON.stringify(d));
console.log('docs', d.DOCS.length, 'studies', d.STUDIES.length, 'bodies', d.BODIES.length,
  'scen', d.SCEN.length, 'langs', d.LANGS.join(','), 'errors', errs.length);
await b.close();
