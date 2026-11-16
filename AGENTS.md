# tools.petrov.re — instructions for AI agents

This document is the convention. Two copies exist and they are kept byte-identical: the
Google Drive file `17yqvEDNnjRNX6cWV3mYLlQgvnhWdTMA6` in the folder `tools.petrov.re`, and
`AGENTS.md` in the site root. Edit both in one pass and `sha256sum` them against each other
afterwards. They have drifted before: on 2026-09-11 the `transients` category stood in the
server copy alone.

Working documents that support this convention live in `_docs/` and are named where they apply.
This file carries the rules; `_docs/` carries the contracts, the measured change records and the
campaign notes.


## 0. Language contract — v3.7.0 (normative)

**Read this before touching localisation.** Canonical standalone contract: `LANGUAGE_CONTRACT.md`.

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

### 0.1 How a tool carries its seven languages

Four mechanisms are in use across the estate. A tool being written or extended takes the one
its neighbours already use rather than introducing a fifth:

- **positional wrappers** — `T(en,uk,de,nl,fr,es,pl)`, one call per string;
- **per-language object maps** — `{en:…, uk:…, …}` keyed by language code;
- **DOM overlays** — a `<script id="XX-domain-overlay">` block guarded by `siteLang()`, looking
  each text node up exactly and then trimmed, walking the tree with a `TreeWalker` and keeping
  up with a `MutationObserver`;
- **sidecar language packs** — `<tool>-lang-XX.json` beside the HTML, declared in the manifest
  `dependencies` and covered by `network_access: same-origin-data`.

**A tool with a `report.profile` carries its report dictionary in all seven as well.** A DOM
overlay does not reach the report: the report is rendered into a separate document from the
record, so an overlay-localised tool shows a Dutch interface and prints an English sheet until
the report strings get the same treatment.

**Number formatting needs a locale map covering all seven.** A shortcut of the shape
`lang==='pl'?'pl-PL':'en-GB'` puts an English decimal point into a document whose every other
number carries a comma.

**The English slot is also the fallback.** A `T(...)` call whose first argument holds the
Ukrainian text renders that Ukrainian string in all seven languages, because every language the
tool does not implement resolves to English. The September 2026 pass found nine such calls
across four tools, one manifest `description.en`, and two solver warning strings. §8 carries the
scan that catches them.

The campaign that took the estate from 55 to 70 tools with all seven languages is recorded in
`_docs/CHANGES-languages.md`.

## 1. Deployment unit

A tool is self-describing. Normal deployment is **one HTML file**. If the tool requires local data or binary assets, deploy the HTML plus only those files/directories listed in its `dependencies` field. Do not edit `index.html`, `validation.html`, `benchmark.html`, `catalog.php`, `site-disclaimer.js` or `diagram-common.js` when adding or updating an ordinary tool — a tool's status, its chip and its benchmark report page are all rendered from its own manifest and its artifact.

`catalog.php` discovers tools by scanning HTML files in the site root for the embedded manifest. The index and validation register both read that catalog. It reports two classes of defect: **`errors`** are structural faults that make the entry unusable (unparseable manifest, `file` not matching the real filename, a missing required field, a missing declared local dependency, a missing benchmark artifact, `benchmarked` without a passing benchmark) and the tool is left out of `tools`; **`warnings`** are honesty or consistency defects that do not stop the tool working (an inaccurate `network_access`, `report.pdf` without `diagram-common.js`, a `handoff.accepts` entry outside the vocabulary) — the tool stays listed and carries the warning in its own catalog entry so `validation.html` can flag it. Benchmark artifacts live in `benchmarks/` and ship with the site; a tool that claims `benchmarked` deploys its artifact alongside the HTML.

## 2. Required manifest

Place this block inside `<head>` and within the first 256 KiB of the HTML:

```html
<script type="application/json" id="diagram-tool-manifest">
{ ... }
</script>
```

Schema for a new or updated tool: `tools.petrov.re/tool-manifest/v2`. `catalog.php` still accepts
`…/v1` and reports the version per tool as `manifest_version`, but do not write new v1 manifests.

The host in a schema or API string is part of a **name**, not an address: `DiagramUI.api` and the
handoff schema are compared for equality, and a payload whose schema differs is refused with
`reason:"schema"`. On 2026-09-11 these names were moved from the previous host to `tools.petrov.re`
across the whole estate, deliberately and without a compatibility branch, so records, permalinks and
handoff payloads saved before that date no longer pass the schema check. Moving such a name again
means moving every producer, every consumer and every generator in the same pass.

Required v1 fields, unchanged:

- `schema` — exact schema string above.
- `manifest_revision` — framework/content revision used when preparing the manifest.
- `id` — stable lowercase identifier; do not change it merely because the title changes.
- `file` — exact deployed filename, including case.
- `listed` — `true` to appear in the site catalog.
- `category` — exactly one primary catalogue category: `nuclear-physics`, `nuclear-eng`, `thermo`, `transients`, `hvac`, `acoustics`, `envelope`, `electrical`, `control`, `safety`, `project-delivery`, `tendering`, `engineering-change`, `mep-maintenance`, `plumbing`, `vertical-transport`, `ccus`, `oil-gas-h2`, `struct`, `physics`, `optics`, `mat`.
- `order` — display order; preserve existing values where practical.
- `title` — object containing every language declared in `catalog_languages`.
- `summary` — every language declared in `catalog_languages`; one compact catalog sentence, normally 70–220 characters. State what the tool calculates or lets the user do, not marketing language.
- `description` — every language declared in `catalog_languages`; a fuller explanation shown only after the catalog row is opened.
- `status` — `prototype`, `benchmarked` or `verified`; see §5.
- `independent_validation` — boolean. Kept as a mirror of `validation.independent_validation` for one release. Never set `true` without a documented independent validation basis.
- `limitations` — every language declared in `catalog_languages`; tool-specific model limitations. This is not the generic site disclaimer.
- `intended_use` — normally `education`, `technical exploration`, `preliminary assessment`.
- `catalog_languages` — non-empty subset of the global site registry `en`, `uk`, `de`, `nl`, `fr`, `es`, `pl`; current manifests include `en`. Only languages declared here are mandatory in catalogue-visible localized fields.
- `tool_languages` — languages actually supported by the tool domain UI. It is a non-empty subset of `catalog_languages`; current manifests include `en`. It does **not** control which site languages the global picker offers.
- `dependencies` — local runtime/maintenance files needed beside the HTML, e.g. `smr-data.json` or `neutron-data/`. Empty list if none.
- `network_access` — one of three modes, and it must be accurate:
  - `{ "mode": "none" }` — literally no network at all: everything the tool needs is inside the HTML.
  - `{ "mode": "same-origin-data", "note": "…" }` — the tool fetches **only its own declared local dependencies** from this site (a data JSON, a language pack, a `.wasm` core) and contacts no external service. The `note` names the files and confirms nothing is transmitted.
  - `{ "mode": "external", "note": "…" }` — the tool contacts a third-party host. The `note` names what is downloaded or transmitted, and why.

New v2 fields:

| field | type | rule |
|---|---|---|
| `validation` | object | `{ basis: {localized object}, independent_validation: bool, benchmarks: [...] }`; localized basis entries follow the tool/catalog declaration |
| `validation.benchmarks[]` | object | `{ id, reference, citations[], cases, passed, tolerance, run_at, artifact }`; `artifact` is a site-relative path such as `benchmarks/steam_tables.json` and the file must exist and parse; `reference` and `tolerance` are a plain string or a localized object (`{en, uk, …}`, printed in the report language; `catalog.php` keeps the English text) |
| `report` | object | `{ pdf: bool, source_attribution: bool }` — both **must** be `true` for a new tool |
| `python_export` | object | `{ supported: bool, reason?: string, requires?: [] }` — `requires` is normally **empty**: the script must run on a bare `python3`, standard library only. Any surviving entry needs a `requires_reason` that the generated header prints |
| `handoff` | object | `{ provides: [], accepts: [] }` — quantity names from §2.4 only; empty arrays are fine |
| `state_codec` | object | `{ permalink: bool, record: "tools.petrov.re/calculation-record/v1" }` |

