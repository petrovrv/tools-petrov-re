# tools.petrov.re — porting a tool onto `diagram-ui.js`

Revision 2026-08-15a. Framework `tools.petrov.re/ui/v1`.

This is the working procedure. It is written to be executed by someone — or some session — with
**no memory of the audit**, against **whatever version of the tool exists on the day**. Everything it
needs is either in this file, in the four files listed under §0.1, or derivable from the tool itself.

The goal is a port that a user cannot tell happened, except that the screen is now the same shape as
every other tool: **no number changes, no capability is lost, no permalink breaks.**

---

## 0. Starting a session

### 0.1 What to put in front of the model

| File | Why |
|---|---|
| `PORTING_PLAYBOOK.md` | this file — the procedure |
| `TOOL_MIGRATION_MAP.json` | priors for the specific tool: archetype, slots, known traps |
| `UI_FRAMEWORK_SPEC.md` | the normative rules the result is judged against |
| `diagram-ui.js` | the library being adopted |
| `ui-demo.html` | the worked reference at level 3 |
| the tool's current `.html` | the thing being ported |
| `AGENTS.md` | the data contract, unchanged by this work |

`UI_AUDIT.md` is optional; the per-tool traps are already copied into the map.

### 0.2 Bootstrap prompt

> Port `<tool>.html` onto the shared UI framework `diagram-ui.js`, following
> `PORTING_PLAYBOOK.md` exactly. Use the card for this tool in `TOOL_MIGRATION_MAP.json` as a prior
> only: re-derive the classification from the current source (step 1) and tell me where the card is
> wrong. Do not change any calculation, any manifest field, or any exported artefact. Produce
> `<tool>.html` (ported), `<tool>.parity.json` (the numeric baseline) and a short report of what you
> deleted, what you moved and what you could not map.

One tool per session. Two tools in one session is how a shared helper gets invented twice.

### 0.3 The one thing that makes this safe

**Step 2 is not optional.** Capture the numeric baseline before touching anything. Every other step
is reversible; a silently changed number is not.

---

## 1. Inventory and classification (30 minutes, no edits)

Read the current file and write down, in the report:

1. **The model.** Which functions compute the answer? Are they pure, or do they read the DOM
   (`document.getElementById(...).value`) inside the maths? Note every place the maths touches the DOM.
2. **The state.** What does `Diagram.init({state:{serialize}})` return today? That object is the
   contract for existing permalinks — **its shape may not change**. If the tool has no `state`,
   you are free to design one.
3. **Inputs.** Every control: id, label, unit as displayed, min/max/step, default, whether it is
   validated, whether it is derived/read-only.
4. **Outputs.** Every displayed quantity, and what `record()` returns. These two lists must agree
   after the port; if they disagree before it, say so.
5. **Archetype**, by this test, in order — first match wins:
   - the user *creates and manipulates objects* in a drawing (place, drag, delete, select) → **studio**
   - the user is walked through *numbered steps* → **wizard**
   - the primary content is *material to read, filter or look up*, and inputs only narrow it → **reference**
   - otherwise → **calculator**
6. **Compute mode.** Is there a control the user must press to get an answer? → `run`. Otherwise
   `live`. If the tool is live but has a button that recomputes anyway, it is `live` and the button goes.
7. **Data dependencies** and, critically, **where `Diagram.init()` is called from.** If it sits
   inside a `.then()`, an `onReady`, an `ensureThen` or an event handler for a data/WASM load, record
   it: that is the S-2 defect and step 8 fixes it.
8. **Compare with the card** in `TOOL_MIGRATION_MAP.json`. Where the source disagrees, the source
   wins; note the disagreement so the map can be corrected.

Output of this step is a short written inventory. Do not start editing before it exists.

---

## 2. Freeze the numbers (the parity baseline)

Write `<tool>.probe.json` describing how to drive the tool from the outside:

```json
{
  "file": "moodydiagram.html",
  "ready": "window.__diagramReady === true",
  "set": { "D": "#dia", "L": "#len", "Q": "#flow", "eps": "#rough" },
  "read": "record",
  "cases": [
    { "D": 0.1,  "L": 100, "Q": 0.02,   "eps": 4.5e-5 },
    { "D": 0.025,"L": 12,  "Q": 0.0005, "eps": 1.5e-6 },
    { "D": 0.3,  "L": 900, "Q": 0.4,    "eps": 2.6e-4 }
  ]
}
```

