/* Shared provenance stamp for every benchmark driver in this directory.
 *
 * AGENTS §5 requires a benchmark artifact to carry the build it was executed against
 * and where its reference values come from: build, manifest_revision,
 * reference_provenance, provenance_note and run_at.
 *
 * The build an artifact names is the revision read out of the live DOM of the page the
 * browser loaded. The driver reads it with readPageManifestRevision(page) after its
 * goto and passes it as `prov.build`; stampProvenance refuses to write anything without
 * it. The earlier version of this module read the revision from the file sitting next to
 * the driver and never consulted the page the run fetched, so a driver pointed at
 * another tree's page produced an artifact naming this tree's revision: a run against
 * `integ`'s kinetics.html, which declares 2026-08-14.taxonomy1, wrote
 * build 2026-10-03.prototype-1.
 *
 * The file on disk is still read, as the cross-check it already was: when the observed
 * revision and the file disagree the stamp throws and names both values and both
 * sources. There is no fallback, default, environment override or waiver that lets a
 * driver skip the observation.
 *
 * ---- What this module ties, and what it does not -----------------------------------
 *
 * Until this revision the stamp constrained the build's VALUE and not its PROVENANCE.
 * Measured on 18 guard-defeat attempts: 14 refused and left no file, and three wrote a
 * full four-field artifact — the exact string the page would have produced typed in as a
 * literal, the same string read off disk by the caller itself, and a `prov.siteRoot`
 * that redirected the cross-check to a tree where a wrong build was the right one. A
 * string equal to the right answer is not a measurement of the page; it is a retype.
 *
 * That is the defect class the conformance programme spent six rounds on, and its
 * answer is in /home/claude/qa/_snapshots/README.md and KNOWN-LIMITS L-5: **a record
 * must be tied by reference to the run that produced it, not by a value anyone can
 * retype.** So:
 *
 *   - readPageManifestRevision(page) mints an OBSERVATION and registers it by object
 *     identity in a module-private WeakSet. The observation is a frozen String
 *     instance, so every existing driver — all 46 of them pass the return value
 *     straight into `{ build: BUILD }`, and two store it in an object first — keeps
 *     working unchanged, while what reaches the stamp is a reference and not a value.
 *   - stampProvenance accepts only an observation this module minted. A primitive
 *     string, a `new String(...)` the caller built, a Proxy around one, an object with
 *     a convenient toString: each is refused by name, and nothing is written.
 *   - the observation records the url it was read from, and the stamp checks the page it
 *     was read from against the page the artifact names, so a genuine observation of one
 *     page cannot stamp another page's artifact.
 *   - `prov.siteRoot` is gone. The cross-check resolves the site root the way
 *     benchpaths.mjs does — --site, then BENCH_SITE_ROOT, then the parent of bench-src —
 *     so the tree a run drove is the tree it is checked against, and the caller has no
 *     parameter that moves the check.
 *
 * **What this establishes.** That the build an artifact names was read out of a document
 * by this module, from the page that artifact names, during this run, and that it equals
 * what that page declares on disk in the tree the run resolved.
 *
 * **What it does not establish.** That the GRADED NUMBERS in the artifact came from that
 * document. The driver counts its own cases, and nothing here re-derives them; a run can
 * drive the page honestly and misreport what it saw. That is L-5, measured there as
 * `d-m5`, and closing it needs a second independent reader of the same page — a second
 * instrument, not a guard. It also does not establish anything against code running
 * inside this process that reaches the module's own internals: the registry is a
 * module-private const and unreachable through the exports, and a determined caller in
 * the same address space is outside what an in-process guard can decide.
 *
 * reference_provenance and provenance_note are facts about the reference rather than
 * about the run, so each driver declares its own. The enum is §5's:
 * recomputed | recorded | mixed, or null where this tree does not establish it — a null
 * is named by catalog.php.
 *
 * run_at is written only when the artifact carries neither run_at nor generated_at, so a
 * driver that dates its own run keeps its value and a driver that dates none still ships
 * a dated artifact.
 *
 * Paths come from ./benchpaths.mjs. SITE_ROOT is re-exported from there so this module
 * and the drivers resolve the site root one way.
 */
import fs from 'fs';
import path from 'path';
import { benchPaths, BENCH_SRC, parseFlags } from './benchpaths.mjs';

export { benchPaths, BENCH_SRC };

/* The site root, resolved exactly as benchpaths.mjs resolves it: flag, then environment,
   then the parent of bench-src. A driver given --site drives that tree, so that tree is
   the one the observed build is cross-checked against. */
