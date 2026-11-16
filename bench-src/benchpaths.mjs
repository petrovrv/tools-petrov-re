/* Path resolution for every benchmark driver in this directory.
 *
 * The drivers were written against one machine's layout: 32 read their references from
 * '/root/bench/ref/...', 27 write their artifact to '/root/bench/results/...', 5 read a
 * fixture from '/root/bench/fixtures/...' and 5 open the page as 'file:///root/site/...'.
 * Neither /root/bench nor /root/site exists in this container, so 23 of the 46 drivers
 * throw on their first read or write in any other tree and the artifact is never written
 * — which is why ten published artifacts carry no run_at and the re-run that would supply
 * one was unavailable. None of the 23 writes into the site's own benchmarks/ directory, so
 * even on the original layout the file the site serves was updated by a copy step that no
 * document names.
 *
 * This module is the single resolver. A driver names what it wants by name, not by path;
 * every path resolves relative to this file's own tree, so a driver run in a workspace
 * drives that workspace. Flags beat environment variables, which beat the defaults:
 *
 *   site root        --site         BENCH_SITE_ROOT     parent of bench-src
 *   reference dir    --ref-dir      BENCH_REF_DIR       <bench-src>/ref
 *   fixture dir      --fixture-dir  BENCH_FIXTURE_DIR   <refDir>/fixtures
 *   scratch dir      --tmp-dir      BENCH_TMP_DIR       <os tmpdir>/bench-<name>
 *   http origin      --base         BENCH_BASE          none; pages open as file://
 *   artifact out     --out          BENCH_OUT           <siteRoot>/benchmarks/<name>.json
 *   second out       --out2         BENCH_OUT2          whatever the driver passes, or none
 *
 * Every directory and file that has to exist is checked here, at the point the driver
 * starts, and the refusal names the flag and the environment variable that set it. A
 * missing reference file therefore surfaces as its own sentence instead of as an ENOENT
 * from inside a JSON.parse several functions later.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const BENCH_SRC = path.dirname(fileURLToPath(import.meta.url));

/* --- flag parsing ---------------------------------------------------------------
 * `--flag value` and `--flag=value`. Anything else is kept in `_` so a driver that
 * still reads a positional argument can find it. */
export function parseFlags(argv) {
  const out = { _: [] };
  const a = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < a.length; i++) {
    const t = String(a[i]);
    if (!t.startsWith('--')) { out._.push(t); continue; }
    const eq = t.indexOf('=');
    if (eq > -1) { out[t.slice(2, eq)] = t.slice(eq + 1); continue; }
    const next = a[i + 1];
    if (next !== undefined && !String(next).startsWith('--')) { out[t.slice(2)] = String(next); i++; }
    else out[t.slice(2)] = true;
  }
  return out;
}

function pick(flags, env, flagName, envName) {
  const f = flags[flagName];
  if (typeof f === 'string' && f !== '') return { value: f, source: '--' + flagName };
  if (typeof env[envName] === 'string' && env[envName] !== '') return { value: env[envName], source: envName };
  return { value: null, source: null };
}

function where(flagName, envName) {
  return 'set it with --' + flagName + ' or ' + envName;
}

function needDir(p, label, flagName, envName) {
  if (!fs.existsSync(p)) throw new Error(label + ' does not exist: ' + p + ' (' + where(flagName, envName) + ')');
  if (!fs.statSync(p).isDirectory()) throw new Error(label + ' is not a directory: ' + p + ' (' + where(flagName, envName) + ')');
  return p;
}

function needFile(p, label, flagName, envName) {
  if (!fs.existsSync(p)) throw new Error(label + ' does not exist: ' + p + ' (' + where(flagName, envName) + ')');
  if (!fs.statSync(p).isFile()) throw new Error(label + ' is not a file: ' + p + ' (' + where(flagName, envName) + ')');
  return p;
}

function asList(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}

function toFileUrl(absPath) {
  /* Encode each segment so a space or a '#' in a directory name cannot truncate the URL. */
  const parts = absPath.split('/').map(s => encodeURIComponent(s));
  return 'file://' + parts.join('/');
}

function queryString(q) {
  if (!q) return '';
  if (typeof q === 'string') return q.startsWith('?') ? q : '?' + q;
  const s = new URLSearchParams(q).toString();
  return s ? '?' + s : '';
}

/* --- the resolver ---------------------------------------------------------------
 * benchPaths({ name, page, ref, fixtures, out2, argv, env, mkdirOut })
 *
 *   name      required. The artifact's base name, which is also the default output
 *             filename: <siteRoot>/benchmarks/<name>.json.
 *   page      required. The HTML filename in the site root that this driver drives.
 *   ref       a reference filename inside refDir, or an array of them. Checked.
 *   fixtures  a fixture filename inside fixtureDir, or an array of them. Checked.
 *   out2      a second output path for a driver that legitimately writes twice;
 *             site-relative or absolute, overridden by --out2 / BENCH_OUT2.
 *   argv      defaults to process.argv.slice(2).
 *   env       defaults to process.env.
 *   mkdirOut  create the directory of out and out2. Default true.
 */