- `set` maps a case key to the **old** control selector. After the port you supply a second map to
  the **new** field keys; `parity.js` accepts both.
- `read: "record"` means the comparison uses `Diagram.record.build().outputs`, which is the honest
  surface: it is what the PDF, the CSV, the JSON and the Python export all read. If the tool has no
  `record()`, add one first — that is a v2 gap, not a UI one, and it is worth fixing anyway.
- Six to twelve cases: the defaults, each preset, one at each end of the validity range, and one
  case in every branch the tool switches on (fluid, regime, mode).

Then run the harness against the **unported** file and keep the output:

```bash
node parity.js --probe moodydiagram.probe.json --base http://127.0.0.1:8099/ --out moodydiagram.parity.json
```

`parity.json` is now the specification of "no number changed". It goes in the commit.

---

## 3. Lift the model out of the DOM

If the maths reads the DOM, move it. This is usually the largest mechanical change and it is worth
doing first, separately, with the parity harness green after it:

```js
/* before */
function calc(){ const D=+document.getElementById('dia').value; … draw(); paint(); }

/* after */
function solve(s){ /* s = {D, L, Q, eps} → returns every computed quantity */ }
```

Rules:

- `solve(state)` is pure: no `document`, no globals it writes, no side effects. It returns **every**
  quantity the page displays, including the ones only drawn on a chart.
- Keep the original function names where you can; a smaller diff is a reviewable diff.
- **Do not "improve" the maths.** Rounding, iteration counts, summation order and clamping stay
  byte-identical. If you find a real bug, stop, report it, and fix it in a separate commit with its
  own parity baseline.

Re-run the harness. It must be green before any UI work starts.

---

## 4. Build the shell

Delete the tool's own header, its layout CSS, its language switcher, its theme button, its export
buttons and its `:root` token block. Then:

```html
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js"  defer></script>
<script src="diagram-ui.js"      defer></script>
…
<body><div id="app"></div>
```

```js
if (!window.DiagramUI || DiagramUI.api !== 'tools.petrov.re/ui/v1')
  throw new Error('diagram-ui.js v1 is required');

const ui = DiagramUI.app({
  id: 'mytool', mount: '#app',
  layout: 'calculator',      // step 1.5
  compute: 'live',           // step 1.6
  state, defaults: DEFAULTS,
  panels: [ /* step 5 */ ],
  learn:  { /* step 7 */ },
  on: { compute: s => ({ /* step 6 */ }) }
});
```

### 4.1 What each archetype gives you

| Archetype | ≥1120px | 768–1120px | <768px |
|---|---|---|---|
| `calculator` | inputs 340 │ stage │ results 360 | inputs │ (stage over results) | sticky result strip, inputs, stage, results |
| `studio` | palette │ stage │ detail; dock beneath | palette rail │ stage; detail below | stage first; palette and detail as sheets |
| `wizard` | steps │ form │ live results | steps │ form | labelled step dropdown, then form |
| `reference` | filters │ content | filters │ content | filters behind one control |

### 4.2 Slot discipline

`header` is framework-owned: return link, `h1` from the manifest, status, undo/redo, learn,
language, theme. Nothing of the tool's goes there except genuinely tool-specific actions.

Everything else goes into `inputs`, `stage`, `results`, `detail`, `dock`, `nav`, `footer` — and
nowhere else. If a piece of the old UI does not fit a slot, that is information: usually it is
either chrome that the framework now owns, or a result that was pretending to be a control.

### 4.3 Deletions that are always right

- the tool's `<h1>` — the framework writes one from the manifest; **exactly one per page**
- the language switcher, in any of its five site-wide shapes
- the theme button and every `@media(prefers-color-scheme:dark)` block
- `Export PDF` / `Report (PDF)` / `⇩ PDF` / `Print calculation` / `Export CSV` / `Save JSON` /
  `Open report` / `Export Excel` — the shared bar owns all of **export**
- `html,body{overflow:hidden}` and any `height:100vh` app frame
- `body{padding-bottom:…}` added by hand for the shared bar — the framework measures it now
- every colour, radius, shadow, font-size and spacing literal (§2 of the spec)
- any `@media` breakpoint that is not 480 / 768 / 1120 / 1440

### 4.3a Deletions that used to be right and are now wrong

Framework v3.1 hosts these. **Re-declare them; do not delete them.** Each one was lost by at least
one port before the component existed, and `Load JSON` is the clearest case: the shared bar exports,
it has never imported, and the old list conflated the two.

