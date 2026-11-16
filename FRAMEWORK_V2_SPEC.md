# tools.petrov.re — framework v2 specification

Revision: 2026-08-14c. This spec is normative for `diagram-common.js`, manifest schema v2,
`catalog.php`, `validation.html` and `AGENTS.md`. The runtime additions of §1.0, §1.3.1, §1.4.0–1.4.3,
§1.5.1 and §1.6 are additive and opt-in: every earlier signature keeps working unchanged.

Design rules that override convenience:
- **No external network dependency.** Several existing tools load jspdf/xlsx/html2canvas from cdnjs
  while their manifest declares `network_access: none` — that is both an offline bug and a false
  declaration. The v2 runtime must provide PDF and data export with **zero external scripts**.
- **One shared runtime file.** `diagram-common.js` is loaded by every tool next to
  `site-disclaimer.js`. It must be side-effect-safe, work when a tool registers nothing, and never
  throw into a tool's own code path.
- **A tool that declares a capability must actually have it.** `catalog.php` rejects manifests that
  claim more than they implement.
- **The exported script runs on a bare `python3`.** Standard library only, one self-contained file.
  A reader must be able to re-run the calculation with nothing installed; a tool that cannot be
  written that way ports the missing piece, scopes the export, or declines (§1.4.0).

---

## 1. `diagram-common.js` — public API

Exposed as `window.Diagram` (single global; do not add others).

```js
Diagram.init({
  id, file, title,           // fall back to the tool manifest when omitted
  state:  { serialize, deserialize },   // optional
  record: () => ({ inputs, outputs, units, model, warnings }), // optional but required for PDF/CSV
  python: () => ({ code, requires, basis, selftest, covers, scope, displayed }),  // optional;
       //     return ({ unsupported: "<reason>" }) to decline the current state
  handoff:{ provides, accepts, build, apply },                 // optional
  report: { sections: rec => [ … ], render: (rec, ctx) => items }   // optional
})
```

Everything added after the first release is opt-in: a tool that passes none of the new fields gets
exactly the behaviour it had before.

### 1.0 Readiness signal

Boot is synchronous, but a tool's first result may need a worker, a fetch or a simulation. A fixed
delay is not a readiness test — it is a guess that is either too short for a slow tool or wasted on
every fast one.

- `Diagram.ready(promise | () => promise)` registers a gate. A tool whose first result is
  asynchronous should register one.
- `Diagram.whenReady([timeoutMs=15000]) -> Promise` resolves once boot and every registered gate has
  settled, and sets `window.__diagramReady = true`.
- With no gates registered, readiness is reached at the end of boot. A page that never calls `init()`
  still reaches it, so an automated checker can wait on the same signal everywhere.

A checker waits for `window.__diagramReady` **and** for `record.build().outputs` to stop changing;
neither alone is sufficient, and both are bounded.

### 1.1 State codec and permalink
- `Diagram.state.encode(obj) -> string` — JSON → `deflate-raw` via `CompressionStream` → base64url.
  Fallback to plain base64url of the JSON when `CompressionStream` is unavailable.
- `Diagram.state.decode(str) -> obj`.
- `Diagram.state.link() -> string` — absolute `https://tools.petrov.re/<file>?lang=xx&s=<encoded>`.
- On load the runtime reads `?s=`, decodes and calls the tool's `deserialize`. A decode failure must
  be reported to the user, never swallowed — a silently ignored permalink is worse than an error.
- The runtime adds a **Copy link** control to the shared toolbar. Keep the encoded state under
  ~4 kB; above that, warn that the link may be truncated by some clients and offer the JSON record
  instead.

### 1.2 Calculation record
`Diagram.record.build()` returns:
```json
{ "schema": "tools.petrov.re/calculation-record/v1",
  "tool": {"id":"","file":"","title":"","manifest_revision":"","status":"","independent_validation":false},
  "generated_at": "<ISO 8601 UTC>",
  "source": "https://tools.petrov.re/<file>",
  "permalink": "<state link>",
  "inputs": {}, "outputs": {}, "units": {},
  "model": {"equations": [], "ranges": [], "notes": []},
  "warnings": [], "limitations": "<manifest limitations, current language>" }
```
Exports: `Diagram.export.json()`, `Diagram.export.csv()` (flattened key/value/unit), both named
`<id>-<UTC timestamp>.<ext>`.