`network_access` **must be accurate**. `catalog.php` scans the whole file for the things the browser
would really request: `<script src=>`, `<link href=>`, `<img src=>`, `fetch(…)` (including wrapper
functions) and `XMLHttpRequest.open(method, url)` targets. A URL-shaped string anywhere else is not a
fetch — a vendored library that merely mentions a CDN URL in a code path the tool never enters is not
an external dependency, and reporting it as one only teaches people to ignore the validator.

A page that really loads something from a third-party host declares `mode: "external"` with a `note`
naming what and why, or the reference is removed. A manifest that declares `none` or
`same-origin-data` while such a load exists gets a **warning**: the tool stays in the catalog, carries
the flag in its catalog entry and shows up in `validation.html`. The declaration is fixed by editing
the manifest or removing the load — not by hiding the tool.

The HTML must also include both shared runtimes, in this order:

```html
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js" defer></script>
```

`site-disclaimer.js` adds the status badge and limitations modal. `diagram-common.js` adds the shared
toolbar (return link, permalink, record export, PDF report, Python export, handoff). Both are
side-effect-safe; a tool that registers nothing gets only the badge and the return link.

### 2.0.1 Framework-owned furniture: verify the rendered DOM, not the mount hierarchy

Framework-owned controls are not guaranteed to be descendants of the tool mount or of `.dgu-app`.
In particular, run-mode action bars, learn/tour popovers, dialogs, toasts and other viewport furniture
may be appended at `<body>` level. **Never write a corrective selector such as
`.dgu-app .dgu-actionbar` merely because the visible control belongs to that app.** Inspect the
rendered DOM first and target the actual node. The run-mode primary action is the case this comes
up in most; its contract and its regression gate are §6.1.

### 2.1 Shared runtime — `diagram-common.js`

Single global `window.Diagram`. Register from a `DOMContentLoaded` handler (the tool's inline script
runs before the deferred runtime):

```js
Diagram.init({
  id, file, title,                                  // fall back to the manifest
  state:  { serialize, deserialize },               // optional -> permalink
  record: () => ({ inputs, outputs, units, model, warnings }),  // required for PDF/JSON/CSV/Python
  python: () => ({ code, requires, basis, selftest, displayed, scope, covers }),
       //     return ({ unsupported: "reason" }) to decline the state you are in
  handoff:{ provides, accepts, build, apply },
  report: {
    sections: rec => [ {title, text, image, svg, head, rows, cols, notes} ],  // extra sections
    render:   (rec, ctx) => items          // supply the report body yourself
  }
})
```

All of this is opt-in: a tool that passes none of the newer fields behaves exactly as before.

Two helpers exist for asynchronous tools and for the language attribute:

```js
Diagram.ready(promise)        // register a gate: "my first result is not ready yet"
Diagram.whenReady()           // resolves after boot + every gate; sets window.__diagramReady
Diagram.setDocumentLang(l)    // writes <html lang> only when it really changes
Diagram.watchLang(cb)         // guarded observer: no callback for an unchanged value
```

A tool whose first result needs a worker, a fetch or a simulation should register a gate — that is
the readiness signal automated checks wait for, instead of guessing a delay.

Every callback is wrapped: an exception inside one is logged, never propagated. The runtime is silent
for a tool that calls nothing.

- `Diagram.state.encode/decode` — JSON → raw DEFLATE → base64url; the permalink is
  `https://tools.petrov.re/<file>?lang=xx&s=…`. Keep the encoded state under ~4 kB.
  A permalink that fails to decode is **reported to the user**, never silently ignored.
- `Diagram.record.build()` — the `tools.petrov.re/calculation-record/v1` document.
- `Diagram.export.json() / .csv()` — named `<id>-<UTC timestamp>.<ext>`.

`record()` must return `null` when there is nothing computed yet; the runtime then tells the user
instead of exporting an empty document.

### 2.2 PDF report — source attribution is mandatory

`Diagram.report()` renders the record into a hidden same-origin iframe and prints it. No jsPDF, no
html2canvas, no network. Every page carries a footer reading

```
Source: https://tools.petrov.re/<file> · <ISO timestamp> · <status label>, independent validation: yes|no · page N of M
```

and, for a tool that has a benchmark artifact, one further segment before the page counter so the
printed sheet leads back to the evidence:

```
… independent validation: no · Benchmark report: https://tools.petrov.re/benchmark.html?tool=<id>&lang=xx · page N of M
```

The source URL is mandatory and stays first; the page counter stays last; the whole line must fit the
two-line footer box. Page 1 additionally carries the benchmark summary (with the report URL) when the
tool has one; the `limitations` string closes the document, beside the disclaimer it qualifies.

**The address is in the document, and its length decides where.** Measured at the default state, the
permalink runs from 124 characters (`xenon`) to 3 513 (`technicalrequisition`), median about 1 200,
and the report's body width takes 70–80 monospace characters per line — so the earlier rule, the full
address on page 1, put twenty lines of base64 ahead of the engineering on most sheets. Since v4.18:

- a permalink of at most **200 characters** (three printed lines; 2 of 20 sampled tools) prints in
  full on page 1, and no trailer is emitted;
- a longer one leaves page 1 one line — the tool address, the encoded state's length and a **state
  fingerprint**, the first 8 hex of the sha256 of the `s=` payload — and the address itself is the
  **last block of the document**, after the method notes and the annex, segmented at 8 000 characters
  per block so the pager moves each whole and the per-page footer survives under it;
- the fingerprint is in the record (`state_fingerprint`) and beside the page's own Copy-permalink
  action, computed from the same bytes, so a reader holding a sheet can tell whether the page in front
  of them carries that state;
- each figure is printed once: the character count appears only when the address is at the end, since
  a count beside the address it describes is §4.1's "said twice". A tool
that keeps its own PDF path **must** stamp `Diagram.report.attribution({page, pages})` verbatim on
every page — it adds the report segment itself; `Diagram.report.url(lang)` returns the report URL
alone.

**A chart is part of the report.** A tool whose output is a picture passes it as a section:
`image` (a `data:` URL, e.g. `canvas.toDataURL("image/png")`) and/or `svg` (inline markup), with an
optional `caption` and `width`; either may be an array. Only `data:` URLs are printed — anything else
is refused and the omission printed, because the report fetches nothing — and inline SVG is stripped
of scripts, event handlers and external references. Figures are capped to the text column and to one
page body, so they paginate like any other block and the footer stays intact.

A tool with a genuinely richer report supplies `report.render(rec, ctx)` returning blocks built with
`ctx.h / p / kv / url / table / image / svg / sections / raw`. That replaces the record dump only:
the attributed head, the disclaimer and the per-page footer stay with the runtime, so a custom report
cannot lose its attribution.

### 2.2.1 `report.profile` — the engineering sheet