| Was on the delete list | Now |
|---|---|
| **`Load JSON` / `Load case` / `Import JSON` / `Open project…` / the hidden `<input type=file>`** | `ui.importAction({label, accept, as, run})` in a panel's `actions:[…]` — spec §8.12. `heat_exchangers` deleted its import and reported that "a user holding old case files genuinely cannot open them any more and that deserves naming". Deleting the open half of a save-and-open pair orphans every file a user already has. |
| the tool's collapsible input groups (`<details class="sec">`, accordion cards) | `ui.panel({collapsible:true, collapsed:…})` — §5.1. `decayheat` and `outdoornoise` each lost five groups; `cfd` and `ductnetwork` ended up with a ~3 000 px input column. |
| a sticky genre / freshness / structural-failure warning bar | `ui.notice({sticky:true})` — §5.2. Do not demote it to a static block at the top of the column: `kernnormenwijzer` and `normenwijzer` both did and both filed it as a declared loss. |
| drag splitters and their `localStorage` widths | `app.resizable({region, min, max})` or `resize:[…]` — §4.6. Delete the tool's own storage key and its `setupSplitters()`; the framework's key is `dgu.<toolId>.layout.<name>`. |
| independent column scrolling | `app.scrollRegion('inputs')` or `scroll:[…]` — §4.6. The **region** scrolls; a panel still may not. |
| a play / pause / speed / frame-slider timeline | `ui.transport({frames, label, fps, on})` — §10.1. |
| a hand-built track-and-fill "value against its own limit" bar | `ui.meter({value, max, thresholds})` — §7.1. |
| a hand-built swatch-and-label legend row | `ui.legend()` / `stage.legend()` / `results({legend})` — §7.3. |
| a chosen-row highlight, dimmed rows, a per-row reason column, a subtotal row, a sticky header, a "wider than the screen" hint | flags on `tables:[…]` rows and cells — §7.2. |
| a `<select>` with `<optgroup>` wrapped in a `type:'custom'` field | `type:'select'` with `{group, options}` entries — §6.3. |
| a hand-built preset panel because `ui.examples()` would render forty buttons | `ui.examples(list)` with `group` on each entry, or `{as:'select'}` — §8.3. |
| re-creating panels, stages, tabs or examples from `on.ready` because a language change destroyed them | Nothing — `App.rebuild()` replays them (§3.1). **Delete the workaround.** If the tool holds a reference to what it created, re-point it in `on.rebuild(app)`. |
| re-applying `min`/`max` to the generated number controls | Nothing — the framework writes them, converted to display units (§6.1). If the tool *refuses* rather than clamps, declare `clamp:false` and keep both. |
| a `syncSteps()` that mirrors the tool's step onto the buttons and the `<select>` | `steps.sync(id)`. |
| a local `adopt(fresh, app)` helper because `reset()`/`example()` orphaned the state object | Nothing — `App.state` keeps its identity (§8.3). |