### 1.3 PDF report — source attribution is mandatory
`Diagram.report(opts)` renders the record into a hidden same-origin iframe and calls `print()`.
No jsPDF, no html2canvas. Every page must carry, via `@page` margin boxes or a repeating
table header/footer:

- header: tool title (current language) · `tools.petrov.re`
- footer, on **every** page:
  `Source: https://tools.petrov.re/<file> · <ISO timestamp> · <status label>, independent validation: yes|no`
  `[· Benchmark report: https://tools.petrov.re/benchmark.html?tool=<id>&lang=xx] · page N of M`
  The source URL is mandatory and comes first; the page counter always closes the line. The report
  segment is present only for a tool that has a benchmark artifact, so a prototype keeps the short
  footer and a printed benchmarked report leads back to the evidence (§6). Two lines of the footer
  box are the budget — do not add a fourth segment without removing one.
- first page additionally: the permalink URL in full as selectable text, the tool's
  `limitations` string, and the benchmark summary (including the report URL) if the tool has one.

`Diagram.report.attribution({page, pages})` returns that footer string so a tool that keeps its own
PDF path can stamp the identical text; it adds the report segment by itself, and `report.url(lang)`
returns the report URL alone. Any tool that still uses jsPDF **must** call it.

#### 1.3.1 Extra sections, figures and a tool-supplied body

`report: { sections: rec => [...] }` appends sections to the record. A section is

```js
{ title, text,
  image,            // data: URL, or {src, caption, width, alt}, or an array of either
  svg,              // inline "<svg …>…</svg>", or {markup, caption, width}, or an array
  head, rows, cols, // table
  notes }           // small print
```

A chart-centric tool no longer has to keep its own PDF path to keep its picture: pass
`canvas.toDataURL("image/png")` as `image`, or the chart's own markup as `svg`.

- Only `data:` image URLs are printed. Any other source is refused and the omission is printed in
  place of the figure — the report may not fetch anything, and silently dropping a figure would be
  worse than saying so.
- Inline SVG is sanitised: `<script>`, `on*=` handlers and non-`data:`/non-fragment `href`s are
  stripped. The printed report is offline and inert.
- A figure is one flow item, capped at the width of the text column and at one page body's height, so
  it paginates like any other block and the per-page footer stays intact.

`report: { render: (rec, ctx) => items }` replaces the **body** of the report — the inputs/outputs/
model/warnings dump — with whatever the tool builds. It never replaces the attributed head (title,
timestamp, source, status, revision, permalink, limitations, benchmark summary), the closing
disclaimer or the footer: the runtime keeps ownership of the pagination and of the attribution, so a
richer report cannot lose them. `render` returns an HTML string or an array of them, each a top-level
block. `ctx` supplies the block builders — `h, p, kv, url, table, image, svg, sections, raw`, plus
`lang`, `esc` and `record` — so a tool never hand-writes the report's markup. Returning nothing falls
back to the default body. `sections` are appended after `render` output either way.
`Diagram.report({body})` passes the same items for a single report without registering a hook.

### 1.4 Python export
`Diagram.python.emit()` returns a single runnable `.py` file:
- header comment: tool title, `https://tools.petrov.re/<file>`, manifest revision, generation
  timestamp, permalink, the tool's `limitations`, and the equations from `model.equations`;
- the current inputs as module-level constants with units in comments;
- a pure function per computed quantity;
- the dependency list and the basis statement of §1.4.0;
- `if __name__ == "__main__":` printing every output the tool displays;
- **a self-test block** asserting the freshly computed values equal the values the tool displayed at
  export time, to a stated tolerance. The exported script must verify itself.

**Do not fake this.** A tool whose result comes from a large solver, a data table or a Monte-Carlo
run must set `python_export.supported = false` with a one-line `reason`, rather than emit a script
that reproduces only a fragment. Partial export is allowed only if the header states exactly which
part it reproduces.

#### 1.4.0 Dependencies, and what the script is claiming

**The export runs on a bare `python3`: standard library only.** `requires` should normally be empty.
The export exists so that a reader can re-run the calculation with nothing installed and see exactly
what the tool did; a `pip install` standing between the reader and the number defeats that, and a
value handed over by a library is not the tool's own value. This is achievable in practice, not in
theory: `steam_tables.html` ports the complete IAPWS-IF97 engine — regions 1, 2, 3, 4 and 5, the
region 2/3 boundary and the numerical inversions, some 605 lines — into the script it emits, and that
script needs nothing but `math`.