`report.profile` is how a tool hands the engine structured content: summary tiles, a results
table, decision cards, method notes, a figure. A tool that registers none leaves the engine to
build the sheet from the record: correct, and a flat list of machine keys.
The field-by-field contract, with worked examples, is `_docs/TZ-report-profile.md`; the change
records for the engine behind it are `_docs/CHANGES-v4.7.md` and `_docs/CHANGES-v4.10.md`.
Engine state as this was written: `diagram-common.js` v4.16, sha256 `11a293a3655b`, 444579 bytes.
v4.16 added the report's permalink row, printed each benchmark fact once instead of three
times (which had tripped §8's repeated-sentence gate on every benchmarked tool), and made the
evidence strings print in the report language or carry the language they are in. The change records
are `_docs/CHANGES-v4.16.md` and `_docs/CHANGES-v4.17.md`.

Five things decide whether the printed sheet reads as engineering.

**The engine deduplicates.** A table row whose value already stands in a summary tile is dropped
before printing. A results table therefore has to carry quantities the tiles do not, or it prints
nearly empty — one tool shipped a results table that reduced to a single row.

**Supply the figure.** Draw it into its own canvas at 2× and return it through
`ctx.figure(canvas, {caption, alt})`. A tool that supplies none leaves the engine scraping the
visible page canvases: screen resolution, no caption, and no say over which figure lands in which
section or in what order.

**Print the unit the engineer reads it in.** The record keeps SI (§2.4); the sheet prints what the
interface prints. A report reading `2 000 000 Pa` beside an interface reading `20 bar` has failed
its reader.

**Give every key a label.** Where `ctx.label(key, unit)` finds no vocabulary entry it de-underscores
the key, so `m_admitted` reaches the page as "M admitted". A machine key on a printed sheet marks a
missing label; supply one.

**One y-axis per unit.** Series carrying different units land on different axes. Measured: pressure
in bar sharing an axis with temperature in kelvin left the pressure curve 13 px of 280, 4,7 % of
plot height; a second tool drew tank level at 15,6 %. The on-screen chart and the report figure run
from the same defaults, so correct it once in the drawing code and pass no `ticks:` or `fmt:`
override that would let the two disagree.

### 2.3 Python export

`Diagram.python.emit()` produces one runnable `.py` file: header comment (title, source URL, manifest
revision, timestamp, permalink, limitations, equations, validity ranges), the current inputs as
module-level constants with units in comments, the tool's pure functions, a `compute()` returning the
displayed quantities, a `__main__` block printing every displayed output, and **a self-test that
asserts the freshly computed values equal what the tool displayed at export time**, to a stated
tolerance.

**Dependencies: none.** The exported script must run on a bare `python3` — **one self-contained
file, standard library only**. `requires` is normally empty. The export exists so a reader can re-run
the calculation with no setup and see exactly what the tool did; a `pip install` in the way defeats
that, and a library-supplied property value is not the tool's own value. `steam_tables.html` shows
this is achievable: it ports the complete IAPWS-IF97 engine (~605 lines) into the script it emits.

A tool that genuinely cannot be written that way has three honest options, and no fourth:

- **port it** — carry the piece into the file. Port the subset actually used (region 1, not all
  five), and name its source in the header. A long coefficient table is checkable; a `pip install`
  is not.
- **scope it** — export the part that reproduces honestly and say what is missing: `covers` for the
  outputs, a per-state decline for the fluids, modes or ranges out of reach.
- **decline** — `python_export.supported: false` with a reason, or `{unsupported: "…"}` for the
  current state.

If a `requires` entry survives anywhere it is an exception and looks like one: supply
`requires_reason` and the generated header carries the one-line justification, with a warning banner
above it and a second banner printed when the script runs. Leave it out and the header prints
**"justification: NOT STATED by the tool"** next to the same banner. Either way `catalog.php` raises
`python_export_requires` against the manifest. There is no approved list: numpy, scipy, CoolProp and iapws are treated like any other
package — justify it or remove it.

**Say which claim you are making.** `basis` stays, and `kind: "reproduce"` is now the norm:

```js
basis: { kind: "reproduce",         // "reproduce" | "recompute" | "mixed"
         note: "the IF97 region-1 polynomial and the 0.05 K enthalpy table this page interpolates "
             + "are ported verbatim, coefficients and all; the circuit algebra is the page's own",
         deviation: "none observed; the script evaluates the same expressions in the same order" }
```

- **reproduce** — the script re-implements the tool's own computation, in the same order. With
  `requires` empty and no `basis`, the runtime prints this claim itself.
- **recompute** — a quantity comes from somewhere other than the tool's own model. Say what replaced
  what, and state the **expected size of the difference**. "Small" is not a number. This is also the
  honest label for a port that deliberately drops a step.
- **mixed** — part of each.

**The tolerance follows from the basis.** A faithful port asserts a tight tolerance. If porting moves
the last digits — a different summation order, a dropped interpolation table — name that cause in
`selftest.note` and set the number from it. Widening it for any other reason is falsification: if the
script and the tool disagree beyond what `basis.deviation` predicts, one of them is wrong. Fix that,
do not raise the number.

Do not fake this. If the result comes from a large solver, a data table or a Monte-Carlo run, set
`python_export.supported: false` with a one-line `reason` instead of shipping a script that reproduces
a fragment. Partial export is allowed only when the header states exactly which part it reproduces
(`scope`). Porting closes the gap for property correlations and small numerics; it closes nothing for
a Monte-Carlo run, a shipped data file, a mesh solver or a wall-clock-dependent trajectory.

Three things the provider can do instead of lying or giving up:

- **Decline the state you are in.** Support is often per module, per fluid, per validity range.
  Return `{ unsupported: "the Monte-Carlo branch is sampled, not closed form — switch to the
  analytic branch to export" }` (a string, or `{en:…, nl:…}`). The user is told the reason verbatim.
  Returning `null` is not that: it produces a bare "no python code".
- **Scope the export with `covers`.** `covers: ["eta","w_t","q_in"]` names the outputs the script
  reproduces. The self-test then asserts only those, the header states how many of how many outputs
  are reproduced and names the ones that are not, and `NOT_REPRODUCED` is printed at run time. A
  correct partial export passes its own self-test — do not set `supported: false` for one.
- **Return a structure.** An output that is a dict or a list is flattened to scalar leaves for the
  comparison (numbers relatively, everything else by equality, anything incomparable counted as
  skipped and reported).

Verify by running the script. `python3 export.py` must exit 0 and print its `self-test passed` line.

### 2.4 Cross-tool handoff — SI only

Payload schema `tools.petrov.re/handoff/v1`; `Diagram.handoff.send(targetFile, payload)` opens
`target.html?lang=xx&in=<encoded>`, `Diagram.handoff.receive()` validates it on load and calls the
tool's `apply`.

**Values are always SI base units**: K, Pa, kg/s, m3/s, J/kg, J/(kg.K), W, kg/m3, m3/kg, m, s, kg/kg,
V, A, Ω. No kPa, no °C, no bar, no kW — the receiving tool converts for display. The runtime rejects a
payload carrying a prefixed or non-SI unit.

Canonical quantity names (extend only by editing this list, `catalog.php` and `diagram-common.js`
together): `T`, `p`, `rho`, `h`, `s`, `u`, `v`, `x`, `w` (humidity ratio), `mdot`, `Vdot`, `Q`, `U`,
`A`, `NTU`, `eps`, `f_darcy`, `Re`, `D`, `L`, `dp`, `M` (Mach), `phi` (neutron flux), `rho_reac`
(reactivity), `E`, `I`, `V_volt`, `Z`, `XR` (reactance/resistance ratio X/R), `Ik` (initial symmetrical short-circuit current Ik″), `ip` (peak short-circuit current), `Ib` (symmetrical breaking current), `Ith` (thermal-equivalent short-circuit current), `Ires` (residual/earth current 3I0), `t_clear` (fault clearing time).

A receiving tool ignores quantities it does not understand and **tells the user which ones it
ignored**. `handoff.accepts` naming anything outside the list is a catalog **warning**: the runtime
will not offer that quantity, but the rest of the tool works and the tool stays listed.

The "Send to …" list comes from `catalog.php`, which needs a server. From a `file://` copy or an
offline mirror the runtime falls back to a page-embedded catalogue
(`<script type="application/json" id="diagram-handoff-catalog">`, or `Diagram.handoff.setCatalog()`)
and then to a dated snapshot inside `diagram-common.js`, always **labelled as a snapshot**; where
even that is empty it says so and still offers *Copy the handoff data (JSON)*. Never present an
unreadable catalogue as "no tool accepts these quantities". Regenerate the snapshot when a tool's
`handoff.accepts` changes:
`php catalog.php | jq -c '[.tools[]|select(.handoff.accepts|length>0)|{f:.file,t:.title.en,a:.handoff.accepts}]'`

### 2.5 Project package — the `project-delivery` lifecycle

Nineteen tools exchange one JSON document, `tools.petrov.re/project-package/v1`: the thirteen
`project-delivery` tools, `changeimpact` (category `engineering-change`), the four `control` lifecycle tools (`functionaldescription`, `causeeffect`,
`iolist`, `functionaltest`) and `loadlist`. The contract is `_docs/TZ-project-package.md`, extended
by `_docs/TZ-engineering-workflow.md` §2–§4 (2026-09-26: thirteen further registers and the
`calculations` section); this is what an agent needs before touching one of the nineteen.

**It is not handoff.** §2.4 carries SI scalar quantities from a closed vocabulary and the runtime
rejects anything else. A project id, a lifecycle stage, a package or an interface is not a physical
quantity. Never add one to `QUANTITIES`; the two channels are separate and a tool may use both.

**It never travels in a URL.** The permalink budget is ~4 kB (§2.1 of the framework spec).
`requirementsmatrix` alone passes it at about 65 requirements — 5987 characters at 100, 11603 at
200 — and `interfacebuilder` needs 7363 for 45 boundaries and 135 items. Transport is `localStorage`
on the shared origin plus a file export, one format for both. There is no "share this project as a
link", and adding one would be a silent data-loss bug.

**A register has exactly one writer.** Where two tools genuinely hold one, the register is SPLIT:
`deliverables` / `vendor_documents`, `verification_evidence` / `commissioning_evidence`,
`definition_decisions` / `review_decisions`. This is not tidiness. `save()` can refuse a patch
outside a declared path, but a whole-array write from a legitimate owner is indistinguishable from
a correct one, so a shared array cannot be protected. Three separate falsification tests each
destroyed a sibling's register before the splits went in.

**`structure` is owned per array** — `packages` by `interfacebuilder`, `systems` by
`commissioningturnover` — and the owner declares the DOTTED path, `"writes": ["structure.packages"]`.
Declaring the whole section is legal to the runtime and wrong; `catalog.php` warns
(`project_package_whole_section_write`) because only the catalogue can see a bad declaration.

**Read what you own.** A tool that writes a register and never reads it back tells the user on every
reload that it is discarding data it wrote itself. `catalog.php` warns
(`project_package_write_without_read`).

**Only `changeimpact` writes `flags`, and only `flags`.** It is not a stage — its `order` is 404 and
it acts across the seven. A flag never deletes or edits what it points at; a tool displaying another
tool's register may show a flag beside the row, attributed, but may not offer to edit, resolve or
dismiss it. `flags` is the one section whose contents the runtime validates, because one tool writes
it and all the others render it. The registers are deliberately untyped — §2.3 of the contract gives
each owner its own fields.

**`diagram-project.js` is its own file with its own cache anchor**, loaded by those nineteen pages
and no others. It is not in `diagram-common.js`: 99 tools load that and 80 have no project to carry,
so the blast radius stays at nineteen. Any change to it re-anchors every page that loads it, which
means a revision bump and an artifact re-run on all nineteen — plan a runtime change as a
nineteen-tool pass, never as one. The 2026-09-22 pass measured what that costs: 14 of the eight
tools' own benchmark checks pinned the old list of 8 flag kinds or 11 sections and had to be
rewritten, while every graded value reproduced unchanged.

**A calculation tool may write one path without declaring anything.** Any page whose manifest has an
`id` may write `calculations.<its own id>` — the record it attaches through the shared toolbar. It
may not write the whole `calculations` section nor another tool's key; such a patch is refused
atomically like any other foreign write. A page with no `project_package` block reads `project`,
`structure` and its own calculations key, and nothing else.

**Evidence.** Every one of the nineteen carries package cases: round trip, unknown sections restored to
the top level verbatim, ignored sections reported to the user, no implicit apply on boot, a throwing
`localStorage` degrading to "no package" with the tool still calculating, and an atomic refusal of a
patch naming a register the tool does not own. The package must not move one computed number: a
change that moves a pre-existing benchmark value is a mistake, not an improvement.

### 2.6 Safety exchange — the `safety` work-control chain

Seventeen `safety` tools pass work-control data to each other in one JSON document,
`tools.petrov.re/safety-exchange/v1`. The contract, the item vocabulary per kind and the audit
behind it are in `_docs/TZ-safety-exchange.md`.

**It is not handoff and not the project package.** Hazards, controls and isolation steps are not
SI quantities (§2.4) and belong to no project register (§2.5). Transport is a file download and
upload, plus `localStorage` key `tools.petrov.re/safety-exchange/<kind>`; never a URL.

**One writer per kind.** `jsatrabuilder` writes `jsa.task-hazards` and `jsa.residual-hazards`,
`permitworkstudio` writes `ptw.isolation-request`, `isolationplanner` writes
`loto.isolation-register`, `bowtiebuilder` writes `bowtie.barriers`, `workatheight`,
`confinedspace`, `hotworkrisk` and `electricalsafework` write `wah.controls`, `confined.controls`,
`hotwork.controls` and `electrical.sequence`, `safetyscenariolab` writes `scenario.outcomes`.

**The consumer fails safe.** An item whose status the consumer does not know is imported as the
most restrictive value and says so; it is never dropped. An import that applies nothing shows a
warning. Import happens on a button press, never on boot. The first audit found eight of nine
pairs losing items to vocabulary mismatches, one of them a failed oxygen check, while every
self-test passed on hand-written fixtures; each consumer now tests a document exported by its
real partner.

**Benchmarks of this category** use corpora written without access to the tool code
(`benchmarks/<tool>.reference.json`, fetched only by `window.__dgcBenchmark()`); corrections to a
corpus are recorded in its notes and never made by the tool's builder.

### 2.7 Workflow map — which tool comes next

`workflow-map.json` in the site root is framework data, not a tool: per tool an `entry`
(`calculate` or `deliver`), the lifecycle stages it serves, its `medium`, and its edges with
`carries` (`handoff` | `package` | `link`), a one-sentence `why` in seven languages and an
`offer` flag. The contract is `_docs/TZ-engineering-workflow.md` §5 and §5.1; the generator and
the invariant check live beside the file's own record in `_docs/workflow-map.md`.

**A new tool declares its own edges in the manifest**, in a `workflow` object with the same fields;
the manifest wins for that tool and `catalog.php` merges the two. The merge is per field: a field the
manifest declares, even an empty `inputsFrom: []`, replaces the map's, so a new tool leaves out of
its manifest every edge field whose far end is not published yet — at least `inputsFrom` — and that
field lives in the map (catalog.php would otherwise report the later edge as asymmetric, and adding it
would need a manifest revision). A tool whose neighbours are still being built may keep all its edges
in the map and declare only `entry`, `medium` and `lifecycle`. **An existing tool is annotated in
the map, not in its manifest**: a manifest edit bumps `manifest_revision`, which would make that
tool's benchmark artifact read as stale (§5), so annotating the estate through manifests would
stale ~70 artifacts to add navigation data.

**An edge exists only where something real crosses it** — SI quantities through handoff (§2.4), a
package register one writes and the other reads, or a documented manual step. Building the edges
mechanically from shared quantity names produced 781 handoff edges of which 260 rested on
temperature alone, so §5.1 adds two refusal rules and every edge carries the verdict: medium-bound
quantities (`rho`, `h`, `s`, `u`, `v`, `x`, `w`, `mdot`, `Vdot`, `Re`, `f_darcy`, `M`) are refused
across different media, and a bare state point between two categories is refused. Measured on the
first complete map: 463 edges, 356 offered, 107 refused (17 by medium, 90 as state point only).
Nothing is deleted for being refused; `offer_reason` says why, the toolbar shows only offered
targets, and `projectworkspace` shows all of them.

**Pressure is not one quantity.** A pump suction pressure, a barometric pressure and a contained
vessel pressure share the name `p`. Reading each receiver's own apply code moved 45 of 183
p-carrying edges off that quantity, among them six gas, steam and relieving sources that were
handing `operatingpoint` a pump inlet pressure. A receiver that applies an incoming quantity with no
range check is the other half of that defect and is listed in the map's record.

`catalog.php` warns `workflow_unknown_tool`, `workflow_unknown_stage`, `workflow_edge_asymmetric`,
`workflow_offer_missing` and `workflow_medium_missing`. The embedded offline snapshot inside
`diagram-common.js` carries the same edges; regenerate it in the same pass that changes the map
(`regen-snapshot.py`), or a `file://` copy offers edges the map refuses.

## 3. Language plumbing in the page

The index always opens a tool as `tool.html?lang=xx`, and a localized tool honors the query
parameter. A tool that implements fewer languages than the site keeps its own interface in its
`domainLang` fallback and still carries the selected site language: the shared home, status and
disclaimer UI use it, and the return link is `index.html?lang=xx`.

A tool with its own language control writes the site preference through
`localStorage.diagram_site_lang` (§0).

**`<html lang>` is shared ground.** Both framework scripts and most tools observe it. Write it with
`Diagram.setDocumentLang(l)` — it assigns only when the value really changes — and observe it with
`Diagram.watchLang(cb)`, which does not call back for an unchanged value. Assigning
`documentElement.lang` unconditionally from inside your own observer is what made
`probabilisticrisk.html` hang: every write wakes every observer, and one of them writing back is an
endless loop. Both framework observers now ignore an unchanged value, and the runtime's disconnects
itself after 40 real changes in two seconds, so the worst case is a stale toolbar rather than a dead
page — but the tool side is still yours to get right.

## 4. Category and copy rules

`category` is the tool's **primary catalogue home**, not a complete ontology of the physics it uses. Put a tool where a user would look for the engineering task it performs; cross-domain methods belong in the description/handoff vocabulary rather than duplicating a tool across sections.

Current category vocabulary:

- `nuclear-physics` — nuclear/particle physics, nuclides, reactions, spectra and evaluated nuclear-data exploration;
- `nuclear-eng` — reactor engineering, shielding, safety, fuel/source terms, reactor standards and nuclear risk work;
- `thermo` — thermodynamics, heat-transfer equipment, fluid flow and hydraulic/gas-flow systems;
- `transients` — pipe and vessel transients: depressurisation/blowdown, line packing, flashing/relief critical flow, filling/draining, pressurisation and water hammer;
- `hvac` — HVAC, ventilation and indoor/process climate;
- `acoustics` — room acoustics, environmental/industrial noise and sound propagation; incl. the Belgian building-acoustics series (requirements NBN S 01-400-1/-3, airborne sound between rooms EN ISO 12354-1, impact sound EN ISO 12354-2, façade sound insulation EN ISO 12354-3 + NBN S 01-400-1 §7) on one shared project document `acu.project.v1` through `acoustics-be-core.js` (added 2026-11-08, campaign bw-r3);
- `envelope` — building physics and envelope calculations; incl. the glazing & windows series (window performance classes NBN B 25-002-1, glass thickness NBN S 23-002-2 / EN 16612, safety glazing NBN S 23-002/A1, thermal breakage of glass) on one shared project document `tools.petrov.re/glazing/v1` through `glazing-core.js` (added 2026-11-07, campaign bw-r2);
- `electrical` — electrical networks, cables and protection;
- `control` — control, automation and system dynamics;
- `safety` — occupational safety and health: work permits, PPE, workplace hazards, confined spaces, hazardous substances, fire/explosion prevention and safety training;
- `project-delivery` — project definition, requirements, interfaces, deliverables, vendor documentation, design review and commissioning/turnover workflows;
- `tendering` — tendering and contracts for client, contractor and equipment supplier: procurement strategy and procedure, award criteria and price scoring, commercial bid normalisation and life-cycle cost, abnormally low tenders, bid/no-bid, estimates, quote levelling, Monte Carlo contingency, back-to-back terms, contract risk, cash flow, price indexation, liquidated damages and bonds, supplier compliance, lead time and conformity (added 2026-11-15, campaign tnd-2026-11-14);
- `engineering-change` — engineering changes to an operating plant and plant-life decisions: change impact, repair/refurbish/replace/upgrade options, obsolescence, operating envelope and margin, fatigue, wall thinning and degradation life, design basis integrity and long-term operation, replacement equivalence, tie-ins and outage windows, temporary configurations and bypasses, control and software changes, post-modification verification and maintenance/test interval changes;
- `mep-maintenance` — maintenance of building services (HVAC, plumbing, fire protection, electrical and controls): asset criticality, risk-based and reliability-centred maintenance strategy, condition monitoring, maintenance planning and budgets, critical spares and renewal planning (added 2026-11-05, campaign mep-2026-11-05);
- `plumbing` — building plumbing and sanitary installations: sanitary fixture counts, drinking-water pipe sizing (EN 806-3, DIN 1988-300), hot water storage and DHW circulation, legionella control, backflow protection (EN 1717), booster sets, drainage and venting (EN 12056-2), wastewater lifting stations, rainwater reuse and water saving; one shared project document `tools.petrov.re/plumbing/v1` through `plumbing-core.js` (added 2026-11-06, campaign plb-2026-11-05);
- `vertical-transport` — vertical transport in buildings: lift (elevator) passenger waiting times and group control, round-trip-time traffic design and sizing, zoning of tall buildings and lift energy and efficiency class (added 2026-11-06, campaign vt-2026-11-06);
- `ccus` — carbon capture, utilisation and storage across the value chain: CO₂ capture, compression and conditioning, pipeline and ship transport, geological storage, utilisation, carbon pricing and project economics (added 2026-10-19, campaign ccus-2026-10-19);
- `oil-gas-h2` — oil, gas and hydrogen engineering across the value chain: separation and flow assurance, pipeline integrity and cathodic protection, process safety and consequence modelling, methane emissions, hydrogen production, compression, storage, transport, blending and refuelling, hydrogen economics and RFNBO compliance (added 2026-10-22, campaign ogh-2026-10-22).
- `struct` — structures, stress, mechanics, demolition/runout and related engineering mechanics;
- `physics` — general/fundamental physics and mathematics that do not belong to a more specific engineering discipline;
- `optics` — optics and photonics: 3D optical bench with ray tracing, polarisation and Gaussian beams, laser beam propagation and mode matching, lens design with aberrations, spot diagrams and MTF, thin-film coatings, laser safety (MPE, NOHD, laser class, eyewear) and machine-vision lens selection (added 2026-11-13, campaign opt-2026-11-13);
- `mat` — materials and chemistry.

Do not create a new category casually. Use the closest existing category. A framework change is required to add a category because category labels are site UI, not tool metadata.

Catalog summary rules:

- one compact statement;
- say what goes in / what comes out, or what is visualized;
- put caveats in `limitations` rather than in the summary;
- keep long methodological detail in `description`.

### 4.1 House style for everything a reader sees

These govern catalog copy, interface labels, limitations, report prose and work reports alike.

- **No evaluative judgement without a figure.** "Better", "optimal", "efficient", "powerful",
  "advanced", "professional", "easy to use" — a comparative with no number behind it is selling.
  Give the figure or drop the word.
- **Nothing is said twice.** One statement of a fact per document, audited across words,
  sentences and whole sections before publishing. The report engine enforces its own share of
  this mechanically (§2.2.1); the prose is yours.
- Do not use the "not A, but B" construction.
- Do not write text that argues with an earlier version of the document. State what holds; the
  history belongs in the changelog.
- Code comments are in English whatever the interface language.
- Prices are in euros.

## 5. Status ladder and evidence

The manifest enum is exactly `prototype | benchmarked | verified` and does not change.

- **`prototype`** — the default. No benchmark, or a benchmark that does not pass. Say so plainly.
- **`benchmarked`** — every entry in `validation.benchmarks` has `passed == cases` (> 0), each names a
  reference **independent of the tool's own code**, cites it precisely, and states a tolerance chosen
  from the physics rather than from what makes the tool pass. The artifact file must exist and parse.
  `independent_validation` stays `false`: this is still the author's own harness.
  Evidence has to be current, provenanced and counted:
  - the artifact must have been **executed against the build that is shipping**. `run_at` on the
    benchmark entry must not be older than the page's own `manifest_revision`, and `catalog.php`
    warns (`benchmark_evidence_stale`) when it is. A benchmark run against an earlier build answers
    "was this true of some earlier page" where the question is "is this true of the page you are
    reading". One audit pass found every artifact in the tree older than the page it graded;
  - the artifact must carry `reference_provenance` (`recomputed` | `recorded` | `mixed`), a one-
    sentence `provenance_note`, `run_at` and `build`, and per case `ref_source: "recorded"` wherever
    a stored value was reused instead of re-derived. **Reusing a stored `ref` is a regression
    reference, not a re-derivation**: it can tell you the build changed a number and can never tell
    you the number was wrong to begin with. In this tree one such frozen reference was found wrong by
    2.4e-4 the first time anyone re-derived it. Where one part of an artifact can be recomputed and
    another cannot — published property tables, experimental datasets — the artifact is a **merge**:
    recomputed cases carry their full numbers, recorded cases keep their ids, notes and verdicts
    under `reference_provenance: "recorded"`. A recorded case is never restated as freshly measured
    and never dropped to tidy the file;
  - the counts on the manifest must be the counts in the artifact. `benchgate.mjs` checks this
    because `catalog.php` reads them from the manifest and never opens the file, and the first run of
    that check found a shipped manifest claiming **202 cases for a 62-case artifact**;
  - **a passing benchmark is necessary and never sufficient.** Whether the cases cover the tool's
    headline claim is a judgement, not a count. `neutron_transport` passes 251 of 251 and stays
    `prototype`, because its cross-section data is absent from this deployment and not one transport
    result has ever been computed here. Do not promote a status on a pass count alone.
- **`verified`** — **reserved.** `benchmarked` **plus** a documented review by someone other than the
  author, recorded in `validation.review`: who reviewed it, when, against what, and where the record
  can be read. Nothing may be published as `verified` without that record. No tool holds this tier
  today. `catalog.php` rejects a manifest that claims it without a review, and every renderer falls
  back to the `benchmarked` label when `validation.review` is missing, so the word never appears on an
  unreviewed claim. Do not set `verified` because a benchmark looks convincing — a benchmark is what
  `benchmarked` is for.

### 5.1 What the reader sees

The enum value is machine vocabulary. The **displayed** label of `benchmarked` is
**“Benchmark tested”** in all seven languages; do not print the bare enum word in UI:

| status | en | uk | de | nl | fr | es | pl |
|---|---|---|---|---|---|---|---|
| `prototype` | Prototype | Прототип | Prototyp | Prototype | Prototype | Prototipo | Prototyp |
| `benchmarked` | Benchmark tested | Перевірено за еталоном | Benchmark geprüft | Benchmark getoetst | Testé sur banc d'essai | Contrastado con referencia | Sprawdzone benchmarkiem |
| `verified` (reserved) | Reviewed by a third party | Перевірено третьою стороною | Von Dritten geprüft | Door een derde beoordeeld | Examiné par un tiers | Revisado por un tercero | Zweryfikowane przez stronę trzecią |

The label is shown with the case tally (`Benchmark tested · 299/299`) and links to
`benchmark.html?tool=<id>&lang=xx`, the readable benchmark report. That page reads `catalog.php` and
the tool's artifact and shows what was tested, the references cited in full, the tolerance and the
artifact's own statement of why it is that number, cases run/passed/failed/flagged, the failing cases,
**the flagged cases as flagged rather than as passed**, what was explicitly not benchmarked, the run
date, the manifest revision, a link to the raw JSON, and a plain statement that this is the author's
own harness against independent references and not an independent validation. A tool at `prototype`
that has an artifact — a benchmark that runs but fails — keeps the `prototype` label and still links
to the report; a failing benchmark is exactly what a reader must be able to find.

The report page is framework UI: it is not a tool, has no manifest, and a tool author never edits it.
A new benchmarked tool appears there automatically once its manifest names an artifact that exists.

A self-check that re-evaluates the tool's own formula does not count towards `benchmarked`, and the UI
must not present it as validation. `independent_validation=false` means no independent validation
claim is made; self-tests, comparison against the same implementation, analytic checks written by the
same author and bundled benchmarks do not by themselves justify `true`.

`catalog.php` enforces the ladder: a manifest claiming `benchmarked` or `verified` without the
evidence above is rejected into the `errors` array and the tool vanishes from the catalog until it is
fixed.

Benchmark artifacts ship with the site under `benchmarks/`: `benchmarks/<tool>.json` per benchmarked
tool plus `benchmarks/index.json` summarising all of them. `validation.html` renders the register
straight from `catalog.php` — cases, reference, citation, tolerance, run date, a link to the artifact
and a link to the tool's benchmark report. An artifact that records a flagged case (a reference
disagreement, a quantity left `graded: false`, a region the tool itself calls uncertain) must keep
that record: `benchmark.html` counts it separately and shows it as flagged, and burying it in the
passed count would be the one dishonest thing this whole ladder exists to prevent.