export function benchPaths(opts) {
  const o = opts || {};
  if (typeof o.name !== 'string' || o.name === '')
    throw new Error('benchPaths: name is required — the artifact base name, e.g. "steam_tables"');
  if (typeof o.page !== 'string' || !/\.html$/.test(o.page))
    throw new Error('benchPaths: page is required and must be an .html filename in the site root, e.g. "steam_tables.html"');

  const env = o.env || process.env;
  const flags = parseFlags(o.argv === undefined ? process.argv.slice(2) : o.argv);

  /* site root */
  const siteSel = pick(flags, env, 'site', 'BENCH_SITE_ROOT');
  const siteRoot = path.resolve(siteSel.value || path.resolve(BENCH_SRC, '..'));
  needDir(siteRoot, 'the site root', 'site', 'BENCH_SITE_ROOT');

  /* the page, on disk and as a URL */
  const pageFile = path.basename(o.page);
  const pagePath = path.join(siteRoot, pageFile);
  needFile(pagePath, 'the page "' + pageFile + '" under the site root', 'site', 'BENCH_SITE_ROOT');

  const baseSel = pick(flags, env, 'base', 'BENCH_BASE');
  const base = baseSel.value ? baseSel.value.replace(/\/+$/, '') : null;

  function pageUrlFor(file, urlOpts) {
    const u = urlOpts || {};
    const name = path.basename(String(file));
    const q = queryString(u.query);
    if (u.root) return toFileUrl(path.join(path.resolve(u.root), name)) + q;
    if (base) return base + '/' + name + q;
    return toFileUrl(path.join(siteRoot, name)) + q;
  }

  /* reference directory and files */
  const refSel = pick(flags, env, 'ref-dir', 'BENCH_REF_DIR');
  const refDir = path.resolve(refSel.value || path.join(BENCH_SRC, 'ref'));
  const refNames = asList(o.ref).map(String);
  if (refSel.value !== null || refNames.length)
    needDir(refDir, 'the reference directory', 'ref-dir', 'BENCH_REF_DIR');
  const refs = {};
  for (const n of refNames) {
    const p = path.isAbsolute(n) ? n : path.join(refDir, n);
    refs[n] = needFile(p, 'the reference file "' + n + '"', 'ref-dir', 'BENCH_REF_DIR');
  }

  /* fixture directory and files */
  const fixSel = pick(flags, env, 'fixture-dir', 'BENCH_FIXTURE_DIR');
  const fixtureDir = path.resolve(fixSel.value || path.join(refDir, 'fixtures'));
  const fixNames = asList(o.fixtures).map(String);
  if (fixSel.value !== null || fixNames.length)
    needDir(fixtureDir, 'the fixture directory', 'fixture-dir', 'BENCH_FIXTURE_DIR');
  const fixtures = {};
  for (const n of fixNames) {
    const p = path.isAbsolute(n) ? n : path.join(fixtureDir, n);
    fixtures[n] = needFile(p, 'the fixture file "' + n + '"', 'fixture-dir', 'BENCH_FIXTURE_DIR');
  }

  /* scratch directory, for an overlay tree a driver serves instead of the site root.
     Outside the site root, so an overlay copy is never published with the site. */
  const tmpSel = pick(flags, env, 'tmp-dir', 'BENCH_TMP_DIR');
  const tmpDir = path.resolve(tmpSel.value || path.join(os.tmpdir(), 'bench-' + o.name));

  /* output */
  const outSel = pick(flags, env, 'out', 'BENCH_OUT');
  const out = path.resolve(outSel.value || path.join(siteRoot, 'benchmarks', o.name + '.json'));
  const out2Sel = pick(flags, env, 'out2', 'BENCH_OUT2');
  const out2Raw = out2Sel.value || (typeof o.out2 === 'string' && o.out2 !== '' ? o.out2 : null);
  const out2 = out2Raw === null ? null
    : (path.isAbsolute(out2Raw) ? path.resolve(out2Raw) : path.resolve(path.join(siteRoot, out2Raw)));

  if (o.mkdirOut !== false) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (out2) fs.mkdirSync(path.dirname(out2), { recursive: true });
  }

  return {
    name: o.name,
    siteRoot, benchSrc: BENCH_SRC,
    pageFile, pagePath, pageUrl: pageUrlFor(pageFile, { query: o.query }), base,
    refDir, refs, ref: refNames.length ? refs[refNames[0]] : null,
    fixtureDir, fixtures, fixture: fixNames.length ? fixtures[fixNames[0]] : null,
    tmpDir,
    out, out2,
    flags,
    pageUrlFor,
    /* create and return the scratch directory; a driver calls this only if it needs one */
    scratch(sub) {
      const p = sub ? path.join(tmpDir, String(sub)) : tmpDir;
      fs.mkdirSync(p, { recursive: true });
      return p;
    },
    /* an arbitrary path under the site root, for a declared dependency a driver checks */
    site(rel) { return path.join(siteRoot, String(rel)); },
  };
}

export default benchPaths;