A tool whose computation genuinely cannot be written that way does **not** quietly declare a
dependency. It has exactly three honest options:

- **(a) port it.** Carry the piece the script needs into the file. Coefficient tables are long and
  dull; they are also checkable, which a `pip install` is not. Port the subset that is actually
  used — region 1, not all five — and say in the header where it came from.
- **(b) scope it.** Emit for the part that can be reproduced honestly and say so: `covers` for the
  outputs (§1.4.2), a per-state decline for the modes, fluids or ranges that are out of reach
  (§1.4.1). The header must name what is excluded, not merely imply it.
- **(c) decline.** `python_export.supported: false` with a reason, or `{unsupported: "…"}` for the
  current state. A precise refusal is worth more than a script the reader cannot run.

Anything else — an export that works only after the reader installs a package — is a fourth option
that this section exists to remove.

**If a `requires` entry survives anywhere**, it is an exception and is presented as one: the
generated header carries a one-line justification of why the standard library is not enough, taken
from `requires_reason`; the runtime makes the dependency conspicuous, printing a banner above the
header entry and again at the top of the script's own output; and `catalog.php` raises
`python_export_requires` against the manifest that declares it. A `requires` without a
`requires_reason` is emitted with **"justification: NOT STATED by the tool"** in the header and the
same warning banner, because an unexplained dependency is the failure this section exists to prevent.
There is no approved list any more: `numpy`, `scipy`, `CoolProp` and `iapws` are treated exactly like
any other package, which is to say as something to be justified or removed.

**Say what the script is claiming.** The disclosure machinery stays, because it is what makes the
scoped and ported cases readable. The provider declares it with `basis`:

```js
python: () => ({ code, requires: [],
  basis: { kind: "reproduce",
           note: "the IAPWS-IF97 region-1 gibbs polynomial and the 0.05 K enthalpy table this page "
               + "interpolates are ported into the script verbatim, coefficients and all; the "
               + "circuit algebra is the page's own, line for line",
           deviation: "none observed; the script and the page evaluate the same expressions" },
  selftest: { tolerance: 1e-12, note: "…" } })
```

`kind` is `"reproduce"`, `"recompute"` or `"mixed"`.

- **reproduce** — the script re-implements the tool's own computation. Every number it prints comes
  out of the same equations, in the same order, as the page. **This is now the norm**, and the header
  says so: with `requires` empty and no `basis` given, the runtime prints the reproduce claim itself
  and states that the script needs nothing but the standard library.
- **recompute** — the script obtains one or more quantities from somewhere other than the tool's own
  model. The answer should be close, and may be better, but it is *not* the tool's answer, and the
  reader must not be left to discover that by diffing digits. `deviation` states the **expected size
  of the difference** — "small" is not a number. With a library involved this is not optional; it is
  also the honest label for a port that deliberately drops a step (an interpolation table, a
  convergence refinement) rather than carrying it.
- **mixed** — part of each. A bare string for `basis` is read as the note with `kind: "mixed"`.

**The self-test tolerance follows from the basis, and the header says which.** A ported computation
that evaluates the same expressions in the same order should assert a tight tolerance; if porting
changes the last digits — a different summation order, a dropped interpolation step — the header says
so and the tolerance is set from that named cause, in `selftest.note`. Widening the tolerance because
the script disagrees with the tool for any other reason is falsification: the disagreement is a
defect in one of the two, and the export must not be the place it is buried. Two rules follow:

- the tolerance must be justified by a named cause, and the cause must be the one that dominates;
- if the deviation exceeds what `basis.deviation` predicts, the script is wrong, the tool is wrong,
  or the claim is wrong. Fix one of the three. Do not raise the number.

The honesty rules of §1.4.1–1.4.2 are unchanged by any of this. A computation that cannot be honestly
reproduced still declines — `unsupported` / `{supported:false, reason}` with a reason the user reads
verbatim — and an export that covers part of the record still says so with `covers`. Porting closes
the gap for property correlations and small numerics; it closes nothing for a Monte-Carlo run, a
shipped data file, a mesh solver or a wall-clock-dependent trajectory, and those decline exactly as
before.

#### 1.4.1 Declining the current state