A tool-specific limitation must identify the material modelling boundary: omitted physics,
idealizations, validity range, data quality, standards scope, numerical restrictions, or other
conditions that can materially affect use. Do not copy another tool's limitation text merely to fill
the field.

### 5.2 What a benchmark case carries

`benchmark.html` reads artifacts and never runs a tool. The artifact is therefore the whole of the
published evidence, and it has to carry that evidence itself. A case recorded as
`{id, note, pass:true}` reproduces nothing and re-runs nowhere: the transients artifacts stood at
1 560–4 116 bytes in that shape, and the `QA-*.json` records their notes cited were absent from the
server. Rewritten to carry their numbers the same artifacts are 13 688–39 422 bytes.

Per case: the **full input vector**, and per check `got`, `ref`, `tol` and `rel`. The page also
exposes `window.__dgcBenchmark()`, so the published artifact regenerates from the tool itself and
can be compared with what is deployed.

**A check without a criterion is not a check.** An item that reports the state of a solved case
rather than testing it is a diagnostic: `graded:false`, status `info`, recorded with its status and
left out of the pass count. Counting a diagnostic as a failure misreports a scenario that was
designed to end that way.

**Every criterion comes from the tool's own code or from a standard the tool already cites.** Do not
invent a tolerance. Three shapes that ground one: agreement with an independent reference required
to within one of the solver's own steps (`tEnd/900`); a convergence test grounded in the solver's own
bisection count; a closure tested to floating point because the relation is the model's own.

