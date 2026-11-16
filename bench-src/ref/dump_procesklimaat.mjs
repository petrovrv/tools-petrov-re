/* Extracts the data tables of procesklimaat.html.  The whole tool lives inside an IIFE, so
   the pure-data prefix of that script (everything before the first runtime index is built)
   is evaluated on its own — no DOM is touched and no rendering code runs. */
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
const html = fs.readFileSync(PAGE || ('./procesklimaat.html'), 'utf8');
const m = html.match(/<script>\s*"use strict";\s*\(function\(\)\{([\s\S]*?)\n\}\)\(\);\s*<\/script>/);
if (!m) throw new Error('tool script not found');
const src = m[1];
const cut = src.indexOf('var APBY=');
if (cut < 0) throw new Error('runtime boundary not found');
const dataPart = src.slice(0, cut);
const singles = {};
for (const name of ['CATS', 'LAYS', 'LKEY', 'LDESC', 'CSHAPE', 'SSHAPE', 'CTIP', 'STIP']) {
  const r = new RegExp('^var ' + name + '=(.*?);\\s*$', 'm');
  const mm = src.match(r);
  if (mm) singles[name] = mm[1];
}
const tail = 'return {LANGS,DEFAULT_LANG,UI,AP,MS,RULES,IND,PCD,PWH,PCK,PEX,SRCFILES,PROV,' +
  'GROUPS,GKEY,CKEY,SKEY,' + Object.keys(singles).map(k => k + ':' + singles[k]).join(',') + '};';
const d = new Function(dataPart + '\n' + tail)();
fs.writeFileSync(OUT, JSON.stringify(d));
console.log('ap', d.AP.length, 'ms', d.MS.length, 'rules', d.RULES.length, 'ind', d.IND.length,
  'prov', d.PROV.length, 'ui', Object.keys(d.UI).length, 'srcfiles', Object.keys(d.SRCFILES).length,
  'cats', d.CATS, 'lays', d.LAYS);