`python_export.supported: false` is a statement about the whole tool. Support is often per state —
per module, per fluid, per validity range — and the honest answer changes as the user works. The
provider may therefore decline the state it is called in:

```js
python: () => selectedBranch === "montecarlo"
  ? { unsupported: "the Monte-Carlo branch is sampled, not closed form; switch to the analytic branch to export" }
  : { code, covers, selftest }
```

`unsupported` is a string, or `{en:…, nl:…}` for a translated reason. `{supported:false, reason}` is
accepted as the same thing. The reason is shown to the user verbatim — *"Python export is not
available for the current state: …"* — and `Diagram.python.info()` returns
`{error, reason, unsupported:true}`. Returning `null` still yields the generic "no python code";
a provider that declines must say why.

#### 1.4.2 Scoped export: `covers`

A partial export must be able to pass its own self-test, or a tool is pushed into declaring
`supported: false` for a script that is perfectly correct as far as it goes.

`covers: ["eta","w_t","q_in"]` names the record outputs the script reproduces. Then:

- `EXPECTED` holds only those outputs and the self-test asserts only those;
- `NOT_REPRODUCED` holds the rest, and the `__main__` block prints them as not reproduced;
- the header states the split in plain words — how many of how many outputs are reproduced, which
  ones are not, and that the self-test therefore asserts only the reproduced ones. `scope` adds the
  one-line reason.

`covers` naming nothing that is in the record is an error, not a silent full export. Names in
`covers` that are absent from the record are ignored and listed in the header. Without `covers`,
every recorded output is asserted, exactly as before.

#### 1.4.3 Non-scalar outputs

A record output may be an object or an array (a profile, a per-state table). The self-test must not
crash on it — an exported script that raises `TypeError: unsupported operand type(s) for -: 'dict'
and 'dict'` is worse than no export at all. The emitted self-test therefore:

- flattens both the expected and the computed value to scalar leaves (`profile.y[2]`);
- reports a leaf that the script's result does not have, rather than skipping it;
- compares two numbers relatively, anything involving a string, boolean or `None` by equality, and
  counts a leaf it cannot compare as **skipped** — reported in the final line, never dropped in
  silence;
- prints a summary that says how many values were checked, how many were skipped, and how many
  outputs the script does not reproduce.

Formatting via a tool-supplied `fmt()` is wrapped: a `fmt` that cannot render a structure is a
failed check, not a traceback.

### 1.5 Cross-tool handoff
Payload `tools.petrov.re/handoff/v1`:
```json
{ "schema":"tools.petrov.re/handoff/v1",
  "from": {"tool":"","file":"","manifest_revision":""},
  "generated_at":"<ISO>",
  "quantities": { "<name>": {"value": 0, "unit": "<SI unit symbol>"} },
  "sets": { "<set name>": [ {"<name>": {"value":0,"unit":""}} ] } }
```
- **Values are always SI**, base units only: K, Pa, kg/s, m3/s, J/kg, W, kg/m3, m, s, kg/kg, V, A, Ω.
  No kPa, no °C, no bar, no kW. The receiving tool converts for display.
- Canonical quantity names (extend only by adding to this list): `T`, `p`, `rho`, `h`, `s`, `u`, `v`,
  `x`, `w` (humidity ratio), `mdot`, `Vdot`, `Q`, `U`, `A`, `NTU`, `eps`, `f_darcy`, `Re`, `D`, `L`,
  `dp`, `M` (Mach), `phi` (neutron flux), `rho_reac` (reactivity), `E`, `I`, `V_volt`, `Z`, `XR` (reactance/resistance ratio X/R), `Ik` (initial symmetrical short-circuit current Ik″), `ip` (peak short-circuit current), `Ib` (symmetrical breaking current), `Ith` (thermal-equivalent short-circuit current), `Ires` (residual/earth current 3I0), `t_clear` (fault clearing time).
- `Diagram.handoff.send(targetFile, payload)` opens `target.html?lang=xx&in=<encoded payload>`.
- `Diagram.handoff.receive()` runs on load and validates the schema, finite numeric values and the SI-unit allowlist before calling the tool's `apply`. Any invalid unit/value rejects the entire payload; receivers never partially apply a malformed handoff.
  A tool must ignore valid quantities it does not understand and **tell the user which ones it ignored**.
- The runtime renders a "Send to …" menu listing the tools whose manifest `handoff.accepts` overlaps
  this tool's `handoff.provides`, using `catalog.php`.