**Still right to delete**, because the framework deliberately does not host them: a `height:100vh`
app frame with per-pane scrolling — use `app.scrollRegion` and accept that the page itself scrolls;
a scrollbar inside one panel; a repeater/list editor, which has no framework equivalent yet and must
stay tool-owned for now. **Still right to keep**, because it is content and not chrome: a continuous
colour ramp that is a data scale (`debrisrunout`'s hazard scale, `cfd`'s nine kind swatches,
`outdoornoise`'s `colorForLevel`).

Deletions that are **never** right: the manifest, `Diagram.init`, the limitations text, the status
chip, the benchmark link, anything in the honesty layer.

---

## 5. Declare the fields

One `ui.panel({fields:[…]})` per group the user thinks of as a group. Keep the old grouping unless
it was arbitrary.

```js
{ id:'f-D', key:'D', type:'number',
  unit:'m', display:'mm',                 // stored SI, shown in mm
  label: T('Inner diameter', 'Внутрішній діаметр', …),
  min:0.005, max:3, learn:'diameter', required:true,
  hint: T('Bore, not nominal size'),
  validate: (v,ctx) => v > ctx.state.L ? T('Longer than the pipe') : true }
```

Mapping table from what you will actually find:

| In the old tool | Becomes |
|---|---|
| `<input type=number>` + a label ending in `, kPa` | `type:'number', unit:'Pa', display:'kPa'`, unit text deleted from the label |
| `<input type=number>` + a `.unit` span | the same; delete the span |
| a per-field unit `<select>` | delete it; the page-level unit control replaces it |
| `<input type=range>` + a value readout | `type:'range'`; the readout is rendered for you |
| a segmented pill row / mode buttons | `type:'segmented', options:[…]` |
| a checkbox with a label | `type:'toggle'` |
| a read-only computed box | `type:'readonly'` with `get(state)` — or, better, a result tile |
| a `<select>` whose options depend on another field | `options: ctx => …` plus `visible`/`disabled` predicates |
| a field that is hidden by JS in some modes | `visible: ctx => …`; never `style.display` |
| a preset button row | `ui.examples([{label, note, state}])` at the top of `inputs` |
| a long or categorised preset list | the same, with `group` on each entry — it becomes a grouped `<select>` + note + Load automatically past 12 entries |
| a Reset / Clear all / Restore button | `ui.resetAction()` in the `inputs` footer |
| a `Load JSON` / `Open project…` button + a hidden `<input type=file>` | `ui.importAction({accept, as:'json', run})` in the same actions row |
| a `<select>` with `<optgroup>` | `type:'select'` with `{group, options}` entries — no `type:'custom'` needed |
| a label or unit that changes with another field | `label: ctx => …`, `unit: ctx => …`; a thunk unit is display-only and does not convert |
| a field that refuses out-of-range input rather than clamping it | `clamp:false` **with** `min`/`max` declared — you get the browser's stepper and keep the refusal |
| a tooltip, a `?` link, an explanatory paragraph between fields | a `learn` topic (step 7) |
| `title="…"` used as help | a `learn` topic; `title` stays only as a redundant hint |

Two traps in the preset table specifically. An example's **`state:{…}` replaces the whole state** —
keys absent from it are removed — so a preset that changes two of eight inputs must use
`apply(state)`, which patches in place. And do not delete the tool's `Load JSON` when you delete its
`Save JSON`: only the second is the shared bar's (§4.3a).

Units: the framework stores SI and displays whatever the unit system says. **`state`, `record`,
the permalink and the handoff payload keep SI** — that is the v2 contract and the parity harness
will catch you if you break it.

---

## 6. Results and states

```js
on: { compute: s => {
  const r = solve(s);
  return {
    verdict: { tone: r.v > 3 ? 'bad' : 'ok', text: T('…') },
    tiles: [
      { label:T('Pressure drop'), value:r.dp, unit:'Pa', tone:'ok' },
      { label:'Reynolds', value:r.Re, precision:0, learn:'reynolds' },
      { label:T('Friction factor'), value:r.f, precision:4, headline:false }
    ],
    tables: [{ title:T('Split of the loss'), head:[…], rows:[…] }],
    notes: [ T('…') ]
  };
}}
```

- The first three tiles without `headline:false` are what the mobile result strip shows. Choose them
  deliberately: they are the answer.
- Never emit `0` for "not computed". Return `null` from `compute` and the framework renders the
  pending state, with `learn.intro` above it.
- Long-running work: `compute` may return a promise; the framework shows `computing` and keeps the
  previous values visible and dimmed.
- A `run` tool marks results `stale` the moment an input changes. You do not write that code.
- Anything the tool drew as a picture stays a picture — it goes in the `stage`, not in `results`.

The payload also takes `meters:[…]`, `legend:[…]` and `nodes:[…]`, and the table vocabulary is
richer than the example above. Reach for these before you hand-build:

| In the old tool | Becomes |
|---|---|
| a track-and-fill bar showing a value against a limit | `meters:[{label, value, max, thresholds:[0.85,1], text}]` — `role="meter"` with your own `aria-valuetext` |
| a highlighted "this is the selected one" table row | `{cells, chosen:true}` |
| greyed-out failing rows, with a reason beside them | `{cells, dim:true, reason:'…'}` — the reason column and its header appear automatically |
| a bold subtotal or total row | `{cells, weight:true}`, or `foot:[…]` for a real `<tfoot>` |
| a cell containing `<b>`, `<sup>` or a small inline widget | `{node: element}` — pass the fragment you already build for the print sheet; there is no HTML-string cell |
| a sticky table header | `sticky:true`, plus `maxHeight` if you want a bounded scrollport rather than page-level pinning |
| a hand-written "scroll sideways to see the rest" line | nothing — the framework measures the table and shows it only when it is true |
| a swatch-and-label legend row under the chart | `stage.legend({items:[{label, series:0}]})`; swatch colour defaults to `DiagramUI.series(i)` |
| hard-coded chart colours picked for "separability" | `DiagramUI.series(i)` — but if the tool already ships a `--series-N` ramp, it keeps winning, and a **continuous** data ramp stays tool-owned |

---

## 7. Learn content

This is the part that is genuinely new work, and it is the part users notice. Budget real time for it.

```js
learn: {
  version: 1,
  intro: { title: T('What this tool does'), body: T('…') },
  topics: {
    diameter: { title: T('Inner diameter'), body: T('…'), more:{href:'…',label:'…'} },
    …
  },
  tour: [
    { topic:'diameter', focus:'[data-dgu-field="f-D"]' },
    { topic:'reynolds', focus:'.dgu-r-results' }
  ]
}
```

Where the content comes from, in order of preference:

1. **Prose the tool already ships.** Most tools have explanatory paragraphs wedged between form
   fields, in a `<details>`, or in a lead paragraph. Move it; do not rewrite it. `moodydiagram`,
   `procesklimaat`, `smrselector`, `hydraulicsolutions` and `reactorstand` are almost entirely
   pre-written. `regelkring` ships 175 KB of per-field help as JSON that maps directly onto `topics`.
2. **The tool's own tour**, if it has one (`outdoornoise`, `relativity`).
3. **The manifest.** `description` is the intro; `limitations` belongs in the footer, not in a topic.
4. Written fresh, last.

Rules: one topic per concept, referenced from as many places as you like. A `hint` says *what*; a
topic says *why*. The intro must answer "what is this and what do I do first" without a modal.
`tour` is four to eight steps; more is a manual, and a manual goes in the footer.

---

## 8. Re-wire the data layer

```js
/* Diagram.init is called unconditionally, at parse time, before any fetch. */
Diagram.init({
  id: 'mytool', file: 'mytool.html',
  state:  { serialize: () => state, deserialize: o => { Object.assign(state,o); ui.sync(); ui.run(); } },
  record: () => last ? { inputs:…, outputs:…, units:…, model:…, warnings:… } : null,
  python: () => …, handoff: { provides, accepts, build, apply },
  report: { sections: rec => [ … ] }
});

fetch('mytool-data.json').then(r => { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
  .then(d => { install(d); ui.ready(); })
  .catch(e => ui.fail(T('The reference data file could not be loaded.')));
```

Checks:

- `record()` returns `null` when nothing has been computed — not an object full of zeros.
- `serialize()` returns the **same shape** as before the port, or existing permalinks die. If you
  must change it, accept both shapes in `deserialize` for one release.
- `deserialize` calls `ui.sync()` then `ui.run()`; it must not fight the field bindings.
- Units in `record.units` and in the handoff payload stay SI.
- If the tool declares `python_export.supported: true`, re-run the exported script after the port
  and confirm its self-test still passes — the inputs it prints come from the state you just moved.

---

## 9. Verification — the definition of done

Run all of it. It is roughly ten minutes.

```bash
# 1. numbers unchanged
node parity.js --probe mytool.probe.json --against mytool.parity.json --base http://127.0.0.1:8099/

# 2. framework gates, both viewports
node check.js mytool.html            # wraps DiagramUI.check() at 1440 and 390

# 3. the chrome survives a data failure
node check.js mytool.html --block '**/mytool-data.json'
```

Manual, once:

- [ ] `parity.json` matches to the stated tolerance, every case
- [ ] `DiagramUI.check()` returns `{ok:true}` at 1440, 1120, 768 and 390 px
- [ ] with the data file blocked: the shell renders, `#dgc-bar` has children, results say why
- [ ] permalink round-trip: set a state, copy the link, open it in a new tab, identical state
- [ ] PDF report prints, `Source:` line on every page, figures still present
- [ ] Python export runs on a bare `python3` and its self-test passes
- [ ] handoff: send to a receiving tool, values arrive in SI
- [ ] every language listed in `tool_languages` re-renders **every** visible string, including
      derived and annotation strings
- [ ] light, dark and auto all render, and the shared chrome matches the tool in each
- [ ] no region is unreachable at 390 px; no scroll ancestor has `overflow:hidden`
- [ ] exactly one `h1`, and it is the tool title
- [ ] the tour completes with the keyboard and never covers its own target
- [ ] `catalog.php` reports no new error and no new warning for this file

Added for framework v3.1 — each of these caught a real regression in a real port:

- [ ] **switch language and count the furniture.** Every panel, stage, tab strip, wizard step,
      examples list and notice is still there, exactly once, and the last result is still on screen.
      If the tool holds a reference to something it created, it re-points it in `on.rebuild`.
- [ ] **first undo.** Type into a number field, then undo: the value returns to what it was *before*
      that edit, not to the edit itself.
- [ ] **a folded panel is really folded.** Its body measures 0 px, and `DiagramUI.check()` does not
      count controls inside it. Reload: the fold is remembered. A validation error inside it opens it.
- [ ] **the save-and-open pair is whole.** If the tool ever wrote a `.json` scene or case file,
      opening one still works, and it accepts the files the pre-port tool wrote.
- [ ] **no tool `localStorage` key outside `dgu.<toolId>.`**, apart from `diagram_theme`,
      `diagram_lang` and `diagram_units`.
- [ ] **`grep` the ported file for `createElement`, `innerHTML`, `getElementById` and
      `addEventListener`.** Every hit is either the tool's own drawing or something §4.3a now says
      to declare instead. `NEW_TOOL_TEMPLATE.html` has three DOM calls in total; that is the target.
- [ ] **`grep` the ported file for `<style>`.** Every rule left in it should be content — a data
      colour scale, a drawing's own geometry. Chrome CSS is a defect now, not a compromise.
- [ ] the manifest gains `"ui": {"framework":"tools.petrov.re/ui/v1","level":3}`

Report, in the commit message: what was deleted, what moved slot, what could not be mapped, and any
disagreement with `TOOL_MIGRATION_MAP.json`.

---

## 10. When the tool has changed since the audit

Expected, and handled by construction: step 1 re-derives everything and the card is a prior. Two
cases need judgement:

- **The trap is already fixed.** Say so in the report and remove it from the card. Do not re-fix it.
- **The tool grew a feature the card does not mention.** Classify it with §1.5 and §5's mapping
  table like anything else. If it genuinely has no framework equivalent, keep it as a custom panel
  (`render(box, ctx)`) or a `type:'custom'` field, and write one line in the report saying what the
  framework is missing. Three tools asking for the same thing is how the framework grows; one tool
  asking for it is a custom panel.

---

## 11. Anti-patterns, learned from the 51

- **Do not re-implement a framework part because the tool's version is nicer.** Two tab bars, two
  toast stacks and two dialogs are how the site got here.
- **Do not keep a control "because someone might use it"** if the shared bar already offers it.
- **Do not hide a region below `md`.** Collapse it into a sheet, a tab or a disclosure.
- **Do not put units in the label.** The unit slot exists.
- **Do not fix a disagreement between the script and the tool by widening a tolerance.** That rule
  is already in the v2 spec for the Python export and it applies here too.
- **Do not port the layout.** Port the content into the slots. If you find yourself writing
  `grid-template-columns`, you have taken a wrong turn.
- **Do not batch several tools into one commit.** One tool, one parity baseline, one review.

Added for framework v3.1, each learned from a specific port:

- **Do not patch the framework in the tool.** If `diagram-ui.js` is wrong, the repair belongs
  upstream and the port's report should say so in a sentence someone can quote. Eight defects moved
  upstream in v3.1 precisely because 43, 37, 28, 15, 12, 10, 9 and 3 tools had each patched them
  locally instead. If you must patch locally to ship, mark it `UPSTREAM` — that marker is how the
  next release finds it.
- **Do not re-create furniture in `on.ready` to survive a language change.** That workaround is
  obsolete (§3.1 of the spec) and the replay guard will not thank you for it.
- **Do not delete an import because you deleted an export.** They are not a pair the shared bar
  owns; only export is.
- **Do not turn a refusal into a clamp** to get native `min`/`max`. Declare both and set
  `clamp:false`. A tool that refuses out-of-range input is making a statement about its model.
- **Do not write your own `localStorage` key.** `app.remember()` exists so two tools cannot collide,
  and two deployed keys already nearly do.
- **Do not re-theme a data colour scale.** A hazard ramp, a temperature field or a renderer's kind
  palette is content; the categorical series scale is chrome. If the drawing is compared against a
  stored baseline, changing its colours is a numeric change.
- **Do not accept a component because it exists.** Every one of these was added because three or
  more tools showed the same shape. If your tool is the only one that wants something, say so in the
  report and keep it local — that is how the next three get counted.