function resolveSiteRoot() {
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.site === 'string' && flags.site !== '') return path.resolve(flags.site);
  if (typeof process.env.BENCH_SITE_ROOT === 'string' && process.env.BENCH_SITE_ROOT !== '')
    return path.resolve(process.env.BENCH_SITE_ROOT);
  return path.resolve(BENCH_SRC, '..');
}

export const SITE_ROOT = resolveSiteRoot();

const MANIFEST_RE = /<script[^>]*id="diagram-tool-manifest"[^>]*>([\s\S]*?)<\/script>/;

/* ---- the observation registry -------------------------------------------------------
 * Module-private, keyed by object identity. Nothing in the exports reaches it, and a
 * value that was not minted here cannot be added to it. */
const OBSERVED = new WeakSet();
const OBSERVED_META = new WeakMap();

function mintObservation(revision, url, channels) {
  const obs = new String(revision);
  Object.defineProperty(obs, 'observedUrl', { value: url, enumerable: false });
  Object.defineProperty(obs, 'observedChannels', { value: Object.freeze(channels.slice()), enumerable: false });
  Object.freeze(obs);
  OBSERVED.add(obs);
  OBSERVED_META.set(obs, { revision, url, channels: channels.slice(), at: Date.now() });
  return obs;
}

/** True only for a value this module minted in this process. */
export function isObservation(v) {
  return (typeof v === 'object' || typeof v === 'function') && v !== null && OBSERVED.has(v);
}

/* The driver's own filename, for a refusal that has to say which driver refused. */
function callerName(explicit) {
  if (typeof explicit === 'string' && explicit !== '') return explicit;
  const entry = process.argv && process.argv[1];
  return entry ? path.basename(entry) : 'this driver';
}

/* The revision in the page file on disk. Used as the cross-check against what the
   browser reported, and never as a substitute for it. */
export function readManifestRevision(file, siteRoot = SITE_ROOT) {
  const p = path.isAbsolute(file) ? file : path.join(siteRoot, file);
  const src = fs.readFileSync(p, 'utf8');
  const m = src.match(MANIFEST_RE);
  if (!m) throw new Error('no diagram-tool-manifest in ' + p);
  const j = JSON.parse(m[1]);
  if (!j.manifest_revision) throw new Error('no manifest_revision in ' + p);
  return j.manifest_revision;
}

/* ---- is this a Playwright page, or something shaped like one? -----------------------
 * The previous version asked for an object with an `evaluate` method, so
 * `{ evaluate: async () => ({ state: 'ok', revision: 'FAKE' }) }` returned FAKE: a
 * one-line object minted a build. Three things are required instead, and each one costs
 * a fake more than a line:
 *
 *   1. the Page surface — evaluate, content, url, goto, mainFrame and context are all
 *      functions;
 *   2. an identity round-trip through the object graph: page.mainFrame().page() is the
 *      same object, and the frame's url is the page's;
 *   3. a nonce written through one channel and read back through the other. The module
 *      sets an attribute on documentElement via page.evaluate and then requires it to
 *      appear in page.content(), which is the serialised document fetched over the
 *      browser protocol. A stub has to implement a mutable document that two independent
 *      methods agree about.
 *
 * This raises the cost of a fake from one line to a working document; it does not make
 * one impossible, because a fake lives in this process. The limit is stated at the top
 * of this file. */
function pageSurfaceFault(page) {
  if (!page || (typeof page !== 'object' && typeof page !== 'function')) return 'it is not an object';
  for (const m of ['evaluate', 'content', 'url', 'goto', 'mainFrame', 'context'])
    if (typeof page[m] !== 'function') return 'it has no ' + m + '() method';
  return null;
}