#### 1.5.1 When the catalogue cannot be read

`catalog.php` needs a server. Opened from a `file://` copy, a USB stick or an offline mirror the
fetch cannot succeed, and an empty "Send to …" menu misrepresents that as "no tool accepts these
quantities". `Diagram.handoff.targets()` therefore degrades in three steps:

1. the live catalogue, when it answers;
2. otherwise a catalogue embedded in the page —
   `<script type="application/json" id="diagram-handoff-catalog">[{"f":"file.html","t":"Title","a":["T","p"]}]</script>`,
   or `Diagram.handoff.setCatalog(list)`;
3. otherwise the runtime's own snapshot of the deployed manifests, carried in `diagram-common.js`
   with the date it was taken.

A fallback list is **labelled as one**: the menu says the catalogue could not be read, that the list
comes from a stored snapshot and gives its date. Where even that is empty, the menu says plainly that
receiving tools cannot be listed offline and still offers *Copy the handoff data (JSON)*, so the
payload path works with the target opened by hand. Under `file://` the runtime does not attempt the
fetch at all — it only produces a CORS error in the console.

`targets()` keeps its signature (a promise of the array) and the array carries `.offline` and
`.snapshot_date`; `Diagram.handoff.targetsInfo()` returns `{targets, offline, snapshot_date}`.

The snapshot is regenerated whenever a tool's `handoff.accepts` changes:
`php catalog.php | jq -c '[.tools[]|select(.handoff.accepts|length>0)|{f:.file,t:.title.en,a:.handoff.accepts}]'`

### 1.6 `<html lang>` — one observer contract

`diagram-common.js`, `site-disclaimer.js` and most tools watch `<html lang>`. A tool that assigns
`documentElement.lang` unconditionally — even the identical value — wakes every observer; if any of
them writes it back the page live-locks. `probabilisticrisk.html` hung exactly this way.

- Both framework observers ignore a mutation whose value is unchanged. A no-op write costs nothing.
- The runtime's observer disconnects itself, with a console warning, after 40 genuine language
  changes inside two seconds: a runaway loop degrades to a stale toolbar, never to a hung page.
- `Diagram.setDocumentLang(l)` writes the attribute **only when it really differs**; that is the
  supported way for a tool to publish its language.
- `Diagram.watchLang(cb)` gives a tool the same guarded observer, so it does not have to write one.

---

## 2. Manifest schema v2

`"schema": "tools.petrov.re/tool-manifest/v2"`. All v1 fields are retained unchanged. New fields:

| field | type | rule |
|---|---|---|
| `status` | `prototype` \| `benchmarked` \| `verified` | see §3 |
| `validation` | object | `{ basis: string, independent_validation: bool, benchmarks: [...] }` |
| `validation.benchmarks[]` | object | `{ id, reference, citations[], cases, passed, tolerance, run_at, artifact }` — `artifact` is a path such as `benchmarks/steam_tables.json` |
| `report` | object | `{ pdf: bool, source_attribution: bool }` — both **must** be `true` for a new tool |
| `python_export` | object | `{ supported: bool, reason?: string, requires?: [] }` — `requires` is normally **empty**: the exported script must run on a bare `python3`, standard library only (§1.4.0). Any surviving entry is an exception and must be justified in the generated header |
| `handoff` | object | `{ provides: [], accepts: [] }` — quantity names from §1.5, empty arrays allowed |
| `state_codec` | object | `{ permalink: bool, record: "tools.petrov.re/calculation-record/v1" }` |

`independent_validation` moves into `validation` but the top-level v1 key is kept as a mirror for
one release so nothing breaks.

`category` is one primary navigation category. The accepted vocabulary is:
`nuclear-physics | nuclear-eng | thermo | transients | hvac | acoustics | envelope | electrical | control | safety | project-delivery | tendering | engineering-change | mep-maintenance | plumbing | vertical-transport | ccus | oil-gas-h2 | struct | physics | optics | mat`.
The catalogue UI owns the translated long and short labels. A tool is classified by the task a user
comes to perform, not by every underlying method it uses; adding a category is therefore a framework
change, not an ordinary tool edit.

`network_access` **must be accurate**, and v2 fixes the v1 ambiguity about a tool that loads its own
data file. The vocabulary is exactly three modes:

| mode | meaning |
|---|---|
| `none` | literally no network at all; everything the tool needs is inside the HTML |
| `same-origin-data` | fetches **only its own declared local dependencies** (data JSON, language pack, `.wasm` core) from this site, and contacts no external service; `note` names the files |
| `external` | contacts a third-party host; `note` names what is downloaded or transmitted, and why |

A tool that `fetch()`es a file listed in `dependencies` is `same-origin-data`, not `none`. A page
loading anything from a CDN declares `external`.

## 3. Status ladder

The schema enum is exactly `prototype | benchmarked | verified` and does not change.

- **`prototype`** — the default. No benchmark, or a benchmark that does not pass.
- **`benchmarked`** — every entry in `validation.benchmarks` has `passed == cases`, each names a
  reference **independent of the tool's own code**, cites it, and states a tolerance chosen from the
  physics rather than from what makes the tool pass. The artifact file must exist and must parse.
  Still `independent_validation: false` — this is the author's own harness.
- **`verified`** — `benchmarked` **plus** a documented review by someone other than the author,
  recorded in `validation.review` (who reviewed it, when, against what, and where the record lives).
  Nothing may be published as `verified` without that record. The tier is **reserved**: no tool holds
  it today, `catalog.php` rejects a manifest that claims it without a review, and every renderer
  (`index.html`, `validation.html`, `benchmark.html`, `diagram-common.js`, `site-disclaimer.js`)
  independently falls back to the `benchmarked` label when `validation.review` is absent, so the word
  can never appear on an unreviewed claim even if the catalog check were bypassed.

### 3.1 Displayed labels

The enum value is machine vocabulary; what the reader sees is a label. `benchmarked` is displayed as
**“Benchmark tested”**, never as the bare enum word, in all six languages:

| status | en | uk | de | nl | fr | es |
|---|---|---|---|---|---|---|
| `prototype` | Prototype | Прототип | Prototyp | Prototype | Prototype | Prototipo |
| `benchmarked` | Benchmark tested | Перевірено за еталоном | Benchmark geprüft | Benchmark getoetst | Testé sur banc d'essai | Contrastado con referencia |
| `verified` (reserved) | Reviewed by a third party | Перевірено третьою стороною | Von Dritten geprüft | Door een derde beoordeeld | Examiné par un tiers | Revisado por un tercero |

The label is shown with the case tally (`Benchmark tested · 299/299`) wherever there is room, and it
is a link to that tool's benchmark report (§6). A tool at `prototype` that nevertheless has an
artifact — a benchmark that runs but does not fully pass — keeps the `prototype` label and still
links to the report, because a failing benchmark is exactly what a reader must be able to see.

A self-check that re-evaluates the tool's own formula does not count towards `benchmarked`, and the
UI must not present it as validation.

## 4. `catalog.php`

- Accept manifest v1 and v2; report the version per tool.
- **`errors` — the entry is unusable, so the tool is left out of `tools`:** the manifest is absent,
  unreadable or not parseable JSON; `file` does not match the deployed filename; a required field is
  missing (or `category`/`status`/the six languages are invalid); a declared local dependency does not
  exist; a `validation.benchmarks[].artifact` does not exist or does not parse; `status: benchmarked`
  (or `verified`) without a benchmark entry where `passed == cases`, and `verified` without a review.
  Datasets that live on the server and are deliberately not shipped by a framework deploy
  (`catalog.php` `SERVER_DATA`, AGENTS.md §9) are exempt from the dependency rule and warn instead.
- **`warnings` — the defect does not stop the tool working, so the tool stays in `tools` and carries
  the warning in its own entry:** `network_access` understating what the page really loads;
  `report.pdf: true` without `diagram-common.js` (or without `source_attribution`); `handoff.accepts`
  naming a quantity outside the §1.5 vocabulary; a missing `note` on a non-`none` mode; a benchmark
  that would justify a higher status. Taking a working tool off the site for a defect it can be
  flagged for is worse than the defect.
- Off-site detection counts only what the browser would really request: a `<script src=>`,
  `<link href=>` or `<img src=>` attribute, a `fetch(…)` argument, or an `XMLHttpRequest.open()`
  target. A URL-shaped string elsewhere in the file — for instance inside a vendored library's dead
  code path — is not a fetch and must not be reported as one.
- Expose `status`, `validation` summary, `handoff` and per-tool `warnings` so the index, the
  validation register and `benchmark.html` can render them without opening every tool.
