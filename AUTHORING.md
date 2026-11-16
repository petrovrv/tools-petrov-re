# tools.petrov.re — authoring a NEW tool

Revision 2026-09-01 (v3.7.0 localisation contract). Framework `tools.petrov.re/ui/v1`, implementation `diagram-ui.js`
file version `2026-08-31.v3.7-i18n`. Data contract `tools.petrov.re/tool-manifest/v2`.
Verified against the served tree on 2026-08-22: `fwgate` GREEN 84/84 with 52 findings waived across
the same 7 known defects, `repgate` GREEN 21/21 with none, `check.js` clean on all six tools built
from this guide (49 of 53 tree-wide, the same 4 environment failures), `catalog.php` 0 errors and
3 pre-existing warnings, the parity sweep 49 OK / 1 / 1 of 51, six languages loaded on each.
Revision `d` adds **§5.8.1** — an example can declare an `id:`, and that id is the only supported way
to address a preset from a probe, a driver or another part of your tool (v3.5.2, spec §8.3.1).
Revision `c` amends **§6.6.1** with the repaired state of all four traps and the two corrected
measurements behind them (v3.5.1, spec §21.9), and names `print-contrast2.mjs` as the instrument.
Revision `b` adds **§6.6.1** — the four ways a tool can still print wrong now that §6.6's one path
exists, all four measured on shipped tools after v3.5 landed.

`PORTING_PLAYBOOK.md` tells you how to move an existing tool onto the framework. This file tells
you how to **write one that did not exist yesterday**. It is a procedure, in order, and it is
written to be executed by someone — or some session — with **no memory of this project**, without
reading the 79 kB specification first, and without copying an existing tool.

The goal: a tool a user cannot tell is new. Same header, same slots, same exports, same six
languages, same honesty layer as the other fifty — because you declared it, not because you copied
it.

Everything below is true of `diagram-ui.js` as it stands. Where the specification promises
something the code does not do, §12 says so and **the code wins**.

## Contents

| | |
|---|---|
| §0 | before you write a line — what to read, what to decide |
| §1 | what a tool IS here: manifest, model, interface, record |
| §2 | **step 1** — the manifest, field by field, six languages, the status ladder |
| §3 | **step 2** — the archetype: a decision test, what each one costs, and (§3.5–§3.7) the `studio`'s declared mechanics — 2D `interact:`, 3D `scene:`, one keyboard scheme |
| §4 | **step 3** — the model, the state, and units (store SI) |
| §5 | **step 4** — declaring the interface: panels, fields, lists, stage, results, steps, notices, examples, learn, rebuild |
| §6 | **step 5** — the data layer: state, record, handoff, python, report, and (§6.6) **printing — one path, which you do not write**, plus (§6.6.1) the four ways tools still get it wrong |
| §7 | the obligations that are easy to miss and expensive to fix |
| §8 | **step 6** — how to check your work |
| §9 | what the framework does **not** do |
| §10 | the traps, mined from 49 real ports |
| §11 | when the framework is missing something |
| §12 | where the specification and the code disagree — believe the code |
| §13 | the skeleton |
| §14 | definition of done |
| §15 | what six newcomers actually hit — the 2026-08-18 cohort (§15) and the 2026-08-21 cohort (§15.1), and what each gap cost |

If you read only four sections before starting: **§3** (the archetype decides which regions exist),
**§4.2** (store SI — twenty tools cannot, because they decided late), **§12** (the eighteen places
the specification is wrong) and **§15** (the places this document was wrong or silent as recently as
2026-08-21, and what each one cost the author who found it).

Two checklists exist because six authors paid for them the expensive way. If your tool declares
`scene:`, read **§3.6.1** before you write a line of it. If your archetype is `reference`, read
**§5.5.1.1**. Both are lists of things the framework does *not* do for you, and four of the eleven
items are silent — no gate catches them.

---

## 0. Before you write a line

### 0.1 What to put in front of you

Paths are relative to the deployment root (the directory the site is served from).

| File | Why |
|---|---|
| this file | the procedure |
| `AGENTS.md` | the data contract: manifest, record, PDF, Python, handoff, status ladder |
| `diagram-ui.js` | the library. Read it when this file and the spec disagree |
| `UI/UI_FRAMEWORK_SPEC.md` | the normative rules your result is judged against; a reference, not a tutorial |
| `NEW_TOOL_TEMPLATE.html` | a working level-3 tool: 0 bytes of CSS, 3 DOM calls |

**The spec and the playbook are in the `UI/` subdirectory, not beside this file.** An author who
looked for them at the root concluded they had been deleted and worked without them:

> "Neither file exists in `/root/refactored3`. §12 is written as a diff against a spec revision that
> is not on disk, so every 'believe the code' claim in §12 is unverifiable from the deployment tree.
> I took §12 on trust." — `trussframe.html`

They are at `UI/UI_FRAMEWORK_SPEC.md` and `UI/PORTING_PLAYBOOK.md`. §12 is checkable.

**The three gate scripts are NOT in the deployment tree at all.** The table below used to name them
as `UI/tools/check.js` and `UI/tools/parity.js`, relative to the deployment root, and there is no
`UI/tools/` under `/root/refactored3` — `UI/` there holds only the spec, the playbook, the migration
map and the audit. Both authors of the 2026-08-21 cohort lost time on it, and it is the same class
of error §15 already records for the spec paths:

> "§0.1 names `UI/tools/check.js` and `UI/tools/parity.js`; §8 runs them from the deployment root.
> There is no `UI/tools/` directory in /root/refactored3 … This is the same class of error §15
> records for the spec paths, fixed for the spec and not for the tools." — `pipesupports.html`

Where they actually are, verified on 2026-08-22:

| Script | Path | Note |
|---|---|---|
| `check.js`  | `/root/harness/check.js`  | a byte-identical copy is at `/root/site/UI/tools/check.js` |
| `parity.js` | `/root/harness/parity.js` | a byte-identical copy is at `/root/site/UI/tools/parity.js` |
| `fwgate.mjs` | `/root/harness/fwgate.mjs` | **only there.** No copy anywhere else, and until this revision the guide never gave it a path at all |
| `repgate.mjs` | `/root/harness/repgate.mjs` | only there. `fwgate.mjs` runs its `--sample` lane itself; `FWGATE_NOREPORT=1` skips it |
| `benchgate.mjs` | `/root/harness/benchgate.mjs` | only there. New 2026-08-22. **The only gate that opens `benchmark.html`**, which is where every printed footer in the tree points |

`check.js --all` additionally reads `catalog.json` from the **current working directory**, which the
tree does not contain — generate it first with `php catalog.php > catalog.json`, and delete it after,
because it is a build product and not a deployment file.

**`benchmark.html` needs PHP and the development server does not run it.** The page fetches
`catalog.php`; `python3 -m http.server` hands back the PHP *source* with a `200`, so the fetch
succeeds and only the JSON parse fails. Since 2026-08-22 the page falls back to a `catalog.json`
beside it and, failing that, prints the exact command to run in all six languages — but the way to
actually check it is `node /root/harness/benchgate.mjs <tool>`, which starts its own `php -S`. If
your tool declares `validation.benchmarks`, run it: it is the check that the numbers on your manifest
are the numbers in your artifact, and the first run of it found a shipped manifest claiming 202 cases
for a 62-case file.

Four files this guide **tells you to run** but does not describe completely enough to predict. Every
one of the four authors of the 2026-08-18 cohort read at least three of them, and each said the same
thing — the prose describes the behaviour, the source defines it. Budget the time:

| File | What only the source tells you |
|---|---|
| `diagram-common.js` | what `python()` emits actually calls (`compute()` returning the record's output keys, `INPUTS`/`EXPECTED` as module constants via `pyIdent`); the real key set of a `report.sections` entry; that `Diagram.init` sets `window.__diagramReady` through `whenReady()` independently of the UI layer; that the permalink callable is `Diagram.state.link()` |
| `catalog.php` | which manifest fields are hard errors and which are warnings; that only `title`/`summary`/`description`/`limitations` are language-checked; how `listed:false` is handled (§8.4) |
| `check.js` | that `--block` filters the assertions down to `#dgc-bar` and `__diagramReady` — the fact that forces the boot shape in §1.3 |
| `parity.js` | that `set_state` goes through `DiagramUI.pathSet`, so a case value may be an array; that a `null` record at load aborts with exit 3 (§6.2) |
| `fwgate.mjs` | **what the gate now enforces.** Its header comment is the only description of checks C1–C5 anywhere; §8.2 summarises it but the file defines it. Both 2026-08-21 authors read it before writing a line, and both said so: two of the five checks are exactly the traps their archetype hits first |

You do **not** need `UI_AUDIT.md`, `PORT_REPORTS.json`, `TOOL_MIGRATION_MAP.json` or the changelog.
Their conclusions are already in §10, §11 and §15 here.

### 0.2 The deployment unit

One HTML file. Data or binaries only if the manifest's `dependencies` lists them, and then they
deploy beside the HTML. You do not edit `index.html`, `validation.html`, `benchmark.html`,
`catalog.php`, `site-disclaimer.js`, `diagram-common.js` or `diagram-ui.js` to add a tool. If you
believe you must, you have found either a framework gap (§11) or a wrong turn.

### 0.3 Four decisions, before any code

Write the answers down. Three of them are irreversible after the first deploy.

1. **What does it compute, and what is the answer?** Name the two or three numbers that go in the
   headline. If you cannot, the tool has no shape yet.
2. **What is the state?** The named inputs, and their units. **Decide SI now** (§4.2). The state
   shape is the permalink; the permalink is a promise to every reader who bookmarks one.
3. **Which archetype?** §3. It decides which regions exist at all.
4. **What is the honest status?** `prototype` unless you have run a benchmark against an
   independent reference *today*. §2.4.

### 0.4 The one thing that makes this safe

The record — `Diagram.record.build()` — is the centre. The PDF, the CSV, the JSON export, the
Python export, the parity harness and every downstream check read it, and nothing else. Design it
in step 4, before the screen exists, and the rest of the work has a fixed point to be checked
against. Design it last and you will find on the day of the deploy that the screen shows six
numbers the record has never heard of.

---


## 0. Language contract — v3.7.0 (normative)

**Read this before touching localisation.** Canonical standalone contract: `LANGUAGE_CONTRACT.md`. This section supersedes every historical reference later
in this document to “six languages”, “all six”, or “a seventh language”. Those phrases describe the
pre-v3.7 estate and are not the current contract.

The site has a **global site-language registry** of seven languages:
`en`, `uk`, `de`, `nl`, `fr`, `es`, `pl` (English, Українська, Deutsch, Nederlands, Français,
Español, Polski).

There are two different language concepts and they must not be collapsed:

- **`siteLang`** — language of shared site/framework chrome: catalogue, return-to-tools link,
  language picker, common toolbar, disclaimer/status shell, report chrome and other framework-owned
  strings. It is selected by `?lang=` → `localStorage.diagram_site_lang` → legacy
  `localStorage.diagram_lang` → browser language → `en`. `<html lang>` follows `siteLang`.
- **`domainLang`** — language of the current tool's own labels, explanations, model warnings and
  other tool-owned content. `domainLang` is resolved from `siteLang` against the tool manifest's
  `tool_languages`; if unsupported it falls back to `en` (or, for defensive compatibility, the
  first declared tool language if `en` is absent).

Manifest language arrays are **subsets**, not copies of the global registry:

- `catalog_languages`: languages for which this tool supplies the catalogue-visible localized
  fields (`title`, `summary`, `description`, `limitations`, and localized validation basis where
  applicable). Every language named here must have those fields. Adding a new global site language
  does **not** require editing every existing tool.
- `tool_languages`: languages actually supported by the tool's domain UI. It must be a subset of
  `catalog_languages`. For normal current manifests `en` must be present.
- The language picker shows the **global site languages**, not only `tool_languages`. Selecting a
  site language that the tool does not implement is valid: shared chrome changes to `siteLang` and
  the tool remains in its `domainLang` fallback.

Do not hard-code a local `['en','uk','de','nl','fr','es']` site-language registry in a new tool.
Use the framework registry/resolver. Do not use `diagram_lang` as the primary site preference in new
code; v3.7 uses `diagram_site_lang` so old six-language bootstraps cannot overwrite a newly selected
site language. The legacy key is read only for compatibility/migration.

Current v3.7 localisation canaries are deliberately different:

| Tool | `catalog_languages` | `tool_languages` | Behaviour at `?lang=pl` |
|---|---|---|---|
| `xenon.html` | en uk de nl fr es pl | en uk de nl fr es pl | Polish shell + Polish domain |
| `cfd.html` | en uk de nl fr es pl | en uk de nl fr es | Polish shell + English domain fallback |
| `kernnormenwijzer.html` | en uk de nl fr es pl | en | Polish shell + English domain fallback; Polish jurisdiction data are still available |

The rest of the estate must be read from each tool's manifest. **Never infer domain-language support
from the site's global registry.**

## 1. What a tool IS here

Four parts, in this order, and nothing else:

```
  1. the manifest    a JSON block in <head>. Identity, honesty, capabilities.
                     Read by catalog.php, index.html, validation.html, benchmark.html,
                     site-disclaimer.js, diagram-common.js and diagram-ui.js.

  2. the model       pure functions and a defaults object. No DOM, no strings for the
                     screen, no knowledge that a screen exists.

  3. the interface   ONE DiagramUI.app({…}) declaration. Data, not markup.

  4. the record      Diagram.init({state, record, python, handoff}). The calculation
                     record and everything that reads it.
```

### 1.1 Why the record is the centre

`record()` returns one object:

```js
{ inputs:{…}, outputs:{…}, units:{…}, model:{equations, ranges, notes}, warnings:[…] }
```

Everything downstream is a rendering of it:

- the **PDF report** prints it, with a mandatory `Source: https://tools.petrov.re/<file>` line on
  every page;
- **Export JSON** and **Export CSV** in the shared bar serialise it;
- the **Python export** prints its `inputs` as constants and asserts its `outputs` in a self-test;
- the **permalink** does not carry the record, but `serialize()` must produce the state that
  reproduces it;
- `parity.js`, the numeric regression harness, compares `record().outputs` and nothing else.

Two rules follow, and they are the two that ports most often found broken:

- **`record()` returns `null` when nothing has been computed.** Not an object of zeros. The runtime
  then tells the user instead of exporting an empty document.
- **The record and the screen must agree.** Every quantity the tool displays is in `outputs`, under
  a name a reader can match to the label. One ported tool shipped with node boundary exchange,
  component node-Δp and velocity pressure on screen and absent from the record; nobody noticed for
  two years, because nothing checks it but a human reading both.

### 1.2 Why the model must not touch the DOM

```js
/* wrong */ function calc(){ const D = +document.getElementById('dia').value; … paint(); }
/* right */ function solve(s){ /* s = {D,L,Q,eps} */ return { /* every computed quantity */ }; }
```

`solve(state)` is pure: no `document`, no globals it writes, no side effects, and it returns
**every** quantity the page displays — including the ones only drawn on a chart. This is not
style. It is what makes four other things possible:

- the Python export can print the same functions and assert the same numbers;
- `parity.js` can drive the tool from outside and prove a later change moved no number;
- a language change can destroy and rebuild the whole shell without touching the answer;
- the record can be built at any time, from state alone, without reading a control.

A model that reads the DOM cannot do any of them, and the framework cannot fix it for you.

### 1.3 The boot law

**The framework renders before the tool computes.** Shell, header, panels and the pending state are
on screen from the manifest alone, before any `fetch`, WASM load or solver run.

```js
DiagramUI.app({…});                 // 1. shell, synchronously, from the manifest
fetch('mytool-data.json')           // 2. the tool's data
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => { install(d); ui.ready(); })
  .catch(e => ui.fail(T('The reference data file could not be loaded.', …)));
Diagram.init({…});                  // 3. UNCONDITIONALLY. Never inside a .then()
```

A data failure may cost the tool's **results**. It may never cost the tool's **chrome**: the
return link, the status badge, the limitations modal, the language control and the shared bar all
come from the manifest and must survive. `Diagram.init()` reachable only from a success branch is a
deploy-time error — and it is also how you fail the automated gate, because
`window.__diagramReady` is set by `Diagram.init`'s own boot and by nothing else.

**"Unconditionally" includes the case where `diagram-ui.js` itself did not load.** This is the one
rule that four of four independent authors got wrong in 2026-08, because until this revision the
skeleton in §13 got it wrong too: it `return`ed out of `boot()` on the framework-absent path, before
`Diagram.init`. Every one of them shipped that shape, ran the required gate, and had to restructure:

> "Followed the skeleton first and failed `check.js --block '**/diagram-ui.js'` at all four
> viewports. Verified the template fails the same gate (`#dgc-bar missing` ×4) … The guide's own
> skeleton does not pass the gate the task set." — `trussframe.html`

> "That structure fails `check.js --block '**/diagram-ui.js'` with '#dgc-bar missing'." —
> `damperselect.html`

> "Without that, `check.js --block **/diagram-ui.js` — a gate this task requires — fails on the
> guide's own skeleton." — `weldsymbols.html`

`NEW_TOOL_TEMPLATE.html` failed that gate at 1440, 1120, 768 and 390 as shipped. Verified again on
2026-08-18. So **split `boot()` in two**:

```js
function boot() {
  if (window.DiagramUI && DiagramUI.api === 'tools.petrov.re/ui/v1') buildInterface();
  else degrade();          // document.title + one h1 + one sentence. The only DOM you ever touch.
  installData();           // Diagram.init(…) — ALWAYS, on both paths
}
```

`buildInterface()` owns `DiagramUI.app` and every `ui.*` call. `installData()` owns `Diagram.init`
and nothing else; it needs only `state`, `solve` and `record`, all of which are pure and none of
which know the framework exists. Guard every UI callback inside `Diagram.init` with `if (ui)`.

The reason this matters is not the gate. With the framework gone, the shared bar still gives the
reader the export, the record, the disclaimer and the return link — the four things that are the
site's contract rather than the tool's. `degrade()` must also write the `h1`, because
`DiagramUI.check()`'s one-`h1` rule is the framework's job only while the framework is there.

---

## 2. Step 1 — the manifest

Put it in `<head>`, within the first 256 KiB:

```html
<script type="application/json" id="diagram-tool-manifest">
{ … }
</script>
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js"  defer></script>
<script src="diagram-ui.js"      defer></script>
```

All three scripts, in that order. `site-disclaimer.js` adds the status badge and the limitations
modal; `diagram-common.js` adds the shared bar (return link, permalink, record export, PDF, Python,
handoff); `diagram-ui.js` adds the token layer, the shell and the components. All three are
side-effect-safe.

`AGENTS.md` is the contract and wins any conflict about data. What follows is a faithful summary of
what you must write and what each field commits you to — not a restatement of its 31 kB.

### 2.1 The fields

```json
{
  "schema": "tools.petrov.re/tool-manifest/v2",
  "manifest_revision": "2026-08-18a",
  "id": "flatwall",
  "file": "flatwall.html",
  "listed": true,
  "category": "envelope",
  "order": 120,
  "title":       {"en":"…","uk":"…","de":"…","nl":"…","fr":"…","es":"…"},
  "summary":     {"en":"…", … },
  "description": {"en":"…", … },
  "status": "prototype",
  "independent_validation": false,
  "limitations": {"en":"…", … },
  "intended_use": "education",
  "catalog_languages": ["en","uk","de","nl","fr","es"],
  "tool_languages":    ["en","uk","de","nl","fr","es"],
  "dependencies": [],
  "network_access": {"mode":"none"},
  "validation": {"basis":{"en":"…"},"independent_validation":false,"benchmarks":[]},
  "report": {"pdf": true, "source_attribution": true},
  "python_export": {"supported": true, "requires": []},
  "handoff": {"provides":["U","Q","A"],"accepts":["T","A"]},
  "state_codec": {"permalink": true, "record": "tools.petrov.re/calculation-record/v1"},
  "ui": {"framework": "tools.petrov.re/ui/v1", "level": 3}
}
```

Field by field, and what each one costs you:

| Field | Rule | What you are committing to |
|---|---|---|
| `schema` | exactly the v2 string | v1 is still parsed; do not write a new one |
| `manifest_revision` | the revision you prepared against | it is printed in the Python export header |
| `id` | stable, lowercase | **it never changes.** Export filenames, `localStorage` keys (`dgu.<id>.*`), the benchmark report URL and the learn-tour memory all key on it. It must equal the `id` you pass to `Diagram.init` and to `DiagramUI.app` |
| `file` | the deployed filename, exact case | a mismatch is a `catalog.php` **error**: the tool vanishes from the site |
| `listed` | `true` to appear in the catalogue | `false` is for templates and fixtures |
| `category` | exactly one of the twenty-two | `nuclear-physics`, `nuclear-eng`, `thermo`, `transients`, `hvac`, `acoustics`, `envelope`, `electrical`, `control`, `safety`, `project-delivery`, `tendering`, `engineering-change`, `mep-maintenance`, `plumbing`, `vertical-transport`, `ccus`, `oil-gas-h2`, `struct`, `physics`, `optics`, `mat` (AGENTS.md §4). Do not invent one: the labels are site UI, so a new category is a framework change |
| `order` | display order in its category | |
| `title` | every language declared in `catalog_languages` | it is the page's `h1`, written by the framework |
| `summary` | every `catalog_languages` language, 70–220 chars, one statement | what goes in / what comes out. No "powerful", "advanced", "professional". Caveats go in `limitations` |
| `description` | every `catalog_languages` language | the fuller text behind the opened catalogue row |
| `status` | `prototype` \| `benchmarked` \| `verified` | §2.4 |
| `independent_validation` | boolean, mirrors `validation.independent_validation` | never `true` without a documented basis |
| `limitations` | every `catalog_languages` language | the **material modelling boundary**: omitted physics, idealisations, validity range, data quality, numerical restrictions. Not the site disclaimer, and not another tool's text |
| `intended_use` | `education` \| `technical exploration` \| `preliminary assessment` | |
| `catalog_languages` | non-empty allowed subset of the global site registry; include `en` for current manifests | catalogue-visible localized fields must contain every declared language |
| `tool_languages` | what the domain UI really supports | non-empty subset of `catalog_languages`; normally includes `en` |
| `dependencies` | local files that must ship beside the HTML | a declared file that is missing is a `catalog.php` **error** |
| `network_access` | `none` \| `same-origin-data` \| `external`, accurate | `catalog.php` scans your `<script src>`, `<link href>`, `<img src>`, `fetch()` and `XHR.open()` targets and warns if the declaration understates them |
| `validation` | `{basis:{…}, independent_validation, benchmarks:[]}` | `basis` says what the numbers rest on. Empty `benchmarks` is honest for a prototype |
| `report` | both `true` for a new tool | you get the shared PDF; §5.9 |
| `python_export` | `{supported, requires:[], reason?}` | **if you write `true` you must pass `python:` to `Diagram.init`** — §6.4 |
| `handoff` | `{provides:[], accepts:[]}` from the fixed vocabulary | a name outside it is a catalogue **warning**; empty arrays are fine |
| `state_codec` | `{permalink:true, record:"tools.petrov.re/calculation-record/v1"}` | |
| `ui` | `{"framework":"tools.petrov.re/ui/v1","level":3}` | a new tool is level 3. There is no reason to write a new tool at level 0–2 |

### 2.2 The localisation obligation

The **site** currently supports seven languages: `en`, `uk`, `de`, `nl`, `fr`, `es`, `pl`.
A **tool** supports only the languages it declares.

For every language in `catalog_languages`, provide `title`, `summary`, `description`, `limitations`
and the corresponding localized validation basis where that field is localized. For every language
in `tool_languages`, every tool-owned visible string must be available: labels, hints, unit words,
panel titles, tiles, table headers, verdicts, notes, learn topics, tour steps, example text, derived
sentences, chart annotations and model warnings.

The framework has two selectors: `siteLang` for shared chrome and `domainLang` for tool content. A
page opened with `?lang=pl` may therefore legitimately have Polish framework chrome and English tool
content when `pl` is absent from `tool_languages`; that is a supported fallback, not a defect.

A translation helper may cover exactly the tool languages you declare. Do not make it the global
site registry. A legacy helper such as

```js
function T(en, uk, de, nl, fr, es) { return {en,uk,de,nl,fr,es}; }
```

is fine inside a six-domain-language tool, but it must not be used to decide which languages the
site picker offers or which site preference is valid. New framework-aware code should use
`DiagramUI.siteLang()` / the app's `siteLang` and `domainLang` resolution rather than a local list.

The human gate remains: switch through every language the **tool claims** in `tool_languages` and
read the entire domain UI. Separately test at least one site-language fallback not in
`tool_languages` when such a language exists.

### 2.3 `T()` for a translation you do not have

You are writing a new tool, so there is no pre-existing prose to move. Write the English first,
then the other five. Machine translation of a technical label is acceptable and normal here; an
untranslated label is not. What is **not** acceptable is inventing terminology in a language you
cannot check for a *normative* string — a standard's name, a legal category, a regulated term. If
you cannot state it responsibly, say the English term and qualify it, in that language.

### 2.4 The status vocabulary, and what each tier commits you to

| Status | You may write it when | Displayed as | It commits you to |
|---|---|---|---|
| `prototype` | always. It is the default | Prototype | nothing beyond honest `limitations`. **A new tool is a prototype.** |
| `benchmarked` | every entry in `validation.benchmarks` has `passed == cases` (> 0), each names a reference **independent of your own code**, cites it precisely, states a tolerance chosen from the physics, and its artifact file exists and parses | "Benchmark tested · 299/299", linking to `benchmark.html?tool=<id>` | shipping `benchmarks/<id>.json` with the HTML; `independent_validation` stays **false** — it is still your own harness |
| `verified` | **reserved.** `benchmarked` *plus* a documented review by someone other than the author, recorded in `validation.review` | Reviewed by a third party | no tool on the site holds this. `catalog.php` rejects the claim without the review record |

Three consequences worth stating plainly:

- **Never claim a benchmark you did not run.** `catalog.php` rejects `benchmarked` without a
  passing artifact into `errors`, which means the tool disappears from the catalogue entirely —
  not a warning, a deletion.
- A self-check that re-evaluates your own formula is **not** a benchmark and the UI may not present
  it as validation. Analytic checks you wrote yourself, bundled test cases and comparisons against
  the same implementation do not justify `independent_validation: true`.
- A benchmark that **fails** is publishable: keep `prototype`, ship the artifact anyway, and the
  report page shows the failures. A reader must be able to find them. Burying a flagged case in the
  passed count is the one dishonest thing the whole ladder exists to prevent.

---

## 3. Step 2 — choose the archetype

Four shells. The choice decides **which regions exist at all**, and that is not a preference you
can revisit cheaply: it changes where every panel lands and whether you have a results surface.

Still four. A 3D scene editor is not a fifth: it is a `studio` whose stage is a 3D projection, and
the code says so — see §3.6.

### 3.1 The decision test — first match wins

1. the user **creates and manipulates objects** in a drawing (place, drag, select, delete)
   → **`studio`** — and the manipulation is *declared*, not written: §3.5 for a 2D drawing,
   §3.6 for a 3D scene. There is no separate "scene editor" archetype; §3.6 shows why.
2. the user is walked through **numbered steps** → **`wizard`**
3. the primary content is **material to read, filter or look up**, and inputs only narrow it
   → **`reference`**
4. otherwise → **`calculator`**

If two look plausible, choose `calculator`. It is the only archetype with all of `inputs`, `stage`,
`results`, `dock`, the mobile answer strip and a built results surface, and it is what the framework
is best at.

### 3.2 What each one gives you

| Archetype | ≥ 1120 px | 768–1120 px | < 768 px |
|---|---|---|---|
| `calculator` | `inputs` 340 │ `stage` 1fr │ `results` 360 | `inputs` │ (`stage` over `results`) | sticky result strip, `inputs`, `stage`, `results` |
| `studio` | `inputs`(palette) 250 │ `stage` 1fr │ `detail` 320; `dock` then `results` beneath | palette │ stage, `detail` below | `stage` first, then `inputs`, `detail`, `results`, `dock` |
| `wizard` | `nav`(steps) 240 │ `inputs` 1fr │ `results` 340 | steps │ inputs/stage/results | labelled step **dropdown**, then the form |
| `reference` | `nav`(filters) 250 │ content 1fr, page capped at 1120 | the same | filters above content |

### 3.3 What each one costs you — read this before choosing

These are properties of the shipped grid templates and of `App.build()`. They are not opinions.

- **`calculator`** — all regions exist (`strip`, `nav`, `inputs`, `stage`, `results`, `dock`,
  `footer`). No `detail`. A results view is built. The `nav` row exists only once something is
  placed in it.
- **`studio`** — has `detail`; `dock` renders **above** `results` from 768 px up, so anything you
  dock pushes your KPI tiles further down (below `md` the order is stage, inputs, detail, results,
  dock). **No mobile result strip is rendered for `studio`**
  (`renderStrip` returns early), so below 768 px the answer is wherever `results` falls in the
  column order — after the stage, the palette and the inspector.
- **`wizard`** — has `strip` and `nav`, **no `dock`** and no `detail` area. Steps are a `nav`
  component; below 768 px they become a labelled `<select>`, never bare digits. **`ui.steps()` does
  not switch the form for you** — it moves a marker and calls `onSelect`; you show and hide the
  form with `visible:` predicates on fields (§5.3).
- **`reference`** — has only `nav`, `stage`, `results`, `footer`. **There is no `inputs` area, no
  `dock` and no `strip`.** Since **v3.4** it does have an answer surface (§5.5.1): `ui.results()`
  returns a real view, your `on.compute` return value is rendered, and `learn.intro` appears in the
  pending state like every other archetype. Two things are still true and will still surprise you:

  - `ui.examples()` always inserts into `inputs`, which this grid does not define, so **there are no
    presets** — `App.prototype.examples` hard-codes `useRegion('inputs')`. Ship none, and make the
    filters themselves the entry points. The same goes for any panel you send to `inputs` or
    `detail`: an area the template does not name lands in an implicit track, a phantom column.
  - the answer region comes up **closed** and opens the first time you return something from
    `on.compute`. That is what keeps the four tools that predate v3.4 unchanged. If you want the
    region — and therefore `learn.intro` — on screen from the first paint, declare `results: true`.

  Choose `reference` only for a tool whose answer really is *the filtered content*. If it has a
  headline number, it is a `calculator` with a long table.

  **The shape, because `weldsymbols.html` had to read the `grid-template-areas` block to find it.**
  The grid is `nav stage / nav results`: the "content 1fr" column §3.2 names **is the `stage`
  region**, and `results` is the row underneath it. So:

  - the drawing and the explanation go in `stage`; the catalogue goes in a panel with
    `slot:'results'`, or straight into the answer surface as `tables:` from `on.compute`;
  - a table is built with **`app.table(def)`** — a standalone node factory taking exactly the §5.5
    table shape. `app.meter(def)` and `app.legend(def)` are the same kind of thing. All three are
    real and public; use them from a panel's `render`/`sync` rather than building markup;
  - `ui.resetAction()` goes in the `nav` filter panel's `actions` row, `actionsAlign:'end'` —
    §5.8's "the inputs footer" does not exist here;
  - the "N of M shown" count, the active filters and the empty state now have a home: `filter:` in
    the compute payload (§5.5.1). Do not put the count in a table `foot` row any more.

  One further consequence worth planning for: a `reference` tool builds its content from panel
  `render`/`sync` hooks, and those are replayed **before** `on.rebuild` on every language change.
  Read the boxed rule in §5.11 before you write the first one.

### 3.4 Live or run

```js
compute: 'live'   // recompute on every committed change, debounced 120 ms; a "Live" chip
compute: 'run'    // the user presses the primary action; results go 'stale' on any edit
```

Choose `run` only when a computation is expensive enough that the user would notice it on every
keystroke. Everything else is `live`. A `run` tool gets a primary action at the bottom of `inputs`
above `md` and a sticky action bar below it, both written for you, and its pending state carries
`learn.intro` — which is why a `run` tool must have a `learn.intro`.

A tool whose answer is a long-running transient with its own start/stop lifecycle is neither: it is
`live` over the derived summary, with the expensive run as a tool action. `on.compute` is called
synchronously on every field commit and by the parity harness; do not put a multi-minute solve in it.

---

### 3.5 `studio` — the drawing IS the workspace (`interact:` and `scene:`)

`studio` used to be a grid with no mechanics: the archetype was declared, the interaction was not
built, and every studio author wrote the same 240 lines. Since **v3.3** the mechanics are
**declared on the stage**, not written.

Two entry points, one primitive:

- `interact:` — a 2D drawing you paint yourself. The framework owns the world↔screen transform, the
  hit test, the drag and the keyboard.
- `scene:` — a 3D scene. The framework owns nothing about the geometry: it **hosts**
  `diagram-scene3d.js`, which four shipped tools already use. See §3.5.

```js
ui.stage({
  key: 'sketch',
  render: function (size, stage) {
    var c = stage.canvas(), m = size.map;      // the map is the FRAMEWORK'S
    if (size.live) { /* mid-gesture: draw the cheap version */ }
    state.nodes.forEach(function (n) { c.arc(m.X(n.x), m.Y(n.y), 5, 0, 6.28); });
  },
  interact: {
    world:   { x0: -1, y0: -1, x1: 11, y1: 7 },   // or a function, or omitted -> bbox of objects
    yUp:     true,                                 // world +y is UP. Default true.
    snap:    function () { return state.snap; },   // number or function; 0 = no snap
    objects: function () {                         // the declared object model
      return state.nodes.map(function (n, i) {
        return { id: 'n' + i, kind: 'node', x: n.x, y: n.y, ref: n };
      }).concat(state.members.map(function (m, k) {
        return { id: 'm' + k, kind: 'member', ref: m, movable: false,
                 a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y } };
      }));
    },
    on: {
      select:  function (obj) {},                  // selection changed (obj may be null)
      tap:     function (pt, ev) {},               // empty space, in WORLD coordinates
      move:    function (obj, pt) { obj.ref.x = pt.x; obj.ref.y = pt.y; },
      commit:  function (obj) { ui.sync(); ui.run(); },   // ONCE, at the end of the gesture
      remove:  function (obj) {},                  // Delete
      cancel:  function () {},                     // Escape
      context: function (obj, ev) {}               // optional; right-click on an object
    },
    inspect: {                                     // the per-object inspector, DECLARED
      id: 'insp', title: {en:'Joint', de:'Knoten', …},
      fields: function (obj) {                     // array, or a function of the selection
        return obj.kind !== 'node' ? [] :
          [ { key: 'x', label: 'x', type: 'number', si: 'm', step: 0.5 },
            { key: 'y', label: 'y', type: 'number', si: 'm', step: 0.5 } ];
      },
      change: function (obj, path, v) {}
    }
  }
});
```

**A descriptor is a point `{id,x,y}` or a segment `{id,a:{x,y},b:{x,y}}`.** `ref` is your own object
— what the inspector edits and what every callback is handed. `movable:false` makes an object
selectable but not draggable. `tap:` on one descriptor overrides the radius for that object only;
you should almost never need it.

**What you get, and therefore must not write again:**

| you get | where it lives |
|---|---|
| `size.map` — `X/Y` world→screen, `wx/wy` screen→world, `scale`, `toWorld`, `toScreen` | rebuilt once per frame in `Stage.measure`, before your `resize` and your `render` |
| ONE tap radius | `DiagramUI.scene.tap` — point **14 px** fine / **22 px** coarse, segment **10 / 16**. 22 is half the §16 44 px touch floor, so a finger gets a 44 px catch diameter while the drawn dot stays 5 px. |
| points beat segments | always, unconditionally — a joint sitting on a member stays reachable |
| drag with pointer capture, grab offset and snap | `on.move` per frame, `on.commit` once |
| exactly **one** undo entry per gesture | `ui.pushHistory()` is called by the framework at `pointerdown`, not per move |
| a cheap redraw | the framework calls `stage.schedule()` during the gesture — **`on.compute` never runs mid-drag**. `size.live` is true while a gesture is in flight. |
| the inspector | a real `Panel` in `detail` (studio) or `inputs`, in `app.panels`, synced by `ui.sync()` like any other |
| ONE keyboard scheme | §3.7 |

**Do not** bind `pointerdown` to the canvas yourself, do not call `getBoundingClientRect`, do not
write a `screenToWorld`, and do not invent a tap radius. If `interact:` genuinely cannot express
your hit test — an axis-aligned box, a filled polygon — declare `hit: function (pt, map, ix)` and
return a descriptor or `null`; you still get the drag, the keyboard, the history and the inspector.

### 3.6 A 3D scene is a `studio`, not a fifth archetype

There is no `scene` archetype and there will not be one. The three tools that drive
`diagram-scene3d.js`'s `AuthoringShell` — `roomacoustics`, `outdoornoise`, `debrisrunout` — pass the
same six hosts, and those six map onto the `studio` grid with nothing left over:

| what the library wants | studio region |
|---|---|
| `paletteHost`, `searchHost`, `treeHost` | `inputs` |
| `toolbarHost`, `placementBadge`, the canvas | `stage` |
| `propertiesHost` | `detail` |

So: `layout:'studio'`, and `scene:` on the stage. The framework creates those six hosts in those
three regions, hands them to `AuthoringShell`, points `CanvasViewport` at the stage's own canvas,
and wires the library's `invalidate()` to the stage's rAF-coalesced `schedule()`.

```js
ui.stage({
  key: 'scene', minHeight: 340,
  scene: {
    /* everything here except `viewport` is passed straight through to
       DiagramScene3D.AuthoringShell — read that library's contract, not this
       guide, for palette / tree / properties / toolbar / commands / placement */
    adapter: { getObjects: …, getId: function (o) { return o.id; } },
    getSelectionIds: …, getPrimaryId: …, onSelect: …,
    palette: [ … ], tree: { … }, properties: { schema: … }, toolbar: { items: [ … ] },
    viewport: { adapter: { getRoom: …, getEntities: …, getSelection: …,
                           onSelect: …, onMove: …, onCommit: …, getSnapStep: … } }
  }
});
```

Three things the framework now does that the four existing scene tools each wrote by hand:

1. the 3D canvas **resizes with the stage** (the Stage `ResizeObserver`) and **repaints on a theme
   change** (the Stage `theme.watch`) with no subscription of yours;
2. the tree, the inspector and the toolbar **refresh at the gesture boundary** — after a pick and
   after a drag ends, never per pointermove. `roomacoustics` calls this `refreshAuthorDrag()`,
   `debrisrunout` `renderShared3D()`, `outdoornoise` `refreshAll()`; you call nothing;
3. if `diagram-scene3d.js` is not on the page, `stage.scene()` returns `null`, posts a notice that
   says so in the reader's language, and **the rest of the tool still works**.

The renderer is not reimplemented and must not be. `stage.sceneStage.shell` is a real
`DiagramScene3D.AuthoringShell`; `stage.sceneStage.viewport` is a real `DiagramScene3D.CanvasViewport`.
`DiagramUI.scene.has3D()` tells you whether the library is present.

**The scene tools already shipped are not migrated.** They keep working exactly as they are; this
is something to adopt, not a change that was done to them.

#### 3.6.1 The seam — what a hosted scene does NOT get, and what you must write

Read this **before** you declare `scene:`. §3.6 is true: the archetype is solved, the hosting works,
and the first author to use it wrote zero lines of projection, camera, picker, drag, placement,
resize, dpr or theme subscription — 210 lines of declaration in a 103 kB file. But
`diagram-scene3d.js` **predates the token layer, the six languages, the 44 px floor and §3.7's
keyboard scheme**, and hosting a library does not modernise it:

> "§18.3 solved the archetype and did not solve the citizenship — a hosted scene is a well-placed
> island of untranslated, untokened, mouse-only widgets, and every one of my ten framework findings
> except two is on that seam. Four of them are silent." — `pipesupports.html`

Six of the seven items below are things **you** must write. Two of them are caught by a gate; four
are silent. Budget a day.

**(1) A six-language label object is illegal inside `scene:`. Pass a thunk.**
`renderPalette()` writes `item.label` straight into `textContent` with no `asLabel` at all;
`createNode()` assigns `text` the same way; `asLabel(v)` returns a non-function unchanged. So a
`{en,uk,de,nl,fr,es}` object prints `[object Object]` in the palette, the tree rows, the inspector
labels and sections, the toolbar titles and the placement badge — and **fwgate C1 fails the whole
page** for a visible `[object Object]`. A thunk works everywhere `asLabel` is called; in the palette
and the tree rows, which get no `asLabel`, even a thunk prints `function(){…}`, so those must be
re-resolved on the language rebuild instead. The whole answer is three lines:

```js
function T(en,uk,de,nl,fr,es){ return {en:en,uk:uk,de:de,nl:nl,fr:fr,es:es}; }
function L(o){ return DiagramUI.pick(o, DiagramUI.current.lang); }
function LT(en,uk,de,nl,fr,es){ var o = T(en,uk,de,nl,fr,es); return function(){ return L(o); }; }
```

Use `LT(…)` for every string in `tree`, `properties`, `toolbar` and the badge, and declare
`palette:` and every inspector `options:` **as functions**, so the language rebuild re-resolves them.
About 24 extra lines for 40 strings, and a rule you must remember for every string you ever add.

**(2) §3.7's keyboard scheme does not reach a `scene:` stage. You must give it one.**
`DiagramUI.scene.keys` is consumed by `Interaction`, which a `scene:` stage never constructs.
`SceneTree.row()` builds a `<div>` with a click listener — no `tabindex`, no `role`, no key handler;
`CanvasViewport` binds pointer events only. **With the mouse removed, nothing in a hosted scene can
be selected, moved or deleted.** All three shipped `AuthoringShell` tools have the same hole; this is
the fourth report of it. The cheapest honest answer is framework controls beside the scene:

```js
// a declared select bound to your own selection — this is the keyboard path
{ id:'f-sel', type:'select', label: T('Selected object', …),
  get: function(){ return view.sel || ''; },
  set: function(v){ view.sel = v || null; ui.sync(); stage.schedule(); },
  options: function(){ return objects().map(function(o){ return {value:o.id, label:o.name}; }); } }
```

plus Add / Delete as panel `actions` with a predicate `disabled`. ~35 lines, and the tool ends with
two object pickers where the framework should have one. Do it anyway: a drawing that needs a mouse
is a drawing half the readers cannot use.

**(3) The hosted canvas is theme-blind, and fwgate C4 will fail you for it.**
§3.6(1) is literally true — the repaint runs on a theme change — and useless on its own, because
`CanvasViewport` redraws the *same hard-coded colours*, so the bitmap is byte-identical and C4 reads
it as a stale canvas. `drawBackground` uses `this.options.bgNear||'#111922'`; `drawRoom` writes
`rgba(130,155,178,α)` with no option at all; object labels are `rgba(220,231,242,.82)`, which is
white-on-white on a light page. Worse, `SceneStage.build` copies the viewport def **by value**
(`vp[vk] = d.viewport[vk]`), so a declared accessor is evaluated once at build and cannot follow the
theme. Two things get you to green and to legible:

```js
// (a) the background, via accessors on the options object the library re-reads each frame
Object.defineProperty(v.options, 'bgNear', { get: function(){ return token('--panel-2'); } });
Object.defineProperty(v.options, 'bgFar',  { get: function(){ return token('--bg');      } });

// (b) every entity colour recomputed from tokens inside getEntities(), which runs per frame
getEntities: function(){ return objs.map(function(o){ return {…, color: token(o.bad?'--bad':'--ok')}; }); }
```

Re-apply (a) in `on.rebuild` — a language switch rebuilds the stage and the patch is lost with it.

**(4) Declaring `render:` takes the whole canvas away from the library.**
`Stage.schedule` reads `if (self.sceneStage && !isFn(self.def.render)) self.sceneStage.draw();` — so
the moment you declare a `render`, the scene stops painting itself. That is also the **only** hook
for drawing anything on top of a hosted scene. Call the library first, then overlay:

```js
render: function (size, st) {
  var sc = st.sceneStage; if (!sc || !sc.viewport) return;
  sc.draw();                                    // the library's frame, first
  var ctx = st.cv.getContext('2d');             // then your overlay, in --ink
  …
}
```

**(5) `searchHost` is dead on arrival.** §3.6's table promises six hosts. `SceneStage.build` creates
`el('div',{class:'dgu-scene-search'})` and `AuthoringShell` does
`search.addEventListener('input', () => tree.setQuery(search.value))`. A `<div>` fires no `input`
event and has no `.value`, so the filter can never fire. Ship no search (a short tree does not need
one), or build your own `<input>` and call `shell.tree.setQuery()` by hand — which is DOM the
framework exists to remove.

**(6) "0 bytes of CSS" stops being true of the page.** §7.6's promise holds for *your file* — the
tool that proved this shipped a `<style>`-free 103 kB — but `SceneStage.build()` calls the library's
`ensureAuthoringStyles()` on your behalf, which injects ~3 kB of `<style>` into `<head>` containing
**31 distinct hex literals and zero `var(--…)`**. The palette, tree, inspector, toolbar and badge are
a dark-only island inside a themed page; `.scene3d-tree-row:hover{background:#17202c}` paints
near-black behind near-black text in the light theme. There is nothing you can do about it from
inside a declaration and you must not ship a second stylesheet (§7.6, §11.4). Report it.

**(7) The scene inspector's fields are not `Field`s.** `PropertyInspector.field()` renders
`field.unit` as a plain span and commits `Number(input.value)` raw: **no `UNIT_TABLE` lookup, no
min/max clamp with the announced note, no `validate`, no `aria-invalid`, no learn dot.** The declared
`Field` next door has all five. So a scene tool carries two field vocabularies with different
guarantees in the same column, and any conversion is yours:

> "outside diameter, wall thickness and support capacity each needed a hand-written get/set pair
> doing ×1000 and ÷1000 — exactly the arithmetic §4.2 says never to do yourself."

Keep `state` and `record` in SI, do the conversion in the accessor, and say so in
`record.model.notes`.

**Three smaller facts, each measured:**

- **Picking is centre-only and 16 px.** `CanvasViewport.pick()` projects `entityCenter(ent)` and
  takes the nearest within `options.pickRadius||16`, so a 22 m pipe run is clickable only near its
  projected midpoint — although the same file exports `geometry.rayAABB`. Set
  `pickRadius: 22` (the site's coarse point radius, §3.5) and give every object a tree row as the
  reliable way to reach it.
- **The library's toolbar buttons are 34 × 32 px**, under §7.5's 44 px floor, while the framework's
  own Fit tool beside them is 44 × 44. No gate measures a drawn control's size. Make every toolbar
  command reachable through a framework control as well.
- **Declare `diagram-scene3d.js` in the manifest's `dependencies`.** It is a site library, not one
  of the three scripts every tool loads, and it is the one extra file the tool cannot run without.
  `catalog.php` only checks existence, so declaring it is clean and honest.

**And what `record()` returns for an empty scene.** §6.2 gives three rows; a scene editor has a
fourth and commoner case — a valid, computed, **deliberately empty** scene, because the reader
pressed Delete on everything. Return the full key set with `null` in every aggregate, real zeros in
the counts, and a `warnings` entry. Ship probe cases for it.

### 3.7 ONE keyboard scheme for every drawing on the site

A control that needs a mouse is a control half the readers cannot reach. Before v3.3 three tools had
three schemes and two of them were incomplete — `trussframe` could nudge but could not select or
delete without a mouse. This is now the framework's, in `DiagramUI.scene.keys`, and you neither
write it nor change it:

| key | what it does |
|---|---|
| `Tab` | focuses the drawing (it is one focus stop and shows a focus ring) |
| `Enter` / `Space` | select the next object; `Shift+Enter` the previous; wraps |
| arrow keys | move the selection by one snap step; `Shift` moves four. `↑` is +y when `yUp` |
| `Delete` / `Backspace` | remove the selection, then select its **neighbour** — never nothing |
| `Escape` | cancel the gesture and clear the selection |

Every one of those goes through the same `on.move` / `on.remove` / `on.commit` you already declared,
so the keyboard path and the mouse path cannot drift apart. If you have no `on.remove`, `Delete` is
inert rather than wrong.

> **This table covers `interact:` only.** `DiagramUI.scene.keys` is read by `Interaction`, and a
> `scene:` stage never constructs one — so a hosted 3D scene has **no keyboard path at all** until
> you give it one. The section above is printed immediately before §3.6 and the first author to
> read both took it as covering the two entry points; it does not. See §3.6.1(2) for what to write
> instead. Fixing this properly is on the list in §9.

---

## 4. Step 3 — the model, the state and the units

### 4.1 Shape

```js
/* pure. no document, no DOM, no strings for the screen. */
function solve(s) {
  var Rlayer = s.d / s.lambda;
  var Rtot   = s.Rsi + Rlayer + s.Rse;
  var U      = 1 / Rtot;
  var q      = U * (s.Ti - s.Te);
  return { Rlayer:Rlayer, Rtot:Rtot, U:U, q:q, Tsi:s.Ti - q * s.Rsi, Qwall:q * s.A };
}

var DEFAULTS = { d:0.30, lambda:0.90, Rsi:0.13, Rse:0.04, Ti:293.15, Te:263.15, A:25 };
var state = JSON.parse(JSON.stringify(DEFAULTS));
var last  = null;                       /* the last solve() result, or null */
```

`last === null` is the "nothing computed yet" sentinel that `record()` and the stage both read. Keep
it. Never let `record()` return zeros for "not computed".

### 4.2 Units: store SI

**This is the decision that cannot be revisited.** Twenty of the forty-nine ported tools could
not adopt the framework's unit registry, almost every one of them for the same reason, and every one of
them said it in nearly the same sentence: *the record, the permalink and the Python export already
publish this tool's own units, and changing the stored value would move every exported number.*
`thermodynamiccycles` stores MPa and °C; `wallthermalcalculator` mm and °C; `electricalnetwork`
kVA, mΩ and ×In; `klimaatcalculator` hPa, m³/h and EUR/kWh; `hydraulicnetwork` mm, m³/h and kPa;
`ontvochtiging` documents all 81 of its non-SI unit names in `record.units`. They are stuck. You
are not.

The rule, and you get it for free if you follow it from the first line:

> **`state`, `record`, the permalink and the handoff payload carry SI.** The user sees whatever the
> unit system says.

```js
{ key:'d',  type:'number', unit:'m', display:'mm' }   // stored metres, shown millimetres
{ key:'Ti', type:'number', unit:'K', display:'degC' } // stored kelvin, shown °C
```

The framework converts for display and back for storage. Handoff values are **always** SI base
units — K, Pa, kg/s, m³/s, J/kg, J/(kg·K), W, kg/m³, m³/kg, m, s, kg/kg, V, A, Ω — and the runtime
rejects a payload carrying a prefixed unit.

Two facts about the implementation you need before you write a `unit:`:

- **Only nine SI bases convert.** `UNIT_TABLE` covers `Pa`, `K`, `W`, `m`, `m3/s`, `kg/s`, `J/kg`,
  `s`, `kg/m3`. Everything else — `m²`, `W/(m·K)`, `m²·K/W`, `V`, `A`, `Ω`, `%`, `kg/kg` — is a
  **label only**: it renders in the unit slot, nothing converts, and it does not bring up the
  header unit-system control.
- **A `display` unit outside that table silently does not convert.** `unitFor()` falls back to
  `{u: display, f: 1}`: you get the new label and the old number. Declaring
  `unit:'kg/m2', display:'g/m2'` will label grams and show kilograms, with no warning anywhere.
  If the pair is not in `UNIT_TABLE`, do the arithmetic in your model, or leave the SI unit alone.

The unit-system control appears in the header only when at least one field declared in
`DiagramUI.app({panels:[…]})` has a convertible `unit` and **no** `display`. Pin every field with an
explicit `display` and no control appears — which is the right answer for a tool whose quantities
have one natural unit.

**Two more facts, both learned the expensive way.**

- **A `select` does not convert.** `Field.commit` converts for `number` and `range` only; a select's
  option values are raw. A quantity stored in seconds and chosen in minutes has to put the minutes in
  the option *labels* and declare no `unit:` on the field — which is exactly what §5.2 tells you not
  to do. Say so in `record.units`. (`damperselect.html`, which stores `t_required` in seconds.)
- **You may register a unit.** Since 2026-08-18:

  ```js
  DiagramUI.units.register('N', [{u:'N', f:1}, {u:'kN', f:1e-3}], {practical:'kN'});
  DiagramUI.units.register('m', {u:'in', f:1/0.0254}, {us:'in'});
  ```

  `f` converts SI → display, the same direction the built-in table uses; the third argument maps a
  unit system (`si`/`practical`/`us`) to the alternative the header control should pick for that
  base. Call it once, at boot, before `DiagramUI.app`. Registration is page-local: it cannot change
  any other tool. This exists because two of four authors were stopped by the nine bases —

  > "An inch. More generally, a way to register a unit … Shipping `display:'in'` unregistered would
  > have printed inches while showing millimetres." — `flangejoint.html`, which pushed onto
  > `DiagramUI.units.table.m` by hand and marked it UPSTREAM

  > "`N` is not one, `display:'kN'` would relabel without converting … and there is no registration
  > hook." — `trussframe.html`, which shipped newtons everywhere: "Internally consistent and honest;
  > conventionally wrong for structural work."

  Registering a base is not automatically the right answer. `trussframe`'s other option — speak one
  unit, everywhere, and say so in the footer and `record.model.notes` — is still correct for a tool
  whose quantity has exactly one convention. Register when your readers genuinely use two.

### 4.3 The state is the permalink

`Diagram.state.encode` compresses `serialize()` to base64url and hangs it on `?s=`. Keep it under
~4 kB. From the first deploy, its **shape is a promise**: a key you rename breaks every bookmark and
every link anyone has pasted into a report. Two habits make this survivable:

- keep the state **flat and named** — `{d, lambda, Rsi, Rse, Ti, Te, A}`, not
  `{layers:[{…}], env:{…}}` — unless the tool genuinely edits a collection;
- if you must change it later, accept **both** shapes in `deserialize` for one release.

`App.state` keeps its identity across `reset()`, `example()` and a language rebuild, so the object
your `serialize()` and `record()` close over stays the live one. That guarantee is **top-level
only**: a reference you hold to a nested object inside state is orphaned by a reset.

The callable that produces a link is **`Diagram.state.link()`**. `Diagram.state.encode` is the codec
underneath it. (`flangejoint.html` had to find that in `diagram-common.js`'s export table.)

### 4.4 Where everything that is not an input lives

Three of four authors of the 2026-08 cohort asked this and each invented a different answer, because
§4.3 covers the inputs and §5.10 covers remembered layout and nothing covered the middle. There are
exactly three homes and the test is **what a stranger opening your link should see**:

| Kind | Home | Example |
|---|---|---|
| a value the model reads | `state`, and in `record.inputs` | a diameter, a material, a load |
| a **position** in the tool that a shared link must reproduce | `state`, but **not** in `record.inputs` | the wizard's current step; a display-unit preference; the selected catalogue entry |
| where the cursor happens to be, and how the furniture is arranged | a module-level object of your own, **outside** `state`; or `app.remember()` for anything that should survive a reload | the current selection, the active drawing tool, the pan/zoom window, a splitter width |

The rule behind the middle row: **a link that lands the reader on a different question than the
sender saw is a broken link.** `damperselect.html` put `step` in state — "a wizard link that lands
on the wrong question is useless" — and kept it out of `record.inputs`. `flangejoint.html` did the
same with its mm/inch preference and declared it in `record.model.notes` ("display unit system at
export time: …; every value in this record is SI"). `trussframe.html` kept selection, active tool
and the drawing window in a separate `view` object, "so a shared permalink carries the truss and not
where somebody last clicked". All three are right; the differences are only which row each value
belongs in.

Whatever you put in `state` and out of `record.inputs`, **say so in `record.model.notes`**. That is
the line a downstream reader needs to know a key is presentation and not physics.

Do not write a `localStorage` key of your own for any of it (§5.10, §14). `app.remember()` writes
under `dgu.<toolId>.<facet>`, which is the namespace the rule allows.

---

## 5. Step 4 — declare the interface

One call. Everything below is a key in it or a method on what it returns.

```js
if (!window.DiagramUI || DiagramUI.api !== 'tools.petrov.re/ui/v1') {
  document.title = 'diagram-ui.js v1 is required';       // honest degradation, §7.2
  return;
}

var ui = DiagramUI.app({
  id: 'flatwall', mount: '#app',
  layout: 'calculator', compute: 'live',
  state: state, defaults: DEFAULTS,
  subtitle: T('Steady one-dimensional series resistance', …),
  notices: [ … ],        // §5.7
  learn:   { … },        // §5.8
  panels:  [ … ],        // §5.2
  footer:  T('R = d/λ, U = 1/(Rsi + R + Rse) …', …),
  on: {
    compute: function (s) { last = solve(s); return { verdict:…, tiles:[…] }; },
    rebuild: function (app) { /* re-point references, §5.11 */ }
  }
});
```

Also accepted, all optional: `title` (defaults to the manifest title), `lang`, `density`,
`units:{system, overrides}`, `clamp` (page-level default), `scroll`, `resize`, `shortcuts`,
`strings` (your own dictionary for `ui.t`), `history:{capture, restore}`, `debounce`,
`header:{theme:false, lang:false, learn:false, actions:[…]}`, `regions:{name: node|fn}`,
`on:{change, reset, ready, state, rebuild}`.

The framework writes the header for you: return link, the `h1` from the manifest, the status chip,
undo/redo (only if you declared `history.capture`), the learn `?`, the language switcher and the
theme control. **You write no header markup and no `h1`.**

### 5.1 Panels

```js
ui.panel({ slot:'inputs', id:'wall', title:T('Wall', …),
           note, learn:'topic-key', collapsible:false, collapsed:false, remember:true,
           headerActions:[…], actions:[…], actionsAlign:'end',
           fields:[…], render:function(box, ctx, panel){}, sync:function(box, ctx, panel){},
           onCollapse:function(flag, panel){} });
```

Declaratively the same object goes in `panels:[…]`. One panel per group the user thinks of as a
group.

- **A panel never scrolls inside itself.** If a column is too long, fold panels (`collapsible`) or
  scroll the *region* (`ui.scrollRegion('inputs')`).
- **An empty panel does not render.** A panel whose visible field count is zero is hidden — unless
  it has a `render` or `actions`, which always count as content.
- `collapsible` needs a `title` (the disclosure lives in the heading) and an `id` (the fold is
  remembered under `dgu.<toolId>.panel.<id>`). A collapsed panel's body really measures 0 px, and it
  **opens itself** if a field inside it goes invalid. That last clause was an over-claim until
  2026-08-18 — `trussframe.html` measured it (`openRightAfterInvalid:false, openAfterSync:true`,
  because the reveal lived in `Panel.sync` and the refusal path never synced) and reported it rather
  than patching around it. `Field.commit` now reveals the panel on the refusal path itself, so the
  sentence is true as written.
- **A panel action's `disabled` may be a predicate**, `disabled: ctx => …`, re-read on every
  `ui.sync()` — the same contract fields have. It could not be, until 2026-08-18, and it is the kind
  of asymmetry that costs an afternoon: `damperselect.html` found that "`actionButton` reads
  `a.disabled` once at build and a function would be truthy, so a predicate is impossible", and
  drove `backAction._node.disabled` from the panel's `sync` hook instead. `_node` is private; do not
  use it. A panel action's `label` is still read once at build — put a changing word in the panel
  body, not on the button.
- `render(box, ctx, panel)` is the escape hatch for something the framework has no component for.
  Use it, but read §11 first: if the framework has the component, using yours instead is the defect
  the whole framework exists to remove.

### 5.2 Fields

```js
{ id:'f-d', key:'d', type:'number',
  unit:'m', display:'mm',
  label: T('Layer thickness', 'Товщина шару', 'Schichtdicke', 'Laagdikte', 'Épaisseur', 'Espesor'),
  min:0.005, max:2, step:0.005, precision:3,
  required:true, clamp:true,
  hint:  T('Bore, not nominal size', …),
  learn: 'conductivity',
  visible:  ctx => ctx.state.mode === 'layered',
  disabled: ctx => !ctx.state.detailed,
  validate: (v, ctx) => v > ctx.state.L ? T('Longer than the wall', …) : true }
```

`key` is a dotted path into your state object. `id` is optional but declare it: it is how a tour
step finds the field (`focus:'[data-dgu-field="f-d"]'`).

**The types the code implements**, with what each renders:

| `type` | Control | Notes |
|---|---|---|
| `number` (default) | `<input type=number>` | native `min`/`max`/`step`, converted to display units |
| `text` | `<input type=text>` | `inputType` overrides the HTML type |
| `textarea` | `<textarea rows>` | |
| `select` | `<select>` | `options` may contain `{group, options:[…]}` → real `<optgroup>`s |
| `segmented` | a pill row of buttons | flat options only; no groups |
| `toggle` (`boolean`, `checkbox`) | a checkbox | one boolean, one key |
| `range` | `<input type=range>` + an `<output>` readout | `editable:` adds a typed box, `format:` formats the readout — see below |
| `readonly` | an `<output>` | `format:` applies here too; prefer a result tile |
| `note` | a hint paragraph, no control | |
| `list` | a repeating row editor | §5.3 |
| `custom` | `render(box, ctx, field)` — your markup | last resort |

Options may be plain values, `[value, label]` pairs, `{value, label}` objects, `{group, options}`
groups, or a function of the context. `label` and `unit` may be functions, re-read on every sync —
but **a thunk `unit` is display-only and never converts**.

Rules that bite:

- **Units go in the unit slot, never in the label**, and there is no per-field unit `<select>`.
- **`validate` is a gate, not an annotation.** Returning anything but `true`/`null` shows the
  message, sets `aria-invalid`, puts the shell in `error` and **refuses to write the value into
  state**. That is the framework's design, and six ported tools had to abandon field validation
  because their models were built to compute with out-of-range input and warn afterwards (§10.2). Decide,
  per field, which of three behaviours you want, before you write it:
  - *clamp* — declare `min`/`max` and leave `clamp:true`. The value is moved to the nearest allowed
    one, written back into the control, and announced with a note that is **not** an error;
  - *refuse* — declare `min`/`max` **and** `clamp:false`, so you keep the browser's stepper
    semantics and your own refusal;
  - *compute anyway and warn* — declare no `validate`, and put the warning in `record().warnings`
    and in the results `notes`.
  Whichever you choose, remember `record.inputs` reports whatever ended up in state: a clamped
  value is a different number from the one the user typed.
- **`range` writes its `min`/`max` in SI onto a control that operates in display units, and
  `minDisplay`/`maxDisplay` DO NOT FIX IT.** This is a known, unrepaired defect, still unrepaired in
  v3.4 because eleven shipped sliders depend on the current behaviour. Until 2026-08-21 this line
  told you to "declare `minDisplay`/`maxDisplay`" — **that instruction has no effect and cost an
  author a day.** Verified in the source: the `range` branch of `Field.buildControl` writes
  `min: d.min == null ? 0 : d.min` / `max: d.max` straight onto the control and never calls
  `displayBound()`; only the `number` branch does. The v3.4 `editable:` number box repeats it
  (`num.min = d.min`). So a field declaring `unit:'Pa', display:'MPa', min:0, max:1.1e9` gives you a
  slider running 0…1 100 000 000 **in MPa**.

  > "Declaring the pair would have given a slider running 0…1.1e9 in MPa." — `fastenergrades.html`

  Until it is repaired there is exactly one honest workaround, and it costs the field its unit slot:
  declare **no `unit:`**, keep `min`/`max`/`step` in SI, and print the display value with `format:`.

  ```js
  { id:'f-ry', key:'ry_min', type:'range', min:0, max:1.1e9, step:5e7,   // SI, no unit:
    label: T('Minimum yield strength', …),
    format: function (v) { return DiagramUI.fmt(v/1e6, {precision:0}) + ' MPa'; } }
  ```

  The quantity is stored in SI and reads correctly, but it has no unit slot and **cannot follow the
  header unit-system control**. Say so in `record.model.notes`.
- **The range composite — `editable:` and `format:`, new in v3.4.** Three ports wrote
  `type:'custom'` sliders to get past these two gaps: `stress_transformation` five times ("the
  framework is missing a 'range with an editable value' field type"), `fourier_series` for
  "Number of harmonics N", `decayheat` because its slider is an index into a 150-point logarithmic
  grid that has to read `10.4 y`, not `37` ("a field has no value formatter hook").

```js
{ id:'f-n', key:'N', type:'range', editable:true, label:T('Harmonics N', …), min:1, max:64, step:1 }

{ id:'f-h', key:'hour', type:'range', label:T('Time of day', …), min:0, max:24, step:0.25,
  format: v => (v<10?'0':'') + Math.floor(v) + ':' + … }          // → "15:30"

{ id:'f-i', key:'idx', type:'range', editable:true, format: v => yearsAt(v).toFixed(1)+' y',
  label:T('Cooling time', …), min:0, max:149, step:1 }            // box holds 60, readout "26.1 y"
```

  - `editable:true` puts an `<input type=number>` beside the slider, carrying the slider's own
    `min`/`max`/`step` and the field's label. Both controls commit through the same `Field.commit`,
    so clamping, validation, the undo snapshot and the announcement are the ones you already know.
  - An **empty or half-typed box commits nothing** and never writes `NaN` into your state; on blur
    it settles back to what the state holds.
  - `format:(displayValue, ctx, field)` returns a string or a six-language label object and replaces
    the readout text. It applies to `type:'readonly'` as well.
  - Declare both and you get the `decayheat` shape: **the box holds the number, the readout holds
    what it means.** Declare `editable` alone and there is no separate readout — the box is it.
- **Never hide a field with `style.display`.** Use `visible:`; `[hidden]` is what the reachability
  gates understand.
- **`type:'note'` is built and then skipped by `sync()`.** `Field.build` returns early for a note,
  so a note carrying a `visible:` predicate is on screen until the first `ui.sync()`, and with no
  `key` its `readState()` path-gets `undefined`. Give a conditional note
  `get: function () { return null; }` and call `ui.sync()` before `ui.ready()`.
  (`damperselect.html`.)
- **A `select` re-fills its options only when the option *values* change.** The signature
  `Field.sync` compares is built from values alone, so option *labels* that depend on other state
  never refresh. Make the labels state-independent, or make the values change with them.
  (`damperselect.html`, which wanted "EI 90" vs "E 90" off another field and redesigned instead.)

**`key:` is not the only binding — and the alternative is the difference between nine declared
fields and a hand-built form.** A field may declare `get(state, ctx)` and `set(value, state, ctx)`
accessor functions instead of a `key`. `Field.readState`/`writeState` honour them, which means a
field can be bound to *whatever is currently selected* rather than to a fixed path:

```js
{ id:'ins-x', type:'number', unit:'m', label:T('x', …),
  visible: ctx => sel() != null,
  get: function ()    { return sel() ? sel().x : null; },
  set: function (v)   { if (sel()) sel().x = v; } }
```

This was undocumented until 2026-08-18 and `trussframe.html` found it only by reading the library:

> "The whole inspector (x, y, support, Fx, Fy, member length, axial force) is nine ordinary declared
> fields with `get`/`set` and `visible:` predicates, zero custom markup. Without reading the library
> I would have hand-built the inspector and lost units, learn dots, clamping and the a11y wiring."

Reach for `type:'custom'` only after you have ruled this out. §5.1's `type:'custom'` is the last
resort the framework names; `get`/`set` is the one it forgot to mention.

### 5.3 The repeating list field

For a collection the user edits — layers, harmonics, loads, materials:

```js
{ id:'f-layers', key:'layers', type:'list',
  label: T('Layers', …),
  row: [ { key:'name',   type:'text',   label:T('Material', …) },
         { key:'d',      type:'number', label:T('Thickness', …), unit:'m', display:'mm',
           min:0.001, max:1, width:'110px' },
         { key:'lambda', type:'number', label:'λ', unit:'W/(m·K)', step:0.005 } ],
  newRow: rows => ({ name:'', d:0.1, lambda:0.9 }),
  minRows: 1, maxRows: 32, reorder: true,
  validateRow: (row, i, ctx) => row.d > 0 ? true : T('Thickness must be positive', …) }
```

The value is **your own array at `key`, mutated in place** — plain objects in row order, no wrapper,
no injected id — so the permalink, the record, the PDF and the Python export see exactly the shape
you declared. Add, remove and reorder are one undo step each; every string is in six languages;
`Alt`+`ArrowUp`/`ArrowDown` moves a row; below `md` each cell shows its own name instead of a
header strip.

The rest of the vocabulary, from the first production consumer outside the pilots
(`flangejoint.html`, whose bolt-up pass schedule is a list) — none of it was written down before:

- **Cell types are `number`, `text`, `select`, `toggle` and `derived`. Nothing else.** An
  unrecognised `type` **silently becomes a number field**. That is the trap; there is no warning.
- `addLabel:` (the Add button's text), `empty:` (what shows with no rows) and a per-cell
  `placeholder:` all exist and are all translatable.
- `validateRow` is handed a **candidate copy** of the row, so a refused cell never lands in state.
- `minRows` disables the last row's delete button; `maxRows` disables Add.
- **`type:'derived'` is the read-only cell** — new in v3.4, and the thing two of the four 2026-08
  tools asked for in the same words. `flangejoint`'s per-pass torque and `trussframe`'s member
  length both ended up as a second table repeating the same rows read-only, which put the number
  the reader is reasoning about 40 cm from the number they are typing.

```js
row: [ { key:'w', type:'number', label:T('Width', …), unit:'m' },
       { key:'h', type:'number', label:T('Height', …), unit:'m' },
       { type:'derived', label:T('Area', …), unit:'m2', precision:2,
         value: (row, i, ctx) => row.w * row.h,
         tone:  row => row.w * row.h > 5 ? 'warn' : '' } ]
```

  - `value` may be a function `(row, index, ctx)` or omitted, in which case a `key` is read straight
    out of the row — the shape for a number your model writes into the row and the reader may only
    look at. A cell that declares `readOnly: true`, or whose `value` is a function, is derived
    whether or not you also write `type:'derived'`.
  - `unit` and `precision` behave exactly as they do on a results tile: **SI in, display units out**.
    The derived cell converts its own quantity, so the area of two lengths held in metres prints in
    m² while the boxes beside it print mm.
  - It **refreshes on every keystroke in the row**, deliberately in front of the focus guard that
    protects a caret — it is never the focused element, because nothing focuses it, nothing commits
    through it and it never appears in your state unless you put it there yourself.
  - `null` prints an em dash; an **empty string prints blank**, so a note column with nothing to say
    about this row stays quiet. A non-finite number prints an em dash: a half-typed row reads blank,
    never `NaN`.
  - `tone` — `'ok'`/`'warn'`/`'bad'`, a string or a function — colours the readout. A number is
    right-aligned with tabular figures; a word is left-aligned and trails off in an ellipsis with
    the full text on the element's `title`.

Not supported, deliberately: a `range` or `textarea` cell, a nested list, drag-to-reorder, and
self-sorting.

### 5.4 The stage

```js
var stage = ui.stage({
  caption: T('Temperature through the construction', …),
  minHeight: 260,
  a11y: function () { return last ? 'Temperature profile. Inside surface …' : ''; },
  render: function (size, st) {
    var ctx = st.canvas();                 // a 2-D context, sized and dpr-scaled for you
    var coarse = size.density === 'coarse';        // true below 768 px
    ctx.clearRect(0, 0, size.w, size.h);
    if (!last) return;
    DiagramUI.ticks(tmin, tmax, size.h - padT - padB, size.density).forEach(function (t) { … });
    ctx.strokeStyle = DiagramUI.series(0);         // the framework's categorical scale
    …
  }
});
stage.legend({ items:[ { label:T('Temperature', …), series:0 },
                       { label:T('Dew point', …),   series:1, dash:true } ] });
```

The stage is the one place a tool still owns pixels. The framework owns the box, the sizing (a
`ResizeObserver`, never a pixel constant), the device-pixel ratio, the caption, the legend slot, the
`Fit` button (when you pass `fit`) and the text alternative. You own the drawing.

- Redraw by calling `stage.schedule()` from `on.compute`; it coalesces on the next frame.
- Below `md` you are handed `density:'coarse'`: reduce tick count, drop non-essential annotations.
- **Label size is physical, not scaled.** Draw tick labels at ~12 px regardless of any transform. A
  fixed-`viewBox` SVG scaled to the container will shrink its text below legibility — that is why
  the stage hands you a size instead of a scale factor.
- Read theme colours from the tokens: `getComputedStyle(document.documentElement)` for `--muted`,
  `--line`, `--ink`, and `DiagramUI.series(i)` for curves. **The stage re-schedules itself when the
  theme changes** (since 2026-08-18), so a `render` that reads the tokens each time follows a
  light/dark toggle with no work from you. Before that fix it did not, and it was silent: measured
  on 2026-08-18, `flangejoint`, `trussframe`, `damperselect` **and `ui-demo.html` itself** all kept a
  stale-coloured bitmap after a theme toggle. Only `weldsymbols.html` repainted, because its author
  read the source and found `DiagramUI.theme.watch` — the workaround you no longer need for a stage.
  A canvas you drew **outside** a stage still needs `DiagramUI.theme.watch(repaint)`.
- **There is no pointer API.** `st.canvas()` returns a context and lazily creates `st.cv`, which is
  the only handle on the element. If your tool lets the reader touch the drawing — which is the
  definition of the `studio` archetype (§3.1) — you are writing the hit-testing, the pointer
  capture, the tap radii, the `tabIndex`, the `aria-label` and the keyboard equivalent yourself, and
  you are inventing a convention no other tool shares. `trussframe.html` measured the cost at "about
  190 lines the guide gives no shape for", plus "~50 lines" of world↔screen transform, because
  `render(size, st)` hands you raw pixels and the framework has `DiagramUI.ticks` for axes and
  nothing for a plan view. Budget for it, keep the numbers in one place at the top of the file, and
  read §17.1 of the spec before you invent a fifth scheme.
- **A drag must not run the results.** `ui.run()` rebuilds the whole results view; calling it at
  60 Hz during a gesture thrashes layout and can feed the stage's own `ResizeObserver`. Mutate state
  and call `stage.schedule()` during the gesture, and do `ui.sync(); ui.run()` once on pointerup —
  then draw whatever the reader needs to see live (the dragged coordinates) on the canvas yourself.
  (`trussframe.html`.)
- **Objects inside a drawing are exempt from the 44 px floor (§7.5), and you must say so.** A 44 px
  catch radius on a twelve-panel truss makes neighbouring joints indistinguishable. State the radii
  you chose, state that they grow at `density:'coarse'`, and make the keyboard path complete — that
  is the compensation, and it is what §7.5 is actually asking for.
- **A continuous data ramp is your own.** A hazard scale, a temperature field, a per-category
  palette that encodes meaning is *data*, not chrome. The framework offers no colormap and none is
  planned. The eight-colour `DiagramUI.series()` scale is for *categorical* curves only.
- A stage does **not** take a `learn:` key. Cover it with a tour step or a topic on a nearby tile.

### 5.5 Results

Return the payload from `on.compute`. Do not build result DOM.

```js
on: { compute: function (s) {
  last = solve(s);
  stage && stage.schedule();
  var over = last.U > s.Ulimit;
  return {
    verdict: { tone: over ? 'bad' : 'ok', text: T('The wall is within the limit you set.', …) },
    tiles: [
      { label:T('U-value', …), value:last.U, hint:'W/(m²·K)', precision:3, tone:over?'bad':'ok',
        learn:'uvalue' },
      { label:T('Heat flux', …), value:last.q, hint:'W/m²', precision:1 },
      { label:T('Total resistance', …), value:last.Rtot, hint:'m²·K/W', precision:3 },
      { label:T('Heat flow, whole wall', …), value:last.Qwall, unit:'W', precision:0,
        headline:false }
    ],
    meters: [ { label:T('U against your limit', …), ratio:last.U / s.Ulimit,
                thresholds:[0.85, 1], text:'0.42 / 0.30 W/(m²·K)' } ],
    tables: [ { title:T('Where the resistance is', …),
                head:[ T('Layer', …), {label:'m²·K/W', num:true}, {label:'%', num:true} ],
                rows:[ { cells:[T('Wall material', …), {value:last.Rlayer, precision:3},
                                {value:100*last.Rlayer/last.Rtot, precision:1}],
                         chosen:true } ],
                foot:[ T('Total', …), {value:last.Rtot, precision:3}, {value:100, precision:0} ] } ],
    notes: [ T('The inside face stays above the dew point.', …) ]
  };
}}
```

Rendered in this order: `filter` (§5.5.1), verdict, `entry` (§5.5.1), tiles, meters, tables, your
own `nodes`, legend, notes.

- **The first three tiles without `headline:false` are the mobile answer strip.** Choose them
  deliberately: they are what a phone reader sees first, and on a `calculator` or `wizard` they stay
  on screen while the reader scrolls.
- A tile takes `{label, value, unit, hint, tone, learn, precision, headline}`. `unit` converts;
  `hint` is a static line under the value and is the simplest way to print a non-convertible unit.
- **Never emit `0` for "not computed".** Return `null` from `on.compute` and the framework renders
  the pending state with `learn.intro` above it. A tile with no value renders `—` and says so.
- A meter takes `ratio`, or `value` with `min`/`max`. Over its limit it draws the limit line; with
  no value it draws an empty track and says "Not computed yet". Give it a `text` so the screen
  reader hears "2.7 % of 3.0 %", not "0.9".
- Table rows accept `{cells, tone, chosen, dim, reason, weight, title}` and cells accept
  `{value, text, node, num, tone, precision, span, title, wrap, class}`. `reason` grows a translated
  Reason column automatically. There is no HTML-string cell — pass `{node: element}`.
- **A `T()` object is a legal cell** — `cells:[ T('Wall material', …), … ]` renders the translated
  word. It was not, until 2026-08-18, and the example above is the code that broke. Three of four
  independent authors shipped an em dash into a results table:

  > "`tableCell()` treats every plain object as a cell descriptor, finds no `.text`/`.value`/`.node`
  > on a `{en,uk,…}` object and prints '—'. `NEW_TOOL_TEMPLATE.html` ships this defect live in its
  > resistance table." — `flangejoint.html`

  > "I loaded `NEW_TOOL_TEMPLATE.html` in a browser and confirmed its own table prints
  > '— | 0.130 | 25.8 | 7.7' in all six languages today." — `damperselect.html`

  > "Shipped `cells:[…, stateWord]` … `tableCell` fell through to `String(c.value)` with value
  > undefined and printed '—' in the State column of every row. Caught it only by looking at a
  > screenshot. **No gate anywhere catches this.**" — `trussframe.html`

  The framework now recognises a label structurally (no cell key present, at least one site language
  present) in `cells`, in `foot` and in `head`, so all four positions behave the same. `{text: T(…)}`
  remains correct and is what you want when the cell also carries `tone`, `title` or `wrap`.
- **A cell never wraps unless you ask.** `th`/`td` are `white-space:nowrap` on purpose: a sentence in
  a cell pushes the whole page sideways and trips the measured "wider than the screen" hint. Two of
  four authors lost content to it — `weldsymbols.html` moved all its prose into `<p>` nodes with the
  framework's `.dgu-hint` class; `damperselect.html` reported "three of my tables were flagged, and
  in German so was the second one", in a `wizard` whose results rail is a fixed 340 px. Since
  2026-08-18 you may mark one cell or one head `wrap:true` (`white-space:normal`, capped at 32ch).
  Use it for a phrase. **Prose still does not belong in a table** — put it in a note, or in the
  auto-generated `reason` column, which has always wrapped at 24ch.
- **A label is not a string, so you cannot concatenate one.** `T('Final torque', …) + ', N·m'`
  yields `'[object Object], N·m'`, silently, and `flangejoint.html` shipped it into a table header
  before reading the rendered DOM. Compose per language inside `T()`, or put the unit in its own
  `{label:'N·m', num:true}` head cell.
- **`meters[].thresholds` is `[warn, bad]`** — the ratio at which the meter turns warn, then the
  ratio at which it turns bad. `[0.85, 1]` means "amber from 85 % of the limit, red at the limit".
  Omit it and the meter is neutral. (`flangejoint.html`: "Assumed warn boundary then bad boundary …
  the rendering agrees, but I could not verify it from the guide.")
- `sticky:true` pins a header (with `maxHeight`, inside a bounded scrollport; without it, only when
  the table is measured to fit). The "wider than the screen" hint is measured, never speculative.
- Anything that was a picture stays a picture: it belongs in `stage`, not in `results`.
- A promise from `on.compute` is allowed: the shell shows `computing` and keeps the previous values
  visible and dimmed.
- The freshness states — `pending`, `computing`, `ready`, `stale`, `error`, `failed` — are written
  for you. You never render "stale"; a `run` tool marks itself stale on the first edit.
- **`ui.results()` with no argument is a read** and hands back the view. It used to fall through to
  "set the results to nothing" and wipe the answer off the screen.

#### 5.5.1 The lookup answer — `filter:` and `entry:` (v3.4)

A lookup's answer is **the entry the reader chose and the state of the filtering that found it**.
Until v3.4 `App.build()` created no Results view for `layout:'reference'` at all, so `ui.results()`
returned `null`, `on.compute`'s return value was discarded and `learn.intro` never rendered. It does
now, and these two payload keys are the archetype's own vocabulary. They are legal in every
archetype; they were designed for this one.

```js
on: { compute: function (s) {
  var hits = matches(s), e = pick(hits, s.sel);
  return {
    filter: {
      shown: hits.length, total: CATALOG.length,
      chips: [ { label:T('Group', …), text:s.group,
                 clear: function () { s.group='all'; ui.sync(); ui.run(); } } ],
      clear: function () { ui.reset(); }
    },
    entry: e && {
      id: e.id,
      kicker:   GROUP_LABEL[e.group],
      title:    e.name,
      subtitle: e.meaning,
      rows: [ { label:T('Standard', …), value:e.std },
              { label:T('Throat', …),   value:e.a, unit:'m', precision:1,
                hint:T('design throat, not the leg', …) } ],
      nodes: [ drawing ],
      notes: [ T('Schematic: the shape, not the construction proportions.', …) ]
    },
    tables: [ { head:[…], rows: hits.map(rowFor) } ]
  };
}}
```

- **`filter`** renders one line: the count, a chip per active filter, and a Clear. A chip with a
  `clear` function grows a `✕` whose hit area is 44 px even though the chip is not; a chip without
  one is a statement. The Clear-all button is drawn **only when there is at least one chip**, because
  a dead Reset is worse than none. `shown`/`total` collapse to a single number when they are equal.
- **`filter.shown === 0` is an answer.** The framework renders the translated "Nothing matches these
  filters." and the Clear button, and **skips `entry`** — do not write an empty card. Override the
  sentence with `filter.emptyText`.
- **`entry`** is a definition card, not a table, because a table cell is `nowrap` by design and half
  of what a catalogue entry says is a sentence. `rows[]` take the same `{label, value, unit,
  precision, hint, tone, node}` contract as a results tile, so a reference tool that does hold a
  number states it the way the rest of the site does. `id` lands on `data-entry`, which is what a
  test or a deep link reads to find out what is open.
- The panel is headed **"Selection"**, not "Results", in all six languages; `results:{title:…}`
  overrides it and `results:{slot:'stage'}` moves the whole surface into the other column.
- **The region opens on the first answer.** Return `null` and it stays closed. Declare
  `results: true` on the app to open it at build time, which is the only way to get `learn.intro`
  onto the first screen of a lookup.

**What it buys, measured on the first tool to use it.** `fastenergrades.html` was built from this
guide alone by an author forbidden to read any existing tool, and took the whole answer — filter
line, entry card, 22-row catalogue, notes — with **zero results DOM and zero CSS**:

> "`entry.rows` take the tile contract, so `{value:e.rm, unit:'Pa', display:'MPa'}` converts and
> formats like every number on the site, and a value the standard does not define renders as an em
> dash with a `hint` saying why … the card is a definition list, so the half of a catalogue entry
> that is a sentence has somewhere to live, which a `nowrap` table cell does not … and
> `filter.shown === 0` leaves `record()` populated, so the export stays truthful while the screen
> says nothing matches. That is the right thing built."

#### 5.5.1.1 Six things the surface does not do for you

All six were measured on the first tool to use it. Four are silent.

**(1) A catalogue row you can click destroys itself inside its own click handler.** §9 tells you to
put an `app.actionButton()` in a cell and says the three shipped reference tools solve selection that
way. What §9 does not say is that the answer surface **re-renders the whole table on every
`on.compute`** — so the button the reader just pressed is removed from the DOM by the very run it
triggered, focus falls to `<body>`, and in a 22-row catalogue a keyboard reader is returned to the
top of the document on every pick. Four lines fix it, and every reference tool will write the same
four until the framework carries a selectable row:

```js
var rowBtn = {};                                  // entryId -> the node ui.actionButton() returned
function cellFor(e) {
  var n = ui.actionButton({ label:e.name, variant:'ghost',
                            run: function(){ state.sel = e.id; ui.sync(); ui.run();
                                             if (rowBtn[e.id]) rowBtn[e.id].focus(); } });
  rowBtn[e.id] = n;                               // refilled on every compute
  return { node: n };
}
```

**(2) You cannot print a unit in a table head.** §5.5 says to put the unit in its own
`{label:'N·m', num:true}` head cell. `.dgu-table th` is `text-transform:uppercase`, so that renders
**`N·M`** — and, measured: `RM (MPA)`, `RP (MPA)`, `FY (KN)`. MPA and KN are not units. The head-cell
vocabulary is `{label,num,width,wrap,class}` with no `node` and no per-cell opt-out, so **no tool can
do this correctly today.** Use word-only heads and put the units in a translated note under the
table. §5.5's advice is wrong for any unit whose case carries meaning; it is fine for `%` and `m`.

**(3) The no-match state draws Clear twice.** With at least one chip **and** `filter.shown === 0`,
the framework draws the filter bar's Clear-all *and* the empty state's own Clear — same label, same
callback, 40 px apart. Measured in German: "Filter zurücksetzen" twice. There is no workaround that
leaves both states correct, because dropping `filter.clear` strips the empty state of its only
affordance. Ship the duplicate and expect it to be repaired (§9).

**(4) A panel with no `slot:` lands in a phantom track.** `App.prototype.panel` uses
`def.slot || 'inputs'`, and `reference` does not define `inputs` — so a panel declared without a slot
becomes an implicit grid column, silently. §9 warns that an archetype-less region is not refused;
this is the concrete way you meet it. **Give every panel in a `reference` tool an explicit `slot:`**,
and assert the region list in the DOM after boot: only `nav`, `stage`, `results` and `footer` should
be un-hidden. (Since v3.4 the framework's *own* answer surface refuses a slot the archetype does not
define; a tool's panel still goes wherever it is told.)

**(5) `ui.resetAction()` cannot appear in `panels:[…]`.** It is an instance method and `ui` does not
exist while the opts object is being built; and a panel action's `label` is read once at build, so a
thunk cannot stand in either. §5.8 shows it inside a separate imperative `ui.panel({id:'io'})`, which
in a 250 px `nav` column gives you a second, near-empty card. Build your one filter panel
imperatively instead:

```js
var ui = DiagramUI.app({ … /* no panels: for this one */ });
ui.panel({ id:'filters', slot:'nav', title:T('Filters', …), fields:[…],
           actions:[ ui.resetAction() ] });
```

The cost is §12.5: a panel built after `app()` is invisible to `hasConvertibleUnits()`, so its fields
can never bring up the header unit control. Choose which you want.

**(6) On a phone the answer is the thing the reader scrolls furthest for.** `renderStrip()` returns
early for `reference` and `studio`, and the single-column order is `nav, stage, results`. Measured at
390 px: the entry card starts at **y ≈ 1225 (en) / 1255 (de)** on an 844 px viewport — one and a half
screens below the fold, with the whole filter form above it. There is no `slot` that moves it above
`stage`. Keep the filter panel as short as six languages allow, and put the headline in the stage's
a11y string. §10.3 records the same shape for `studio`, where it is worse.

**One more, outside the surface: keep the `h1` short.** `.dgu-head-l` is a single no-wrap flex row
holding the `h1` and the subtitle. Measured at 390 px in German, a manifest title of
"Schrauben-Festigkeitsklassen" got 156.7 px and broke mid-word across three lines, 90 px tall;
dropping the subtitle gave the same `h1` 276.7 px and one line, 30 px. The guide gives no length
guidance and a tool can only influence it by shortening or dropping its **own** subtitle. Measure
your header at 390 px in German before you settle the manifest.

### 5.6 Steps, tabs and a transport

```js
var steps = ui.steps({ slot:'nav', items:[ {id:'geom', label:T('Geometry', …)}, … ],
                       onSelect:function(id){ state.step = id; ui.sync(); ui.run(); } });
steps.sync('geom');                                   // move the marker without firing onSelect

var tabs  = ui.tabs({ slot:'nav', items:[ {id:'plot', label:T('Plot', …)}, … ],
                      onSelect:function(id){ … } });

var tr = ui.transport({ frames:240, fps:30, slot:'dock',
                        label:function (i, n) { return fmtTime(i / 30); },
                        on:{ frame:function (i) { draw(i); } } });
```

Give `ui.steps` and `ui.tabs` a **`key:`** and read them back from `ui.byKey` (§5.11); the handle
they return does not survive a language rebuild.

`steps` renders a vertical list above `md` and a labelled dropdown below it. **It does not switch
your form** — hide and show fields with `visible:` predicates keyed on the step. `tabs` gives real
`role="tablist"` semantics with arrow keys. A transport is the play/pause/frame/speed row; its
`label(frame, frames)` is both the readout and the slider's `aria-valuetext`, and the framework owns
the clock only when you declare `fps`. Its default slot is `dock` — a transport is not an input.

**What a wizard actually looks like**, since §3.2 gives the grid and §3.3 gives the prohibitions and
neither gives the shape. `damperselect.html` had to invent all of it — "The guide has a worked
calculator (twice) and no worked wizard" — and what it invented works, so it is the recommended
shape until someone has a better one:

- `state.step` is an ordinary permalinked key (§4.4), kept out of `record.inputs`;
- every field carries a `visible:` predicate on `state.step`, which is also how branching works: a
  choice on step 4 reveals four fields on later steps that another choice never shows;
- the last `inputs` panel is a Back/Continue action row, with `disabled: ctx => …` predicates
  (§5.1) so Back is dead on step 1 and Continue on the last;
- the `results` rail is **not empty before the end**. It carries a running summary — a table with
  one row per step, rows for steps the reader has not reached dimmed — plus one explicit sentence:
  *"Step N of 7. Nothing is computed until the last step."* Only on the last step does it become
  tiles, meters and the report;
- the model itself still runs on every commit (§6.2). The deferral is presentation, not arithmetic.

Two costs to plan for. The results rail is a fixed 340 px at every width above 1120, next to an
`inputs` track that is `1fr` and nearly empty on a report step — so a wizard's report has to be
written to fit a column (§17.1 of the spec has this). And a step marker moved by anything other than
a click — an example, a reset, an undo, a permalink — needs `ui.byKey` (§5.11) to reach it.
### 5.7 Notices — the standing qualification

A qualification on the whole answer: a genre warning, a freshness banner, a structural-check
failure. Not a toast.

```js
notices: [{ id:'genre', tone:'warn', sticky:true,
            title: T('What this number is', …),
            text:  T('A teaching estimate for one homogeneous layer. It ignores thermal bridges, ' +
                     'moisture, solar gain and thermal mass, so it is not a compliance calculation.', …) }]
```

Sticky notices clamp to two lines with a translated "Show more", dock under the header (and under
the mobile answer strip, never over it), are dismissible by default and remember the dismissal under
`dgu.<toolId>.notice.<id>` — so **a sticky notice needs an `id`**. They render above the panels in
their region whatever order you declared them in. `live:true` makes it a polite live region for a
notice whose text changes with what the user did.

### 5.8 Examples, reset and import

```js
ui.examples([
  { group:T('Masonry', …), label:T('Solid brick, 300 mm', …), note:'λ 0.80, d 300 mm',
    apply:function (t) { t.d = 0.30; t.lambda = 0.80; } },
  … ]);

ui.panel({ id:'io', slot:'inputs', actionsAlign:'end', actions:[
  ui.importAction({ label:T('Open a saved case…', …), accept:'.json,application/json', as:'json',
                    run:function (data) { /* patch state */ ui.sync(); ui.run(); } }),
  ui.resetAction()
]});
```

- **`apply` patches, `state` replaces.** An example entry declaring `state:{…}` supplies the *whole*
  state and keys absent from it are deleted. A preset that changes two of eight inputs must use
  `apply(state)`. The same distinction applies to `defaults`.
- Examples always land at the top of `inputs`, always labelled **Examples**. The moment any entry
  declares a `group`, or the list exceeds 12, the panel renders a grouped `<select>` + the selected
  entry's note + a `Load` button instead of a wall of buttons. Use `{as:'select'}` to force it.
- Reset lives in the `inputs` footer, secondary weight, under that name. `ui.resetAction()` returns
  an action descriptor; you place it.
- **The shared bar exports; it has never imported.** If your tool can save a scene or a case file,
  `ui.importAction()` is the other half and it is the only way to open one. Do not hand-build a
  hidden `<input type="file">`; the framework creates and removes it.

### 5.8.1 Give every example an `id:` **[v3.5.2]**

```js
const EXAMPLES = [
  { id:'freeHard',  label:T('Free field · hard ground', 'Вільне поле · тверда поверхня',
      'Freifeld · harter Boden', 'Vrij veld · harde bodem', 'Champ libre · sol dur',
      'Campo libre · suelo duro'), note:…, apply:… },
  { id:'barrier',   label:T('Single barrier', 'Один екран', 'Einzelne Schallschutzwand',
      'Enkel scherm', 'Écran unique', 'Pantalla única'), note:…, apply:… },
  … ];

ui.examples(EXAMPLES);
DiagramUI.current.example('barrier');     // apply one by name, from anywhere
```

`id:` is optional, tool-chosen and **not localised** — it is a name, not a string a reader sees, so
it takes no translation. `label` and `note` are read by a human and take all six languages as usual.

What declaring it buys you, and nothing else:

- **`data-example="<id>"` on whatever the panel rendered for that entry** — the `<option>` in select
  mode, the `<button>` in buttons mode. One attribute, one meaning, in both shapes.
- **The `<option>`'s `value` *is* the id**, so `select.value = '<id>'` chooses a preset by name and
  not by declaration order. The one control that applies the choice carries `data-example-load`.
- **`app.example('<id>')`**. An unknown id warns and does nothing; it never silently applies the
  wrong preset.

A list that declares no `id` behaves exactly as it did, down to the `<option>` values still being
ordinals.

**Declare them even if you think nothing addresses your presets.** Something will: a parity probe, a
benchmark driver, a permalink, a handoff, your own "reset to the case we were discussing" button.
`outdoornoise.html` is the worked cautionary tale. It tagged the ids on
`panel.node.querySelectorAll('button')` itself, under a comment promising the preset id stayed
addressable — true of the button-per-example panel, and false the moment §5.8's threshold turned its
17-entry list into a `<select>` plus one `Load`. **Sixteen of seventeen ids were dropped in silence:
exactly one `[data-preset]` element was left on the page.** Its parity probe addressed presets by
that attribute, so sixteen of its eighteen selectors matched nothing, the harness applied those cases
to a scene it had never switched, and the tool sat in the numeric safety net as "16 of 18 failing"
for six days on evidence that was an artefact of the harness. `/root/verification/wh-parity.mjs`
makes the identical assumption about `waterhammer`, independently and by a different hand.

The rule underneath it: **the panel's shape is not yours to know.** §5.8 chooses buttons or a select
from your list's own length and grouping, and it may choose differently again. Never reach into
`panel.node` to find what the framework rendered — declare the identity and let the framework put it
where it put the element.

### 5.9 Footer, learn and the tour

```js
footer: T('R = d/λ, U = 1/(Rsi + R + Rse), q = U (Ti − Te). Steady state, one dimension, ' +
          'one homogeneous layer. No thermal bridges, no moisture, no solar gain.', …),

learn: {
  version: 1,
  intro:  { title:T('What this tool does', …), body:T('It adds three thermal resistances in series …', …) },
  topics: {
    conductivity: { title:T('Thermal conductivity', …), body:T('The material property, in W/(m·K) …', …),
                    more:{ href:'…', label:'…' } },
    uvalue:       { title:T('U-value', …),              body:T('The reciprocal of the total resistance …', …) }
  },
  tour: [
    { topic:'conductivity', focus:'[data-dgu-field="f-lambda"]' },
    { topic:'uvalue',       focus:'.dgu-r-results' },
    { topic:'profile',      focus:'.dgu-stage' }
  ]
}
```

The footer is model notes, equations, validity, references — a string or a `render(box, app)`. It is
not the place for controls.

Learn is framework furniture, present in every tool, and it is the part users notice. A `learn:'key'`
on any panel, field, tile or meter grows a `?` that opens that topic in a popover; the header `?`
turns on learn mode; `learn.intro` fills the results region while the state is `pending`.

- One topic per concept, referenced from as many places as you like.
- A `hint` says **what**; a topic says **why**.
- The intro must answer "what is this and what do I do first" without a modal.
- `tour` is four to eight steps. More is a manual, and a manual goes in the footer.
- The tour auto-starts once per `learn.version`, never on a permalink or handoff arrival
  (`?s=` / `?in=`), and remembers completion in `localStorage.diagram_learn_<id>`. Bump `version`
  to re-offer it; `autostart:false` to never offer it. It restarts on a language change if it was
  never completed — if that is not what you want, set `autostart:false` and offer it from a header
  action.
- Learn content is content: it is translated like everything else, and it can appear in the PDF.

### 5.10 Region scrolling, splitters and remembered state

```js
DiagramUI.app({ scroll:['inputs'], resize:[{ region:'inputs', min:240, max:680 }] });
ui.scrollRegion('results', { from:'md' });
ui.resizable({ region:'inputs', min:240, max:680 });
app.remember('view.mode', 'compact');            // -> dgu.<toolId>.view.mode
```

Scrolling and dragging are **region**-level, never panel-level. Below `md` the handles do not exist
and any stored size is dropped: on one column there is nothing to split. Splitters are
`role="separator"` with arrow keys (16 px), `Shift`+arrow (48 px), `Home` and double-click to reset.

Every key you remember lives under `dgu.<toolId>.<facet>.<name>`. **Do not write a `localStorage`
key of your own.** The three site-wide singletons `diagram_theme`, `diagram_lang` and
`diagram_units` are the only ones outside the namespace, and they are not yours to write except
through the framework.

### 5.11 What a rebuild costs you

A language change, a unit-system change and `ui.setLang()` all destroy the shell and build a new
one. The framework replays everything you created through `ui.panel()`, `ui.stage()`, `ui.tabs()`,
`ui.steps()`, `ui.examples()`, `ui.notice()` and `ui.transport()`, in declaration order, into the
same region, and re-renders the last results payload. **You must not re-create furniture from
`on.ready`** — the replay guard counts what is on screen and the workaround is dead code.

What the framework cannot do is hand you back your objects. If you hold `var stage = ui.stage(…)`,
after a rebuild you hold a destroyed one. Re-point it in `on.rebuild(app)`, which fires once, after
the replay:

```js
function adoptStage(app) {
  stage = app.stages[0] || null;
  if (stage) stage.legend({ items: LEGEND_ITEMS() });   // decorations must be re-applied too
}
… on: { rebuild: adoptStage }
```

`app.stages`, `app.panels`, `app.notices` and `app.transports` are the live arrays. Note also that a
rebuild calls `ready()` again, so `on.ready` is **not** once-only: keep it idempotent.

**Give the thing a `key:` and stop re-pointing.** Since 2026-08-18 every imperative constructor
accepts `key:` and files the object it built into `app.byKey`, and the replay re-files it, so
`app.byKey.<key>` is the live object at all times — before `on.rebuild`, during the replay, and
after:

```js
ui.stage({ key:'main', render:… });
ui.steps({ key:'nav',  items:… });
…
var st = ui.byKey.main;                 // always the live Stage, no adopt function needed
```

This was §17.1's "proposed, not built" row until three of four authors hit its absence:

> "There is no `app.steps` and no `app.tabs`. `replayJournal` calls `app.steps(e.def)` and throws
> the instance away. … I reproduced it: switch to German, press Back, form and results follow,
> marker does not." — `damperselect.html`, which shipped a `setTimeout` that clicks the framework's
> own step button as a fallback

> "The guide never mentions that tool-owned listeners, `tabindex` and `aria-label` on the canvas die
> with the old Stage." — `trussframe.html`

**Three things `key:` does not fix, and one rule that matters more than all of it.**

1. **The replay runs your `render`/`sync` panel callbacks BEFORE `on.rebuild` fires.** So a paint
   routine that closes over a module-level `app` reads a *destroyed* App during every rebuild. This
   is the single most expensive bug of the 2026-08 cohort and it was shipped:

   > "After an in-place language change both content panels came back empty, because my paint
   > routines read a module-level `app` captured at boot while the replay had already built a new
   > one. The guide's §5.11 tells you to re-point references in `on.rebuild` — which fires after the
   > replay, i.e. **too late for anything that paints**. Fixed by taking the App from the panel's
   > `ctx`; that is the single most useful thing this exercise found." — `weldsymbols.html`

   > **The rule: a `render(box, ctx, panel)` or `sync(box, ctx, panel)` callback uses `ctx.app` and
   > `ctx.app.lang`, never a captured reference.** Reserve the module-level handle for code that
   > runs outside the replay — stage a11y strings, `report.sections`, `Diagram.init` callbacks.

2. **A Stage's canvas element does not exist until its first render.** `st.canvas()` returns a
   **2-D context** and lazily creates `st.cv` on the way. Anything you attached to the element —
   listeners, `tabIndex`, `aria-label`, inline `touch-action` — dies with the old Stage and must be
   re-attached; and you cannot re-attach in `on.rebuild`, because the element is not there yet.
   Defer it one `requestAnimationFrame`, or attach from inside your own `render`.

3. **Panel `title:` and `note:` are read once at build and never re-read**, unlike a field's `label:`
   and `unit:` thunks. A panel cannot be headed with the name of the current selection; put that in
   the first line of the body. (`weldsymbols.html`.)

---

## 6. Step 5 — the data layer

Call it from `DOMContentLoaded`, unconditionally, and never from inside a `.then()`.

```js
Diagram.init({
  id: 'flatwall', file: 'flatwall.html',

  state: {
    serialize:   function () { return state; },
    deserialize: function (o) { Object.assign(state, o || {}); ui.sync(); ui.run(); }
  },

  record: function () {
    if (!last) return null;
    return {
      inputs:  { d:state.d, lambda:state.lambda, Ti:state.Ti, Te:state.Te, A:state.A },
      outputs: { U:last.U, q:last.q, R_total:last.Rtot, T_si:last.Tsi, Q_wall:last.Qwall },
      units:   { d:'m', lambda:'W/(m K)', Ti:'K', Te:'K', A:'m2',
                 U:'W/(m2 K)', q:'W/m2', R_total:'m2K/W', T_si:'K', Q_wall:'W' },
      model:   { equations:['R = d / lambda', 'U = 1 / (Rsi + R + Rse)', 'q = U (Ti - Te)'],
                 ranges:['steady state, one dimension, one homogeneous layer'],
                 notes:['no independent validation'] },
      warnings: last.U > state.Ulimit ? ['U is above the limit set by the user'] : []
    };
  },

  python: function () { … },              // §6.4 — required if the manifest says supported
  handoff: { provides:['U','Q','A'], accepts:['T','A'], build:…, apply:… },
  report:  { sections: function (rec) { return [ … ]; } }
});
```

### 6.1 `state`

`serialize()` returns the object you keep. `deserialize(o)` merges and then calls `ui.sync()`
followed by `ui.run()` — sync writes state into the controls, run recomputes. It must not fight the
field bindings by writing into controls itself.

### 6.2 `record`

Discussed in §1.1. Three checks before you call it done: `null` when nothing is computed; every
displayed quantity present in `outputs`; `units` in SI and naming every key in both `inputs` and
`outputs`.

**"Nothing computed" is narrower than it sounds, and three of four authors of the 2026-08 cohort had
to reason it out alone.** §1.1's rule — `null`, never an object of zeros — is about a tool that has
not run. It is not about these three, all of which are common:

| Case | What `record()` returns | Seen in |
|---|---|---|
| the model ran and refused — a mechanism, a singular matrix, an out-of-domain input | the **full key set**, with `null` in every slot it could not fill, a count of what it did solve, and a `warnings` entry naming the reason | `trussframe.html`: "`record()` returns `null` only for an empty drawing … `solved: 0`, and a `warnings` entry naming the reason (mechanism / indeterminate / singular / geometry)" |
| a lookup or a filter, where there is no "before" | a populated record from the defaults, at module load | `weldsymbols.html`: "for a filter there is no 'not computed yet' … I say so in the file and in `record.model.notes` rather than pretend" |
| a wizard whose answer is genuinely deferred to the last step | a populated record from every commit; defer the **presentation**, not the model | `damperselect.html`: "`solve()` runs on every commit (it is pure and cheap) and I deferred only the presentation … steps 1–6 return a running summary and 'Step N of 7. Nothing is computed until the last step'" |

There is a hard constraint behind the last two that the guide used to leave you to discover:
**`parity.js` exits 3 — "the page does not produce a calculation record" — if `record()` is `null`
at load**, and `fwgate` and the task both want a populated record at `__diagramReady`. So a tool
whose model is pure and cheap should run it at boot and defer only what it shows. A tool whose model
is genuinely expensive keeps `null` and accepts that its parity baseline must set an input first.

`null` in an output slot is not a failure to report: the framework renders `—` for a tile with no
value, and `record.warnings` is where the reason goes.

**A record that measures nothing physical still needs `units`.** `weldsymbols.html` used `'text'`
and `'count'` and explained the choice in `record.model.notes`. That is the convention: an honest
non-SI token plus a sentence, never a silent omission.

### 6.3 `handoff`

The quantity vocabulary is **fixed**: `T`, `p`, `rho`, `h`, `s`, `u`, `v`, `x`, `w`, `mdot`, `Vdot`,
`Q`, `U`, `A`, `NTU`, `eps`, `f_darcy`, `Re`, `D`, `L`, `dp`, `M`, `phi`, `rho_reac`, `E`, `I`,
`V_volt`, `Z`, `XR` (reactance/resistance ratio X/R), `Ik`, `ip`, `Ib`, `Ith`, `Ires`, `t_clear`. Here `Ik` means the initial symmetrical short-circuit current Ik″; `Ires` means residual/earth current 3I0; `t_clear` is the fault clearing time. A name outside it is a catalogue warning and the runtime will not offer it. Values
are SI, always. A receiving tool ignores what it does not understand **and tells the user which
quantities it ignored**.

```js
handoff: {
  provides: ['U','Q','A'], accepts: ['T','A'],
  build: function () {
    if (!last) return null;
    return { quantities: { U:{value:last.U, unit:'W/(m2 K)'},
                           Q:{value:last.Qwall, unit:'W'},
                           A:{value:state.A, unit:'m2'} } };
  },
  apply: function (p) {
    var q = (p && p.quantities) || {};
    if (q.T) state.Te = q.T.value;         // this tool reads an incoming T as the outside air
    if (q.A) state.A  = q.A.value;
    ui.sync(); ui.run();
  }
}
```

### 6.4 `python`

If the manifest says `python_export.supported: true`, you **must** pass a `python:` provider.
`diagram-common.js` adds the Python button only when `CFG.python` exists; without it the manifest
makes a claim the page cannot honour, `Diagram.python.emit()` returns
`{error:"no python provider"}`, and the QA gate "every tool declaring `supported: true` produces a
script that runs and whose self-test passes" fails. (`NEW_TOOL_TEMPLATE.html` has exactly this
defect — do not copy it.)

The provider returns one runnable file's worth of material:

```js
python: function () {
  if (state.mode === 'montecarlo')
    return { unsupported: T('The Monte-Carlo branch is sampled, not closed form — ' +
                            'switch to the analytic branch to export.', …) };
  return {
    code: PY_SOURCE,                       // the tool's own functions, ported verbatim
    requires: [],                          // normally empty. A bare python3, standard library only
    basis: { kind:'reproduce',
             note:'the same expressions in the same order as the page',
             deviation:'none observed' },
    selftest: { tolerance: 1e-12 }
  };
}
```

Rules, from `AGENTS.md` §2.3, in force:

- **No dependencies.** One self-contained file on a bare `python3`. A surviving `requires` entry
  needs a `requires_reason`, prints a warning banner in the header *and* at run time, and raises a
  catalogue warning. There is no approved package list.
- Three honest options when a faithful port is impossible: **port** the subset you use and name its
  source; **scope** it with `covers:[…]` and say what is not reproduced; or **decline** —
  `supported:false` with a reason, or `{unsupported:"…"}` for the current state. Returning `null` is
  none of them: it produces a bare "no python code".
- **The tolerance follows from the basis.** Widening it because the script and the page disagree is
  falsification. If they disagree beyond what `basis.deviation` predicts, one of them is wrong.
- Verify by running it: `python3 export.py` exits 0 and prints its self-test line.

### 6.5 `report`

`report.pdf: true` and `report.source_attribution: true` give you the shared PDF: the record,
rendered into a hidden same-origin iframe and printed, with
`Source: https://tools.petrov.re/<file> · <ISO timestamp> · <status>, independent validation:
yes|no · page N of M` on **every** page, the permalink on page 1, the `limitations` string and the
benchmark summary when there is one.

- **A chart is part of the report.** Pass it as a section: `image` (a `data:` URL from
  `canvas.toDataURL`) and/or `svg` (inline markup). Only `data:` URLs print — the report fetches
  nothing — and inline SVG is stripped of scripts and external references.
- `report.sections(rec)` adds blocks; `report.render(rec, ctx)` replaces the record dump entirely.
  Neither can lose the attribution: the head, the disclaimer and the footer stay with the runtime.
- **The section shape, in full** — three authors had to read `sectionItems()` in
  `diagram-common.js` for it, so it is written here:

  ```js
  report: { sections: function (rec) { return [
    { title: T(…),                        // translated
      text:  T(…),                        // translated paragraph
      image: { src: dataUrl, width: 520, caption: T(…), alt: T(…) },
      svg:   '<svg …>',
      head:  [ T(…), … ], rows: [ [ … ], … ],   // a table, same cell rules as §5.5
      notes: [ T(…), … ] };
  ]; } }
  ```

- **The provider is called as `sections(rec)` — with no language.** The renderer picks a language
  for everything else through `sectionItems(sections, l)`, but your callback has to choose its own.
  Use `DiagramUI.pick(obj, app.lang)`. It is right today because the report is printed from the live
  page; it is on the list in §17.1 of the spec to be given the language properly.
  (`damperselect.html`.)
- **Getting a stage drawing into the report takes two steps, in this order.** `stage.canvas()`
  returns a **2-D context**, not the element, and `stage.schedule()` paints on the *next* frame — so
  a report built synchronously can capture a blank or stale bitmap. Factor your drawing into a named
  function, call it, then read the element off the context:

  ```js
  drawChart(stage.measure(), stage);                       // paint now, not next frame
  var png = stage.canvas().canvas.toDataURL('image/png');  // ctx.canvas is the element
  ```

  (`flangejoint.html`, which named this as a framework gap as well: "relies on `ctx.canvas` and on
  the framework not having resized the canvas in between.")
- **A raster figure is clipped, today.** The pager measures each block as it appends it, and it runs
  before a `data:` URL `<img>` has laid out — so a PNG figure measures as zero height, no page break
  happens, and the overflow is clipped away. Measured: `fastenergrades`' report loses fourteen table
  rows off page 2 for exactly this reason. **Pass inline `svg:` where you can** — it lays out
  synchronously and paginates correctly (`mollier`, `moodydiagram`). If your figure can only be a
  canvas PNG, know that it may not survive the page it lands on. Spec §21.5; the repair belongs in
  `diagram-common.js`'s pager.

### 6.6 Printing — there is ONE path, and you do not write it

**Never write a `@page` rule. Never write an `@media print` block for anything the framework
created. Never write `window.print()` as a route to paper** — the one place it is still allowed is
the last arm of a fallback chain, and that is spelled out below. Spec §21.

The framework already gives your tool, with no code from you:

- **`Ctrl`/`Cmd`+`P`** prints `Diagram.report()` — the same artefact as the shared bar's Report
  entry, byte for byte. If your tool has no `record`, the shortcut is left to the browser.
- **File → Print** — which no page can intercept — prints a framework-owned A4 fallback sheet: your
  content in one column, every piece of framework and site chrome gone, a running header with your
  tool's title and `tools.petrov.re`, and a running footer carrying
  `Diagram.report.attribution()` on **every page**, in the reader's language.

If you want a print control in your own chrome, declare it:

```js
DiagramUI.app({ header: { print: true }, … })   // a labelled button, six languages included
app.printAction()                                // the same button, to place yourself
app.print()                                      // the call, for a button you already have
app.canPrintReport()                             // true when there is a record to print
```

On a page that loads `diagram-ui.js` without calling `DiagramUI.app()`, ask for the sheet:
`DiagramUI.printStyles()`, and use `DiagramUI.print()` / `DiagramUI.canPrintReport()`.

**When a tool-side print rule is still legitimate** — and it is a short list:

1. a selector the framework never created (`.rpbar`, `.en-svgwrap`, your own `.noprint`);
2. a CSS custom property the framework does not publish (your own `--warm`, your own `--text`);
3. **which of your own regions belong on paper.** The framework prints them all; that is a content
   decision and it is yours. `decayheat` prints its inputs and un-collapses a folded panel to do it,
   because a reader wants the numbers the answer came from. `regelkring` hides its inputs region,
   because it is 39 fields and the answer is in the cards. Both are right about their own tool.

Anything else is the framework's, and if you find yourself writing it, that is a bug report, not a
local patch. `decayheat` proved it: its print block carried
`html:root{--bg:#fff!important…}` with a comment explaining that a bare `html` selector loses to the
`:root` the framework declares its tokens on. A tool cannot win that argument. Say so instead.

**The one limitation, stated so you do not discover it in front of a client.** The fallback sheet's
page number comes from an `@page` margin box, which Chromium supports and Firefox and Safari do not.
There, the number silently disappears; the source URL, the timestamp and the attribution still
print. The paginated version that numbers its pages everywhere is `Diagram.report()` — which is what
the footer's own translated line tells the reader.

**If you keep a PDF path of your own** — a jsPDF export, a generated document — AGENTS.md §2.2
still applies without exception: stamp `Diagram.report.attribution({page, pages})` verbatim on every
page. `neutron_transport` does. `protectioncoordination` did not until v3.5, and it was a real
finding, not a nit: its study report reached paper with no source URL at all.

### 6.6.1 The four ways tools have got this wrong since v3.5 shipped

Each of these was measured on the shipped tree after §21 landed. None is hypothetical, and none of
them is the framework failing — they are the four gaps a tool can still leave.

> **Amended 2026-08-21 (v3.5.1).** All four have now been repaired in the tools named below, and
> the traps are kept here because they are traps, not history. **Two of the numbers this section
> originally quoted were wrong**, produced by a probe that could not see a `background-image` and
> read `rgba()` as opaque. Measure with **`/root/harness/print-contrast2.mjs`**, which models
> Chrome's "Background graphics" checkbox in both states — and note the calibrated fact it
> established: the framework sets `print-color-adjust:exact` on `body` and that property
> **inherits**, so on any page carrying the framework sheet the checkbox changes nothing.

**1. A dark default theme prints wrong in BOTH directions, and only you can stop it.** *(Rewritten
2026-08-21, v3.5.1: both examples below are now repaired, and both of the numbers this paragraph
used to quote were wrong. Spec §21.9 says why. Use
`/root/harness/print-contrast2.mjs`, not `print-contrast.mjs`.)*

The framework declares white paper and dark ink on `:root`, so every *framework* token flips. It
cannot flip a token it has never heard of, and it cannot repaint a surface you painted yourself.
Two failures follow, and `generatorgrid` had both on one page:

* **your light text on the framework's white paper.** `generatorgrid` kept its own
  `--text:#e7f0f8`, so its title printed at a contrast ratio of **1.15** — invisible.
* **the framework's dark ink on your still-dark surface.** The framework forces `--muted:#3b434d`,
  which is correct on paper — and `generatorgrid` paints `.hint` on its own `#101e2f` panels, so
  eight blocks printed **dark on dark at 1.80**. Nothing about that is the framework's fault and
  nothing about it is fixable from outside your stylesheet.

`protectioncoordination` shows the second half of the repair. It forced the *token values* its
`.light` theme sets — and its legend still printed at **1.36**, because `.light` also carries two
rules as a **class** selector (`.light .legend`, `.light .pane-title`) and a print block cannot put
a class on `:root`. **If your light theme is a class, copy every rule that class carries, not only
its token values.**

**So: if your default is dark, write print rules for (a) the tokens the framework does not publish,
(b) every surface you paint with a literal, and (c) every rule your light class carries — then
measure the sheet, in both background-graphics states.** Both tools measure 0 nodes below a 2.0
ratio today; they measured 9 and 4 before.

**2. Hiding `#app` and substituting your own document only works if the document exists.**
*(Repaired 2026-08-21, v3.5.1; kept here because the trap is general.)*
`solargaincalculator` used to keep `@media print{#app{display:none!important}}` and show
`#report-view` instead. `#report-view` is empty until the reader opens the overlay, so File → Print
produced **one A4 page of 385 characters, every one of them the framework's own header and footer,
and no tool content whatever**. §21.2 lets you decide which of your regions reach paper. It does not
let you decide that none of them do.

The repair is one selector: **key the substitution on the document existing.** The tool already set
`html.sgc-report-open` in the same function that fills and opens `#report-view`, so the rule became
`html.sgc-report-open #app{display:none!important}`. Report open, it prints the identical document
it always did; report closed, the framework fallback sheet prints the tool. If you have no such
class, add one, or hide nothing and let the fallback sheet do its job — that is what it is for.

**3. `Diagram.init`'s `file:` is the published filename, and it is printed.** Eight shipped tools
register as `<name>-v2` / `<name>-v2.html` — `debrisrunout`, `ductnetwork`, `gasdynamics`, `heat2d`,
`hydraulicnetwork`, `outdoornoise`, `probabilisticrisk`, `roomacoustics` — and no `-v2.html` exists.
`Diagram.report.attribution()` builds the source URL and the benchmark URL from that string, so
**every page of every report and every fallback sheet those eight tools produce cites two dead
links**. It has always been wrong; before §21 the screen printout carried no URL at all, so nobody
saw it. Nothing in the tree checks this. Check it yourself: the `file:` you pass `Diagram.init` must
be the name of the file the reader downloaded.

**4. The degraded `window.print()` arm — the only one that is allowed.** Three tools end their print
button like this, and they are right to:

```js
if (window.DiagramUI && DiagramUI.print) DiagramUI.print();
else if (window.Diagram && Diagram.report) Diagram.report({});
else window.print();
```

That last arm is reachable **only** when `diagram-common.js` did not load, in which state
`Diagram.report()` does not exist. A page whose shared runtime failed should still be able to hand a
reader its result. Write it in exactly that order or not at all: a `window.print()` that is not
preceded by both attempts is a second path to paper, and that is the thing §21 exists to remove.

---

## 7. The obligations that are easy to miss and expensive to fix

### 7.1 Declared domain languages, everywhere

Every tool-owned visible string must exist in every language the tool declares in `tool_languages`: labels, tile labels, table headers, verdict text, notes, notices, learn topics, tour steps, example labels and notes, validation messages, the `a11y` text of a stage, annotations, and sentences composed from numbers. Shared framework chrome is instead owned by `siteLang`. Switching through every declared domain language and also exercising one unsupported-site-language fallback is the human gate.

Three mechanical points:

- **`<html lang>` is set for you, on arrival as well as on a switch** (since 2026-08-18). It was not
  before, and the failure was invisible: a page opened at `?lang=de` sat inside `<html lang="en">`
  with correct German text, so nothing on screen was wrong and every screen reader was. Measured on
  2026-08-18, `ui-demo.html` and `NEW_TOOL_TEMPLATE.html` were both wrong, and so were three of the
  four new tools. Only `flangejoint.html` was right, because its author checked: "It is not set: the
  runtime assigns the document language only when the switcher is used." You no longer need
  `Diagram.setDocumentLang(app.lang)` after `ready()`; calling it is harmless.
- **Inside a canvas render, the domain language is `app.lang` (`app.siteLang` is the shared-shell language)** and the picker is
  `DiagramUI.pick(labelObject, app.lang)`. §5.4 shows a render reading tokens and never shows it
  reading a word; `weldsymbols.html` found both in the source.
- **Decide whether your model is language-sensitive, and prefer "no".** A tool with a search box can
  match the domain display language or all languages the tool declares at once. Match all six: the record, and therefore
  `parity.js` and the Python self-test, then give the same answer in every language. A
  language-dependent output makes them disagree between languages, which is a bug you will find
  late. (`weldsymbols.html`.)

### 7.2 Honest degradation

Three failure paths, each with a required behaviour:

| What failed | What must still work | How |
|---|---|---|
| `diagram-ui.js` absent or wrong version | the shared bar, the record, the export, the disclaimer badge, one `h1` and one sentence saying the interface is unavailable — everything else is gone | `degrade()` writes the title, the `h1` and the sentence (the one place a tool may touch `document` directly); `installData()` still runs `Diagram.init` — see §1.3. Do **not** `return` out of `boot()` |
| a data file (`fetch`) | the shell, the header, the shared bar, the status badge, the limitations modal, the language control | `ui.fail(reason)` renders the failure **inside the results region** and leaves everything else standing. `Diagram.init` is already called, so the bar exists |
| the model throws | the inputs stay editable and the message is in place | let it throw out of `on.compute`; the shell goes to `error` with the message |

The automated form of this gate has **two** runs, and both are required:

```
node check.js mytool.html --block '**/mytool-data.json'   # the data path
node check.js mytool.html --block '**/diagram-ui.js'      # the framework path
```

With `--block`, `check.js` narrows its assertions to `#dgc-bar` and `__diagramReady` — so what it is
really asking is *"is `Diagram.init` reachable from here?"*. With the data file blocked the shell
must render, `#dgc-bar` must have children and the results must say why. With `diagram-ui.js`
blocked there is no shell at all, and `#dgc-bar` must **still** have children.

A useful stronger check, and what the four 2026-08 tools each verified by hand: with the framework
blocked, `Diagram.record.build()` still returns a populated record. `damperselect.html` runs
`solve()` once on the degraded path for exactly this reason — "so the record, the permalink and the
PDF stay truthful".

### 7.3 One `h1`, and it is the framework's

The framework writes exactly one `h1` from the manifest title. A tool that writes its own is a
defect and fails `DiagramUI.check()`. The same goes for the language switcher, the theme control and
the return link: one implementation each, in the header, and it is not yours.

### 7.4 The shared bar owns export

Permalink, record JSON, record CSV, PDF report, Python export and handoff live in the shared bar and
nowhere else. Do not add an "Export PDF", "Save JSON", "Download CSV" or "Copy link" button. The one
thing the bar does **not** do is **import** — if your tool writes a scene or case file, ship
`ui.importAction()` to open it (§5.8).

Two genuine exceptions, both of which cost you a line in your own notes: an artefact the shared bar
cannot produce (a PNG of your drawing, a domain-specific `.csv` layout the record does not carry).
If you keep one, keep it as a tool action in a panel, not in the header, and say why.

### 7.5 The 44 px tap-target floor

Below `md` every interactive control is at least 44 px. The framework enforces it on its own
controls — buttons, selects, segmented buttons, tabs, toggles, ranges, the footer summary, the tour
and dialog buttons. Two things are yours:

- anything you draw yourself. A 13 px handle inside a canvas is a control the user cannot hit. If it
  is an object inside a drawing rather than chrome, say so in your notes and give it a keyboard path.
- the learn dot `.dgu-q`, which deliberately keeps its ~28 px drawn size and gains a 44 px invisible
  hit area instead — because a page with three dozen of them would be swamped by 44 px circles. Do
  not "fix" it.

The related failure is a control that is **on screen, focusable and invisible**. Until 2026-08-18 a
`type:'segmented'` field whose options did not fit scrolled silently — `overflow:auto` with
`scrollbar-width:none` and no affordance. `trussframe.html`: "the fourth tool was in the DOM,
focusable, hit-testable by fwgate, and invisible to a user." It now wraps instead. Measured on the
day of the fix, the shipped pilot `decayheat.html` was hiding **4 of 7 buttons in each of two
segmented controls at 390 px in German**, and no gate had ever seen it. Check your own controls at
390 px **in German**, which is the longest of the six for most engineering vocabulary; and check
that anything you draw is inside the box you drew it in.

### 7.6 No literals, no bespoke breakpoints, no second theme

- A colour, radius, shadow, font size or spacing value written as a literal in tool CSS is a defect.
  Read tokens: `--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--accent`, `--ok`, `--warn`,
  `--bad`, `--sp-1…7`, `--radius-sm|md|pill`, `--fs-title|section|body|label|small|micro`, one
  `--shadow`. Semibold is **650**.
- Four breakpoints exist: 480, 768, 1120, 1440. A media query at any other width is a defect.
- Never read `prefers-color-scheme` yourself. `<html data-theme>` is the model and the tokens follow
  it.
- The exception, stated once: a **data** colour scale is yours (§5.4).

**A new tool should ship zero bytes of CSS.** `NEW_TOOL_TEMPLATE.html` does. If you are writing
`grid-template-columns`, you have taken a wrong turn: port the content into the slots.

### 7.7 Never claim a benchmark you did not run

§2.4. `status: "benchmarked"` without a passing artifact removes the tool from the site. A
self-check is not a benchmark. `independent_validation: true` without a documented independent basis
is a lie printed on every page of every PDF the tool emits.

### 7.8 Identity

The `id` in the manifest, the `id` you pass to `DiagramUI.app()` and the `id` and `file` you pass to
`Diagram.init()` must be the same strings. One shipped tool has a manifest promoted to `cfd` and a
`Diagram.init` still saying `cfd-v2`, so every CSV, every JSON, the PDF `Source:` line and the
permalink host path sign themselves with a filename that does not exist.

---

## 8. Step 6 — check your work

Serve the tree on a local HTTP server (the harness assumes `http://127.0.0.1:8099/`) and run all of
it. It is about ten minutes.

```bash
# 1. the framework gates, four viewports: 1440, 1120, 768, 390
node check.js mytool.html

# 2. the chrome survives a data failure
node check.js mytool.html --block '**/mytool-data.json'

# 3. the numeric baseline, so the next change can be proven harmless
node parity.js --probe mytool.probe.json --base http://127.0.0.1:8099/ --out mytool.parity.json

# 4. the catalogue
php catalog.php | jq '.errors, [.tools[] | select(.file=="mytool.html")]'
```

### 8.1 `check.js`, four viewports

`check.js` loads the page at 1440, 1120, 768 and 390 px and asserts, at each:

- no page errors and no console errors;
- `window.__diagramReady === true` — which is only set by `Diagram.init`'s own boot, so this is the
  S-2 regression check: an `init` gated on a fetch fails here;
- `#dgc-bar` exists **and has children**;
- no horizontal overflow;
- exactly one `h1`;
- no scroll ancestor with `overflow:hidden` trapping content;
- `DiagramUI.check()` reports no problems — which additionally hit-tests every focusable control at
  the bottom of the document against the shared chrome's safe area, and flags any focusable control
  with no accessible name.

`--block` repeats the run with a request aborted. Both must be clean.

### 8.2 The `fwgate` rules — what it checks now

`fwgate.mjs` lives at **`/root/harness/fwgate.mjs`** and nowhere else. Its header comment is the only
complete description of what it enforces; read it before you write, because two of its five checks
are aimed at exactly the traps a new tool falls into first. As of 2026-08-21 it runs **84 cells** —
21 tools × 2 viewports (1280, 390) × 2 languages (en, de) — in about 21 s:

| Check | What fails it | The defect it was written for |
|---|---|---|
| **P** | a `[role=separator]`, `[aria-expanded]`, `.dgu-notice-x` or `.dgu-q` that `document.elementFromPoint` cannot reach at three points along it | a pilot shipped a splitter with correct `role`, correct `aria-valuenow`, working arrow keys and a correct 11 × 760 px rectangle fully on screen — that no mouse could touch, through three green gates |
| **C1** | a results-table **column** that is entirely `—` or empty beside populated cells, or any visible `[object Object]` | `tableCell()` could not tell a six-language label object from a cell descriptor and printed an em dash into every row, in all six languages |
| **C2** | `<html lang>` disagreeing with the language the page is showing; framework chrome byte-identical in `en` and `de` | three of four new tools, `ui-demo` and the template all shipped a German page inside `lang="en"` |
| **C3** | a control laid out outside a scroll container that **hides its scrollbar** — in the DOM, focusable, hit-tested green, invisible to a person | `decayheat` hid 4 of 7 buttons in each of two segmented controls at 390 px in German |
| **C4** | a canvas whose `toDataURL` bytes do not move when the theme does | three of four new tools shipped a canvas that ignored the theme; **a hosted 3D scene fails this by default — §3.6.1(3)** |
| **C5** | — | not a check: the whole run happens again at `?lang=de`, because German is the long-word language and that is where C3 lives |

Already-shipped defects are listed in the gate's own `KNOWN[]` array with their evidence: they print
as `known`, do not fail the run, and any entry that **stops** reproducing is reported so it can be
deleted. There are 7 of them today, waived across 52 cells. **A finding that is not in that list
fails the run** — so if your tool turns the gate red, it is your tool.

Take the two older rules from it into your own checking as well:

- **Two viewports, minimum, always.** A gate at one width is a hole. The v3.2.1 release exists
  because a regression lived below `md`, where the single-width gate could not see it.
- **A control the pointer cannot reach is broken**, whatever the DOM says. Check the ones you drew
  yourself the same way.

**Add your tool to `fwgate.mjs`'s `TOOLS` list — one line, `['mytool.html', 'what it exercises']`.**
Not because your tool needs watching, but because the *framework* does: the gate's job is to fail
when a framework change breaks a tool, and a tool that is not in the list is a tool nobody will
notice breaking. All four tools of the 2026-08 cohort added their line; none of them found the
instruction in this guide, because it was not here. (`weldsymbols.html`: "§8.2 describes the fwgate
rules but never says a new tool should be added to its TOOLS list.")

### 8.3 A probe and a parity baseline

Even for a brand-new tool, write the probe and capture the baseline **on the day you ship**. It is
the specification of "no number changed" for everyone who touches the tool after you.

> **Two rules the 2026-08-21 sweep bought the expensive way.** The first full run of all 51 stored
> baselines found **11 failing**, and ten of the eleven were simply **stale** — the tools produce
> byte-identical records under the framework version before and after, and are stable across repeated
> runs. A baseline nobody recaptures stops being a safety net and becomes noise, and a maintainer
> who cannot tell a regression from the backlog stops running the check.
>
> 1. **Recapture your baseline whenever you deliberately change a number**, in the same commit, and
>    say in the message which numbers moved and why.
> 2. **Nothing derived from a clock, a frame count or wall time may enter `record().outputs`.**
>    `reactorstand` is the eleventh failure and the only one that is not stale: its `t_model` read
>    10.131 / 10.295 / 10.29 across three runs. No baseline can ever hold it, so its parity check has
>    silently meant nothing since the day it was written. If your tool has a simulation clock, keep it
>    in `state` and out of the record, or quantise it.

```json
{
  "file": "mytool.html",
  "settle_ms": 400,
  "tolerance": 1e-9,
  "set_state": { "d": "d", "lambda": "lambda", "Ti": "Ti" },
  "cases": [
    { "d": 0.30, "lambda": 0.90, "Ti": 293.15 },
    { "d": 0.08, "lambda": 0.024, "Ti": 293.15 },
    { "d": 2.00, "lambda": 5.00,  "Ti": 333.15 }
  ]
}
```

`set_state` maps a case key to a state path (`set` maps to a CSS selector instead, for a page with
no framework state). The comparison surface is `Diagram.record.build().outputs` — the honest one,
because it is what the PDF, the CSV, the JSON and the Python export all read. Six to twelve cases:
the defaults, each example, one at each end of the validity range, and one in every branch the model
switches on.

Four practical facts, each of which cost somebody an hour:

- **`parity.js` and `check.js` call `chromium.launch()` with no `executablePath`.** Export
  `PLAYWRIGHT_BROWSERS_PATH` before you run either, or they fail to find a browser.
- **A case value may be an array or an object.** `set_state` goes through `DiagramUI.pathSet`, so a
  tool whose state is a collection — a list field, a drawing — can be driven case by case.
  `trussframe.html` ships whole node and member arrays this way.
- **Include the refusals.** A model with branches that decline to answer must have one case per
  refusal branch; `trussframe.html`'s 13 cases are 9 solvable and 4 unsolvable (mechanism,
  indeterminate, singular, degenerate geometry), and those four are the ones a later change is
  most likely to break silently.
- **`parity.js` aborts with exit 3 if `record()` is `null` at load.** See §6.2 before you decide
  what your `record()` returns before the first interaction.

### 8.4 `catalog.php`

Run it. Two classes of finding:

- **`errors`** — the tool is **not listed at all**: an unparseable manifest, `file` not matching the
  real filename, a missing required field, a missing declared dependency, a missing benchmark
  artifact, `benchmarked` without a passing benchmark, a language key absent from the six.
  Your tool must produce **zero**.
- **`warnings`** — the tool stays listed and carries the flag: an inaccurate `network_access`,
  `report.pdf` without `diagram-common.js`, a `handoff.accepts` entry outside the vocabulary, a
  `python_export.requires` entry, `python_export.supported:false` with no reason. Every warning your
  tool raises must be one you can name and intend to fix.

Then open `index.html` and `validation.html` and confirm the tool appears in the intended category
and its real validation row, **without editing either file**.

**Unless your manifest says `listed:false`** — in which case that last step is not available and you
should not go looking for it. `catalog.php` validates an unlisted manifest in full and *then*
`continue`s before emitting the entry, so the tool can never appear in `tools[]`, in `index.html` or
in `validation.html`. The only provable statement for an unlisted tool is **"zero errors, zero
warnings attributable to me"**: run `catalog.php`, check the total error count is 0, and check that
every remaining warning names a different file. (`flangejoint.html` found this; three of the four
2026-08 tools were unlisted and all three reported the same three pre-existing `status_understated`
warnings on other files.)

### 8.5 The manual list

- [ ] `DiagramUI.check()` clean at 1440, 1120, 768 and 390 px;
- [ ] with the data file blocked: shell renders, `#dgc-bar` has children, results say why;
- [ ] **six-language load**: open `?lang=en`, `uk`, `de`, `nl`, `fr`, `es` and read every visible
      string on each, including units, chart labels, verdicts and derived sentences;
- [ ] **switch language in place and count the furniture**: every panel, stage, tab strip, wizard
      step, examples list and notice is still there, exactly once, and the last result is still on
      screen;
- [ ] permalink round-trip: set a state, copy the link, open it in a new tab, identical state;
- [ ] PDF prints, `Source:` on every page including a paginated one, figures present;
- [ ] Python export runs on a bare `python3` and its self-test passes;
- [ ] handoff: send to a receiving tool, values arrive in SI;
- [ ] light, dark and auto all render, and the shared chrome matches the tool in each;
- [ ] nothing unreachable at 390 px; the answer is on the first screen;
- [ ] exactly one `h1`, exactly one status statement;
- [ ] the tour completes with the keyboard and never covers its own target;
- [ ] a collapsed panel measures 0 px, remembers its fold, and opens itself on a validation error;
- [ ] first undo after a field edit returns the value from *before* that edit;
- [ ] no `localStorage` key outside `dgu.<toolId>.`;
- [ ] with `diagram-ui.js` blocked: `#dgc-bar` has children, `__diagramReady` is true, one `h1`,
      and `Diagram.record.build()` still returns a populated record (§1.3, §7.2);
- [ ] `grep` your file for `createElement`, `innerHTML`, `getElementById` and `<style>`. Every hit
      is either your own drawing or a defect. The template has **three** DOM calls and **no**
      `<style>`; that is the target, not an aspiration.

      Four exceptions the rule must forgive, because the framework requires them. Count them and
      move on; do not contort the file to avoid them:
      `document.addEventListener('DOMContentLoaded', boot)` (§13's skeleton mandates it),
      `document.title` and the `h1`/sentence in `degrade()` (§7.2 mandates them),
      `getComputedStyle(document.documentElement)` for theme tokens in a canvas render (§5.4
      mandates it), and `canvas.toDataURL` to put a drawing in the PDF (§6.5 mandates it).
      Report your count **split by API**, the way the four 2026-08 tools did, rather than one
      number: "createElement 0, innerHTML 0, appendChild 0, plus 5 document touches, named" is a
      statement a reviewer can check. `flangejoint.html` raised this: "the rule flags a hit that
      cannot be removed";
- [ ] the `localStorage` rule means **keys you write**. After a full session the page will also hold
      `diagram_lang`, `diagram_theme`, `diagram_units` and `diagram_learn_<id>` — all written by the
      framework and by `site-disclaimer.js`, none of them yours. Check the list, do not check the
      count.

---

## 9. What the framework does NOT do

Design around these. Discovering them at the end is how a two-day tool becomes a two-week tool.

**No layout of your own.** The archetype owns the grid. There is no way to make the flexible track
draggable, no way to add a region, no way to reorder the columns, and no 100 vh app frame with
per-pane scrolling — that shape is prohibited outright, and `scrollRegion` is what you get instead.
`wizard` has no wide report area; `reference` has no `inputs`. A region an archetype does not name
is not refused — it becomes an implicit grid track, a phantom column, silently.

**No component for these, today:**

| Wanted | Status |
|---|---|
| a multi-select field (N of M, checkbox group, chip picker) | **not built.** Five tools hand-build it. `toggle` is one boolean; `select`/`segmented` are one value |
| ~~a range + editable-number composite; a value formatter on a range~~ | **built 2026-08-21 (v3.4)** — `editable:` and `format:` on a range field, §5.2 |
| a continuous colormap and a gradient legend | **deliberately never.** A data ramp is yours |
| HTML-string table cells | **deliberately never.** `{node: Element}` covers it without an `innerHTML` sink |
| a card grid, a picker dialog, an editable table | not built. Use `ui.dialog()` with your own body |
| a sheet/overlay for "filters behind one control" below `md` | **still open.** The `reference` rail splits at `md` and there is no sheet primitive |
| tabs mounted *inside* a panel | not built. Tabs mount into a region |
| a sticky table header inside a bounded scroll box of your choosing | only with `maxHeight`; a panel may not scroll |
| parking `#dgc-bar` / `#eng-disc-badge` across a rebuild | not built |
| ~~a `key:` on the imperative constructors so a rebuild hands the same object back~~ | **built 2026-08-18** — `key:` + `app.byKey`, §5.11 |
| a repeater | **built in v3.2** — `type:'list'`, §5.3 |
| ~~a read-only or derived cell inside `type:'list'`~~ | **built 2026-08-21 (v3.4)** — `type:'derived'`, §5.3 |
| a selectable results-table row (`onSelect`, or a `selected` id reported back) | **not built, and now at four tools with a measured cost.** The `actionButton`-in-a-cell workaround is destroyed by the very `on.compute` its own click triggers; focus falls to `<body>`. §5.5.1.1(1) is the four-line workaround every reference tool now writes identically |
| a unit symbol in a **table head cell** | **not built, and not possible today.** `.dgu-table th` is `text-transform:uppercase`, so §5.5's advised `{label:'N·m'}` renders `N·M`; measured `MPA` and `KN`. The head vocabulary has no `node` and no opt-out |
| one Clear button in the no-match state instead of two | **not built.** With one chip and `filter.shown === 0` the framework draws Clear-all and the empty state's Clear, same label, same callback, 40 px apart. Both halves are new in v3.4, so nothing shipped depends on the pair — this is a one-line repair nobody has made |
| a keyboard path for a `scene:` stage | **not built.** `DiagramUI.scene.keys` is read by `Interaction`, which `scene:` never constructs, so a hosted 3D scene is mouse-only. Four tools have the hole. §3.6.1(2) |
| theme tokens, six languages, a 44 px floor or unit-aware fields **inside** `diagram-scene3d.js` | **not built, and outside `diagram-ui.js`.** The library predates all four. Hosting it faithfully (§3.6) does not modernise it; §3.6.1 is the list of what you must write instead |
| a control in `searchHost` | **not built.** The framework creates a `<div>` and the library binds `input`/`.value` to it — one of the six advertised hosts is dead on arrival. §3.6.1(5) |
| `displayBound()` on a `range` field's `min`/`max` and on the v3.4 `editable:` box | **not built, on purpose.** Eleven shipped sliders are calibrated against the current behaviour and repairing it would move their numbers. §5.2 has the only honest workaround |
| ~~an answer surface for `reference` — a verdict, a count, a freshness state, `learn.intro`~~ | **built 2026-08-21 (v3.4)** — `filter:` and `entry:` in the compute payload, §5.5.1 |
| a repeating **content** component (a catalogue of N entries) | not built. `type:'list'` is an input repeater. `app.table()` with `{node:…}` cells is the substitute |
| a small self-sizing, theme-aware canvas that is not a `Stage` | not built. `weldsymbols.html` re-implemented dpr sizing 33 times per repaint for its thumbnails |
| ~~a pointer/hit-test/world-transform primitive on the stage~~ | **built 2026-08-21 (v3.3)** — `interact:` on the stage. §3.5, and §3.7 for the one keyboard scheme |
| ~~a way to host `diagram-scene3d.js` / `diagram-scene-editor.js`~~ | **built 2026-08-21 (v3.3)** — `scene:` on the stage, §3.6. Hosted, not reimplemented |
| a marquee / multi-selection in a drawing | **not built, on purpose.** `diagram-scene3d.js` offers it and none of the five scene tools use it — all three `AuthoringShell` tools pass a single primary id. Below the three-tool bar |
| a transform gizmo (move/rotate/scale handles in the drawing) | **not built, on purpose.** `roomacoustics` only — one tool |
| rectangle and polygon hit shapes | **not built, on purpose.** `debrisrunout` (AABB) and `outdoornoise` (poly) — two tools. `hit:` is the escape hatch (§3.5) |
| a `slot:` on `ui.examples()` | not built — it hard-codes `inputs`, so `reference` and `studio` cannot offer presets |
| a panel `title:`/`note:` that follows the state | not built. Fields have label/unit thunks; panels do not |
| a language argument on `report.sections(rec)` | not built; pick it yourself (§6.5) |
| a key/value definition list that wraps | not built. Use a two-column table with `wrap:true` (§5.5) |
| an export of the **drawing** (PNG/SVG) from the shared bar | not built. The bar exports the record; put the picture in `report.sections` |

**No selection, context menu or palette primitives yet.** `History` and `Splitter` have landed in
`diagram-ui.js`; `Selection`, `ContextMenu` and `renderPalette` are still in
`diagram-scene3d.js` and are re-exported there.

**No screen-reader, second-browser or touch verification behind any accessibility claim.** Every
`role`, `aria-valuetext` and live-region announcement in the framework is a DOM assertion made in
one Chromium build. Attributes were asserted; announcements were not heard.

**No locale-aware number formatting.** `DiagramUI.fmt` groups thousands with a space and always
writes `.` as the decimal separator, in every language. A tool that must show `12,34` to a Dutch
reader formats it itself — and should think twice: `flangejoint.html` decided against it, on the
grounds that "formatting my own numbers differently from every other tool would be worse than the
inconsistency". Report it; do not diverge alone.

**No guarantee for a nested state reference.** `App.state` keeps top-level identity across
`reset()`/`example()`; a reference you hold to an object *inside* state does not survive.

**One thing the framework does that you might not expect:** it publishes the token layer, repairs
the shared-chrome safe area and makes `#dgc-bar` transparent to pointer events on **every page that
loads the file**, whether or not `DiagramUI.app()` is ever called.

---

## 10. The traps — mined from 49 real ports

Every one of these was found the expensive way by at least three tools. They are ordered by what
they cost.

### 10.1 Deciding the units after the record is published

**Twenty of the forty-nine tools could not adopt the unit registry.** Not one of them was wrong to
refuse: their records, permalinks and Python exports already published MPa, °C, mm, kVA, m³/h, hPa,
g/kg, pcm, wt%C. Changing the stored value would have moved every exported number and broken
every permalink.

You have a freedom they do not. **Store SI from the first line** (§4.2). If you genuinely must
publish a non-SI record — the standard your tool implements is written in kPa and its readers expect
kPa — then decide it now, write it in `record.units`, pin every field with `display` equal to its own
unit so no unit-system control appears, and say so in your notes. What you may not do is start
loosely and tidy it up later: after the first permalink is shared, "later" is gone.

Second-order trap, from the code rather than the reports: a `display` unit that is not in
`UNIT_TABLE` relabels without converting, silently. §4.2.

### 10.2 Assuming `validate` annotates

**Six tools discovered that `Field.commit()` refuses to write the state when `validate` fails**
and abandoned field-level validation to keep their models' behaviour; two more refused to declare
`min`/`max` for the neighbouring reason, that the framework clamps at the control while their own
code clamps *and records the correction*. `cablesizing` keeps 24
validation messages as a tool-level list. `RWA_calculator`, `verwarmenkoelenselector` and
`waterhammer` say the same in different words: the unported page computed with the out-of-range
value and warned; the framework would refuse it, which changes what the tool accepts and what the
record contains.

For a new tool this is a design decision, not a defeat — but it is a decision, per field, and it
belongs in step 3, not in step 5. Clamp, refuse, or compute-and-warn (§5.2). And whichever you
choose, remember that `record.inputs` reports what is in state: a clamped input is a different
number from the one the user typed, and one shipped tool prints the raw entry in the record while
clamping inside the model — a disagreement nothing but a human reading both will catch.

### 10.3 Choosing an archetype that has no answer surface

**Fixed in v3.4 for `reference`; still true for the rest of the family. Read it anyway — the lesson
is the one that generalises.** Four tools found that `layout:'reference'` built no results view at
all. `periodictable`: "`App.build()` creates no Results view when layout is `reference`, so
`ui.results()` returns null and `on.compute`'s return value is discarded". `hydraulicsolutions` lost
tiles, verdict and the freshness states the same way, and its `learn.intro` with them, because the
intro renders only inside the results region's empty state. `weldsymbols` counted the bill:
"every one of 33 catalogue rows had to be appended by hand — the extra 11 DOM calls are all the same
defect in the framework, not eleven different ones." Since v3.4 a `reference` tool has a real answer
surface (§5.5.1). `kernnormenwijzer` additionally found that `ui.examples()` always inserts into
`inputs`, which the reference grid does not define — a panel in an implicit track. **That one is
not fixed**, and neither is any other panel you send to a region the archetype does not name.

Two more of the same family: `luchtbalans` found that in the `studio` grid `dock` renders **above**
`results`, so anything docked pushes the KPI tiles down; `cfd` and `outdoornoise` found that no
mobile result strip is rendered for `studio` at all. `pipesupports` is the third report of the last
one and the first to measure it: at 390 px in German its stage starts at **y = 195** and its first
result tile at **y = 2788**, in an 844 px viewport — the verdict of a layout tool 3.3 screens below
the layout it is judging.

**v3.4 gave `reference` an answer and did not give it a place to be seen.** `renderStrip()` returns
early for `reference` as well, and the single-column order is `nav, stage, results`: measured at
390 px, `fastenergrades`' entry card starts at **y ≈ 1225**. So the archetype's own answer is now the
thing a phone reader must scroll furthest for — the same defect the strip was built to fix for
`calculator`, in the two archetypes the strip skips.

The lesson is §3.3: **the archetype decides which regions exist**, and the cost is paid at the end,
when the answer has nowhere to go. Run the decision test, then read what that archetype does not
have, before you write a panel.

### 10.4 The rest, in one line each

- **`Diagram.init` inside a `.then()`** — the shared bar, the permalink and the disclaimer die with
  the data file, and `window.__diagramReady` is never set, so every automated gate fails. Call it
  unconditionally.
- **Deleting the import half of a save-and-open pair** — five tools. The shared bar exports the
  *record*; it has never imported, and the record is an output, not an input. If your tool writes a
  scene file, ship `ui.importAction()`.
- **Re-creating furniture from `on.ready` to survive a language change** — obsolete since v3.1 and
  now dead code the replay guard fights.
- **A language outside the global site registry.** Do not put an arbitrary code in `catalog_languages` or `tool_languages`. The current allowed site registry is `en uk de nl fr es pl`; extending it is a framework change. A newly added supported site language is not an error merely because older tools do not implement it.
- **A `localStorage` key of your own** — five ports invented one and two were a rename away from
  colliding. `app.remember()`.
- **Re-theming a data colour ramp** — if the drawing is compared against a stored baseline, changing
  its colours is a numeric change.
- **Two status statements on one page** — the framework's freshness line is one; a second "state
  chip" of your own is a defect unless it means something genuinely different, and then it needs a
  sentence explaining why.
- **A `type:'custom'` field wrapping a `<select>` with `<optgroup>`** — no longer necessary;
  `type:'select'` takes `{group, options}` (§5.2).
- **Hand-building a track-and-fill bar, a swatch legend, a play/pause row, a collapsible group, a
  sticky warning, a preset wall, a repeater, a hidden file input** — all of these are framework
  components now (§5). Every one of them was hand-built by three or more tools before it existed.

---

## 11. When the framework is missing something

It will be. §9 is the honest list and it is not complete.

1. **Check §9 and the spec's §17.1 first.** Several gaps are deliberate and will not be filled: a
   colormap, HTML-string cells, a draggable flexible track, the 100 vh app frame.
2. **Keep it local, in a `render(box, ctx)` panel or a `type:'custom'` field**, styled from the
   tokens. That is a supported shape, not a failure.
3. **Write one line saying what the framework is missing**, in your notes and in the commit message,
   in words someone can quote. Three tools asking for the same thing is how the framework grows;
   one tool asking for it is a custom panel. `type:'list'`, meters, notices, legends, transports,
   collapsible panels, grouped options and file import all arrived exactly this way.

   Write it in three parts — **wanted / why / workaround** — and make the *why* a measurement, not
   an opinion. The 2026-08 cohort's reports were actionable because they read like
   "`.dgu-seg{overflow:auto;scrollbar-width:none}` — four options do not fit the 250 px studio
   palette in any of the six languages, and the overflow is silent", not like "the segmented control
   is too narrow". Nine framework changes shipped on 2026-08-18 off four such reports; the ones that
   shipped first were the ones that named the line of code.
4. **Do not patch `diagram-ui.js` from your tool.** If the framework is wrong, the repair belongs
   upstream. Eight defects moved upstream in v3.1 precisely because 43, 37, 28, 15, 12, 10, 9 and 3
   tools had each patched them locally instead. If you must patch locally to ship, mark it
   `UPSTREAM` — that marker is how the next release finds it.
5. **Do not re-implement a framework part because yours is nicer.** Two tab bars, two toast stacks
   and two dialog implementations are how the site got into this state.

---

## 12. Where the specification and the code disagree

`UI_FRAMEWORK_SPEC.md` revision 2026-08-21b against `diagram-ui.js` `2026-08-21.v3.4.0`. **Believe
the code.** Each of these was checked in the source, not inferred.

1. **`fmt` has no unit argument and is not locale-aware.** §11 documents
   `ui.fmt(value, unit, {precision})` with "locale-aware separators". The implementation is
   `fmt(value, {precision, group})`: it groups thousands with a **space** and always writes `.` as
   the decimal separator, in all six languages. Call it as `DiagramUI.fmt(v, {precision:3})`, and
   format it yourself if a comma decimal matters.
2. **The tick helper is not where §10 says.** The spec offers `ui.stage.ticks(range, px)`. The code
   publishes `DiagramUI.ticks(min, max, px, density)` (also `DiagramUI.Stage.ticks`). There is no
   `ticks` on the app's `stage` method.
3. **`type:'color'` and `type:'file'` do not exist.** Both are in the §6 type vocabulary; neither
   has a branch in `Field.buildControl`, so both fall through to a plain text input. Use
   `inputType:'color'` on a `text` field, and `ui.importAction()` instead of a file field.
4. **The shortcut router cannot see Space, and its own redo binding fires undo.** `Shortcuts.handle`
   builds the combo from `event.key.toLowerCase()` and compares against `keys.trim()`, so `' '` can
   never match — `heat2d` kept Space on its own listener for this reason. It also only prefixes
   `shift+` when `event.key.length > 1`, so the framework's registered `mod+shift+z` never matches
   and `Ctrl`/`Cmd`+`Shift`+`Z` triggers **undo**. `Ctrl`+`Y` redoes correctly.
5. **The unit-system control only sees declaratively-declared fields.** `hasConvertibleUnits()`
   scans `opts.panels` only, so fields added through `ui.panel()` after `app()` never bring up the
   header control, whatever they declare. §11 says the control appears "when the tool has at least
   one convertible quantity".
6. **The unit registry is nine SI bases, and an unknown `display` fails silently.** Not stated
   anywhere in the spec. See §4.2. Also: the default unit system is **`practical`**, not `si` — a
   field declaring `unit:'K'` with no `display` shows °C, and `unit:'Pa'` shows kPa.
7. **The return link is hard-coded English.** `buildHeader` writes `'← ' + (… ? 'Tools' : 'Tools')` —
   a dead ternary with the same string in both branches. §12 requires every string the framework's
   own furniture puts on screen to exist in all six languages. Reported by `periodictable`; the
   changelog lists it as still open.
8. **`fail()` sets a state the §8.2 state machine does not contain.** `App.fail()` puts the shell in
   `failed`; §7's table and §8.2 name `error`. Both render; nothing reads `data-state="failed"`
   except the results view.
9. **§3's `DiagramUI.app()` signature is incomplete.** It omits `state`, `defaults`, `panels`,
   `footer`, `subtitle`, `strings`, `history`, `debounce`, `density` and `results:false`, all of
   which the implementation reads and most of which the worked example uses — despite §0's rule that
   "a component that is not documented here does not exist as far as a port is concerned". §5 of this
   file lists what the code actually accepts.
10. **`NEW_TOOL_TEMPLATE.html` claims a Python export it does not provide.** Its manifest declares
    `python_export.supported: true` and its `Diagram.init` passes no `python:`, so
    `diagram-common.js` never adds the button and `pythonEmit()` returns `no python provider`. The
    template is otherwise sound **except for two things measured on 2026-08-18**: it fails
    `check.js --block '**/diagram-ui.js'` at all four viewports (`#dgc-bar missing`), because it
    copies the pre-2026-08-18 skeleton — see §1.3; and its "Where the resistance is" table printed
    `— | 0.130 | 25.8 | 7.7` in all six languages, because §5.5's worked example put a `T()` object
    straight into a cell. The framework side of the second is repaired; if the template on disk still
    shows either, treat this guide's §1.3 and §5.5 as the source of truth, not the template.
11. **`report.sections(rec)` is called with no language argument**, although the renderer picks a
    language for everything else. Pick it yourself — §6.5.
12. **A `select` field never converts units.** `Field.commit` converts for `number` and `range`
    only. §11 of the spec does not distinguish them — §4.2 here does.

13. **`layout:'reference'` also puts a visible region in an area its grid does not define.**
    `hydraulicsolutions` ships a panel in `inputs`, which the reference template does not name, so
    it lands in an implicit track. Nothing warns. Since v3.4 the framework's own answer surface
    refuses a slot the archetype does not define and falls back to `results`; a **tool's** panel
    still goes wherever it is told. Check `regions` in the DOM before you ship.

14. **`Diagram.python.emit()` does not return what §6.4 implies.** `emit()` returns the code
    **string**; `Diagram.python.info()` is the one that returns `{code, covers, scoped}`
    (`diagram-common.js:1236`). Reading `r.code` off `emit()` gives `undefined`, and a JSON-quoted
    string handed to `python3` **exits 0 and prints nothing** — a silent pass. Cost one author a test
    cycle, and would have cost a reader who did not check the output their belief that the export
    ran.
15. **`minDisplay`/`maxDisplay` are read only by the `number` branch.** §6.1 says a range field's
    bounds are in SI; the guide until 2026-08-21 told you to declare the display pair to fix it, and
    it does nothing — `Field.buildControl`'s `range` branch and the v3.4 `editable:` box never call
    `displayBound()`. §5.2 has the workaround.
16. **`.dgu-table th` is `text-transform:uppercase`.** Not stated anywhere. It makes §5.5's advised
    unit head cell wrong for every unit whose case carries meaning. §5.5.1.1(2).
17. **§3.7's keyboard scheme is documented as covering "every drawing on the site" and covers
    `interact:` only.** A `scene:` stage never constructs an `Interaction`, so nothing in a hosted 3D
    scene is reachable without a mouse. §3.6.1(2).
18. **§7.6's "a new tool should ship zero bytes of CSS" and §3.6 contradict each other.** Declaring
    `scene:` makes the framework call the library's `ensureAuthoringStyles()`, which injects ~3 kB of
    `<style>` with 31 hex literals and no tokens. Your file still has 0 bytes; the page does not.
    Neither section mentions it. §3.6.1(6).

Two things the spec already admits, repeated here because they will bite you: a **range** field's
`min`/`max` are written in SI onto a control operating in display units (§6.1) — still true in v3.4,
because eleven shipped sliders depend on it, **and `minDisplay`/`maxDisplay` do not fix it** (item 15
above) — and `rebuild()` cannot hand a tool back its objects (§3.1), which is now answerable with
`key:`/`app.byKey`, §5.11.

**Nine framework repairs landed on 2026-08-18**, all of them from the four new tools' reports:
a language object is a legal table cell; `wrap:true` on a cell or head; `<html lang>` at boot; a
Stage repaints on a theme change; `key:` + `app.byKey` on every imperative constructor; a predicate
`disabled` on a panel action; `DiagramUI.units.register()`; a refused value opens the collapsed panel
that holds it; a segmented control wraps instead of scrolling out of sight. Where this file describes
any of them, this file is current and the spec revision above predates them.

**Four more landed on 2026-08-21 (v3.4)**, from the same cohort's reports: the `reference` answer
surface with `filter:` and `entry:` (§5.5.1); `type:'derived'` in a list row (§5.3); `editable:` and
`format:` on a range field (§5.2); and `ui.results()` with no argument reads instead of clearing.

**Two more surfaces landed the same day (v3.3)**: `interact:` and `scene:` on a stage declaration
(§3.5, §3.6). Items 14–18 above are the second cohort's findings against the result. **None of them
has been repaired**; every one is a real defect with a measured cost, and every one is listed in §9
so the next release can pick them up in order.

---

## 13. The skeleton

Everything above, in the order it goes in the file. Nothing here is optional except where marked.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flat wall heat loss</title>
<script type="application/json" id="diagram-tool-manifest">
{ …§2.1… }
</script>
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js"  defer></script>
<script src="diagram-ui.js"      defer></script>
</head>
<body>
<div id="app"></div>
<script>
(function () {
  'use strict';

  /* ---------------------------------------------------------- 1. the model */
  function solve(s) { … }                        // pure. returns every displayed quantity
  var DEFAULTS = { … };                          // SI
  var state = JSON.parse(JSON.stringify(DEFAULTS));
  var last = null;

  /* ------------------------------------------------------ 2. the interface */
  function T(en, uk, de, nl, fr, es) { return { en:en, uk:uk, de:de, nl:nl, fr:fr, es:es }; }
  var stage = null;
  function adoptStage(app) { stage = app.stages[0] || null; if (stage) stage.legend({items:…}); }

  var ui = null;

  /* The framework-absent path. The ONLY place this file touches `document`.
     It does not return early: installData() runs on both paths — see §1.3. */
  function degrade() {
    document.title = 'diagram-ui.js v1 is required';
    var h = document.createElement('h1');
    h.textContent = 'Flat wall heat loss';
    var p = document.createElement('p');
    p.textContent = 'The interactive interface could not load. The export, the record and the '
                  + 'limitations are still available from the bar at the bottom of the page.';
    document.getElementById('app').appendChild(h);
    document.getElementById('app').appendChild(p);
    last = solve(state);                         // so the record and the export stay truthful
  }

  function buildInterface() {
    ui = DiagramUI.app({
      id:'flatwall', mount:'#app', layout:'calculator', compute:'live',
      state: state, defaults: DEFAULTS,
      subtitle: T(…),
      notices: [ { id:'genre', tone:'warn', sticky:true, title:T(…), text:T(…) } ],
      learn:   { version:1, intro:{title:T(…), body:T(…)}, topics:{…}, tour:[…] },
      panels:  [ { id:'wall', slot:'inputs', title:T(…), fields:[ … ] }, … ],
      footer:  T(…),
      on: {
        rebuild: adoptStage,
        compute: function (s) {
          last = solve(s);
          if (stage) stage.schedule();
          return { verdict:{…}, tiles:[…], meters:[…], tables:[…], notes:[…] };
        }
      }
    });

    ui.panel({ id:'io', slot:'inputs', actionsAlign:'end',
               actions:[ ui.importAction({…}), ui.resetAction() ] });
    ui.examples([ … ]);
    ui.stage({ caption:T(…), minHeight:260, a11y:function(){…}, render:function(size, st){…} });
    adoptStage(ui);

    ui.ready();                                  // or: after the data load resolves
  }

  function boot() {
    if (window.DiagramUI && DiagramUI.api === 'tools.petrov.re/ui/v1') buildInterface();
    else degrade();
    installData();                               // ALWAYS. Both paths. §1.3
  }

  /* ------------------------------------------------------ 3. the record */
  function installData() {
    if (window.Diagram) {
      Diagram.init({
        id:'flatwall', file:'flatwall.html',
        state:  { serialize:function(){ return state; },
                  deserialize:function(o){ Object.assign(state, o||{}); last = solve(state);
                                           if (ui) { ui.sync(); ui.run(); } } },
        record: function () { return last ? { inputs:…, outputs:…, units:…, model:…, warnings:… }
                                          : null; },
        python: function () { return { code:…, requires:[], basis:{…}, selftest:{…} }; },
        handoff:{ provides:[…], accepts:[…], build:…, apply:… }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  /* This listener is mandatory, and it is the one `addEventListener` §8.5's grep must forgive. */
})();
</script>
</body>
</html>
```

With a data file, the middle changes only in that `ui.ready()` moves:

```js
    fetch('flatwall-data.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { install(d); ui.ready(); })
      .catch(function ()  { ui.fail(T('The reference data file could not be loaded.', …)); });

    Diagram.init({ … });     // still here, still unconditional, outside every then/catch
```

`installData()` is unchanged by a data file: it runs before the fetch resolves, and `record()`
returns `null` until it does.

---

## 14. Definition of done

- the manifest parses, `catalog.php` reports **zero errors** for the file and only warnings you can
  name;
- `node check.js mytool.html` is clean at 1440, 1120, 768 and 390 px, and clean again with the data
  file blocked;
- `mytool.probe.json` and `mytool.parity.json` exist and are in the commit;
- all six languages render every visible string, and switching language in place keeps the furniture
  and the answer;
- the permalink round-trips, the PDF carries `Source:` on every page, the Python export runs on a
  bare `python3` and passes its self-test, the handoff arrives in SI;
- the file contains no `<style>`, no colour or spacing literal, no `h1`, no export button, no
  language switcher, no theme button, and no `localStorage` key outside `dgu.<toolId>.`;
- **the file contains no `window.print()`, no `@page` rule and no `@media print` block for anything
  the framework created** (§6.6, spec §21). Press `Ctrl`+`P` and confirm it produces the report, not
  the screen; then use File → Print and confirm the fallback sheet carries the running header, the
  source URL and the page number on every page;
- `node check.js mytool.html --block '**/diagram-ui.js'` is clean, and with the framework blocked
  `Diagram.record.build()` still returns a populated record;
- one line for the tool in `/root/harness/fwgate.mjs`'s `TOOLS` list, and `fwgate.mjs` is GREEN;
- the manifest says `"ui": {"framework":"tools.petrov.re/ui/v1","level":3}` and means it;
- the status is the one you can defend, and the limitations text names the real modelling boundary.

Write, in the commit message: what the tool computes, what it deliberately does not model, which
framework component you wanted and did not find (wanted / why / workaround — §11), and any place
where this document was wrong.

---

## 15. What six newcomers actually hit

**§15 is the first cohort; §15.1 is the second.** On 2026-08-18 four authors built four tools — a `calculator` with a repeating list
(`flangejoint.html`), a `studio` with direct manipulation (`trussframe.html`), a `reference`
catalogue (`weldsymbols.html`) and a branching `wizard` (`damperselect.html`) — from this document
alone, forbidden to open any existing tool's source. All four shipped working: `check.js` clean at
four viewports and again with `diagram-ui.js` blocked, `catalog.php` zero errors, `fwgate` GREEN,
parity baselines captured, six languages each.

Every quotation in this guide comes from their reports. The table is here so you can see the shape
of the risk before you meet it: **what the guide got wrong tends to be silent**, and the gates do
not catch it.

| What was wrong or missing | Authors who hit it | What it cost | Now |
|---|---|---|---|
| §13's skeleton `return`ed out of `boot()` when `diagram-ui.js` was absent, so `Diagram.init` never ran | **4 of 4** | every one of them shipped the skeleton's shape, failed the required gate at all four viewports, and restructured. `NEW_TOOL_TEMPLATE.html` failed it too | §1.3, §7.2, §13 rewritten |
| a `T()` object in a results-table **cell** rendered `—` | **3 of 4** | shipped by two of them into every row of a table, in all six languages; caught by reading a screenshot, not by a gate | fixed in the framework; §5.5 |
| `layout:'reference'` had **no answer surface at all** — `ui.results()` null, `on.compute`'s return discarded, `learn.intro` never rendered | 1 of 4 built one, and 3 shipped tools were already living with it | "every one of 33 catalogue rows had to be appended by hand — the extra 11 DOM calls are all the same defect in the framework, not eleven different ones" | built in v3.4; §5.5.1 |
| `type:'list'` had no read-only or derived cell | **2 of 4**, independently | both rendered the same rows twice on one page: "the number the user is reasoning about is 40 cm away from the number they are typing" | built in v3.4; §5.3 |
| where non-input state lives — a wizard step, a display preference, a selection | **3 of 4** | three different answers invented independently | §4.4, new |
| what `record()` returns for a partial, deferred or lookup answer | **3 of 4** | one of them found `parity.js` exits 3 on a null record and had to reconcile it alone | §6.2 |
| §5.11's "re-point in `on.rebuild`" is too late for anything that paints | **3 of 4** | one shipped a tool that came back **empty** after a language change; another's canvas listeners died with the Stage; a third's step marker detached | rule boxed in §5.11; `key:`/`app.byKey` built |
| the real shape and language of a `report.sections` entry | **3 of 4** | all three read `diagram-common.js` | §6.5 |
| table cells never wrap | 2 of 4 | prose relocated; three tables clipped in a 340 px rail | `wrap:true` built; §5.5 |
| no way to register a unit — nine SI bases, no force, torque, stress or area | 2 of 4 | one monkey-patched `DiagramUI.units.table`; one shipped newtons where its readers write kilonewtons | `units.register()` built; §4.2 |
| §0.1 named two files that appeared not to exist | 1 of 4 (all four worked without the spec) | §12 taken on trust, unverifiable | paths corrected in §0.1 |
| `<html lang>` was not set on arrival | 1 of 4 noticed; **3 of 4 shipped it wrong**, and so did `ui-demo.html` and the template | invisible; correct German text inside `lang="en"` | fixed in the framework; §7.1 |
| a segmented control that did not fit was silently invisible | 1 of 4 | a palette lost its fourth tool in English and would have lost more in German. The shipped pilot `decayheat.html` was hiding 4 of 7 buttons at 390 px and no gate had seen it | it wraps now; §7.5 |
| `Field`'s `get`/`set` accessors were undocumented | 1 of 4 found them | "Without reading the library I would have hand-built the inspector and lost units, learn dots, clamping and the a11y wiring" | §5.2 |
| §5.1's "a collapsed panel opens itself on invalid" was not true | 1 of 4 measured it | reported rather than patched around | fixed in the framework; §5.1 |
| §8.4's "confirm the tool appears in `index.html`" is impossible for `listed:false` | 1 of 4 | an unprovable checklist item | §8.4 |
| §8.5's grep rule flags the `DOMContentLoaded` listener the skeleton mandates | 1 of 4 | a rule that cannot be satisfied | §8.5 |

**How much they had to read outside this guide.** All four read `diagram-ui.js` heavily, which §0.1
sanctions. Beyond that, three of four read `diagram-common.js`, all four read `check.js`, three read
`parity.js`, three read `catalog.php`, and one read `fwgate.mjs`. Not one of them opened another
tool's `.html` — the constraint held. `trussframe.html` named the three moments it wanted to and
could not, and all three are now answered in this guide: how another `studio` wires a click on a
drawing (§5.4 — nobody does, there is no primitive), whether anyone had solved "a form bound to the
selected object" (§5.2 — `get`/`set`), and where other studios put their palettes (§3.2, §5.4).

**The honest reading of this table:** a newcomer can ship a correct tool from this document, and
four of them did. But three of the four also shipped a silent defect they never saw, and the fourth
avoided them only by reading the library first. Where this guide is *silent*, the cost is a day of
source reading. Where this guide is *wrong*, the cost is a shipped bug — because the gates check the
shell, the record and the numbers, and none of them reads a sentence in a table cell. When you find
the next one, write it down in the form §11 asks for, and it will be here for the person after you.

### 15.1 What two more newcomers hit — the 2026-08-21 cohort

The two surfaces built that week — `interact:`/`scene:` (§18 of the spec) and the `reference` answer
surface (§19) — were then handed to two more authors under the same rule: build a tool from this
document alone, open no existing tool's `.html`. `pipesupports.html` is a `studio` with a hosted 3D
scene; `fastenergrades.html` is a `reference` lookup. **Both shipped working**: `check.js` clean at
four viewports and again with `diagram-ui.js` blocked, `fwgate` GREEN, `catalog.php` zero errors,
parity baselines captured, all six languages read end to end, **0 bytes of tool-owned CSS each**. The
constraint held: neither opened a tool file, and each named the three moments they wanted to and did
not.

That is the good half. The other half is that **every gap they found is on the seam between the new
surface and something older than it.**

| What was wrong or missing | Which author | What it cost | Now |
|---|---|---|---|
| §0.1's `UI/tools/check.js` / `parity.js` paths do not exist in the deployment tree, and `fwgate.mjs` had no path at all | both | a `find /root -name check.js` each; the same class of error §15 above already records for the spec | §0.1, absolute paths and `fwgate.mjs` named |
| a six-language label object inside `scene:` prints `[object Object]` — and **fwgate C1 fails the page for it** | `pipesupports` | ~24 lines of `LT()` thunks for 40 strings, and a rule to remember for every string ever added | §3.6.1(1) |
| §3.7's "ONE keyboard scheme for every drawing" does not reach a `scene:` stage — a hosted scene is **mouse-only** | `pipesupports` | ~35 lines, and the tool ends with two object pickers where the framework should have one. Fourth report of this hole | §3.6.1(2), §3.7 boxed, §9 |
| the hosted 3D canvas repaints on a theme change and draws the **same hard-coded colours**, so **fwgate C4 fails** | `pipesupports` | two `defineProperty` accessors, per-frame token reads, and a `render:` overlay to make object labels legible on a light page | §3.6.1(3)(4) |
| `searchHost` is a `<div>` and the library binds `input`/`.value` to it — one of six advertised hosts is dead | `pipesupports` | shipped no search | §3.6.1(5), §9 |
| declaring `render:` silently stops the scene painting itself | `pipesupports` | read `Stage.schedule` to find out | §3.6.1(4) |
| a selectable catalogue row destroys its own button inside its own click handler; focus falls to `<body>` | `fastenergrades` | four lines, which **every** reference tool will now write identically. Fourth tool to ask for the surface | §5.5.1.1(1), §9 |
| `.dgu-table th` is uppercase, so §5.5's advised unit head cell renders `MPA` / `KN` | `fastenergrades` | six head cells rewritten as words plus a per-language note under the table | §5.5.1.1(2), §9, §12.16 |
| §5.2's "declare `minDisplay`/`maxDisplay`" **has no effect on a range** | `fastenergrades` | would have shipped a slider running 0…1.1e9 in MPa; the field lost its unit slot instead | §5.2 rewritten, §12.15 |
| the no-match state draws **two** identical Clear buttons | `fastenergrades` | shipped the duplicate — there is no workaround that leaves both states correct | §5.5.1.1(3), §9 |
| a panel with no `slot:` defaults to `inputs`, which `reference` does not define | `fastenergrades` | a phantom grid track, silently | §5.5.1.1(4) |
| `ui.resetAction()` cannot go in `panels:[…]`, and building the panel imperatively costs §12.5 | `fastenergrades` | one filter panel moved out of the declaration | §5.5.1.1(5) |
| `Diagram.python.emit()` returns a string, not `{code,…}` — the wrong call **exits 0 and prints nothing** | `fastenergrades` | one test cycle, and a silent pass a less careful reader would have believed | §12.14 |
| no `h1` length guidance; `.dgu-head-l` is one no-wrap flex row | `fastenergrades` | "Festigkeitsklassen" broken mid-word over three lines at 390 px in German | §5.5.1.1, last item |
| the archetype's own answer is 1.5 screens (`reference`, y≈1225) / 3.3 screens (`studio`, y≈2788) below the fold at 390 px | both, independently | headline numbers relocated into the stage a11y string and the tree meta column | §5.5.1.1(6), §10.3, §9 |

**The honest reading of this table.** Both authors answered the question they were sent to answer —
yes, a 3D scene tool can be *declared* now, and yes, `reference` can now *compose* its own answer —
and both wrote the same qualification in their own words:

> "§18.3 solved the archetype and did not solve the citizenship." — `pipesupports.html`

> "Yes for composing the answer, not yet for reaching it." — `fastenergrades.html`

Two things follow for you. First: **the new surfaces are real and you should use them** — 210 lines
of declaration replaced a projection, a camera, a picker, a drag, a placement session, a resize, a
dpr fix and a theme subscription, and a whole answer surface cost zero results DOM. Second: **the
gaps are now concentrated on the seams**, not in the middle of the archetypes, and §3.6.1 and
§5.5.1.1 exist so that you meet them as a checklist rather than as a day of source reading.

---

## 16. The panel is the reader's, not yours **[v3.6.1]**

From v3.6.1 the framework lays out the side rails for you. You do not call `scrollRegion()` and you
do not call `resizable()`; your archetype does both, and both withdraw themselves when they are not
earning their place. What you need to know is the four ways you can get in their way.

**16.1 Do not set a width on a region.** The rail's width belongs to the reader now — there is a
drag handle on it, and dragging it wider is what turns your field stack into two or three columns.
A `width` or `flex-basis` on `.dgu-r-inputs` in your stylesheet takes that away silently. If you
need a floor or a ceiling, pass `handles:[{region:'inputs', min:…, max:…}]`; if the tool genuinely
must not be resized, `handles:false`, and put the reason in a comment.

**16.2 Your `scroll:` is merged, not obeyed wholesale.** Naming one region does not opt the others
out. `scroll:{detail:'md'}` gives `detail` your answer and leaves `inputs` with the archetype's. To
turn the whole thing off, `panes:false`.

**16.3 `.dgu-fields` is a grid; put tool markup in it freely.** Only `.dgu-field` — the framework's
own control — takes a grid track. Everything else you append gets `grid-column:1/-1` and stays
full-width, so a panel, a chart or a table dropped into a field stack looks exactly as it did. If
you want a composite to claim two tracks where two exist, add `dgu-span-2`; it silently takes one
track where there is only one. `--dgu-col` (default 240px) is the width below which the stack
refuses to split.

**16.4 If you are writing `flex-wrap`, `overflow-x` or a grid template against a `.dgu-` class,
stop and file it instead.** Three of the repairs in v3.6.1 were tool-local CSS that had been sitting
in one page's stylesheet doing the framework's job — `xenon` was the only tool in the tree whose
result strip did not hide a number, because it alone had written `flex-wrap:wrap`; `kernnormenwijzer`
and `periodictable` had each written the same reference-rail block. When one tool has to write it,
every tool needs it. The exception that survived is instructive: `kernnormenwijzer` kept its block
because the measurement came out the other way for that page, and the comment now carries the
numbers so the next person can re-check rather than re-litigate.