async function assertLivePage(page) {
  const fault = pageSurfaceFault(page);
  if (fault !== null)
    throw new Error('readPageManifestRevision: pass the Playwright page the run drove — ' + fault
      + '. The build an artifact names has to be read out of a document the browser loaded, so a '
      + 'value supplied by the caller is refused here rather than at the stamp.');

  let frame;
  try { frame = page.mainFrame(); } catch (e) { frame = null; }
  if (!frame || typeof frame.page !== 'function' || frame.page() !== page)
    throw new Error('readPageManifestRevision: this object is not the page it claims to be — '
      + 'page.mainFrame().page() is not the page itself. A Playwright Page and its main frame '
      + 'point at each other; an object assembled to look like one does not.');

  const nonce = 'obs-' + Date.now().toString(36) + '-'
    + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  const echoed = await page.evaluate((n) => {
    const el = document.documentElement;
    el.setAttribute('data-bench-observation', n);
    return el.getAttribute('data-bench-observation');
  }, nonce);
  if (echoed !== nonce)
    throw new Error('readPageManifestRevision: page.evaluate() did not run the function it was '
      + 'given against a document — it returned ' + JSON.stringify(echoed) + ' for a nonce it was '
      + 'asked to write and read back. Nothing is observed, so nothing is returned.');
  let html;
  try { html = await page.content(); } catch (e) {
    throw new Error('readPageManifestRevision: page.content() failed, so the document the nonce '
      + 'was written into cannot be read back over a second channel: ' + String(e && e.message || e));
  }
  if (typeof html !== 'string' || html.indexOf(nonce) < 0)
    throw new Error('readPageManifestRevision: the nonce written through page.evaluate() does not '
      + 'appear in page.content(). The two channels are not reading one document, so this is not '
      + 'the live page of a run.');
  /* leave the page as it was found */
  try {
    await page.evaluate(() => document.documentElement.removeAttribute('data-bench-observation'));
  } catch (e) { /* a page closing under us is not a reason to lose the observation */ }
  return html;
}

/* The revision in the document the browser actually loaded.
 *
 *   const BUILD = await readPageManifestRevision(page);
 *
 * Returns an observation: a frozen String instance carrying the revision, registered by
 * identity in this module. It behaves as the revision string everywhere a driver uses it
 * — concatenation, template literals, JSON.stringify, .trim() — and it is the only thing
 * stampProvenance accepts as `prov.build`.
 *
 * Throws, naming the page's URL, when the manifest script is absent, unparseable, or
 * carries no manifest_revision; and before any of that, when the object it was given is
 * not the live page of a run. */
export async function readPageManifestRevision(page) {
  let url = '(unknown url)';
  const html = await assertLivePage(page);
  try { url = page.url(); } catch (e) { /* a closed page still gets a named refusal */ }
  const seen = await page.evaluate(() => {
    const n = document.getElementById('diagram-tool-manifest');
    if (!n) return { state: 'no-script' };
    let j;
    try { j = JSON.parse(n.textContent); } catch (e) { return { state: 'unparseable', why: String(e && e.message || e) }; }
    if (!j || typeof j !== 'object') return { state: 'unparseable', why: 'the manifest is not an object' };
    const r = j.manifest_revision;
    if (typeof r !== 'string' || r === '') return { state: 'no-field' };
    return { state: 'ok', revision: r };
  });
  if (seen.state === 'no-script')
    throw new Error('the page loaded at ' + url + ' carries no #diagram-tool-manifest script, '
      + 'so this run cannot state the build it graded');
  if (seen.state === 'unparseable')
    throw new Error('the #diagram-tool-manifest script at ' + url + ' does not parse: ' + seen.why);
  if (seen.state === 'no-field')
    throw new Error('the #diagram-tool-manifest script at ' + url + ' declares no manifest_revision, '
      + 'so this run cannot state the build it graded');

  /* The serialised document is the second channel on the same observation: where the two
     disagree, the live DOM wins and the disagreement is named, because a page that
     rewrites its own manifest after load is a finding and not a build. */
  const channels = ['page.evaluate'];
  const m = typeof html === 'string' ? html.match(MANIFEST_RE) : null;
  let serialised = null;
  if (m) {
    try { serialised = (JSON.parse(m[1]) || {}).manifest_revision || null; } catch (e) { serialised = null; }
  }
  if (serialised !== null) {
    channels.push('page.content');
    if (serialised !== seen.revision)
      throw new Error('the page at ' + url + ' reports manifest_revision "' + seen.revision
        + '" through page.evaluate() and "' + serialised + '" through page.content(). One document '
        + 'is giving two builds, so this run cannot state the build it graded.');
  }
  return mintObservation(seen.revision, url, channels);
}

/* Mutates and returns the artifact, so a driver can wrap its write in one call.
 *
 *   stampProvenance(artifact, { build: BUILD, reference_provenance: '…', provenance_note: '…' })
 *
 * `build` must be the observation readPageManifestRevision() returned for the page this
 * run drove. Without it the function throws and writes nothing. */