**A tolerance written as an absolute on a dimensional quantity will be broken by a case at another
scale.** An absolute 1e-5 Pa bound held on one case and was exceeded by the same check at higher
pressure. State the criterion against the solver's own step, or state it relatively.

**The reference shares the model's equations and not its method.** For a time march, an independent
quadrature of the same relation in another variable. A reference that re-runs the same integrator
agrees with itself; an independent one is what catches an integration defect.

**A failure is not repaired by fitting.** Two transients tools record 8 of 13 and 11 of 16, the
failures being experimental points where a homogeneous-equilibrium model departs from measurement.
No correction was fitted then, and none may be fitted later to move a count.

### 5.3 What the numbers caught

The argument for §5.2 is what surfaced the first time the transients artifacts carried numbers. Four
defects had been riding in verdict-only records for as long as those records existed.

- `flashing_valve` computed `G = Math.min(at.G, crit.best.G)`, returning the back-pressure flux while
  the restriction is choked, because the maximum of two values is never the smaller of them. On the
  tool's own defaults that under-reports mass flow by 20,5× — 0,164 kg/s against 3,36 kg/s. Its
  sibling `two_phase_critical_flow` runs the same HEM core, takes the maximum, and is right.
- `vessel_blowdown` closed its inner state with a damped fixed point capped at 10 iterations, which
  exhausted the cap on every call instead of meeting its own `1e-8` test: 0,70 % error on the shipped
  pipe preset, four orders above the tolerance the tool declared. A bracketed root find meets
  `1e-12`, with a worst residual of 4,5e-13 over 14 823 configurations, and runs faster.