- `benchmark.html` is site UI, not a tool: it carries no manifest and is in `SKIP`.

## 5. `index.html` and `validation.html`

`index.html` shows the **real** status of every tool, never a hardcoded word. The per-tool chip
carries the displayed label of §3.1 and, whenever a benchmark artifact exists, is an `<a>` to
`benchmark.html?tool=<id>&lang=xx` reading `Benchmark tested · N/N`. The chip lives inside
`<summary>`: its click handler must stop the event before the `<details>` sees it, or opening the
report would also toggle the row. The opened row repeats the status, states that independent
validation was not performed, and links to the report.

`validation.html` is the register: one row per tool showing status, number of benchmark cases and how
many passed, the reference and its citation, the tolerance, the run date, and a link to the artifact
JSON. Each row whose tool has an artifact links its status cell to the same report page. Tools at
`prototype` say so plainly and state why (no benchmark yet / benchmark failing). Six languages, as
everywhere else.

## 6. `benchmark.html` — the readable benchmark report

`benchmark.html?tool=<id>&lang=xx` is the page behind every status label. It reads `catalog.php` and,
for the tool it was asked about, each `validation.benchmarks[].artifact`, and renders the evidence
for a human. No external dependency, the same CSS variables and light/dark handling as `index.html`,
the same six languages, no horizontal overflow at 390 px.

It must show, in this order:

1. the tool, its displayed status with the case tally, `independent_validation`, the manifest
   revision and a link to the tool itself;
2. a plain statement, before any number, that this is the author's own harness run against
   independent references and is **not** an independent validation;
3. what was tested and against what reference, with `reference_citations` rendered **in full** — not
   truncated, not summarised;
4. the tolerance, quoted verbatim from the artifact, which is where the reason for that particular
   number is stated;
5. cases run / passed / failed / flagged as four figures, then the failing cases in full detail;
6. **flagged cases as flagged, never as passed.** A case where the independent references disagree
   by more than the tolerance, where a quantity is recorded `graded: false`, or which the tool itself
   marks uncertain, is counted in its own figure and listed with its reason. This is the honest part
   of the page and must stay above the fold of its section, never folded into a "passed" count;
7. what the artifact records as explicitly **not** benchmarked (`not_benchmarked`), plus run notes —
   environment, known issues during the run, cross-check between references, captured page errors;
8. every case in a collapsed table, the run date, the manifest revision and a link to the raw JSON
   artifact; anything else the artifact carries is offered as raw JSON rather than dropped.

Degradation is part of the contract: an unknown `?tool=`, a missing `?tool=`, a tool with no
benchmark and an artifact that fails to load each produce a plain explanation and a way back to the
index — never an empty page and never a silent failure.

The artifact's own strings (reference, citations, tolerance, case notes) are evidence and are shown
verbatim in the language they were written in. Only the interface around them is translated.

## 7. `AGENTS.md`

Add: the v2 manifest requirement, the `diagram-common.js` include, the mandatory PDF source
attribution, the Python export rule (including when to set `supported: false`), the handoff
vocabulary and SI-only rule, and the status ladder with its evidence requirements, the displayed
labels of §3.1 and the benchmark report page of §6. Keep §9 (neutron-data) and the SMR section as
they are.

## 8. Deploy

`benchmarks/` ships with the site: `benchmarks/<tool>.json` per benchmarked tool, plus
`benchmarks/index.json` summarising all of them. `benchmark.html` ships with the framework files
(`index.html`, `validation.html`, `catalog.php`, `site-disclaimer.js`, `diagram-common.js`); a tool
whose status chip links to it is unreadable without it.

### Handoff dimensional validation clarification — 2026-09-04

The runtime validates not only the SI-unit allowlist, but the canonical unit for each quantity before `apply()`. A dimensionally mismatched pair such as `Ik` with unit `V`, `V_volt` with unit `A`, or `t_clear` with unit `m` is invalid even though each unit token exists elsewhere in the vocabulary.

### `network_access` and the site usage counters — clarification 2026-09-19

`network_access` describes what a tool's calculation and its declared dependencies fetch. The
site-level usage beacon that `diagram-ui.js` sends to `/_stats/hit.php` (AGENTS.md §10) belongs to
the framework, carries no input or output value, and does not change any tool's mode: a tool with
`none` stays `none`. The beacon is disclosed once, in the footer of `index.html`.