export function stampProvenance(artifact, prov) {
  if (!artifact || typeof artifact !== 'object') throw new Error('stampProvenance: not an artifact');
  const p = prov || {};
  const who = callerName(p.driver);

  if (p.build === undefined || p.build === null || p.build === '')
    throw new Error('stampProvenance: ' + who + ' passed no observed build. The build an artifact '
      + 'names is the manifest_revision read out of the live DOM of the page the browser loaded '
      + '(readPageManifestRevision(page) in this module, called after the goto). A run that did not '
      + 'observe the page it drove cannot state the build it graded, so nothing is written. There is '
      + 'no default and no override.');

  if (!isObservation(p.build))
    throw new Error('stampProvenance: ' + who + ' passed a build value this module did not observe'
      + ' (' + (typeof p.build) + (typeof p.build === 'string' ? ', a plain string' : '') + '). '
      + 'A string equal to what the page declares is a retype and not a reading: the literal, and '
      + 'the same value read off disk by the caller, both used to write a full artifact. `build` '
      + 'must be the value readPageManifestRevision(page) returned in this run — it is registered '
      + 'by object identity, so it cannot be reconstructed, copied out of a file or built with '
      + 'new String(). Call readPageManifestRevision(page) after the goto and pass what it returns.');

  const observed = String(p.build).trim();
  if (observed === '')
    throw new Error('stampProvenance: ' + who + ' passed an observation carrying an empty revision.');

  const file = p.file
    || (typeof artifact.file === 'string' && /\.html$/.test(artifact.file) ? artifact.file : null)
    || (typeof artifact.tool === 'string' && /\.html$/.test(artifact.tool) ? artifact.tool : null);
  if (!file) throw new Error('stampProvenance: ' + who + "'s artifact names no page file, so the "
    + 'observed build cannot be cross-checked against the page on disk. Set artifact.file to the '
    + 'page filename, or pass it as prov.file.');
  const pageFile = path.basename(file);

  /* The observation names the url it was read from. An artifact stamped with another
     page's observation would carry a build nobody read from the page it names. */
  const meta = OBSERVED_META.get(p.build) || {};
  if (typeof meta.url === 'string' && meta.url !== '(unknown url)') {
    let observedFile = null;
    try {
      const u = meta.url.startsWith('file://') ? new URL(meta.url).pathname : new URL(meta.url).pathname;
      observedFile = decodeURIComponent(path.basename(u.split('?')[0]));
    } catch (e) { observedFile = null; }
    if (observedFile && /\.html$/i.test(observedFile) && observedFile !== pageFile)
      throw new Error('stampProvenance: ' + who + ' observed ' + observedFile + ' at ' + meta.url
        + ' and is stamping an artifact that names ' + pageFile + '. The observation belongs to the '
        + 'page it was read from; an artifact is stamped with the build of the page it grades.');
  }

  if (p.siteRoot !== undefined && path.resolve(String(p.siteRoot)) !== SITE_ROOT)
    throw new Error('stampProvenance: ' + who + ' passed prov.siteRoot "' + p.siteRoot + '", which '
      + 'is not the site root this run resolved (' + SITE_ROOT + '). The parameter is gone: it used '
      + 'to redirect the cross-check, so a build the shipping page does not declare could be '
      + 'written against a tree where it was right. The tree is set for the whole run with --site '
      + 'or BENCH_SITE_ROOT, which is what benchpaths.mjs reads.');

  const onDisk = readManifestRevision(pageFile, SITE_ROOT);
  if (observed !== onDisk)
    throw new Error('build mismatch: the page the browser loaded reports manifest_revision "'
      + observed + '", and ' + path.join(SITE_ROOT, pageFile) + ' on disk reports "' + onDisk
      + '". The run and the page in this tree are not the same build, so the artifact would name a '
      + 'build it did not grade. Drive the page in this tree, or point --site at the tree whose page '
      + 'was driven.');

  artifact.build = observed;
  artifact.manifest_revision = observed;
  /* An artifact that names no page cannot be checked against one: benchmarks/operatingpoint.json
     shipped without `file`, so catalog.php could not resolve its page from the artifact and the
     independent build check had to skip it. The stamp knows the page, so it writes it. */
  if (typeof artifact.file !== 'string' || !/\.html$/i.test(artifact.file)) artifact.file = pageFile;
  artifact.reference_provenance = p.reference_provenance === undefined ? null : p.reference_provenance;
  artifact.provenance_note = p.provenance_note || null;
  const dated = (typeof artifact.run_at === 'string' && artifact.run_at !== '')
    || (typeof artifact.generated_at === 'string' && artifact.generated_at !== '');
  if (!dated) artifact.run_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return artifact;
}
