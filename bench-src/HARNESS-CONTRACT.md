# Benchmark harness contract — `provenance.mjs`, `benchpaths.mjs`, `ref/genpaths.py`

Owner: `bench-sweep`. Audience: anyone writing or porting a driver under `bench-src/`, and
anyone reading a `benchmarks/*.json` artifact and asking what its `build` field is worth.

Measured census of this directory, taken with a comment-stripping parser over the code and
not over the comments (`work/callsites.py` in the owning workspace):

| | count |
|---|---|
| `run_*.mjs` drivers | 46 |
| `stampProvenance(` call sites in code | 46 — one per driver, **0 drivers calling it twice** |
| `readPageManifestRevision(` call sites in code | 46 — one per driver |
| `benchPaths(` call sites in code | 46 — one per driver |
| python files under `ref/` | 50, of which 45 are `*_ref.json`'s generators or their libraries |
| files under `ref/` | 108, of which 54 are `.json` and 45 are `*_ref.json` |

An earlier revision of this document said 51 call sites with 5 drivers calling twice. That
described the tree before the conversion; the figures above are the tree as it ships.

Three rules decide every signature below.

1. **The build an artifact names is the revision read out of the live DOM of the page the
   browser loaded.** Not the page file beside the driver. A run against `integ`'s
   `kinetics.html`, which declares `2026-08-14.taxonomy1`, produced an artifact claiming
   `build 2026-10-03.prototype-1`.
2. **A record is tied to the run that produced it by reference, never by a value anyone can
   retype.** Of 18 guard-defeat attempts against the previous revision, 14 refused and left
   no file and 3 wrote a full four-field artifact: the exact string the page would have
   produced typed in as a literal, the same string read off disk by the caller, and a
   `prov.siteRoot` that moved the cross-check to a tree where a wrong build was right. The
   same 18 attempts plus 14 more now stand at **one write, and that one is the genuine
   observation** (§1.5).
3. **No path contains a `/root` literal.** `/root/bench` and `/root/site` do not exist in this
   container. `grep -rn /root bench-src/run_*.mjs` returns nothing, and after this round
   `grep -rln /root bench-src/ref/*.py` returns only `genpaths.py`, where the sentence
   describes the defect.

---

## 1. `provenance.mjs`

```js
import { readPageManifestRevision, stampProvenance } from './provenance.mjs';
```

### 1.1 `await readPageManifestRevision(page) -> observation`

`page` is the Playwright `Page` the run drove. Call it **after** the `goto`, and after
`ready(page)` where the driver has one.

Returns an **observation**: a frozen `String` instance carrying the `manifest_revision` of
the JSON in that document's live `#diagram-tool-manifest` script, registered by object
identity inside this module. It behaves as the revision string everywhere a driver uses one
— concatenation, template literals, `JSON.stringify`, `.trim()`, storage in an object and
read back out — and it is the only value `stampProvenance` accepts as `prov.build`.

Before it reads anything it establishes that it was handed the live page of a run:

| condition | message begins |
|---|---|
| not an object, or missing `evaluate`/`content`/`url`/`goto`/`mainFrame`/`context` | `readPageManifestRevision: pass the Playwright page the run drove — <which>` |
| `page.mainFrame().page()` is not the page | `this object is not the page it claims to be` |
| `page.evaluate` does not run the function it is given against a document | `page.evaluate() did not run the function it was given against a document` |
| the nonce written through `evaluate` is absent from `page.content()` | `the nonce written through page.evaluate() does not appear in page.content()` |

The nonce is the test that costs a fake the most: the module writes a random attribute onto
`documentElement` through one channel and requires it to come back in the serialised document
fetched over the other, then removes it. The previous revision asked only for an object with
an `evaluate` method, so `{ evaluate: async () => ({ state: 'ok', revision: 'FAKE' }) }`
returned `FAKE`.

Then, on the document:

| condition | message begins |
|---|---|
| no `#diagram-tool-manifest` element | `the page loaded at <url> carries no #diagram-tool-manifest script` |
| the script's text does not parse | `the #diagram-tool-manifest script at <url> does not parse: <why>` |
| no `manifest_revision`, or not a non-empty string | `the #diagram-tool-manifest script at <url> declares no manifest_revision` |
| `page.evaluate` and `page.content()` report different revisions | `One document is giving two builds` |

There is no fallback, no default, no environment override and no waiver flag. A driver that
cannot read the page cannot write an artifact.

### 1.2 `stampProvenance(artifact, prov) -> artifact`

Mutates and returns `artifact`, so the call sits inside the write expression.

| `prov` field | required | meaning |
|---|---|---|
| `build` | **yes** | the observation `readPageManifestRevision(page)` returned **in this run** |
| `reference_provenance` | no | `"recomputed"` \| `"recorded"` \| `"mixed"`, or omitted for `null` |
| `provenance_note` | no | one sentence on where the reference values come from |
| `file` | no | the page filename, when `artifact.file` / `artifact.tool` does not carry it |
| `driver` | no | the name the refusal uses; defaults to `basename(process.argv[1])` |

`siteRoot` is **gone**. It used to redirect the cross-check, so a build the shipping page does
not declare could be written against a tree where it was right. The tree is set once for the
whole run with `--site` or `BENCH_SITE_ROOT`, which is what `benchpaths.mjs` reads; a
`prov.siteRoot` that is not that tree is refused by name.

Writes onto the artifact: `build` and `manifest_revision` (both the observed revision),
`reference_provenance`, `provenance_note`, `file` (the page filename, **when the artifact does
not already name an `.html`** — `benchmarks/operatingpoint.json` shipped without it, so
`catalog.php` could not resolve its page from the artifact), and `run_at` — the last **only**
when the artifact carries neither `run_at` nor `generated_at`, so a driver that dates its own
run keeps its value.

Throws, writing nothing, when:

| condition | the refusal says |
|---|---|
| `prov.build` absent, `null` or `''` | `<driver> passed no observed build…`, naming `readPageManifestRevision(page)` |
| `prov.build` is anything this module did not observe | `<driver> passed a build value this module did not observe (<type>)…`, and that a string equal to what the page declares is a retype and not a reading |
| the observation was read from a different page than the artifact names | `<driver> observed <page> at <url> and is stamping an artifact that names <other>` |
| `prov.siteRoot` is not the run's site root | `prov.siteRoot "<v>" … The parameter is gone` |
| no page filename anywhere | `<driver>'s artifact names no page file, so the observed build cannot be cross-checked` |
| observed ≠ the revision in the page file on disk | `build mismatch: the page the browser loaded reports manifest_revision "<observed>", and <abs path> on disk reports "<on disk>"` |

### 1.3 `readManifestRevision(file, siteRoot = SITE_ROOT) -> string`

The disk read, kept as the cross-check `stampProvenance` performs. A driver does not need to
call it, and its return value is **not** an observation: passing it as `prov.build` is attempt
`j_disk_read`, and it is refused.

### 1.4 Also exported

`isObservation(v)` — true only for a value this module minted in this process. `SITE_ROOT`,
resolved as `benchpaths.mjs` resolves it: `--site`, then `BENCH_SITE_ROOT`, then the parent of
`bench-src`. `benchPaths` and `BENCH_SRC` re-exported, so one import line can serve a driver.

### 1.5 What the tie establishes, and what it does not

**Establishes.** That the build an artifact names was read out of a document by this module,
through two channels of one page, from the page that artifact names, during the run that wrote
the artifact, and that it equals what that page declares on disk in the tree the run resolved.