- `vessel_blowdown` terminal time diverged under refinement in the two-phase branch. The right-hand
  side jumps 4,8 % at the saturated-vapour surface, and the finite difference was taken across a kink
  where ∂U/∂T changes by a factor 37,9. Localising the phase crossing onto a step boundary and taking
  the difference one-sided within the branch fixed it. A residual floor near 1e-3 s remains and is
  declared in the artifact.
- Three recorded claims failed to reproduce. "Refinement demonstrates convergence to <1e-6 s"
  measures 1,6e-4 s, because the terminal event is located by bisection on a vanishing mass rate and
  not by the RK4 order. "Lossless level error < 2e-6 m" measures 3,3e-5 m on the shipped defaults.
  The 1e-5 Pa absolute bound is the case in §5.2.

Where a measurement contradicts a manifest or a stored artifact, the measured figure replaces the
claim, and the work report names the replacement.

## 6. Normal deploy procedure

For a new self-contained tool:

1. Create `toolname.html` with a v2 manifest and both runtime references (`site-disclaimer.js`, `diagram-common.js`).
2. Call `Diagram.init` with at least `state` and `record`; a tool with no exportable result says why in `python_export.reason`.
3. Test it locally and on HTTP(S), including `?lang=en`, `?lang=nl`, and at least one other supported language.
4. Round-trip the permalink: set a state, copy the link, open it in a fresh tab, confirm the state comes back identically.
5. Generate the PDF report and confirm the `Source: https://tools.petrov.re/<file>` line appears on **every** page, including a report long enough to paginate.
6. Export the Python file, run it with `python3`, and confirm its self-test passes and its printed values match what the page shows.
7. Upload the HTML to the site root, together with `benchmarks/<tool>.json` if the tool claims `benchmarked`.
8. Open `catalog.php` and verify exactly one entry for the new filename and no `errors` array.
9. Open `index.html` and `validation.html`; verify the new tool appears in the intended category and its real validation row, without editing either file. If it claims `benchmarked`, open `benchmark.html?tool=<id>` from its status chip and check that the report shows the reference, the citations, the tolerance and the cases the artifact really contains.
10. Verify the floating **Tools** link returns to `index.html?lang=xx`.
11. Verify all files named in `dependencies` exist.
12. Declare the tool's `workflow` block (§2.7) and add its counterpart edges to `workflow-map.json`,
    then run the map's own check: an edge without a back-link is a catalogue warning.