**Does not establish.** That the **graded numbers** in the artifact came from that document.
The driver counts its own cases and nothing here re-derives them, so a run can drive the page
honestly and misreport what it saw. That is `KNOWN-LIMITS.md` L-5, measured there as `d-m5`;
closing it needs a second independent reader of the same page, which is a second instrument and
not a guard. Nor does it establish anything against code in this process that reaches the
module's internals: the registry is a module-private `const` unreachable through the exports,
and a determined caller in the same address space is outside what an in-process guard decides.

Measured, 32 attempts, each judged by whether its own output file exists afterwards
(`work/guards.mjs`):

| | attempts | wrote an artifact | refused, no file | not artifact-producing |
|---|---|---|---|---|
| before | 25 | 4 — a literal, a disk read, a `siteRoot` redirect, and the corpus's own control | 14 | 7 |
| after | 32 | **1 — the genuine observation** | 23 | 8 |

The two controls the earlier corpus used (`m_file_control`, `n_artifact_no_page`) passed a
literal build, so after the tie they refuse at the tie and no longer reach what they probed;
they are re-taken with the genuine observation as `z3`–`z5`.

---

## 2. `benchpaths.mjs`

```js
import { benchPaths, parseFlags } from './benchpaths.mjs';
```

### 2.1 `benchPaths(opts) -> paths`

| `opts` | required | meaning |
|---|---|---|
| `name` | **yes** | the artifact base name, e.g. `"steam_tables"`; sets the default output filename |
| `page` | **yes** | the `.html` filename in the site root this driver drives |
| `ref` | no | a reference filename inside `refDir`, or an array of them |
| `fixtures` | no | a fixture filename inside `fixtureDir`, or an array of them |
| `out2` | no | a default second output, site-relative or absolute |
| `query` | no | query appended to `pageUrl`; a string or an object |
| `argv` | no | defaults to `process.argv.slice(2)` |
| `env` | no | defaults to `process.env` |
| `mkdirOut` | no | create the directories of `out` and `out2`; default `true` |

Flags beat environment variables, which beat the defaults:

| what | flag | env var | default |
|---|---|---|---|
| site root | `--site` | `BENCH_SITE_ROOT` | the parent of `bench-src` |
| reference directory | `--ref-dir` | `BENCH_REF_DIR` | `<bench-src>/ref` |
| fixture directory | `--fixture-dir` | `BENCH_FIXTURE_DIR` | `<refDir>/fixtures` |
| scratch directory | `--tmp-dir` | `BENCH_TMP_DIR` | `<os tmpdir>/bench-<name>` |
| http origin | `--base` | `BENCH_BASE` | none; pages open as `file://` under the site root |
| artifact output | `--out` | `BENCH_OUT` | `<siteRoot>/benchmarks/<name>.json` |
| second output | `--out2` | `BENCH_OUT2` | `opts.out2`, or none |

`--flag value` and `--flag=value` both parse. Anything else lands in `paths.flags._`.

**A driver that reads a positional argument reads it from `parseFlags(...)._`, never from a
filter over `argv`.** `process.argv.slice(2).filter(a => !a.startsWith('--'))` keeps flag
*values*: `--base <url> --out2 <path>` left `POS = ['<url>', '<path>']`, so
`run_operatingpoint.mjs` took `POS[1]` as its page and `benchPaths` refused the run with
*"page is required and must be an .html filename"*. `run_spectrum.mjs` has the correct shape.

### 2.2 The returned object

| field | value |
|---|---|
| `siteRoot`, `benchSrc` | absolute directories |
| `pageFile`, `pagePath`, `pageUrl` | the page's filename, its absolute path, and its URL (`--base` origin, else `file://`) |
| `base` | the http origin, or `null` |
| `refDir`, `ref`, `refs` | the directory; the first requested reference file; `{name: absolute path}` |
| `fixtureDir`, `fixture`, `fixtures` | the same for fixtures |
| `tmpDir` | the scratch directory's path, not yet created |
| `out`, `out2` | absolute output paths; `out2` is `null` when none was asked for |
| `flags` | the parsed flags, for a driver's own extra flag |
| `pageUrlFor(file, {root, query})` | a URL for another page; `root` forces `file://` under that directory |
| `scratch(sub)` | creates `tmpDir[/sub]` and returns it |
| `site(rel)` | an absolute path under the site root |