13. Run `php build-static.php` on the server. It rewrites the crawlable catalogue inside
    `index.html`, `sitemap.xml`, `robots.txt` and the per-category and per-stage pages from
    `catalog.php`; a tool that skips it is invisible to a reader without JavaScript. Then
    `php benchmarks/_mkindex.php` so the benchmark register names the run that shipped.
14. Confirm the artifact's `reference_sha256` equals the sha256 of the corpus deployed beside it. A
    corpus edited after the artifact was generated — even one citation string — leaves the evidence
    pointing at bytes that are no longer there, and `window.__dgcBenchmark()` then stops
    reproducing the shipped file.

For a tool with local data, upload the HTML and those data files atomically where possible. Never publish a manifest that declares a dependency that is not present.

### 6.1 Run-mode primary action: use the panel actions API

For `DiagramUI.app({compute:"run"})`, the primary action contract is split by breakpoint:

- **desktop >= 769 px:** the final `inputs` panel must expose Run through that panel's public
  `actions:[…]` descriptor, with `variant:"primary"` and `run:()=>app.run()` (or the equivalent
  closure over the app instance);
- **mobile <= 768 px:** the framework sticky run control is the primary action. Hide only the
  desktop panel-action button by id or another tool-scoped selector.

Do **not** hand-build a `.dgu-panel-actions` row inside `panel.render()` for the run footer. That class
is framework implementation detail: `ui.panel({actions:[…]})` already renders the panel's action row
in the correct structural position. A hand-built row can acquire framework action-row layout without
being in the framework-owned action slot, producing an apparently floating / ghost primary control.

Secondary tool-specific controls that are not panel actions (for example a case-file picker or a
transient-history CSV) may be rendered in a plain tool-owned row with its own class. Do not reuse
`.dgu-panel-actions` for that row.

Do not patch or reparent the framework sticky action surface to repair a desktop footer problem. First
remove any hand-built framework-class action row and move Run/Reset into the panel `actions` API.

Regression gate for every `compute:"run"` tool:

1. the final desktop `inputs` panel declares exactly one primary Run action through `actions:[…]`;
2. no tool creates `.dgu-panel-actions` itself for that primary footer;
3. desktop >= 769 px: Run is in normal flow after the input content, with Reset beside it;
4. mobile <= 768 px: the desktop Run action is hidden and one sticky framework Run control remains;
5. changing an input marks results stale and Run recomputes it;
6. rendered-browser QA is performed at both sides of the 768 px breakpoint.

### 6.2 Changing a file that is already deployed

Every tool page loads `diagram-common.js?v=<first 12 hex of the engine sha256>`, and every page is
rewritten server-side when the engine deploys. A patch prepared away from the server states its
hashes and its anchors against the file with that cache anchor **normalised to the bare filename**,
so `sha256_from` still matches after an engine deploy lands between preparing the patch and applying
it. No `old` fragment contains `?v=`, and no op rewrites the anchor. The envelope, and the rules the
applier enforces on it, are in `_incoming/README.txt`.

**A patch from outside is applied by a person.** The drop box is `_incoming/` over FTP, reachable
over no other protocol. `diagram-common.js`, `.htaccess`, `index.html`, `benchmark.html`, `_new/`,
`_backup/`, `_incoming/` and `_docs/` are never patchable from it.

**Guard the solver mechanically.** The assembler asserts that the solver region is byte-identical
before and after the patch. Where a string literal inside that region legitimately changes — a
warning message, a label — compare a second time with every literal replaced by a placeholder, and
confirm that the literal count is unchanged and that no numeric or control-flow token moved.

**Use a fresh filename for every file transfer.** Writing over an existing path through the device
bridge keeps the old content and reports success.

**Every shared script carries a cache anchor, not only the engine.** A tool compares the runtime's
identifier at boot — `DiagramUI.api === 'tools.petrov.re/ui/v1'` — so a shared script that changes
while its `<script src>` stays bare is served from cache against pages that have already moved. The
2026-09-11 host rename landed correct files on the server and dropped every cached visitor into
`degrade()`: `uiApi` still read the old identifier, `uiPanels` was 0, and the interface was gone
while nothing on disk was wrong. `diagram-ui.js` was bare in 75 pages and `site-disclaimer.js` in 74.
Anchor `diagram-ui.js`, `site-disclaimer.js`, `diagram-compute*.js`, `diagram-scene3d.js` and
`diagram-scene-editor.js` the way the engine is anchored, and rewrite all of them in the same pass
that changes the file they point at.

**A change to a value both sides compare lands in one pass or not at all.** The identifier rename
touched 139 files of code and data, then 48 generators and the `bench-src/` harness — a generator
left behind reintroduces the old value at the next regeneration — then the documentation. Verify by
scanning the whole tree with `_backup` and `_new` excluded, and expect zero.

Back up before editing, into a directory named for the campaign and under the original filename:
`_backup/prelang/` holds each file as it stood before the language work, `_backup/prereport/` before
the report work. Verify after deploying: sha256 equals what was built, byte size matches, and the
`?v=` anchor is unchanged and present exactly once.

### 6.3 A preset is named for the engineering it demonstrates

A preset carries no client identity. One preset named for a real project, city, reservoir and
water-treatment plant was renamed for the flow regime it shows, with every number kept. Identity also
sits where an ASCII scan will not find it: in non-Latin spellings of the same names, and in sidecar
i18n files keyed by the English string. Search the translations and the language packs as well.


## 7. Framework deploy

Changes to `index.html`, `validation.html`, `benchmark.html`, `catalog.php`, `site-disclaimer.js`, `diagram-common.js`, the manifest schema, the handoff quantity vocabulary, the status labels, category set, or common language rules are framework changes. They require a full-site QA pass and a full deploy package. Ordinary tool changes do not.

### 7.1 Server configuration carries what no tool can declare

`.htaccess` settles three things for the whole estate. Each is commented in the file with the
measurement that produced it.