### 2.3 What it refuses, at the moment it is called

| condition | the refusal names |
|---|---|
| `name` missing | `benchPaths: name is required` |
| `page` missing or not `.html` | `benchPaths: page is required and must be an .html filename` |
| the site root is absent or not a directory | `--site or BENCH_SITE_ROOT` |
| the page is not in the site root | `--site or BENCH_SITE_ROOT` |
| the reference directory is absent — when `ref` is requested or the flag was given | `--ref-dir or BENCH_REF_DIR` |
| a requested reference file is absent | `--ref-dir or BENCH_REF_DIR` |
| the fixture directory or a requested fixture is absent | `--fixture-dir or BENCH_FIXTURE_DIR` |

Every refusal carries the absolute path it resolved and `(set it with --<flag> or <ENV_VAR>)`.

---

## 3. `ref/genpaths.py` — the generator half

```python
from genpaths import REF_DIR, SITE_ROOT, ref, site, tmp
```

The drivers were parameterised and the generators were not: 37 of the 50 python files under
`ref/` held a `/root/bench/ref/...`, `/root/bench/tmp/...` or `/root/site/...` literal, so a
generator run in this container wrote nothing and the corpus it produces could not be
regenerated. `genpaths.py` mirrors `benchpaths.mjs`:

| what | flag | env var | default |
|---|---|---|---|
| reference dir | `--ref-dir` | `BENCH_REF_DIR` | this file's own directory |
| site root | `--site` | `BENCH_SITE_ROOT` | the parent of `bench-src` |
| scratch dir | `--tmp-dir` | `BENCH_TMP_DIR` | `<ref dir>/_tmp` |

`ref('x_ref.json')`, `site('x.html')` and `tmp('x.json')` resolve a name against those;
`tmp()` creates its directory. `need_ref('x.json')` is the read-side check and raises with the
flag and the environment variable that set the directory. `label('gen_x.py')` returns
`bench-src/ref/gen_x.py`, for a `generated_by` string that is **published inside an artifact**:
a provenance string names a path in the deployment, never a path on the machine that ran it.

---

## 4. `catalog.php` — the checks against the tree

| code | kind | what it measures |
|---|---|---|
| `benchmark_provenance_incomplete` | warning | the artifact is missing one of `build`, `manifest_revision`, `reference_provenance`, `provenance_note`, `run_at` |
| `benchmark_provenance_enum` | warning | `reference_provenance` is outside `recomputed` \| `recorded` \| `mixed` |
| `benchmark_build_mismatch` | **error** | the artifact's `build` or `manifest_revision` differs from the `manifest_revision` declared by the page it names — its own `file`, or the page whose manifest points at it. The tool is withheld from the catalogue and the message prints both values and the page |
| `benchmark_run_at_drift` | warning | the page's `validation.benchmarks[].run_at` disagrees at day level with the date the artifact's own run wrote |
| `benchmark_evidence_stale` | warning | a `benchmarked`/`verified` claim whose run predates the day its `manifest_revision` carries |
| `benchmark_undated` | warning | the same claim with no parseable run date anywhere |

**The run date served to the register comes off the artifact.** `catalog.php` serves
`run_at` from the artifact's own `run_at`, then its `generated_at`, and falls back to the
manifest entry's string only for an artifact that carries no date at all; `run_at_source` says
which was used and `run_at_manifest` keeps the page's string visible. The register
(`validation.html`) rendered the manifest's and the report (`benchmark.html`) prefers the
artifact's, so re-running a driver moved one date and left the other and the two pages quoted
different runs for one piece of evidence. The artifact wins because it is the only one of the
two that a run writes; writing the date into the page instead would make re-running a
benchmark edit the page, which moves `manifest_revision`, which makes the run stale against
its own evidence.