**Character set.** A manifest of translated titles, descriptions and validation prose runs to tens of
kilobytes, which pushes `<meta charset="utf-8">` past the first 1024 bytes a browser prescans for it —
byte 82 590 in `nuclideatlas.html`. With no charset on the response, the encoding of every page rested
on the browser's own detector, and a headless render of the French sheet came back as "Atlas des
nuclÃ©ides". `AddDefaultCharset utf-8`, plus `AddType` for `.html .htm .js .mjs .json`, settles it
before the first byte of body arrives.

**Cache.** The framework and the tool sheets must never be served stale; the file carries
`no-cache, must-revalidate` for the served extensions and disables the edge cache.

**Backups under the web root are served.** A pre-edit copy written to `_backup/` answered HTTP 200 at
a guessable URL, which leaves a redacted string fetchable after the live file has been corrected.
`_backup/.htaccess` denies the files themselves and not only the directory listing. Any new directory
under the web root that holds pre-edit copies needs the same file, and `_incoming/` carries it for the
same reason.

## 8. QA gates

Before publication, verify:

- every listed HTML has one parseable manifest;
- `manifest.file` equals the real filename exactly;
- every language named in `catalog_languages` has a title, summary, description and limitations;
- no English slot of a localisation call holds non-Latin text — scan the first argument of every
  `T(...)`, every manifest `description.en` and every warning string before deploying;
- every dependency exists (except the server-maintained datasets listed as `SERVER_DATA` in
  `catalog.php` — `neutron-data/`, `nuclide-data.js` and the `smr-*.json` trio — which are deliberately
  preserved from the existing server deployment and are reported as warnings, not errors);
- `catalog.php` parses under the target PHP version and reports no manifest errors;
- index renders without horizontal overflow at ~390 px viewport;
- opening/closing deck rows does not navigate accidentally, and the status chip in a row opens the
  benchmark report **without** toggling that row;
- `benchmark.html?tool=<id>&lang=xx` renders for every benchmarked tool in every language, shows the
  flagged cases as flagged, and degrades with a plain message for an unknown `?tool=`, a missing
  `?tool=`, a tool with no benchmark and an artifact that fails to load. **Run
  `node /root/harness/benchgate.mjs` — it starts its own `php -S` and does this for every catalogued
  tool.** The page needs PHP: under `python3 -m http.server`, `catalog.php` comes back as source with
  a `200`, and until 2026-08-22 that produced a one-line page on the server every other gate uses;
- no page shows the `verified` label while `validation.review` is absent;
- selected language reaches tool URLs as `?lang=xx`;
- every tool exposes the shared return link;
- no tool calculation code was changed merely to update catalog metadata;
- no secret, API token, private key or credential is present in client-side HTML/JS/JSON;
- `catalog.php` reports zero `errors` — an error means the tool is **not listed at all**, so no
  `manifest_json`, `file_mismatch`, `missing_field`, `languages`, `dependency_missing`,
  `benchmark_artifact` or `status_unsupported` entry;
- `catalog.php` `warnings` contains only defects you can name and intend to fix — `network_access_false`,
  `report_without_runtime`, `handoff_vocabulary` and friends flag a listed tool rather than hiding it,
  so the list is the site's honest to-do list and must not be allowed to fill up with noise;
- every tool declaring `report.pdf: true` loads `diagram-common.js`, and its report footer carries the
  source URL on every page — plus the benchmark report URL when the tool has an artifact;
- every tool declaring `python_export.supported: true` produces a script that runs and whose self-test
  passes; every tool declaring `false` states a reason; a provider that declines a particular state
  returns `{unsupported: "…"}` with that reason, and a scoped export names in its header both what it
  reproduces and what it does not;
- a report figure is embedded as a `data:` URL or inline SVG — never fetched — and the per-page footer
  survives on the page that carries it;
- writing `<html lang>` is done through `Diagram.setDocumentLang()`, and no page live-locks when the
  attribute is assigned its current value repeatedly;
- every `handoff` quantity name is in the §2.4 vocabulary and every value is SI; the "Send to …" menu
  labels a fallback list as a snapshot instead of passing it off as the live catalogue;
- no tool loads a script, stylesheet or font from a third-party host while declaring
  `network_access: none`;
- every inline script passes `node --check`;
- the report builds in all seven languages, carries its figure, and shows zero `undefined`,
  `[object Object]`, `NaN`, unfilled `{placeholder}` and console errors;
- no sentence longer than 45 characters appears twice in a rendered report;
- `window.__dgcBenchmark()` regenerates the deployed artifact identically;
- the server answers with `charset=utf-8` in `Content-Type` for `.html`, `.js` and `.json`;
- the rendered report pages are read as images and not only inspected as source.

## 9. neutron-data

`neutron-data/` is a large existing runtime dataset. Normal framework deployment must **not delete or overwrite it** unless the task explicitly concerns neutron data. `neutron_transport.html` declares it as a dependency so the omission from a framework ZIP is visible and intentional.


## SMR dynamic knowledge base

For `smrselector.html`, read `SMR_UPDATING.md` before editing reactor data. Do not restore an embedded `inline-data` snapshot: the tool intentionally loads `smr-data.json`. The WNA SMR Design Database is the automatic design-discovery master: new WNA design cards are added without human approval and records with `record_origin=wna_auto` are refreshed automatically. Preserve the original curated records and their richer engineering/judgement fields; WNA data is a cross-check for those records. Do not convert a generic page hash change into a review item. After SMR data/schema changes run `php smr-validate.php` and the site-wide validator.

## 10. Site usage counters (framework, since 2026-09-19)

The end of `diagram-ui.js` carries the counter block (`tools.petrov.re/stats/v1`), so every page
that loads the UI framework is counted with no per-tool code. `index.html`, which loads no
framework by design, carries a minimal copy that sends the view and its visible time. `reactorgame.html` loads
neither and is not counted.

- **Sent** via `navigator.sendBeacon` (fallback: `fetch` with `keepalive`) to `/_stats/hit.php`:
  the view about a second after load, then the increments since the previous beacon, five seconds
  after the last counted action and when the page is hidden or left. Counted: page file name, UI language, referrer class (`?ref=<tag>` wins), viewport
  class, CPU-core bucket, counts of input edits, runs after the first user gesture, resets, preset
  names, download extensions, prints and PDF reports, run-time buckets, visible seconds, and up to
  five JS error messages with digits masked. Since 2026-09-26 the shared toolbar also sends `co`
  (Continue with →) and `at` (Attach to project); whether they are stored depends on the key filter
  in `/_stats/hit.php`, which this pass did not change — check it before reading those two.
- **Never sent**: input or output values, cookies, identifiers. The collector stores no IP address
  and no user agent; it keeps daily sums per page only, in `~/tools-stats/stats.sqlite`, outside
  the web root.
- **Off** when the host is not `https://tools.petrov.re`, under `navigator.webdriver`, Do-Not-Track
  or Global Privacy Control, or when the browser opted out on the dashboard
  (`localStorage.dgu_stats_optout = "1"`). `?stats=qa` forces a beacon for automated checks; the
  collector files it in a separate 200-row table and never in the counters.
- **Hooks** are the prototype methods `run`, `setState`, `onFieldCommit`, `reset` and `example` of the
  app returned by `DiagramUI.app()`, a patched `HTMLAnchorElement.prototype.click` plus a capture
  listener for `a[download]`, `beforeprint`, and the insertion of `#dgc-report-frame`. A tool that
  computes outside `on.compute` (thermaloptimizer) or builds no app (generatorgrid,
  protectioncoordination, vcatrainer) reports views, downloads, prints, reports and errors, and no
  runs.
- **Dashboard**: `/_stats/` (HTTP Basic Auth, `~/tools-stats/.htpasswd`).
- The counters are not a tool's network access: a tool's `network_access` keeps describing what the
  calculation fetches (FRAMEWORK_V2_SPEC §2, clarification of 2026-09-19).
- To tag a link, append `?ref=<tag>` (letters, digits, `_`, `-`, up to 20), e.g. `?ref=li` in
  LinkedIn announcements.
