# tools.petrov.re — UI framework specification (framework v3)

Revision: 2026-09-01 (v3.7.0 localisation contract). API string: `tools.petrov.re/ui/v1` (unchanged). Implementation:
`diagram-ui.js`, file version `2026-08-31.v3.7-i18n`.

This spec is normative for `diagram-ui.js` and for every tool that adopts it. It **adds a layer**;
it does not change the manifest schema, the calculation record, the PDF attribution rules, the
Python export rules or the handoff vocabulary. `FRAMEWORK_V2_SPEC.md` and `AGENTS.md` remain in
force and win any conflict about *data*; this document wins about *interface*.

Every rule below traces to a finding in `UI_AUDIT.md`; the finding id is quoted as **[S-n]**. Rules
added after the first 52 ports trace instead to the ports themselves, quoted from
`PORT_REPORTS.json` or counted in `LOCAL_PATCHES.md`.

> **What changed in revision 2026-08-21f.** **No new surface and no new API.** One new subsection,
> **§21.9**, which closes items 1–4 of §21.7 — and, because every one of them was re-measured before
> it was touched, corrects two of the figures §21.7 published: `generatorgrid` was 9 low-contrast
> nodes and not 133, and `protectioncoordination`'s legend was 1.36 and not 1.19. §21.9.1 records
> the calibrated fact that makes the "background graphics off" half of §21.7 item 2 false on any
> framework-sheet page: `PRINT_CSS` sets `print-color-adjust:exact` on `body`, the property
> inherits, and backgrounds therefore print in both states. §21.8's two rules are sharpened rather
> than changed — forcing a light palette means copying every rule the tool's light **class** carries,
> not only its token values, and a tool that substitutes its own document under print must key the
> substitution on that document existing. The implementation gained one localised `UI_STRINGS` key,
> `print_source`, on a branch reachable only where `diagram-common.js` is absent. Nothing a tool
> written against revision 2026-08-21e does becomes wrong.

> **What changed in revision 2026-08-21e.** **No new surface, no implementation change, no new
> API.** §21 was written by the pass that built it; this revision is what an independent measurement
> of §21 found, and it changes §21 from a description into a contract with a stated conformance
> level. Three subsections are new — **§21.6** (what was measured, and by which method), **§21.7**
> (the four pages and eight tools that do **not** conform, each named), and **§21.8** (the two rules
> §21 stated absolutely and which practice shows need an exception). §21.1's prohibition on
> `window.print()` is narrowed to admit the degraded arm, because three shipped tools legitimately
> keep one and the flat rule made them all liars. Nothing a tool written against revision
> 2026-08-21d does becomes wrong.

> **What changed in revision 2026-08-21d.** One new section, **§21 One path to paper**, and one new
> API surface: `app.print()`, `app.canPrintReport()`, `app.printAction()`, `header:{print:true}`, and
> `DiagramUI.print()` / `.canPrintReport()` / `.printStyles()` for a page that loads the framework
> without calling `DiagramUI.app()`. `Shortcuts` gained two general flags, `anywhere` and `when`.
> Everything is additive; a tool written against any earlier revision keeps working, and gains an
> attributed print sheet and an intercepted Ctrl+P without changing a line. `Diagram.report()` in
> `diagram-common.js` is untouched, and that was proved rather than asserted — see the changelog.

> **What changed in revision 2026-08-17a.** The API string is deliberately unchanged: everything
> below is additive, and a tool written against revision 2026-08-15a keeps working untouched. This
> revision documents what the implementation gained once the first 52 ports reported back — eight
> defects the ports had each repaired by hand, and the components three or more of them asked for
> in the same words. New or changed material is marked **[v3.1]**.
> `refactored3/CHANGELOG-diagram-ui.md` carries the release's evidence, its file counts and its
> measured regressions; `refactored3/NEW_TOOL_TEMPLATE.html` is the worked example.
> **A component that is not documented here does not exist as far as a port is concerned.**

> **What changed in revision 2026-08-18a.** Still additive, still the same API string. Two things,
> both named by the independent verdict on the five-tool pilot as the work to do before the sweep
> continues: **§6.4**, the repeating list field, which §17.1 of the previous revision listed as
> "the largest remaining gap"; and **§17.9**, the ninth consolidated repair — sticky regions
> escaping their grid row and scrolling panes clipping their own splitter handle, found
> independently by three pilots and patched three different ways. §4.4 and §4.6 change with it.
> New or changed material is marked **[v3.2]**.

> **What changed in revision 2026-08-18b.** One repair, no new surface. The wrapper of revision
> 2026-08-18a re-broke the eighth consolidated repair, `mobile-strip-overflow` (§17, R3): below
> `md` the result strip is sticky *by being the grid item*, and a wrapper of exactly its own height
> is a containing block it cannot travel in, so the answer left the first screen on the first
> scroll again — on every calculator and wizard below 768 px. **§17.9.1** states the exception the
> implementation now makes, and §4.6 records it. The two v3.2 repairs are unchanged above `md`,
> where they live. Marked **[v3.2.1]**.

> **What changed in revision 2026-08-21b.** Still additive, still the same API string, still no
> existing call shape changed. Three new surfaces, all of them from the four tools built on
> 2026-08-18 from `AUTHORING.md` alone: **§19**, the `reference` answer surface, which closes the
> gap that made one of the four declared archetypes unable to state its own answer — `App.build`
> created no Results view for it, so `ui.results()` returned null, `on.compute`'s return was
> discarded and `learn.intro` never rendered; **§6.4.1**, `type:'derived'`, the read-only cell in a
> list row, asked for independently by two of the four in the same words; and **§6.1**'s range
> composite, `editable:` and `format:`, which §17.1 had carried since v3.2. §7 and §17.1 change with
> them. New material is marked **[v3.4]**.
>
> **What §17.1 now says is the largest thing left**: the `md` filter sheet §4.2 promises for
> `reference` and the runtime has never had. Three tools want it.

> **What changed in revision 2026-08-21a.** Still additive, still the same API string. One new
> surface, **§18 — the scene primitive**, which closes the gap this specification has carried since
> revision 2026-08-15a: `studio` was declared as "the user creates and manipulates objects in a
> drawing" and the runtime offered no way to express any of it. `interact:` and `scene:` on a stage
> declaration now do. **§18.3 settles the archetype question raised by `SCENE3D_SURVEY.md`: a 3D
> scene editor is a `studio` with a 3D stage, not a fifth archetype**, and the reason is the six
> hosts the three shipped `AuthoringShell` tools already pass. §13 changes with it: the clause that
> promised to move `diagram-scene3d.js`'s primitives *into* `diagram-ui.js` is replaced by hosting
> them where they are. New material is marked **[v3.3]**.

> **What changed in revision 2026-08-21c.** **No new surface and no implementation change.** This
> revision records what happened when §18 and §19 were handed, the day they shipped, to two authors
> who had never seen this project and were forbidden to read any existing tool. Both shipped working
> tools from `AUTHORING.md` alone. Neither surface had to be changed for them. **§20** states what
> the exercise measured, in the form §17.1 uses: what is now genuinely supported, what the seams
> cost, and what is still not built. §17.1 gains seven rows and §13 gains a consequence. Nothing
> below §20 is normative that was not normative before; §20.2 **is** normative, because it states
> obligations a tool declaring `scene:` must meet that the runtime does not meet for it.

---

## 0. Why a third file

`site-disclaimer.js` owns the honesty layer. `diagram-common.js` owns the data layer — permalink,
record, report, export, handoff. Neither owns the *screen*, and the audit measured what that costs:
269 CSS custom-property names, 18 body font stacks, 27 background colours, 32 breakpoints, 17 `h1`
sizes, 12 tools with no `h1`, 7 tools with no responsive CSS at all **[S-3, S-5, S-16]**.

`diagram-ui.js` is a third shared file, loaded after the other two:

```html
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js"  defer></script>
<script src="diagram-ui.js"      defer></script>
```

It is dependency-free, side-effect-safe, and does nothing observable to a page that never calls
`DiagramUI.app()` except publish the token layer and repair the shared-chrome safe area (§4.4) —
which is a fix every existing tool needs whether or not it ever adopts the rest **[S-1]**.

`diagram-common.js` is not modified by this spec except for the three changes listed in §14.

## 0.1 Non-goals

Not a component framework in the React sense: no virtual DOM, no build step, no reactivity system.
Not a chart library: §10 governs how a chart is *hosted and sized*, not how it is drawn. Not a
replacement for `diagram-scene3d.js`: the 3-D editor keeps its API and becomes a *consumer* of the
token and shell layers (§13).

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

## 1. Design rules that override convenience

1. **The screen is a contract, not a preference.** A user who has learned one tool has learned the
   position of every control in all of them. Where §5 fixes a slot, a tool may not move it.
2. **The framework renders before the tool computes.** Shell, chrome, header, panels and the
   pending state must be on screen from the manifest alone, before any `fetch`, WASM load or
   solver run. A tool's data failure may cost the tool's *results*; it may never cost the tool's
   *chrome* **[S-2]**.
3. **Fixed chrome reserves its own space.** Nothing docked to a viewport edge may overlap document
   content. The framework measures its own furniture and publishes the reserved area **[S-1]**.
4. **One way to do one thing per page.** If the shared bar exports it, the tool does not **[S-6]**.
   If the framework owns the language control, the tool does not **[S-7]**.
5. **Every value carries its unit, in one place, in one style** — and the value the tool *keeps* is
   SI, whatever the user sees **[S-8]**, matching the handoff rule of v2 §2.4.
6. **A number on screen states its own freshness.** Live, computing, stale and failed are four
   distinguishable states, not one **[S-9, S-12]**.
7. **Every tool can teach itself.** Learn mode is framework furniture, present in every tool, in the
   same place, driven by data **[S-10]**.
8. **No layout may make content unreachable.** `overflow:hidden` on a scroll ancestor of tool
   content is prohibited **[S-5]**.
9. **Tokens, not literals.** A colour, radius, shadow, font size or spacing value written as a
   literal in a tool's CSS is a defect **[S-3]**.
10. **Additive at every step.** A tool adopting only §3 must keep working unchanged. Each migration
    level of §15 is independently shippable.

---

## 2. The token layer

`diagram-ui.js` injects one `<style id="dgu-tokens">` on load, before any other framework style,
idempotently. The names are `index.html`'s, because they are already the site's de facto standard;
`benchmark.html` supplies the warn/bad extension.

### 2.1 Colour

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--bg` | `#f6f8fb` | `#0d1117` | page background |
| `--panel` | `#ffffff` | `#161b22` | raised surface |
| `--panel-2` | `color-mix(in srgb,var(--panel) 96%,var(--accent))` | idem | nested surface |
| `--ink` | `#12161d` | `#e6edf3` | body text |
| `--muted` | `#5b6675` | `#9aa7b4` | secondary text |
| `--line` | `#e2e7ee` | `#293240` | borders, rules |
| `--accent` | `#3763e6` | `#6f98ff` | primary action, selection |
| `--weak` | `rgba(55,99,230,.10)` | `rgba(111,152,255,.12)` | accent wash |
| `--ok` / `--ok-bg` | `#1f6f34` / `rgba(31,111,52,.10)` | `#5fb87a` / `.13` | pass |
| `--warn` / `--warn-bg` | `#9a5a00` / `rgba(154,90,0,.10)` | `#d0a24a` / `.13` | caution |
| `--bad` / `--bad-bg` | `#a5261f` / `rgba(165,38,31,.10)` | `#e08a83` / `.13` | failure |
| `--shadow` | `0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.06)` | `0 1px 2px rgba(0,0,0,.28),0 10px 30px rgba(0,0,0,.36)` | the only shadow |

#### 2.1.1 The chart-series scale **[v3.1]**

Eight categorical series colours, published in both themes as `--dgu-series-1` … `--dgu-series-8`,
and read through:

```js
DiagramUI.series(i)        // the resolved colour string for series i (wraps at 8)
DiagramUI.series.css(i)    // the same, for a style property
DiagramUI.series.list(n)   // the first n colours
DiagramUI.series.count     // 8
DiagramUI.series.refresh() // drop the cache; called for you on a theme change
```

Normative:

- **The token name is `--dgu-series-N`, never `--series-N`.** The framework sheet is appended to
  `<head>` and therefore lands after a tool's inline `<style>`; publishing the bare `--series-N`
  spelling would silently overwrite the ramps `decayheat`, `solargaincalculator`,
  `gesloten-atmosfeer`, `neutron_transport` and `ontvochtiging` already ship, changing five drawings
  that are compared against a stored baseline.
- **A tool's own ramp wins.** `series(i)` resolves `--series-N` first and `--dgu-series-N` second,
  against the `.dgu-app` shell rather than `:root`, because `solargaincalculator` scopes its ramp to
  `html[data-theme] .dgu-app`. A tool that has already chosen its series colours keeps them without
  doing anything.
- The scale is **categorical only**. A continuous ramp — a hazard scale, a temperature field, a
  noise-level map — is *data*, not chrome, and stays with the tool: `debrisrunout` says so
  explicitly ("the hazard colour ramp in particular is a data scale that the legend gradient must
  match"), and `cfd`'s nine kind swatches "document the renderer's own palette and must not be
  re-themed". The framework offers no colormap and none is planned.
- The default values are `decayheat`'s, chosen there "for separability in both themes"; `spectrum`
  cites that precedent when it declares its own single series ink.

Deprecated spellings are aliased for one release so no tool breaks mid-migration: `--good`→`--ok`,
`--acc`→`--accent`, `--acc2`/`--accent2`→`--accent`, `--border`→`--line`, `--text-muted`→`--muted`,
`--surface-1`→`--panel`, `--r`→`--radius-md`. An alias emits one console warning per name per page
in `DiagramUI.debug` mode and is removed in v3.1.

### 2.2 Type

Base `400 15px/1.5` with the single stack
`-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif`, mono
`ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`. Six steps, no others:

| Token | Size / weight | Use |
|---|---|---|
| `--fs-title` | `clamp(20px,2.4vw,26px)` / 650, `letter-spacing:-.02em` | the tool `h1` |
| `--fs-section` | `13px` / 650 uppercase `letter-spacing:.08em`, `--muted` | panel headings |
| `--fs-body` | `15px` / 400 | body, field values |
| `--fs-label` | `13px` / 500 | field labels |
| `--fs-small` | `12px` / 400, `--muted` | hints, units, captions |
| `--fs-micro` | `11px` / 500 | chips, counts, tally |

Semibold on this site is **650**, not 600. A tool may not introduce a seventh step, a second family
or a body size other than `--fs-body` **[S-3]**.

### 2.3 Space, radius, elevation, motion

Spacing ramp — `--sp-1:4px`, `--sp-2:8px`, `--sp-3:12px`, `--sp-4:16px`, `--sp-5:24px`,
`--sp-6:32px`, `--sp-7:48px`. Nothing between the steps.

Radii — `--radius-sm:8px` (controls, buttons), `--radius-md:14px` (panels, cards),
`--radius-pill:999px` (chips, segmented controls). Elevation — exactly one `--shadow`; panels use
`1px solid var(--line)`, not a shadow. Motion — `--motion-fast:120ms`, `--motion:200ms`, both
`cubic-bezier(.2,.6,.2,1)`, and every animation is suppressed under
`@media(prefers-reduced-motion:reduce)`.

### 2.4 Breakpoints

Four, and only these, published as `--bp-*` and used by the shell:

```
sm  480px      md  768px      lg 1120px      xl 1440px
```

The audit found 32 distinct breakpoint values in use **[S-3]**. A tool may add a media query only
at one of these four widths.

### 2.5 Z-index

`diagram-common.js` and `site-disclaimer.js` occupy 2147482900–2147483640. The UI layer lives far
below and must never enter that band:

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | shell content |
| `--z-sticky` | 100 | sticky headers, sticky result strip |
| `--z-dock` | 200 | docked panels, mobile sheets |
| `--z-popover` | 700 | tooltips, learn popovers, menus |
| `--z-dialog` | 800 | `<dialog>` backdrop and panel |
| `--z-tour` | 850 | tour card |

### 2.6 Theme

One model replaces four **[S-4]**. `<html data-theme>` takes `light`, `dark` or `auto`;
`auto` (the default) resolves from `prefers-color-scheme`. `DiagramUI.theme.set(v)` writes the
attribute, persists `localStorage.diagram_theme`, and emits `diagram-ui:theme`.

**The shared chrome must follow the tool, not the OS.** `diagram-common.js` and
`site-disclaimer.js` restyle their furniture from `[data-theme="dark"]` in addition to
`prefers-color-scheme` (§14.3). Until that lands, `diagram-ui.js` publishes a compatibility
stylesheet that restyles `#dgc-bar`, `#dgc-menu`, `#dgc-notes` and `#eng-disc-badge` from the
resolved theme; the rule is removed when §14.3 ships.

A tool may not read `prefers-color-scheme` directly. It reads tokens.

---

## 3. Boot and lifecycle

```js
const ui = DiagramUI.app({
  id, title,                    // default: manifest id / title in the current language
  layout: 'calculator',         // 'calculator' | 'studio' | 'wizard' | 'reference'
  compute: 'live',              // 'live' | 'run'
  mount: '#app',                // default: document.body
  header:  { theme:true, lang:true, learn:true, actions:[…] },
  regions: { inputs:…, stage:…, results:…, detail:…, dock:… },
  learn:   {…},                 // §9
  units:   {…},                 // §11
  shortcuts: […],               // §8.11
  notices: […],                 // §5.2  [v3.1]
  scroll:  ['inputs'],          // §4.6  [v3.1]
  resize:  [{region:'inputs', min:240, max:680}],   // §4.6  [v3.1]
  clamp:   true,                // §6    [v3.1] page-level default for field clamping
  on: { compute, reset, ready, rebuild }
});
```

Hard version gate, as `diagram-scene3d.js` already requires of its consumers:

```js
if (!window.DiagramUI || DiagramUI.api !== 'tools.petrov.re/ui/v1')
  throw new Error('diagram-ui.js v1 is required');
```

**Order of operations is normative** and exists to satisfy rule 2:

1. On script load: tokens, theme resolution, safe-area repair (§4.4). No tool code involved.
2. `DiagramUI.app()` renders the shell, header, panels and every declared region in the `pending`
   state, synchronously, from the manifest.
3. The tool loads its data. Failure calls `ui.fail(reason)`, which renders the failure inside the
   results region and **leaves the shell, the header and the shared chrome standing** **[S-2]**.
4. The tool calls `Diagram.init({…})` **unconditionally**, outside any `then`/`catch`. It is a
   deploy-time error for `Diagram.init` to be reachable only from a success branch.
5. `ui.ready()` flips the shell to `idle` and resolves `DiagramUI.whenReady()`.

`ui.destroy()` removes every listener, observer and node the instance created; every binder returns
its own unbinder. This is the `diagram-scene3d.js` discipline, generalised.

### 3.1 Rebuild **[v3.1]**

A language change, a unit-system change and `ui.setLang()` all go through `App.rebuild()`, which
destroys the shell and builds a new one. Normative:

- **`rebuild()` restores furniture created imperatively after `app()`.** Everything built through
  `ui.panel()`, `ui.stage()`, `ui.tabs()`, `ui.steps()`, `ui.examples()`, `ui.notice()` and
  `ui.transport()` is journalled at the moment it is created and replayed onto the new shell, in
  declaration order, into the same region. Before this, a language switch silently deleted it:
  `procesklimaat` measured the cost — "Switching language silently lost 'Load a typical set', 'Show
  a conflict example' and Reset" — and `roofstormwater`, `heat2d`, `decayheat`, `debrisrunout`,
  `gasdynamics`, `wallthermalcalculator`, `steam_tables`, `heat_exchangers` and `klimaatcalculator`
  each reported the same defect. **The workaround of re-creating furniture from `on.ready` is
  therefore obsolete and must be deleted from a port, not carried forward** — the replay is guarded
  by the on-screen count and will not double what the tool re-creates, but the tool code is dead.
- **`rebuild()` re-renders the last results payload** and carries the `ready`/`stale` state across,
  so an answer does not vanish because the reader changed language. Requested by `steam_tables`:
  "Upstream, `rebuild()` should re-render the last results payload."
- **`rebuild()` does not hand a tool back its objects.** A tool holding `var st = ui.stage(…)`
  holds a destroyed `Stage` after a rebuild. `on.rebuild(app)` fires once, after the replay, and is
  the supported place to re-point such references — `app.stages`, `app.panels`, `app.tabsList` and
  `app.notices` are the live arrays. A tool that decorates a replayed object (a stage legend, a
  tab body) must re-apply the decoration there. This is a real cost of the imperative constructors
  and it is named rather than hidden.
- `App.state` keeps its identity across `reset()`, `example()` and a rebuild (§8.3).

---

## 4. The shell

### 4.1 Slots

The shell renders a fixed set of named regions. A tool fills the ones it needs; unfilled regions
collapse without leaving a gap **[S-16]**.

| Slot | Contains | Required |
|---|---|---|
| `header` | identity, title, status, tool actions, language, theme, learn | framework-owned |
| `nav` | tabs, wizard steps, category filters | optional |
| `inputs` | everything the user sets | yes for `calculator`, `wizard` |
| `stage` | the drawing, chart, canvas, 3-D viewport, map | optional |
| `results` | the answer: KPI tiles, tables, verdicts | yes for `calculator`, `wizard` |
| `detail` | inspector for the current selection | `studio` |
| `dock` | logs, timelines, secondary charts | optional |
| `footer` | model notes, limitations, references | optional |

### 4.2 Archetypes

| Archetype | ≥ lg | md | < md |
|---|---|---|---|
| `calculator` | `inputs` 340 px │ `stage` 1fr │ `results` 360 px | `inputs` │ (`stage` over `results`) | sticky result strip, then `inputs`, `stage`, `results` |
| `studio` | `inputs`(palette) │ `stage` 1fr │ `detail`; `dock` beneath | palette collapses to a rail; `detail` becomes a right sheet | `stage` full-width; palette and `detail` become bottom sheets; `dock` a tab |
| `wizard` | `nav`(steps) │ `inputs` 1fr │ `results` | steps become a horizontal strip **with labels** | steps become a labelled dropdown — never bare digits |
| `reference` | `nav`(filters) │ content 1fr | filters collapse to a sticky bar | filters in a sheet behind one button |

**`nav` exists in every archetype [v3.1].** `calculator` and `studio` declared `.dgu-r-nav` without
a `nav` area in their grid templates, so a tab strip was auto-placed into an implicit track and the
explicit columns collapsed: `wallthermalcalculator` measured `grid-template-columns: 340px 268.7px
360px 0px 359.3px` and "a stage squeezed to 269 px"; `cfd` found that under `studio` "a tab strip
placed in the nav slot lands in an implicit row at the very bottom of the page". Both archetypes now
carry a full-width `nav` row above their columns at every breakpoint. The area is switched on by a
`data-nav` attribute the framework sets the first time something is placed in `nav`, so a tool that
places nothing there keeps a byte-identical template.

Two mobile rules are absolute:

- **The answer is on the first screen.** Below `md`, `calculator` and `wizard` render a sticky
  result strip carrying the two or three headline outputs above the inputs **[S-16]**.
- **Nothing is hidden without a replacement.** A region may collapse into a sheet, a tab or a
  disclosure; it may not be `display:none` **[S-5]** — the audit found a tool hiding both its model
  column and its headline probability at 820 px.

### 4.3 Placement law

This is the "expectedness" the framework exists to buy. Fixed, in every tool:

| Element | Position |
|---|---|
| return link, tool title (`h1`), status | header, left → right, in that order |
| undo / redo | header, immediately right of the title, only for direct-manipulation tools |
| learn (`?`), language, theme | header, far right, in that order |
| presets / examples | top of `inputs`, labelled **Examples** |
| primary action (`run` tools) | bottom of `inputs` on ≥ md; sticky action bar below `md` |
| reset | `inputs` footer, secondary weight, labelled **Reset** |
| exports, permalink, Python, handoff | **the shared bar only** — never in the tool **[S-6]** |
| results | `results` region only; never above their own inputs **[S-16]** |
| model notes, equations, limitations | `footer`, in a disclosure |

Exactly **one** `h1` per page, and it is the *tool's* name — not the site's **[S-16]**. The
framework writes it from the manifest; a tool that hand-writes an `h1` is a defect.

### 4.4 Safe area — the fix for [S-1]

On load, and on every resize and mutation of the shared furniture, `diagram-ui.js` measures the
real bounding boxes of `#dgc-bar` and `#eng-disc-badge` and publishes:

```
--dgu-safe-bottom        max(bar height, badge height) + 12px
--dgu-safe-bottom-left   bar width  + 20px
--dgu-safe-bottom-right  badge width + 20px
```

It then sets `padding-bottom:var(--dgu-safe-bottom)` on the scroll container — `body` by default,
or the element named by `mount` when the tool uses an app-shell scroll root. Any framework
furniture docked to a bottom corner (sticky action bar, tour card, dock tabs, toasts) is offset by
the corresponding variable. **A tool may not place an interactive control inside the safe area.**

This single rule repairs 51 tools, including the eight cases in `UI_AUDIT.md` §2 S-1 where the
chrome currently covers a live input, and the `outdoornoise` tour whose Next button is unreachable.

**[v3.2] The bar's own box does not take pointer input; its buttons do.** `#dgc-bar` is a
transparent flex box — 560 x 67 px on a 1440 px screen — whose two rows of pills leave most of that
box empty, and every empty pixel of it used to swallow a click meant for the tool underneath
(measured on `normenwijzer`: a help button that could not be hit at all, `elementFromPoint`
returning `DIV#dgc-bar`). The framework sets `pointer-events:none` on the container and restores it
on the children. A container that reserves no space and paints nothing must not take pointer input
either.

### 4.5 Density

`data-density="comfortable" | "compact"` on the shell scales the spacing ramp and control heights.
Default `comfortable`; control height 36 px, tap target ≥ 44 px below `md` **[S-5]** — the audit
found sub-32 px targets in all 51 tools. `compact` (30 px) is permitted only above `lg` and only in
`studio` inspectors.

The 44 px floor is enforced by the framework on `.dgu-sel`, `.dgu-home`, `.dgu-seg button`,
`.dgu-tab`, `.dgu-toggle`, range controls, the footer disclosure summary and the body-level tour,
popover and dialog buttons **[v3.1]**. The learn dot `.dgu-q` keeps its drawn size and gains a
44 px `::after` hit area instead of growing: `mollier` explains why — "there are three dozen of them
on this page and 44px circles would swamp the labels" — and `solargaincalculator` says the same of
its 28 dots. Nine tools had patched this locally (`LOCAL_PATCHES.md`, `tap-44`).

### 4.6 Remembered layout: scrolling regions and splitters **[v3.1]**

Five ports lost independently scrolling columns and six lost drag splitters with remembered sizes.
Both come back at **region** level, never at panel level — §5 forbids a panel scrolling inside
itself, and that rule is not relaxed.

```js
app.scrollRegion('inputs', { from:'lg' })      // or from:'md', or from:false to clear
app.resizable({ region:'inputs', min:240, max:680, key, label, remember, onResize })
app.resizable({ target:stage, axis:'y', min:220, max:900, key:'chart' })
```

Declaratively, `scroll:['inputs']` / `scroll:{results:'md'}` and `resize:[…]` in `DiagramUI.app()`;
anything declared there is rebuilt automatically on a language change.

Normative:

- A scrolling region uses `overflow-y:auto`, **never `overflow:hidden`** (§1 rule 8). Below the
  archetype's multi-column breakpoint it is an ordinary static block and the document scrolls as
  one. `from:'md'` exists because `ontvochtiging` measured the gap: "above 1120 px the framework
  keeps the results column sticky, which covers the same need, but between 768 and 1120 px it does
  not."
- **[v3.2] The pane's clip edge is the bottom edge of the screen, and the shared chrome is scroll
  padding inside it, not height taken off it.** Until v3.2 the `max-height` stopped short of the
  chrome (§4.4), which left a band of screen in which the pane's own content was laid out, clipped
  and therefore invisible *and* unclickable while still inside the viewport — measured on
  `normenwijzer`: a `.dgu-q` help button 51 px below the fold, and `document.elementFromPoint`
  returning the shell. **Content a pane clips must be off-screen content.** The pane now ends at
  `100vh` and carries `padding-bottom: var(--dgu-safe-bottom) + var(--sp-4)`, so the tail of a long
  pane can always be scrolled clear of the bar instead of resting under it.
- **[v3.2] The region is not the grid item; its wrapper is** (§17.9). A sticky region is therefore
  confined to its own grid row, and a splitter handle — which sits by design in the grid gutter
  *outside* the region — is no longer clipped away by the pane's own overflow.
- **[v3.2.1] Below `md` the result strip's wrapper is `display:contents`** (§17.9.1), so the strip
  region is the grid item and the sticky answer bar travels with the reader again. This is the one
  exception to the line above, and it costs nothing: below `md` the handles do not exist (see the
  rule further down) and the layout is one column.
- **The archetype owns the shape, not the drag.** The framework's own track sizes are measured
  pristine and are the reset target; the flexible track is never dragged and is never squeezed below
  320 px; a size remembered on a wide screen is re-clamped, and dropped, when the layout changes
  breakpoint.
- A splitter is `role="separator"` with `aria-orientation`, `aria-valuenow/min/max` and a translated
  `aria-valuetext`. Arrow keys step 16 px, `Shift`+arrow 48 px, `Home` resets and clears the stored
  size, double-click resets — the gesture `decayheat`, `roofstormwater` and `neutron_transport` all
  shipped.
- **Below `md` the handles do not exist**, the inline grid template is dropped and any stored height
  is ignored. This is the honest degradation: on one column there is nothing to split.
- The framework does **not** restore the 100 vh app shell that `nuclideatlas` and
  `neutron_transport` lost. §1 rule 8 prohibits it and §4.3 makes it a mandated deletion. A tool
  gets the per-region scrollbar back; it does not get a page that cannot scroll.

### 4.7 Remembered state: the persistence namespace **[v3.1]**

Every port that remembered a layout invented a global `localStorage` key of its own —
`sfst.panel`, `cfd.leftW`, `nuclideatlas_top_ratio`, `roof_left_w`, `nsim.w.left` — and two of them
are one rename away from colliding with a neighbour. One namespace, keyed on the manifest id:

```
dgu.<toolId>.<facet>.<name>
```

```js
DiagramUI.persist.{ ns, key, get, set, clear, toolId }
app.remember('facet.name')            // read
app.remember('facet.name', value)     // write
```

Reserved facets: `layout` (splitters), `panel` (folds), `notice` (dismissals). A tool's own keys
default to the `tool` facet. Normative:

- A build-time restore is **write-free**: a declared default is never written back over itself, so
  changing that default later still reaches a returning reader.
- A reset deletes the key rather than writing a sentinel.
- The three site-wide singletons `diagram_theme`, `diagram_lang` and `diagram_units` stay outside
  this namespace. They are cross-tool by design and 52 pages read them.

---

## 5. Panels

```js
ui.panel({ slot:'inputs', id, title, note, learn:'…', actions:[…], actionsAlign, fields:[…],
           collapsible:false, collapsed:false, remember:true, onCollapse,   // [v3.1]
           headerActions:[…], render, sync })
```

Renders `<section class="dgu-panel">` with the §2.2 `--fs-section` heading, a `?` learn affordance
when `learn` is set, an optional note, the field list, and an actions row. Panels never scroll
internally above `md` unless the archetype's region does — the audit found four tools showing a
scrollbar inside a panel while five others did not **[S-16]**.

An empty panel must not render. `heat_exchangers`'s `OPTIONS` card renders ~200 px of nothing for
the default heat-exchanger type; the framework refuses to draw a panel whose visible field count is
zero.

### 5.1 Collapsible panels **[v3.1]**

`collapsible` has been in this signature since the spec was written and was not implemented; five
ports hit the same wall. `ductnetwork`: "UI_FRAMEWORK_SPEC section 5 declares `ui.panel({collapsible})`
but diagram-ui.js does not implement it. Without it the input column is 3 400 px tall on a desktop,
which pushes the answer far below the fold." `cfd`: "Eight inputs panels make a ~3000px column at
1440px." `waterhammer`, `outdoornoise` and `decayheat` say the same. It is now implemented, and
normative:

- The disclosure is a **button inside the heading**, not `<details>`. `ontvochtiging` measured why:
  "Chromium no longer takes the contents of a closed `<details>` out of layout — it hides them with
  `content-visibility` — so every gate that asks 'is this control under the chrome' counts controls
  inside collapsed disclosures." The `[hidden]` attribute really does remove them; a closed panel
  body measures 0 px.
- The heading stays an `h2`; `aria-expanded` and `aria-controls` point at the body id; the toggle's
  `title` is the six-language `Expand` / `Collapse` and follows a language change.
- `collapsible` requires `title` — there is nowhere else to put the disclosure — and the framework
  warns if one is declared without the other.
- The fold is remembered under `dgu.<toolId>.panel.<id>` (§4.7) unless `remember:false`, and it
  survives a language rebuild.
- **A fold may never hide a problem.** `Panel.sync()` reveals a collapsed panel that contains an
  `aria-invalid` field. `Panel.reveal()` is the public handle for anything opening a panel from
  outside — a tour step, a deep link, a validation message; `app.findPanel(id)` returns it.
- `Panel.setCollapsed(flag)` is the programmatic form; `onCollapse(flag, panel)` is the hook.

### 5.2 Notices — the standing qualification **[v3.1]**

A qualification on the whole answer: a genre warning, a freshness banner, a structural-check
failure. Two reader-facing tools lost the behaviour that made it work and three more hand-built the
static version. `kernnormenwijzer`: "The warning bar is no longer sticky. Its text is intact,
verbatim, at the top of the content column, but it now scrolls away instead of holding 21% of a
390px viewport for the whole page." `normenwijzer` measured the same 22 %.

```js
ui.notice({ id, title, text, tone:'warn', sticky:false, compact, dismissible, live,
            actions:[…], slot, place:'start'|'end', remember:true })
// or declaratively: notices:[ … ] in DiagramUI.app()
```

`Notice.set(text)`, `.show()`, `.hide()`, `.dismiss()`, `.reset()`.

Normative:

- **Sticky is affordable only if it is compact.** Both measurements above say the same thing, so a
  sticky notice clamps to two lines with a translated `Show more` disclosure — measured at 72 px,
  9 % of a 390 px viewport, against the 21–22 % those two tools were paying.
- A sticky notice is dismissible by default and the dismissal is remembered under
  `dgu.<toolId>.notice.<id>` (§4.7). A notice without an `id` cannot be remembered.
- It docks under the shell header, and below `md` under the sticky mobile result strip as well —
  the framework publishes `--dgu-strip-h` for this. A notice never covers the answer.
- Default placement is the top of the column the reader is in: `inputs` for `calculator`, `wizard`
  and `studio`, `stage` for `reference`. Notices render above panels in the same region whichever
  order they were declared in, because a qualification reads above the thing it qualifies.
- `role="note"` by default; `live:true` makes it `role="status"` with `aria-live="polite"` for a
  notice whose text changes in response to what the user did.
- A notice is **not** the message surface of §8.4. A toast is transient and about an action; a
  notice is standing and about the answer.

---

## 6. Fields

Generalised from `PropertyInspector` in `diagram-scene3d.js`, which already implements this shape
for the 3-D tools. A field is data:

```js
{ key:'p_boiler',            // dotted path into the tool's state object
  type:'number',             // number|text|textarea|select|toggle|range|segmented|color|file|readonly|note|custom|list
  label:'Boiler pressure',   // string or () => string  (thunk = re-translatable)
  unit:'Pa', display:'MPa',  // §11 — stored SI, shown in the user's unit
  min, max, step, precision,
  minDisplay, maxDisplay,    // override the converted native bounds
  clamp: true,               // [v3.1] false = refuse out of range, do not move the value
  hint:'…', learn:'boiler-pressure',
  placeholder, options,      // array | [value,label][] | {group,options}[] | () => …
  visible:ctx=>…, disabled:ctx=>…, required:true,
  validate:(v,ctx)=> true | 'message',
  get(state), set(v,state),  // escape hatches; default is pathGet/pathSet
  primaryOnly, equal, mixedText }
```

Rules:

- **One unit idiom.** The unit renders in a dedicated slot after the control, `--fs-small`,
  `--muted`. Units are never appended to the label text, never in parentheses in the label, and a
  per-field unit `<select>` is prohibited — unit *system* is a page-level control (§11)
  **[S-8]**.
- **Validation is visible.** A failed `validate` renders the message beneath the field in
  `--bad`, sets `aria-invalid`, and puts the shell in `error`. Silently ignoring bad input, as
  `iron_carbon_diagram` does, is a defect **[S-9]**.
- **Clamping is announced.** A value the tool clamps is written back into the control and a note is
  shown. `beam_diagrams` currently clamps a load position and prints the unclamped value elsewhere
  on the same screen **[S-9]**.
- **Labels never truncate silently.** A clipped label carries `title` and the full text stays
  reachable; a `<select>` whose value would clip wraps or expands rather than cutting mid-word.
- **Multi-target editing uses the `mixed` sentinel** already defined by `diagram-scene3d.js`:
  `DiagramUI.mixed`, rendered as an indeterminate checkbox or a `— mixed —` placeholder.

### 6.1 Range semantics and the refusal opt-out **[v3.1]**

Twelve tools re-applied native range attributes to the framework's own controls
(`LOCAL_PATCHES.md`, `field-minmax`). `xenon`: "buildControl writes `step` but only writes `min`
when `minDisplay` is given, so a number field declaring min/max lost the browser's own range
semantics." `stress_transformation`: "Field writes a native `min=` from `minDisplay` but has no
`maxDisplay` at all." Now normative:

- A `number` control receives **native `min`, `max` and `step`**, converted from the field's SI
  `unit` into its `display` unit. `minDisplay`/`maxDisplay` still win where declared.
- **`clamp:false` separates range semantics from clamping.** A tool that refuses out-of-range input
  with a message rather than moving the value can now declare `min`/`max` for the browser's stepper
  and keep refusing. `thermodynamiccycles` had to give up one to keep the other: "min / max on the
  number fields (framework clamping). This tool refuses out-of-range input with a message instead of
  clamping, and the manifest says so … Declaring min/max would have turned every refusal into a
  silent clamp and changed both the record and the benchmarked behaviour." The default is
  `clamp:true`, so no existing field changes; `clamp` may also be set page-wide in `DiagramUI.app()`.
- **A clamp is announced and it stays announced.** The clamp note survives `clearError()`, renders
  as `.dgu-err.note` with `role="status"`, and carries **no** `aria-invalid` — a value the tool moved
  is not a value the user got wrong. `gesloten-atmosfeer` states the contract: "The tool still brings
  a value back to the nearest allowed one AND says so."
- **A value the field could not write is settled on blur.** `syncControl` still refuses to write
  into a focused control — that is what keeps a caret from jumping mid-entry — but the correction is
  applied when focus leaves, so a rejected entry no longer lingers in the box. The settle is skipped
  when the box already parses to the same number, so a typed `1.50` is not rewritten to `1.5`.

A range field's own `min`/`max` are still interpreted in SI against a control operating in display
units. This is a known defect, it is not repaired in this revision either — eleven shipped sliders
are calibrated against the current behaviour — and a tool with a unit-converted slider should
declare `minDisplay`/`maxDisplay`.

**The range composite: `editable:` and `format:` [v3.4].** Three tools wrote `type:'custom'` sliders
to get past two gaps §17.1 has carried since v3.2. `stress_transformation` five times over — "the
framework is missing a 'range with an editable value' field type"; `fourier_series` for its
harmonic count; `decayheat` because its slider is an index into a 150-point logarithmic grid that
must read `10.4 y`, not `37` — "a field has no value formatter hook".

- **`editable:true`** renders an `<input type=number>` beside the slider, carrying the slider's own
  `min`/`max`/`step` and the field's label. Both controls commit through the same `Field.commit`, so
  clamping, validation, the undo snapshot and the announcement are unchanged and cannot diverge
  between the two. An **empty or unparseable box commits nothing** and never writes `NaN` into
  state; on blur the box settles to what state holds, the same rule as §6.1's focused-control
  settle. Declaring `editable` alone removes the separate `<output>` readout — the box is it.
- **`format:(displayValue, ctx, field)`** returns a string or a six-language label object and
  replaces the readout text. It applies to `type:'readonly'` as well. A field that declares no
  `format` prints exactly what it printed before this revision.
- Declaring both is the `decayheat` shape: **the box holds the number, the readout holds what it
  means.**

### 6.2 Dynamic labels and units **[v3.1]**

`label` and `unit` may be **functions**, resolved with the field context and re-read on every
`Field.sync()`. Three tools patched the framework's own `.dgu-flabel` and `.dgu-unit` nodes from a
panel `sync` hook to get this. `cablesizing`: "Field builds its label and unit slot once and never
re-reads the thunk on sync, so a declaration alone cannot express a unit that depends on another
field." `steam_tables` and `thermodynamiccycles` repaired it the same way.

A **thunk `unit` is display-only**: no `unitEntry` is resolved, nothing converts, and the field does
not count towards `hasConvertibleUnits()`. That matches what all three patching tools did by hand,
and it means a tool cannot declare a unit that is both dynamic and convertible. That combination is
not supported and is not intended to be.

### 6.3 Grouped options **[v3.1]**

`options` may contain `{ group:'…', options:[…] }` entries alongside plain values, `[value,label]`
pairs and `{value,label}` objects, in any mix and in declaration order. They render as real
`<optgroup>`s. `moodydiagram` could not use `type:'select'` at all without this: "Field.fillOptions
emits a flat `<option>` list with no optgroup support, and flattening would turn a two-level pick
into a 33-item scroll." `decayheat` has 27 presets in 8 groups, `probabilisticrisk` 40 in 8. The
flat option list every other caller sees — segmented controls, `sync`, validation — is unchanged.

---

### 6.4 The repeating list field, `type:'list'` **[v3.2]**

Five ports asked for it and three built it by hand: `decayheat` (composition and structural
repeaters), `fourier_series` (manual harmonics — "the sole reason lookups (9) and listeners (17)
did not fall"), `roomacoustics` (surface-material rows); `stress_transformation` and
`beam_diagrams` asked without building. It is a field, declared like any other:

```js
{ id:'f-harm', key:'manual', type:'list',
  label:'Manual harmonics',
  row: [                                    // the row shape, left to right
    { key:'n',     type:'number', label:'n', min:1, max:100, step:1, width:'80px' },
    { key:'amp',   type:'number', label:'Amplitude', step:0.05 },
    { key:'phase', type:'number', label:'Phase', step:5, unit:'deg' }
  ],
  newRow: rows => ({ n: rows.length + 1, amp: 0.5, phase: 0 }),   // or a plain object
  minRows: 0, maxRows: 64,                  // row-count bounds; `min`/`max` stay per cell
  reorder: true,                            // default; false hides the move buttons
  addLabel, empty,                          // both default to the framework's six languages
  validateRow: (row, i, ctx) => true | false | 'message' | {en:…, de:…} }
```

A cell takes `key`, `type` (`number|text|select|toggle|derived`), `label`, `unit`/`display`,
`min`/`max`/`step`, `minDisplay`/`maxDisplay`, `options` (array, `[value,label][]` or a thunk),
`placeholder`, `value` (the default a generated new row gets) and `width` (any grid track size). A
cell with no `key` addresses the row itself, so a list of bare numbers is `row:[{type:'number'}]`.

Normative:

- **The value is the tool's own array, at `key`, in the tool's own state.** It holds plain objects
  in row order; nothing is wrapped and no id is added. The array is **mutated in place** and never
  replaced, so a tool that captured a reference at boot keeps it (§8.3, the `state-orphan` rule).
  Permalink, record, PDF and Python export therefore see exactly the shape the tool declared.
- **A cell converts units exactly as a field does** (§11): SI in state, display units in the box,
  the unit named once in the column header. A cell may not carry its own unit `<select>` **[S-8]**.
- **Refusal and clamping keep §6 and §6.1 semantics.** `validateRow` is run against the *candidate*
  row before anything is written, so a refused value never reaches the tool's state; the message is
  rendered in the field's own error slot prefixed with the row number, every control in that row
  gets `aria-invalid`, and the shell goes to `error`. A clamped cell is written back and announced
  (§6.1) rather than silently moved.
- **Add, remove and reorder are one undo step each** and take the pre-edit snapshot before the
  change, like every other field edit (§8.3).
- **Keyboard operable throughout.** Every cell is a native control; add, remove and the two move
  buttons are real buttons in the tab order; `Alt`+`ArrowUp`/`ArrowDown` inside a row moves that
  row without leaving the cell. Focus follows the work: to the first cell of a new row, to the
  remove button of the row that takes the removed row's place, and with a row as it moves. Each
  structural change is announced in a polite live region.
- **Every string comes from `DiagramUI.t()`** in all six languages (`add_row`, `remove_row`,
  `move_up`, `move_down`, `row`, `list_empty`, `list_full`, `row_added`, `row_removed`,
  `row_moved`); `addLabel` and `empty` override them per tool.
- **The row names its columns twice.** Above `md` the names are a header strip and each control
  carries `aria-label` = column + row number; below `md` the strip is hidden and each cell shows its
  own name, because three number boxes side by side on a 390 px screen is not a form. The list is a
  `role="group"` labelled by the field's own label.
- **A sync never fights the reader.** The rows are rebuilt only when the row *count* changes;
  otherwise each control is refreshed from state and the control with focus is left alone — the
  same rule `Field.writeControlValue` follows.
- Row count is bounded by `minRows`/`maxRows`: the add button disables at the ceiling with a
  translated title, the remove buttons disable at the floor. Neither is a silent limit.

Not in scope, and deliberately: a list cell is not a `range`, a `textarea` or a nested list; a list
does not sort itself; and there is no drag-to-reorder — the buttons and `Alt`+arrows are the whole
gesture, and they work on a touch screen and a keyboard alike.

#### 6.4.1 `type:'derived'` — the read-only cell **[v3.4]**

Two of the four tools built from `AUTHORING.md` alone by agents forbidden to read any existing tool
asked for the same thing in the same words, and both shipped the same workaround: the list in one
panel and a table of the *same rows*, read-only, in another. `flangejoint` stated the cost — "the
number the user is reasoning about is 40 cm away from the number they are typing" — for its per-pass
torque; `trussframe` did it for member length and axial force.

```js
row: [ { key:'w', type:'number', label:'Width',  unit:'m' },
       { key:'h', type:'number', label:'Height', unit:'m' },
       { type:'derived', label:'Area', unit:'m2', precision:2,
         value: (row, i, ctx) => row.w * row.h,
         tone:  row => row.w * row.h > 5 ? 'warn' : '' } ]
```

- **A derived cell is not a control.** Nothing focuses it, nothing commits through it, it takes no
  `aria-invalid` on a refused sibling, and it never appears in the tool's state unless the tool put
  it there itself. It renders as an `<output>` with `aria-live="off"` — the element for a calculated
  value, without turning every row into a live region that speaks on each keystroke of the box
  beside it.
- **`value`** is `(row, index, ctx)`, or is omitted, in which case a `key` is read straight out of
  the row — the shape for a quantity the tool's own model writes into the row. A cell declaring
  `readOnly:true`, or a `value` that is a function, is derived whether or not `type:'derived'` is
  also written.
- **`unit` and `precision` follow §11 and §7**: SI in, display units out, the unit named once in the
  column header. The derived quantity converts on its own terms — an area in m² beside two lengths
  in mm.
- **It refreshes on every keystroke in its row, ahead of the focused-control guard** of §6.4. That
  guard exists to protect a caret; a derived cell can never hold one, and refreshing while the
  reader types is the entire point.
- **`null` renders an em dash; an empty string renders blank; a non-finite number renders an em
  dash.** A half-typed row reads blank, never `NaN`.
- **`tone`** — `'ok'`/`'warn'`/`'bad'`, a value or a function — colours the readout. A numeric value
  is right-aligned with tabular figures; a textual one is left-aligned and ellipsised with the full
  text on `title`.

## 7. Results

```js
ui.results({ filter:…, verdict:…, entry:…, tiles:[…], meters:[…], tables:[…],
             nodes:[…], legend:[…], notes:[…] })
```

The surfaces render in that order: filter, verdict, entry, tiles, meters, tables, tool nodes,
legend, notes. `filter` and `entry` are **[v3.4]** and are specified in §19.

**A results view exists for every archetype [v3.4].** `ui.results()` never returns `null` for a tool
that did not declare `results:false`, and `on.compute`'s return value is never discarded. Before
this revision `App.build` skipped the view for `layout:'reference'` and all three of those sentences
were false there; §19 states what changed and what stayed the same.

**`ui.results()` with no argument is a read [v3.4]**, returning the view. It previously fell through
to `set(undefined)` and cleared the answer. `ui.results(null)` is still how a tool clears it, and is
what `reset()` and `example()` use.

A tile is `{ label, value, unit, tone:'ok'|'warn'|'bad'|null, hint, learn, precision }`. Tiles
render in a responsive grid, never fewer than two per row above `sm`, and **never truncate their
own value** — the audit found four tools cutting KPI values mid-number **[S-16]**.

### 7.1 Meters — a value against its own limit **[v3.1]**

```js
ui.meter({ label, value, max, min, ratio, text, unit, precision,
           thresholds:[0.85,1], tone, hint, learn, note })
// or in the payload: meters:[ … ]
```

`cablesizing` could not express its headline affordance with tiles: "The three criteria bars
(ampacity / voltage drop / short circuit, with ok-warn-bad thresholds at 0.85 and 1.0) stay a
tool-owned node. … The framework has no meter or progress component; tiles cannot express 'value
against its own limit'." The same track-and-fill pair is hand-built in `operatingpoint`,
`klimaatcalculator`, `solargaincalculator`, `ductnetwork`, `iron_carbon_diagram` and
`probabilisticrisk`.

Normative: `role="meter"` with `aria-valuenow` and an `aria-valuetext` carrying the tool's own
string (`"2.7 % of 3.0 %"`, not `"0.9"`). Defaults are `cablesizing`'s thresholds `[0.85, 1]`;
`tone` overrides them; `tone:'accent'` is the neutral budget bar `operatingpoint` needs. A meter
that is over its limit draws the limit line. **A value that does not exist draws an empty track and
says "Not computed yet"** — never a zero-length bar, per §7's rule about `—`.

### 7.2 Tables **[v3.1]**

```js
tables:[{ title, head, rows, foot, sticky, maxHeight, reasonHead, wide }]
head:  'Label' | { label, num, width, class }
row:   [cell, …]  |  { cells, tone, chosen, dim, weight, reason, id, title, class }
cell:  'text' | 12.3 | null | { value, text, node, num, class, tone, title, span, precision }
```

`ui.table(def)` / `DiagramUI.table(def)` render the same table outside the results payload. A plain
array of arrays of strings is still a plain table: every existing caller is unaffected.

Four tools named the gaps. `cablesizing`: "Results.table() renders plain string/number cells: it has
no chosen-row highlight, no dimmed failed rows and no per-row failure-reason cell. Those three are
the tool's best affordance (the card says so)." `moodydiagram`: "The framework gap is a table row
flag (the two subtotal rows carry weight…) and rich-text cells." `fourier_series` lost its sticky
header row; `luchtbalans` lost "the 'this table is wider than the screen' hint".

Normative:

- **Rich cells are `{node: Element}`, not HTML strings.** A tool that needs markup passes the
  fragment it already builds for its print sheet, so there is one copy of the row data and the
  framework gains no `innerHTML` sink.
- **The sticky header has two modes and degrades honestly.** With `maxHeight` the header pins inside
  a bounded scrollport. Without it the wrapper is upgraded to `overflow:visible` **only after
  measurement confirms the table fits**, and the header pins to the page under `--dgu-head-h`; when
  the table does not fit, the horizontal scroller and the width hint stay and the header does not
  stick. This is the compromise §5 forces by forbidding a panel to scroll internally, and it is why
  `fourier_series`'s original 300 px scroll box does not come back.
- **The width hint is measured, never speculative.** `wide` is applied by measurement on render and
  on resize; `wide:false` suppresses it. There is deliberately no `ResizeObserver` per table, so a
  tool that mutates cells in place without re-rendering will hold a stale hint until the next render
  or resize.
- `foot` is a row array rendered in `<tfoot>` with the `weight` flag; `reason` on any row appends a
  reason column with a translated `Reason` header, or `reasonHead` if the tool names it.

### 7.3 Legends **[v3.1]**

```js
ui.legend({ items, compact, shape:'line'|'dot'|'box', toggle, onToggle })
stage.legend({ items })          // §10: the slot above the stage caption
ui.results({ legend:[…] })       // under the tables
node.update(items)               // repaint in place
```

Four tools hand-built the same swatch-and-label row. `fourier_series`: "ui.stage offers `caption`
but no legend slot, and the entries are conditional … Injected as a row inside the stage node above
the caption." That position is now the slot. A swatch defaults to `DiagramUI.series.css(i)`, so a
legend cannot drift from the curve it names; `color` overrides it for a tool with its own data
scale.

---

Every result surface carries the shell's freshness state (§8):

| State | Rendering |
|---|---|
| `pending` | skeleton tiles + one sentence naming what to do first (`run` tools) or what is loading |
| `computing` | skeleton with a progress affordance after 250 ms; the previous value stays visible, dimmed |
| `ready` | the value |
| `stale` | the value, dimmed, with a `Recompute` affordance in `run` mode |
| `error` | the failure message in `--bad`, in place, with the inputs still editable |

A result that has never been computed shows `—` **with an explanation**, never `0`. Exports for a
result that does not exist are disabled, not merely present **[S-9]**.

**The pending state is painted at build time [v3.1]**, not on the first `results()` call. Three
tools reported the empty region: `heat2d` ("Results never renders its pending state until
`results()` is called at least once, so the region shows only its heading — including the
`learn.intro` that §9.2(4) says must be on the first screen of a run tool"), `steam_tables`, and
`nuclideatlas`, which showed it blank "for the whole 17 s this tool spends loading". Build time and
not `ready()` time, so a slow data load is covered too.

---

## 8. Interaction contract

### 8.1 Live vs run

`compute:'live'` recomputes on every committed change (debounced 120 ms) and the header shows a
`Live` chip. `compute:'run'` requires the primary action and marks results `stale` the moment an
input changes. Enter-only commit with no visible affordance, as in `iron_carbon_diagram`, is
prohibited **[S-12]**.

### 8.2 The state machine

`pending → idle → editing → computing → ready`, with `stale` and `error` reachable from `ready`.
Published as `data-ui-state` on the shell so tool CSS can react without JavaScript.

### 8.3 Reset, examples, undo

`Reset` restores the declared defaults, always from the `inputs` footer, always under that name
**[S-11]**. `Examples` is a labelled list at the top of `inputs`; each entry has a one-line
description; loading one announces what changed and, in `run` mode, says the result is not yet
computed. Any tool whose `stage` supports direct manipulation **must** register `ui.history`
(the `History` class from `diagram-scene3d.js`, lifted into `diagram-ui.js`) and expose undo/redo
in the header; nine such tools currently ship with no undo at all **[S-11]**.

**`state` replaces, `apply` patches.** An example entry declaring `state:{…}` supplies the *whole*
state: keys absent from it are removed. An entry that changes two of eight inputs must use
`apply(state)`, which mutates in place. The same distinction applies to `defaults`.

**`App.state` keeps its identity [v3.1].** `reset()` and `example()` mutate the state object in
place instead of assigning a new one. Fifteen tools had patched this (`LOCAL_PATCHES.md`,
`state-orphan`); `spectrum` states the consequence: "the object this file holds — the one
`serialize()`, `record()` and the handoff write through — is orphaned the moment either runs, and
the permalink then freezes at the reset value." The guarantee is **top-level only**: a tool holding
a reference to a nested object inside state is still orphaned, exactly as before.

**Examples render as a select when the list is long or grouped [v3.1].**

```js
ui.examples(list, { as:'select'|'buttons', max:12, apply:'change', loadLabel })
```

An entry may carry `group`. The moment any entry declares one, or the list exceeds `max` (12), the
panel renders a grouped `<select>`, the selected entry's note, and a `Load` button, instead of one
button per preset. `probabilisticrisk` had to hand-build the panel because "forty buttons is not a
preset list, it is a wall"; `decayheat` has 27 in 8 groups and `roomacoustics` needed a dialog for
15. Every list the 52 ported pages currently pass is shorter than 12 and ungrouped, so they render
exactly as before. The panel keeps its id, its title and its top-of-`inputs` position — **[S-11]**
still holds.

**The undo snapshot is taken before the write [v3.1].** `History.push()` was called from
`onFieldCommit` *after* the value was written, which made the first undo restore the state the user
was already in and every later one off by one. `heat2d`: "Any studio tool following the card
literally will ship a broken undo." `hydraulicnetwork`, `electricalnetwork` and `ductnetwork` each
gate the automatic push off and push by hand for this reason; those four are unaffected by the
change. `ui.pushHistory()` is the supported way to snapshot before a non-field mutation.

### 8.3.1 An example has an addressable identity **[2026-08-21g]**

```js
ui.examples([{ id:'freeHard', label:T('Free field · hard', …), note:…, apply:… }, …]);
ui.example('freeHard');            // apply one by name, from anywhere
```

`id:` is optional, tool-chosen and not localised — it is a name, not a string a reader sees, so it
takes no translation. It buys three things and nothing else:

1. **`data-example="<id>"` on whatever the panel rendered for that entry** — the `<option>` in
   select mode, the `<button>` in buttons mode. One attribute, one meaning, in both shapes.
2. **The `<option>`'s `value` *is* the id**, so `select.value = '<id>'` chooses a preset by name
   and not by declaration order. The Load button carries `data-example-load`.
3. **`app.example(id)`** — a string argument resolves against the ids the app has been given.
   An unknown id warns and does nothing; it never silently applies the wrong preset.

A list that declares no `id` is untouched, down to the `<option>` values still being ordinals. That
is every list the shipped tree passed before this revision, and the 84-cell gate is GREEN at the
same 84/84 with the same 52 waivers before and after.

**Why the framework owes this and not the tool.** `outdoornoise.html:1529` did it itself:

```js
function tagExamples(panel){
 /* the preset id stays addressable, as it was on the old preset grid */
 const bs = panel.node.querySelectorAll('button');
 EXAMPLE_DEFS.forEach((x,i)=>{ if(bs[i]) bs[i].dataset.preset = x[0] });
}
```

That is true of a button-per-example panel and false of everything else. §8.3's select threshold
[v3.1] made it false: outdoornoise passes **17** examples, 17 > 12, the panel became a `<select>`
plus one `Load`, and `querySelectorAll('button')` returned **one** element. Sixteen of seventeen ids
were dropped with no error anywhere. Measured live before the repair: exactly **1** `[data-preset]`
element on the page. Its parity probe addressed presets by that attribute, so 16 of its 18 selectors
matched nothing, `parity.js` applied those cases to a page it had not switched, and the tool sat in
the safety net as "16 of 18 failing" for six days on evidence that was an artefact of the harness.

It is not one tool's mistake. `/root/verification/wh-parity.mjs:162` makes the same assumption
independently — it indexes `[data-dgu-panel="dgu-examples"] button` — and `waterhammer` also passes
**17** examples, so `n` is 1, `captureUI` returns `null` for cases 1–16, and its `--ui` cross-check
has silently covered case 0 only. Two consumers, written by different hands, both broken by the same
seam, neither told. A tool cannot be asked to track the panel's shape because the panel's shape is
not the tool's to know: §8.3 chooses buttons or a select from the list's own length and grouping, and
can change that choice again. **What the framework renders, the framework must make addressable.**

**What the alternative would have cost.** The tool-side repair — teach `tagExamples()` to tag
`querySelectorAll('option')` as well — is four lines and fixes outdoornoise this afternoon. It fixes
nothing else: `wh-parity.mjs` stays wrong, every future tool re-derives the panel's private DOM, and
the next change to §8.3's rendering breaks all of them again exactly as this one did. It also leaves
the ordinal coupling in place, so a preset inserted in the middle of the list silently renumbers
every stored case. The framework version is ~20 lines, additive, and moves no shipped number.

**§17.1's bar, applied honestly.** Two shipped consumers use it today: `outdoornoise` (the tool) and
`outdoornoise.probe.json` (the harness). `wh-parity.mjs` is a third that *should* — `waterhammer`
declares no ids yet, so its repair is one `id:` per entry in `PRESET_LIST` and is not done here.
That is **below the three-tool bar** on tools, and it is built anyway for the reason §6.4.1 was built
at two: the two discoveries are **independent**, and one of them is a **gate lying about a tool**.
The rule exists to stop a framework growing two of everything; it is not a licence to leave the
safety net reading a page it is not driving.

### 8.4 Messages

One surface. `ui.notify(msg,{kind})` delegates to `Diagram.notify` so the site keeps a single toast
stack; `kind:'ok'` self-dismisses, `warn`/`err` persist until dismissed. Tool-local toast
implementations are removed **[S-9]**.

### 8.5 Dialogs

`ui.dialog({title, body, actions})` uses the native `<dialog>` element — currently used by no tool
on the site **[S-15]** — with focus trapping, `Esc`, restore-focus-on-close, and a scroll lock that
is reference-counted so it survives `site-disclaimer.js` writing `document.body.style.overflow`
unconditionally.

### 8.6 Popovers and tooltips

One implementation, anchored, collision-avoiding, keyboard-reachable, dismissed by `Esc` and by
outside click. `title=` attributes are not an accessibility mechanism and are not a help mechanism;
they may remain only as a redundant hint.

### 8.7 Tabs

`ui.tabs({slot:'nav', items, onSelect})` renders real `role="tablist"`/`role="tab"`/
`role="tabpanel"` with arrow-key navigation — one of 16 tab implementations on the site does this
today **[S-15]**. An overflowing tab strip gets a scroll affordance (edge fade plus keyboard
scroll); it never clips a label mid-word.

### 8.8 Wizard steps

Steps always carry their names. Reducing them to bare digits below `md`, as two tools do, is
prohibited **[S-16]**; below `md` a labelled dropdown replaces the strip.

### 8.9 Selection

`DiagramUI.Selection`, lifted from `diagram-scene3d.js`, is the selection model for lists, trees
and stages.

### 8.10 Focus and keyboard

`:focus-visible` is styled by the token layer for every framework control; tools inherit it. Every
interactive element has an accessible name — the framework refuses to render a control with neither
`label` nor `aria-label` and logs the offender in debug mode **[S-15]**.

### 8.11 Shortcut map

`shortcuts:[{keys:'r', when:'stage', run, label}]` registers into one router. The router is scoped
(never document-wide by default — `EditorToolbar` currently steals `v/g/r/s/Delete` from the whole
page), never fires while a text input has focus, and populates a `?`-key shortcut sheet
automatically. Reserved site-wide: `?` shortcuts, `Esc` dismiss, `/` focus search, `l` learn mode.

### 8.12 File import **[v3.1]**

The shared bar owns **export**. §4.3 says so and it is not changing. It does not own **import**, and
five tools discovered that the hard way. `heat_exchangers`: "Loading a previously saved
`hx-lab-case.json` back into the tool. The ↥ button and `#fileIn` are gone, and the shared bar
exports JSON but does not import it … a user holding old case files genuinely cannot open them any
more and that deserves naming rather than filing under 'the shared bar owns it'."
`wallthermalcalculator` lost "Open project…"; `outdoornoise` kept Load case because "deleting it
would make every already-saved .json scene unopenable"; `probabilisticrisk` kept Import JSON because
deleting Export "would have orphaned" it; `debrisrunout` keeps Load JSON, "a SCENE file, not the
calculation record".

```js
ui.importAction({ label, accept, as:'text'|'json'|'arrayBuffer'|'dataURL'|'file',
                  multiple, run(data, file, app), quiet, errorText })  // -> an action descriptor
ui.openFile(opts) / DiagramUI.openFile(opts)                          // -> Promise
```

Normative:

- `importAction()` returns an ordinary **action descriptor**, so it drops into the existing
  `actions:[…]` and `header.actions` vocabulary. There is no second way to declare a button.
- **A cancelled picker says nothing.** A file that cannot be read says `t('import_bad')`, or the
  tool's `errorText`. A successful read notifies with the file name unless `quiet:true`.
- The hidden `<input type="file">` is created and removed by the framework. **No tool builds one
  again**, and §4.3's deletion of `Save JSON` / `Export CSV` / `Open report` does not extend to the
  import half of a save-and-open pair.
- What is imported is the tool's own scene or case file. It is **not** the calculation record, which
  `diagram-common.js` owns and which is an output, not an input.

---

## 9. Learn mode

The audit found roughly 10 of 51 tools with any onboarding, implemented five different ways, one of
which blocks the interface it describes and cannot be advanced because the shared badge covers its
Next button **[S-10, S-1]**. Learn mode is therefore framework furniture, present in every tool.

### 9.1 Data

```js
learn: {
  version: 3,                                  // bump to re-offer the tour
  intro: { title, body },                      // what this tool is for, before anything is touched
  topics: {
    'boiler-pressure': { title, body, more:{href,label}, media:{svg|image} },
    …
  },
  tour: [ { topic:'…', focus:'#field-p', action?:()=>…, note? }, … ]
}
```

Strings are per language (`{en:…, nl:…}`) or resolved through `ui.t`. Topics are referenced from
panels, fields, tiles and stage annotations by their key — **one topic, one definition, any number
of call sites**, which is what the six duplicated `? Why this question` links in one screenshot
should have been.

### 9.2 Surfaces

1. **Inline.** Any element with `learn:'key'` gets a `?` affordance rendering the topic in a
   popover. Keyboard reachable; `Esc` closes.
2. **Learn mode.** The header `?` toggles `data-learn="on"`: every annotated element gets a marker,
   and a reading pane lists all topics for the current region. Toggling does not change any value.
3. **Tour.** An ordered walk over `tour[]`. The card docks clear of the safe area (§4.4), never
   covers the element it points at, offers `Back`/`Next`/`Skip` with **`Back` disabled on step 1**,
   and remembers completion in `localStorage.diagram_learn_<id>` against `learn.version`.
4. **Intro.** `learn.intro` renders in the `results` region while the state is `pending` for a
   `run` tool, so the first screen answers "what is this and what do I do first" without a modal.

### 9.3 Rules

- The tour never auto-opens more than once per tool per `learn.version`, and never on a permalink
  or handoff arrival — a user who arrived with state wants the state, not a tour.
- Learn content is content, not chrome: it is included in the PDF report as an appendix when
  `report.sections` asks for it, and it is translated like everything else.
- A field with a `hint` does not need a topic; a topic explains *why*, a hint explains *what*.

---

## 10. Stage and charts

`ui.stage({ render, resize, fit, aspect, minHeight, annotations, a11y })` hosts a canvas or SVG and
owns its sizing. The audit found charts raster-scaled to 39 %, axis labels at ~4 px, SVG node text
at ~4 px, a chart fitted into a pane whose height changed after layout leaving 85 % of the canvas
empty, and 520–620 px-tall boxes containing a 37 %-scale drawing **[S-13]**.

Normative:

- Sizing comes from a `ResizeObserver` on the host, never from a fixed pixel constant, and the
  redraw is `requestAnimationFrame`-coalesced. `devicePixelRatio` is applied for canvas.
- `minHeight` defaults to 260 px; below it the stage scrolls rather than shrinking.
- **Label size is physical, not scaled.** Tick labels, legends and annotations are drawn at
  `--fs-small` regardless of the drawing transform.
- Below `md` the framework passes `density:'coarse'`: the tool must reduce tick count, drop
  non-essential annotations and move the legend below the plot. `ui.stage` provides
  `ui.stage.ticks(range, px)` so tick density is computed the same way everywhere.
- A stage that can be panned or zoomed exposes **Fit** in its corner, keyboard-reachable.
- `fit()` is called after layout settles, not during it.
- Every stage has a text alternative: `a11y` returns a short description of the current drawing,
  rendered into a visually hidden live region.
- `stage.legend({items})` inserts a legend row **above the caption** (§7.3) **[v3.1]**. A stage
  legend applied imperatively must be re-applied from `on.rebuild` (§3.1).

### 10.1 Transport — the timeline **[v3.1]**

```js
ui.transport({ frames, frame, playing, speed, speeds, label(frame, frames), steps, loop, fps,
               slot, title, on:{ frame, seek, play, pause, speed } })
// set(state) / seek(i) / play() / pause() / toggle() / destroy()
```

`heat2d` named this the one region with no framework equivalent: "The timeline (play/pause, frame
slider, time label, playback speed) … The framework has no timeline or transport component, and a
range `Field` renders its own numeric readout — it cannot show `12 h 0 min`." `debrisrunout`,
`waterhammer`, `gesloten-atmosfeer`, `regelkring`, `roofstormwater` and `cfd` each hand-build
play/pause and a speed control.

Normative:

- **`label(frame, frames)` is the point.** The readout is the tool's own string, and it is also the
  range's `aria-valuetext`, so a screen reader hears "12 h 0 min", not "7".
- **The framework owns the clock only when `fps` is declared.** A solver-driven tool keeps its own
  loop and calls `set()`; the component never decides when a frame is ready.
- Play/pause is one toggle button with `aria-pressed` and a translated accessible name; the frame
  slider is a real `range`; the speed control is a `<select>` of `speeds`.
- A transport is registered on the app and its `requestAnimationFrame` loop is stopped by
  `destroy()`, so it cannot outlive a language rebuild.
- The default `slot` is `dock`. A transport is not a field and does not belong in `inputs`.

---

## 11. Units

One registry, one page-level control, SI in storage.

```js
units: { system:'si', // 'si' | 'practical' | 'us'   — default from localStorage.diagram_units
         overrides:{ p:'kPa' } }
```

- A field declares its SI `unit` and optionally a `display` unit. The framework converts for
  display and back for storage; **state, record, permalink and handoff always carry SI**, which is
  already required by v2 §2.4.
- The unit-system control lives in the header, next to language, and only appears when the tool has
  at least one convertible quantity. Per-field unit selects are removed **[S-8]**.
- Formatting is `ui.fmt(value, unit, {precision})`: locale-aware separators, a fixed significant-
  figure policy, and no raw float dumps — the audit found `-35.52338329811103` in an input box.

---

## 12. Localisation

- The language control is framework furniture: header, far right, ahead of theme. One idiom for the
  whole site **[S-7]**.
- The **global site-language registry** is `en, uk, de, nl, fr, es, pl`. The switcher shows all of
  these in native names: `English · Українська · Deutsch · Nederlands · Français · Español · Polski`.
- `siteLang` and `domainLang` are distinct. `siteLang` owns framework chrome and `<html lang>`;
  `domainLang` owns tool-provided strings and is resolved against manifest `tool_languages`.
- `catalog_languages` is an allowed subset of the site registry. Localized manifest fields are
  required only for languages the tool declares there. `tool_languages` is a non-empty subset of
  `catalog_languages` and states actual domain-UI support.
- The switcher is **not filtered** to `tool_languages`. If the user selects a supported site
  language that the tool does not implement, the shell stays in that `siteLang` and the domain UI
  falls back to English. This is deliberate and is one of the v3.7 canary behaviours.
- Site-language precedence: `?lang=` → `localStorage.diagram_site_lang` → legacy
  `localStorage.diagram_lang` → browser → English. The separate v3.7 key prevents an old
  six-language bootstrap from overwriting a newly introduced site language such as `pl`.
- `ui.t(key)` resolves tool dictionaries with `domainLang`, then framework dictionaries with
  `siteLang`. Labels declared as thunks re-render on a language change without a remount.
- `setLang(l)` selects a **site** language, recomputes `domainLang`, persists the site language,
  updates `<html lang>`, invokes `on.lang(domainLang, app, siteLang)`, then rebuilds the UI.
- Every framework-owned user-visible/accessibility string exists in all global site languages.
  Every tool-owned user-visible string exists in every language declared in that tool's
  `tool_languages`. Never infer domain support from the global registry.
- Adding an eighth site language is a framework change (registry + shared dictionaries + tests),
  but it must not force edits to every existing tool manifest. Existing tools continue with
  catalogue/domain fallback according to their declared subsets.

---

## 13. Relationship to `diagram-scene3d.js`

The 3-D runtime keeps its API string `tools.petrov.re/scene-editor/v1` and its consumers keep
working unchanged. Three changes align it with this spec:

1. `ensureAuthoringStyles()` stops hardcoding its dark palette and reads the §2 tokens, so a 3-D
   tool follows the site theme.
2. `EditorToolbar` binds its shortcuts through the §8.11 router instead of a document-level
   `keydown`.
3. `History`, `Selection`, `ContextMenu`, `renderPalette`, `bindSplitter`, `pathGet`/`pathSet`,
   `commonFieldValue` and the `mixed` sentinel move into `diagram-ui.js` as the shared primitives
   they already are; `diagram-scene3d.js` re-exports them for one release.
   **[v3.1]** `bindSplitter` has landed, as `app.resizable()` / `DiagramUI.Splitter` (§4.6);
   `nuclideatlas` reported that this clause had promised it and the shipped file did not export it.
   `Selection`, `ContextMenu` and `renderPalette` are still outstanding.

`PropertyInspector` becomes the `studio` archetype's `detail` region, driven by §6 fields.

**[v3.3] This clause is superseded by §18.3.** The direction was wrong: `diagram-scene3d.js` is not
a pile of primitives to absorb, it is a working renderer that four tools depend on, and moving its
internals into `diagram-ui.js` would have meant rewriting projection, picking, an orbit camera and a
placement session that already work. The framework **hosts** it instead — it creates
`PropertyInspector`'s host element in the `studio` `detail` region and hands it to the library,
rather than becoming it. `Selection`, `ContextMenu` and `renderPalette` stay in
`diagram-scene3d.js`; the two files are no longer scheduled to merge.

**[2026-08-21c] The consequence, now measured.** Hosting was the right call and it has a price this
clause did not name: items 1 and 2 above — the token palette and the shortcut router — were the
*alignment* work, and superseding the merge did not cancel them. It moved them **out of reach**.
`diagram-ui.js` cannot fix a hard-coded literal inside a file it does not own, so §20.2 makes what
can be fixed the tool's obligation and records the rest as defects of the hosted library. The first
tool built on §18.3 found four of them and could route around only three:

> "The framework hosts `diagram-scene3d.js` faithfully, and `diagram-scene3d.js` predates the token
> layer, the six languages, the 44 px floor and the one keyboard scheme. §18.3 solved the archetype
> and did not solve the citizenship." — `pipesupports.html`

Items 1 and 2 of this section are therefore **still owed**, and they are owed by
`diagram-scene3d.js`, not by `diagram-ui.js`. Until they are paid, a scene tool cannot be a
first-class citizen of §2, §12, §16 or §18.4 no matter how well it is written.

---

## 14. Required changes to the v2 runtime

Three, each small, each fixing a P0 finding.

1. **`buildBar()` must not be gated on `init()` [S-2].** The runtime builds the bar on DOM-ready
   from the manifest alone, and `init(cfg)` *upgrades* it. `buildBar()` is already idempotent
   (`bar.innerHTML=""` then rebuild), so the second call is free. Until this ships, a tool may call
   `Diagram.toolbar.refresh()` from its failure path — verified to build the bar from the manifest
   alone.
2. **Readiness must not lie [S-2].** `window.__diagramReady` is set only when the chrome rendered;
   otherwise the runtime sets `window.__diagramChromeMissing = true` and logs it, so an automated
   check can catch the regression class.
3. **The chrome follows the tool's theme [S-4]**, i.e. `[data-theme="dark"]` in addition to
   `@media(prefers-color-scheme:dark)`, for `#dgc-bar`, `#dgc-menu`, `#dgc-notes` and
   `#eng-disc-badge`.

Two side findings from the audit belong to the same deploy: `flowstep.html` does not load
`diagram-common.js` at all, and `protectioncoordination.html` is excluded from the catalogue by a
missing benchmark artifact.

---

## 15. Migration levels

A tool declares what it has reached in its manifest:

```json
"ui": { "framework": "tools.petrov.re/ui/v1", "level": 2 }
```

| Level | What it means | Typical work |
|---|---|---|
| **L0** | loads `diagram-ui.js`; gets tokens, theme, safe area, focus styles | one `<script>` line |
| **L1** | + tokens adopted: no colour, radius, shadow, font-size or spacing literal remains; breakpoints reduced to the four of §2.4 | a CSS pass |
| **L2** | + the shell: header, slots, placement law, one `h1`, exports de-duplicated, language and theme controls handed to the framework | a layout pass |
| **L3** | + components: fields, results, states, learn topics, stage sizing, unit registry, shortcut map | the full refactor |

**[v3.1]** L3 is unchanged as a level — a tool that reached it against revision 2026-08-15a is still
at L3 — but the components a port has to hand at L3 now include collapsible panels (§5.1), notices
(§5.2), meters (§7.1), rich tables (§7.2), legends (§7.3), transports (§10.1), file import (§8.12),
grouped options and example selects (§6.3, §8.3), region scrolling and splitters (§4.6). A tool
already at L3 that hand-builds one of these is not demoted, but the hand-built copy is now
redundant. `refactored3/NEW_TOOL_TEMPLATE.html` is a level-3 tool with zero bytes of tool-owned CSS
and no DOM construction at all; it is the target shape, not merely a demonstration.

L0 and L1 are mechanical and can be batched. L2 is where the site starts to look like one product.
L3 is per tool and can proceed for years without blocking anything.

Recommended order: the four tools that are unusable below `md` (`heat2d`, `moleculeconstructor`,
`thermodynamiccycles`, `roomacoustics`), then the six that overflow horizontally, then the studio
tools already on `diagram-scene3d.js` — they are closest to L3 — then the rest by traffic.

---

## 16. QA gates

Extends `AGENTS.md` §8. A tool at L2 or above must additionally pass:

- the shell renders and the shared bar is present **with the tool's data file deliberately blocked**;
- `window.__diagramReady` is true **and** `#dgc-bar` has at least one child;
- no interactive element intersects the safe area of §4.4 at 1440, 1120, 768 and 390 px;
- no horizontal overflow and **no unreachable region** at 390 px: every declared region is
  reachable by scrolling; no scroll ancestor of tool content has `overflow:hidden`;
- every focusable control has an accessible name; every tap target ≥ 44 px below `md`;
- exactly one `h1`, and it is the tool title;
- exactly one status statement on the page;
- the tool defines no colour, radius, shadow, font-size or spacing literal, and no CSS custom
  property outside the §2 set;
- tab strips, wizard steps and selects do not clip a label mid-word at any of the four breakpoints;
- learn: `intro` exists, every panel has a topic, the tour completes with the keyboard, and the tour
  card never overlaps its own target or the safe area;
- results show `pending`/`stale` correctly: with a `run` tool, changing an input after a run marks
  the result stale; exports are disabled while no result exists;
- theme: light, dark and auto all render, and the shared chrome matches the tool in each;
- language: switching re-renders every visible string, including derived and annotation strings.

The checks are mechanical and belong in the existing headless harness. `validation.html` gains a
`ui.level` column so the site's own register shows how far the migration has run.

Added in this revision **[v3.1]**:

- a language change keeps every panel, stage, tab strip, wizard step, examples list and notice the
  tool created, and keeps the last result on screen (§3.1);
- the first undo after a field edit returns the value the user had before that edit (§8.3);
- a collapsed panel's body measures 0 px and its controls are not counted by the reachability gate
  (§5.1);
- a control that is merely scrolled out of an independently scrolling region is **not** reported as
  occluded by the shared chrome (§4.6) — `DiagramUI.check()` was corrected for this;
- a `run`-mode tool shows its pending sentence and `learn.intro` before any data has loaded (§7).

---

## 17. Repairs consolidated into the framework **[v3.1]**

These are not new components. Each is one defect that N ported tools had already repaired by hand,
counted in `LOCAL_PATCHES.md`, moved upstream so the local repair becomes redundant. **A port must
delete its local copy; it is redundant, not load-bearing.** Every one of them is already marked
`UPSTREAM` in the tool that carries it.

| Defect | Tools | What the framework now does |
|---|---:|---|
| `hidden-collapse` | 43 | `[hidden]` collapses a `.dgu-field`, `.dgu-panel` and every other framework element, not only `.dgu-region`. Without it, `visible:false` left the control on screen. |
| `box-sizing-body-cards` | 37 | `box-sizing:border-box` on the tour card, learn popover and dialog, which live on `<body>` and were outside the `.dgu-app *` rule — they hung ~30 px past the right edge at 390 px. |
| `field-clamped-note` | 28 | The clamp note survives `clearError()` and is restated (§6.1). |
| `state-orphan` | 15 | `reset()` and `example()` mutate state in place (§8.3). |
| `field-minmax` | 12 | Native `min`/`max`/`step`, converted to display units, plus the blur settle (§6.1). |
| `mobile-strip-overflow` | 10 | Below `md` the strip **region** is the sticky box, so the answer travels with the reader instead of leaving the first screen on the first scroll. **[v3.2.1]** It is the grid item too, because its wrapper is `display:contents` there — see §17.9.1; a sticky box wrapped in a box of its own height cannot move. |
| `tap-44` | 9 | The 44 px floor reaches segmented buttons, tabs, toggles, ranges, the footer summary and the body-level cards (§4.5). |
| `step-select-sync` | 3 | The wizard `<select>` takes its value at build; `Steps.sync(id)` moves the list and the select without firing `onSelect`. |
| `sticky-region-stacking` **[v3.2]** | 3 | §17.9. The region is no longer the grid item, so a sticky region stays in its own row and a scrolling pane no longer clips its own splitter handle. Above `md` only: §17.9.1. |

`upstream-note` (32 files) is not in this list. It is a documentation marker, not a behaviour, and
nothing was changed for it.

Two framework CSS defects found by the ports are repaired in the same release: `.dgu-btn`'s
`white-space:nowrap` applied to the prose note the framework itself renders inside an examples
button — 513 px of horizontal overflow at 390 px in `debrisrunout`, 350 px in `procesklimaat`, 321 px
in `moodydiagram` — now `.dgu-btn-wrap`; and `.dgu-head-r` could neither shrink nor wrap, so a
single tool-contributed header action pushed the framework's own language, learn and theme controls
off the viewport (354 px in `gasdynamics`, 175 px in `wallthermalcalculator`, 123 px in
`roomacoustics`).

### 17.9 The ninth repair: sticky regions and the grid row **[v3.2]**

Three of the five pilot tools found this defect independently, patched it three different ways, and
none of them took it upstream. It is one defect with three faces, and `LOCAL_PATCHES.md` carries it
as `sticky-region-stacking` with the three files named.

- `fourier_series`: "at >=lg `.dgu-r-results` is sticky and escapes its grid row, floating over the
  dock … 343 px of them run under it." It repaired the consequence — the table's width.
- `doppler`: "above lg the framework makes the results column sticky … it ends up painted over the
  full-width footer, because a positioned element wins against static content." It gave the footer
  its own layer.
- `roomacoustics` shipped the worst face of it and no patch: the detail column's splitter handle had
  `role="separator"`, `aria-valuenow`, working arrow keys, a correct 11 x 760 px rectangle fully on
  screen — and `document.elementFromPoint` returned `DIV.dgu-main` down its whole length, at 1440
  and at 1280. A control no mouse can touch, through three green gates.

**Cause.** The region was the grid item. Two things follow from that and neither is obvious:
Chromium constrains a sticky *grid item* to the grid **container**, not to its grid area, so a
sticky region slides on down over the rows beneath it (measured in isolation: an item in row 1 of a
0–1200 px row reaching 1100–1300 px while row 2 begins at 1216 px); and a region that is also a
scrolling pane computes `overflow-x:auto` — one axis `auto` forces the other off `visible` — so it
clips everything absolutely placed outside its box, which is exactly where the splitter handle
belongs.

**What the framework now does.** Every region is placed through a wrapper: `.dgu-rwrap.dgu-rw-<name>`
is the grid item and carries `grid-area`; it is static, stretched to its row (`align-self:stretch`)
and does not scroll. The region keeps its class, its `data-region`, its identity and everything a
tool ever appended to it, and is an ordinary block inside the wrapper. A sticky region's containing
block is therefore its own row, and a splitter handle hangs on the wrapper — in the gutter, outside
the scroll box, reachable again. Because the handle now spans its whole grid row, its grip is
`position:sticky` and rides the viewport so the gesture stays in reach.

Normative for ports and for the framework:

- **`.dgu-region` is no longer a child of `.dgu-main`.** A tool that selects `.dgu-main > …`, or
  that sets `grid-area`/`grid-column` on a `.dgu-r-*` class, must move that rule to the wrapper.
  The old `.dgu-r-*{grid-area:…}` rules are still emitted and are inert; they go when the sweep
  reaches the last tool that relies on them.
- **A wrapper whose region is hidden is not a grid item at all.** An area name the archetype does
  not define creates an implicit track — measured: a phantom 12 px column and an extra row. The
  wrapper follows the region's `hidden` state synchronously through `App.useRegion` and, for the
  tools that write `app.regions.x.hidden` themselves (`cfd`, `luchtgroepselector`,
  `kernnormenwijzer` do), through a `MutationObserver` on the attribute.
- The three local repairs are **redundant, not load-bearing**, and each port deletes its copy.

#### 17.9.1 The one exception: the mobile result strip **[v3.2.1]**

The wrapper is a containing block, and that is the whole point of it above `md`. Below `md` it is
the defect: `.dgu-r-strip` is sticky *by being the grid item* — that is R3 `mobile-strip-overflow`
(§17), which seven of its ten tools had fixed in exactly those words — and a wrapper stretched to
the strip's own 48 px row is a containing block the strip cannot travel in. Measured on `doppler`
at 390x844 with only `diagram-ui.js` swapped: at `scrollY` 800 the strip sat at `top` −531 with the
wrapper, and at 245 without it. The gate saw none of it, because it ran at one width where the
strip is `display:none`.

**Below `md` the strip's wrapper steps out of the way:** `@media(max-width:768px){.dgu-rw-strip{
display:contents}}`. The region is the grid item again, in that one row and at that one width, so:

- the sticky box is the grid item, which is what R3 requires and what the framework rule
  `.dgu-r-strip{position:sticky;top:var(--dgu-head-h)}` has always assumed;
- a tool's own R3 copy still decides its own `top` — `gasdynamics` deliberately pins at `0` rather
  than under a header that does not stick, and measured travel on all ten R3 tools is now identical,
  pixel for pixel, to the pre-wrapper build;
- nothing is given back. Below `md` there is one column, so there is no neighbouring row for a
  sticky region to escape into that the reader does not want it in; and by §4.6 **the handles do not
  exist below `md`**, so there is no splitter handle for a scroll box to clip. The two defects
  §17.9 repairs are both above-`md` defects.

`display:contents` is chosen over making the wrapper the sticky box because the wrapper cannot
inherit the `top` the tool wrote on the region: a sticky wrapper pinned `gasdynamics` 203 px lower
than the tool asked for. It is also not a new stacking or hiding hole — `.dgu-rwrap[hidden]` and
`.dgu-rwrap:not(:has(> .dgu-region:not([hidden])))` are both more specific and still win, verified
by toggling `regions.strip.hidden` at 390 px: no phantom row, and the row returns at 48 px.

### 17.1 Asked for, deliberately not built

Named so a port does not go looking, and so the next person knows the question was considered.

| Wanted by | Not built | Why |
|---|---|---|
| ~~`stress_transformation`, `beam_diagrams`, `decayheat`, `fourier_series`, `roomacoustics`~~ | ~~a repeater / `type:'list'` field~~ | **Built in v3.2 — §6.4.** It was the largest remaining gap and the stated cause of the pilot's flat lookup and listener counts. |
| ~~`fourier_series`, `stress_transformation`, `decayheat`~~ | ~~a range + editable-number composite, and a value formatter on range fields~~ | **Built in v3.4 — §6.1.** `editable:` and `format:`. It waited two releases because it changes `Field.build` and the sync path; it shipped in the same release as §6.4.1 because both touch that surface and both were verified on it together. **[v3.4]** |
| `debrisrunout`, `cfd`, `outdoornoise` | a continuous colormap and a gradient legend | The ports say these are data, not chrome. A framework ramp would either be ignored or would move pixels in drawings compared against a baseline. |
| `moodydiagram` | HTML-string table cells | `{node: Element}` covers the need without adding an `innerHTML` sink (§7.2). |
| `roomacoustics` | a card-grid and an editable table for dialogs | One tool. Below the three-tool bar. |
| ~~`flangejoint`, `trussframe`~~ | ~~a read-only / derived cell in `type:'list'`~~ | **Built in v3.4 — §6.4.1.** Two tools, which is below the bar; it shipped anyway because the two are **independent** — both were written by agents forbidden to read any existing tool, both hit it, and both shipped the same workaround. Two independent discoveries of one gap is the same evidence as three copies of one habit. **[v3.4]** |
| ~~`periodictable`, `hydraulicsolutions`, `kernnormenwijzer`, `weldsymbols`~~ | ~~an answer surface for `reference` — `ui.results()` returning null, `on.compute`'s return discarded, `learn.intro` never drawn~~ | **Built in v3.4 — §19.** **[v3.4]** |
| `heat_exchangers`, `verwarmenkoelenselector` | parking `#dgc-bar` and `#eng-disc-badge` across a rebuild | Two tools, and moving `diagram-common.js`'s nodes onto `<body>` and back is the riskiest available change to a file 52 pages depend on. |
| `nuclideatlas`, `neutron_transport` | the 100 vh desktop app frame | Prohibited by §1 rule 8 and §4.3. §4.6 gives back the per-region scrollbar without it. |
| `fourier_series` | a sticky table header inside a 300 px scroll box | Needs a scrolling panel with a bounded height, which §5 removed. §7.2 is the honest substitute. |
| `periodictable`, `kernnormenwijzer`, `weldsymbols` | a sheet/overlay for "filters behind one control" below `md` | **Still open, and now at three tools.** §4.2 promises it for `reference` below `md` and the runtime does not have it: the filters simply stack above the content. It is an overlay component with its own focus trap and its own dismissal contract, not a layout region, and it is the largest single thing this specification claims and the code does not do. It is the next thing to build. **[v3.4]** |
| `outdoornoise`, `smrselector` | tabs mounted inside a panel; a wide report area for `wizard` | The second needs a new grid area in the `wizard` archetype, which is not additive. |
| any | a `key:` on the imperative constructors, so a rebuild can hand the same object back | The right fix for §3.1's remaining cost. Proposed, not built. |
| `periodictable`, `weldsymbols`, `kernnormenwijzer` | a selectable results-table row (`onSelect`, or a `selected` id carried back) | **Not built.** All three already solve it by putting an `app.actionButton()` in a cell: the row is selectable, the tool keeps its own selection model, and no framework surface is needed. A second, worse way to click a row is how a framework grows two of everything. Reconsider when one of these tools cannot use the button. **[v3.4]** |
| `debrisrunout`, `cfd`, `outdoornoise` | a continuous colormap and a gradient legend | **Reaffirmed, not built.** Three tools is above the bar and it is still refused for the reason §17.1 gave in v3.2: a framework ramp would either be ignored or would move pixels in drawings compared against a stored baseline, and the parity harness treats a drawing's colours as a numeric change. **[v3.4]** |
| `weldsymbols` | a small self-sizing, theme-aware canvas that is not a `Stage` | **Not built.** One tool. It re-implements dpr sizing 33 times per repaint for its catalogue thumbnails, which is a real cost, but a second canvas primitive beside `Stage` needs a second tool asking before it earns its place. **[v3.4]** |
| `weldsymbols`, `periodictable`, `kernnormenwijzer` | a repeating **content** component — a catalogue of N entries the framework renders | **Not built, and not intended.** `type:'list'` is an input repeater. The v3.4 answer surface (§19) removes the reason this was asked for: the catalogue is `tables:` in the compute payload and the framework re-renders it, so the render/sync/signature dance each of the three wrote by hand is no longer needed. **[v3.4]** |
| ~~`trussframe`, `luchtbalans`, `roomacoustics`, `debrisrunout`, `outdoornoise`~~ | ~~a pointer / hit-test / world-transform primitive on the stage~~ | **Built in v3.3 — §18.** It was the `studio` archetype's whole premise and the framework had none of it. |
| `roomacoustics` | a transform gizmo (move/rotate/scale handles in the drawing) | One tool. Below the three-tool bar. **[v3.3]** |
| `debrisrunout`, `outdoornoise` | rectangle and polygon hit shapes | Two tools. §18.2's `hit:` escape hatch keeps the drag, the keyboard, the history and the inspector for anything the two built-in shapes cannot express. **[v3.3]** |
| none | a marquee / multi-selection in a drawing | `diagram-scene3d.js` offers it and **zero** of the five scene tools use it — all three `AuthoringShell` tools pass a single primary id. Building a framework surface for something nothing uses is how a framework grows a second, worse version of what it already has. **[v3.3]** |
| `roofstormwater` | hosting `diagram-scene-editor.js` (`DiagramSceneEditor`) | One tool. `DiagramScene3D` is what three use, and that is what §18.3 hosts. **[v3.3]** |
| `cfd` | voxel / bounding-box picking | One tool, and its renderer is its own. **[v3.3]** |
| `pipesupports`, `roomacoustics`, `outdoornoise`, `debrisrunout` | a keyboard path for a `scene:` stage | **Not built, and it is a §16 violation in four shipped tools.** §18.4's scheme is consumed by `Interaction`, which `scene:` never constructs; the library's tree rows have no `tabindex` and its viewport binds pointer events only. This is the highest-severity thing on this table: it is an accessibility defect, not a missing convenience. **[2026-08-21c]** |
| `pipesupports` | `pick()` applied to strings inside a `scene:` declaration | **Not built.** The library writes `label`/`text` into `textContent` with no `asLabel`, so a §12 label object renders `[object Object]` and fwgate C1 fails the page. §20.2(1) makes the thunk the tool's obligation; the alternative is a change to `diagram-scene3d.js`, which is out of this file's scope. **[2026-08-21c]** |
| `pipesupports` | theme tokens in `diagram-scene3d.js` (`ensureAuthoringStyles`, `CanvasViewport`) | **Not built, and outside `diagram-ui.js`.** 31 hex literals, zero `var(--…)`. Hosting the library does not modernise it; §20.2(3) makes the entity palette the tool's obligation and the injected `<style>` remains a dark-only island. **[2026-08-21c]** |
| `fastenergrades` | one Clear button in the no-match state instead of two | **Not built — and this is the cheapest repair on the table.** `Results.render` draws the empty state's Clear and `filterBar` draws Clear-all; with one chip and `shown === 0` both appear, same label, same callback. Both halves are new in v3.4, so **nothing shipped depends on the pair**. **[2026-08-21c]** |
| `fastenergrades` | a unit symbol in a table head cell | **Not built, and not expressible.** `.dgu-table th` is `text-transform:uppercase` and the head vocabulary is `{label,num,width,wrap,class}` — no `node`, no opt-out. Either the uppercase goes or heads gain a `node`. **[2026-08-21c]** |
| `fastenergrades`, `pipesupports`, `cfd`, `outdoornoise` | a mobile answer surface for `reference` and `studio` | **Not built.** `renderStrip()` returns early for both. Measured at 390 px: a lookup's entry card at y ≈ 1225, a studio's first result tile at y = 2788 in an 844 px viewport. v3.4 gave `reference` an answer without giving it a place to be seen. **[2026-08-21c]** |
| `fastenergrades`, `kernnormenwijzer` | a `slot:` on `ui.examples()` | **Still not built.** It hard-codes `useRegion('inputs')`, which neither `reference` nor `studio` defines, so a lookup ships no presets and every reader starts from an unfiltered list. Second archetype author to name it. **[2026-08-21c]** |


---

## 18. The scene primitive — the `studio`'s mechanics **[v3.3]**

`studio` has been declared since revision 2026-08-15a as *"the user creates and manipulates objects
in a drawing (place, drag, select, delete)"*. Until v3.3 the runtime supplied the grid and nothing
else: no pointer events in the tool's coordinates, no hit test, no drag, no keyboard equivalent, no
world↔screen transform, no cheap redraw and no inspector bound to a selection. The archetype was a
promise the code did not keep.

### 18.1 The evidence, and the rule applied to it

The project's standing rule is *build only what three or more tools show the same shape of, and name
the three*. Counted across the tree:

| shape | tools | divergence |
|---|---|---|
| screen → tool coordinates | 8 | — |
| nearest-object hit test with a tap radius | 5 | **six different radii** |
| drag with pointer capture | 6 | — |
| a keyboard equivalent for the same edits | 3 | **three schemes**, two incomplete |
| snap to a step | 4 | — |
| a cheap redraw during a gesture | 6 | — |
| a per-object inspector bound to the selection | 4 | — |

Every row clears the bar. Nothing that failed the bar was built: no marquee, no gizmo, no rectangle
or polygon hit shape, no voxel picking (§17.1 names each and its count).

### 18.2 `interact:` — the 2D studio

Declared on a stage. The runtime owns, and a tool therefore may not re-implement:

1. **The transform.** `size.map` (`X`, `Y`, `wx`, `wy`, `scale`, `toWorld`, `toScreen`) is rebuilt
   once per frame in `Stage.measure`, before `resize` and `render`. World +y is up unless
   `yUp:false`.
2. **One tap radius, site-wide.** `DiagramUI.scene.tap`: point 14 px fine / 22 px coarse, segment
   10 / 16. The coarse point radius is half the §16 44 px touch floor, so the catch area is 44 px
   across while the drawn mark stays as small as the drawing needs. **Points beat segments
   unconditionally.**
3. **The gesture.** Pointer capture, a grab offset, snapping, `on.move` per frame and `on.commit`
   once at the end. **Exactly one undo entry per gesture**, however many pointermoves it contains.
4. **The cheap redraw.** During a gesture the runtime repaints the stage and never calls
   `on.compute`. `size.live` is true while a gesture is in flight.
5. **The inspector.** `inspect:{fields}` builds a real §5 `Panel` of §6 `Field`s in the `detail`
   region, bound to the selected object's own `ref`, synced by `ui.sync()` like any other panel.
6. **One keyboard scheme** — §18.4.

A tool declares its object model as points `{id,x,y}` and segments `{id,a,b}`, each carrying `ref`,
its own object. `hit:` replaces the built-in test where the two shapes cannot express it, and keeps
everything else.

### 18.3 A 3D scene is a `studio`, not a fifth archetype

`SCENE3D_SURVEY.md` measures five tools hand-rolling a scene tree, a resize, a render, an inspector
and a grid and asks whether a fifth archetype is owed. **It is not, and the code says so.** The
three tools driving `DiagramScene3D.AuthoringShell` pass the same six hosts, and the six land on the
`studio` grid with nothing left over:

| the library's host | region |
|---|---|
| `paletteHost`, `searchHost`, `treeHost` | `inputs` |
| `toolbarHost`, `placementBadge`, the canvas | `stage` |
| `propertiesHost` | `detail` |

A scene editor is a `studio` whose stage is a 3D projection. No new archetype, no new region, no new
grid template: `layout:'studio'` and `scene:` on the stage.

**The renderer is hosted, never replaced.** `diagram-scene3d.js` keeps every line of its projection,
picking, orbit camera, placement session, tree, inspector and toolbar; `stage.sceneStage.shell` and
`.viewport` are its own classes. What the runtime adds is the wiring each of the four scene tools
writes by hand today:

- the 3D canvas resizes with the stage and repaints on a theme change, through the `ResizeObserver`
  and `theme.watch` every stage already has;
- the tree, inspector and toolbar refresh **at the gesture boundary** — after a pick, after a drag
  ends — never per pointermove, because that would defeat §18.2(4);
- when the library is absent, `stage.scene()` returns `null`, posts a translated notice and the rest
  of the tool still works (§1 rule: honest degradation).

The five tools that use these libraries today are **not** migrated by this revision. They keep
working unchanged; this is a surface to adopt.

### 18.4 One keyboard scheme for every drawing on the site

Published as `DiagramUI.scene.keys`. A tool neither writes it nor varies it.

| key | effect |
|---|---|
| `Tab` | focuses the drawing — one focus stop, with a visible ring |
| `Enter` / `Space` | select the next object; `Shift+Enter` the previous; wraps |
| arrow keys | move the selection by one snap step; `Shift` moves four; `↑` is +y when `yUp` |
| `Delete` / `Backspace` | remove the selection, then select its **neighbour** — never nothing |
| `Escape` | cancel the gesture and clear the selection |

Every key routes through the same `on.move` / `on.remove` / `on.commit` as the pointer, so the
keyboard path and the mouse path cannot drift apart. A drawing whose tool declared no `on.remove`
makes `Delete` inert rather than wrong.

---

## 19. The `reference` answer surface **[v3.4]**

### 19.1 What was wrong

`reference` is declared in §4.2 as an archetype and in §7 as a tool that returns a payload from
`on.compute`. `App.build` did neither for it: one clause, `if (o.layout !== 'reference' && …)`,
skipped the Results view entirely. Four consequences, all of them measured rather than inferred:

| consequence | who measured it |
|---|---|
| `ui.results(…)` returns `null` | `periodictable` — "`App.build()` creates no Results view when layout is `reference`" |
| `on.compute`'s return value is silently discarded | `hydraulicsolutions`, which lost tiles, verdict and the freshness states with it |
| `learn.intro` never renders — the results empty state is the only place that draws it | `hydraulicsolutions`, `weldsymbols` |
| every catalogue row is appended by hand | `weldsymbols` — "the extra 11 DOM calls are all the same defect in the framework, not eleven different ones" |

Four shipped tools are in this family: `periodictable`, `hydraulicsolutions`, `kernnormenwijzer`,
`normenwijzer`, plus `weldsymbols`, which was built from `AUTHORING.md` alone and found it again
from a standing start.

### 19.2 What a lookup's answer is

**The entry the reader chose, and the state of the filtering that found it.** The framework does not
own the catalogue, the search or the selection — those are the tool's model, as they are in every
other archetype. It owns the rendering of the answer, and it owns it in the same shape as every
other archetype: a return value from `on.compute`.

```js
return {
  filter: { shown, total, label, emptyText, note,
            chips: [ { label, text, clear } ],
            clear },
  entry:  { id, kicker, title, subtitle, learn,
            rows: [ { label, value, unit, precision, hint, tone, node } ],
            nodes: [], notes: [] }
};
```

Normative:

- **A Results view is built for every archetype.** §7's three sentences now hold everywhere.
- **`reference` builds it closed.** The region is not shown and the view is `hidden` until the tool
  returns a non-null payload. This is what keeps the four tools that predate this revision
  byte-identical: all four fill `results` with panels of their own and none of them calls
  `ui.results()`, so an empty "Selection" heading above their content would have been a regression
  on every one of them. `results:true` opens it at build time, which is the only way to get
  `learn.intro` onto the first screen of a lookup. `results:false` still suppresses it entirely.
- **The heading is "Selection", not "Results"**, in all six languages. `results:{title:…}` overrides
  it; `results:{slot:…}` moves the surface, and a slot the archetype's grid template does not name
  is refused and falls back to `results` — an unnamed area becomes an implicit track (§17.9).
- **The pending line is the lookup's own** — "Choose an entry to see it here." — not the
  calculator's "Adjust an input to see the result." `reference` is the one archetype that spends
  most of its life in the pending state.
- **`filter` renders one line**: the count, a chip per active filter, and a Clear. A chip whose
  `clear` is a function grows a `✕` whose hit area is 44 px (§16) while the chip stays small; a chip
  without one is a statement. The Clear-all button is drawn **only when at least one chip exists** —
  a dead Reset is worse than none. `shown`/`total` collapse to one number when equal.
- **`filter.shown === 0` is an answer, not an empty state.** The framework renders a translated
  "Nothing matches these filters." with the Clear button and **skips `entry`**. `filter.emptyText`
  overrides the sentence. Every reference tool in the tree had written some version of this by hand.
- **`entry` is a definition list, not a table**, because §7.2 makes a table cell `nowrap` by design
  and half of what a catalogue entry says is a sentence. Its `rows` take the same
  `{label, value, unit, precision, tone}` contract as a §7 tile, so a lookup that does hold a number
  states it the way the rest of the site does. `id` is published as `data-entry`.
- **A rebuild carries the answer and the open region together.** §3.1's results carry-over goes
  through `ui.results()` for a deferred view, not through the view's own setter.

### 19.3 What is still the tool's

The catalogue, the filter predicate, the search, the selection model and the list of hits. A
`reference` tool still renders its rows with `app.table()` — `chosen:true` marks the current one —
or as `tables:` in the same payload. The framework grew no catalogue component, no selection owner
and no search box: three tools want a clickable results row and all three already solve it with an
`app.actionButton()` in a cell, which keeps the tool's own selection model. §17.1 keeps the row.

### 19.4 One layout repair that came with it

`.dgu-app[data-layout="reference"] .dgu-main` is `align-content:start`. A grid whose container is
taller than its content distributes the free space to its `auto` rows, and `reference` is the one
template whose `nav` spans two rows and whose `stage` row is optional — so a lookup with no drawing
stranded its answer ~130 px down the page under an empty row. Scoped to this archetype and measured
first: at 1280 and 390 px, in German, on all five shipped reference tools, not one region moves a
pixel.

---

## 20. What the second blind cohort measured **[2026-08-21c]**

### 20.1 The method, and what it proves

§18 and §19 were built to close two gaps this specification had declared and the runtime had not
kept: `studio` had no mechanics, and `reference` had no answer. The same day, two tools were built
against them by authors who had never seen this project, working from `AUTHORING.md` alone and
**forbidden to open any existing tool's `.html`**. That constraint is the whole value of the
exercise: an author who may read a shipped tool measures how well the tools were copied, and an
author who may not measures how well the framework was **declared**.

| | `pipesupports.html` | `fastenergrades.html` |
|---|---|---|
| archetype | `studio`, `compute:'live'`, hosted 3D scene (§18.3) | `reference` with §19's answer surface |
| `check.js` × 4 viewports | clear | clear |
| `check.js --block diagram-ui.js` | clear | clear |
| `fwgate` | GREEN, no new waiver | GREEN, no new waiver |
| `catalog.php` | 0 errors | 0 errors |
| parity | OK, 12 cases | OK, 14 cases |
| six languages | all six read end to end | all six read end to end |
| **tool-owned CSS** | **0 bytes** | **0 bytes** |
| DOM touches | 10, 8 of them in the four exceptions §7.2/§13/§10/§7.4 name | 11, **0** discretionary |

The release was additionally checked against the **whole** numeric net for the first time: all 51
stored parity baselines were run, **11 failed**, and every one of the eleven was re-captured under
the pre-release framework (`2026-08-18.v3.2.1`) and compared output-by-output. Ten produce
byte-identical records under both versions and are stable across repeated runs — **stale baselines**;
the eleventh, `reactorstand`, is non-deterministic because its record carries wall-clock-derived
outputs. **No surface in this specification moved a number.** The finding is recorded here because
the conclusion "the framework changed nothing" is only worth stating when the measurement that
supports it covered everything, and until 2026-08-21 it had covered five tools.

Neither surface had to be changed to accommodate either tool. **That is the result §18 and §19 were
built for, and it holds.** The scene tool wrote zero lines of projection, camera, picker, drag,
placement, resize, dpr correction or theme subscription — 210 lines of declaration — and the lookup
tool rendered a filter line, an entry card, a 22-row catalogue and its notes at a cost of **zero
results DOM**.

### 20.2 The seam — normative obligations a hosted scene does not inherit

A tool that declares `scene:` hosts `diagram-scene3d.js`, and that library **predates the token
layer (§2), the six-language rule (§12), the 44 px touch floor (§16) and §18.4's keyboard scheme**.
Hosting a library faithfully does not modernise it. The following are therefore **obligations of the
tool**, not of the runtime, until the library is changed:

1. **Every string handed to `scene:` must resolve itself.** `renderPalette()` and `createNode()`
   write `label`/`text` into `textContent` with no `asLabel`; `asLabel(v)` returns a non-function
   unchanged. A §12 label object renders `[object Object]` — a violation of §12 that **fwgate C1
   fails the page for**. A thunk satisfies every `asLabel` site; palette and tree labels, which get
   none, must be re-resolved on the language rebuild.
2. **The tool must supply the keyboard path.** `DiagramUI.scene.keys` is consumed by `Interaction`,
   which a `scene:` stage never constructs; `SceneTree` rows are `<div>`s with a click listener and
   no `tabindex`, and `CanvasViewport` binds pointer events only. §18.4 does **not** reach a hosted
   scene, and §16's rule that a control the pointer alone can reach is broken applies unchanged.
   All four tools driving `AuthoringShell` violate it today.
3. **The tool must colour the scene from tokens.** The Stage repaint reaches the hosted canvas and
   changes nothing, because `CanvasViewport` redraws hard-coded literals — so the canvas is
   byte-identical after a theme change and **fwgate C4 fails**. `SceneStage.build` copies the
   `viewport` def by value, so a declared accessor is evaluated once; entity colours must be
   recomputed inside the per-frame adapter and the background reached through accessors on
   `viewport.options`.
4. **`render:` on a `scene:` stage takes the canvas over.** `Stage.schedule` calls
   `sceneStage.draw()` only when no `render` is declared. A tool that overlays must call it itself.

Measured consequences that are **not** the tool's to fix and are recorded here as defects of the
hosted library: `ensureAuthoringStyles()` injects ~3 kB of `<style>` carrying **31 hex literals and
zero `var(--…)`**, so the palette, tree, inspector, toolbar and badge are a dark-only island on a
themed page (§2 violation); `.scene3d-toolbar button` is **34 × 32 px**, under §16's floor, beside
the framework's own 44 × 44 Fit tool; `PropertyInspector.field()` commits `Number(input.value)` raw
with no unit conversion, no clamp, no `validate` and no `aria-invalid`, so a scene tool carries two
field vocabularies with different guarantees in one column (§11); `CanvasViewport.pick()` tests the
projected **centre** within `pickRadius||16`, a sixth tap radius on a site §18.2 gave one; and
`searchHost`, one of the six hosts §18.3 advertises, is a `<div>` the library binds `input` and
`.value` to — **dead on arrival**.

### 20.3 The `reference` answer surface, as used

§19 is confirmed by use, with one qualification the author stated plainly: *"Yes for composing the
answer, not yet for reaching it."* Six things §19 does not do, each measured:

| | Measured | Status |
|---|---|---|
| a selectable catalogue row | the `actionButton`-in-a-cell workaround §17.1 sanctions is re-rendered by the `on.compute` its own click triggers, so the button is removed inside its own handler and focus falls to `<body>` — in a 22-row catalogue a keyboard reader returns to the top of the document on every pick | **§17.1's reasoning is now wrong.** Fourth tool asking; the first with the cost |
| a unit in a table head | `.dgu-table th` is `text-transform:uppercase`; §7.2's advised `{label:'N·m'}` renders `N·M`. Measured `RM (MPA)`, `RP (MPA)`, `FY (KN)` | no tool can do this correctly today |
| one Clear in the no-match state | with ≥1 chip and `shown === 0` the runtime draws the filter bar's Clear-all **and** the empty state's Clear — same label, same callback, 40 px apart | **both halves are new in v3.4, so nothing shipped depends on the pair.** A one-line repair |
| a default slot for `reference` | `App.prototype.panel` defaults to `inputs`, which the `reference` template does not name, so an undeclared panel becomes an implicit track — §17.9's defect, reached from the other side | tools must declare `slot:` explicitly |
| `ui.resetAction()` in a declared panel | an instance method, and a panel action's `label` is read once at build, so neither the call nor a thunk fits `panels:[…]`. Building the panel imperatively costs the tool §11's header unit control | unresolved trade |
| the answer on the first screen below `md` | `renderStrip()` returns early for `reference` as well as `studio`; the single-column order is `nav, stage, results`. Measured at 390 px: the entry card starts at **y ≈ 1225**, the `studio` tool's first result tile at **y = 2788** in an 844 px viewport | **v3.4 gave `reference` an answer and not a place to see it** |

`minDisplay`/`maxDisplay` are additionally confirmed to have **no effect on a range field**: only the
`number` branch of `Field.buildControl` calls `displayBound()`, and the v3.4 `editable:` box repeats
the omission. §6.1 already admits the SI-vs-display defect; it must also be read as saying that the
documented workaround does not work. Eleven shipped sliders are calibrated against the current
behaviour, so this stays deliberately unrepaired.

### 20.4 The verdict this specification is entitled to

**Of the four archetypes this document declares, four now have mechanics and an answer surface.**
`studio` gained both in v3.3 and `reference` gained its answer in v3.4; `calculator` and `wizard` had
them already. `SCENE3D_SURVEY.md`'s question is closed: a 3D scene editor is a `studio` with a 3D
stage, and §18.3 hosts the library rather than absorbing it.

**What the specification is not entitled to claim is adoption.** Measured in the served tree on
2026-08-21:

| surface | tools using it |
|---|---|
| §18.2 `interact:` — the 2D studio primitive | **0**. Proven on a witness page only. `trussframe` still carries its ~240 hand-written lines, including the drag that snaps the grabbed joint to the pointer instead of preserving the grab offset |
| §18.3 `scene:` — the hosted 3D stage | **1** — `pipesupports`, written blind against it. The four shipped scene tools still hand-wire `AuthoringShell` |
| §19 `filter:` / `entry:` | **1** — `fastenergrades`, written blind against it. The four shipped `reference` tools still render their answers from panel hooks with their own signature caching |
| §6.1 the range composite | **0**. `stress_transformation` still carries five `type:'custom'` sliders and `decayheat` five |
| §6.4.1 `type:'derived'` | **0** |

Every one of those five surfaces was built additively and proved on a witness suite, all of them
re-run on 2026-08-21 by a party that did not write them: **`reference` 50 passed / 0 failed,
`listcell` 34 / 0, `range` 35 / 0**, and the four `scene` scripts printing 75 measurements with
**0 page errors** across their four pages (that suite reports values rather than a pass count).
None of the five was proved on a migration. **The first
real migration will find things no witness did**, and §17.1's three-tool bar cannot be applied
honestly to a surface with one consumer.


## 21. One path to paper **[v3.5]**

*Added 2026-08-21 in answer to a direct question: does the framework give every printed artefact a
common header and footer? Before this section the answer was no, and there were three paths.*

### 21.1 The rule

**Every route by which a tool's content reaches paper goes through `Diagram.report()`.**

`Diagram.report()` lives in `diagram-common.js` and is not this framework's to reimplement. It
builds a separate A4 document with a real running header and a running footer, paginates it in
script, renders it into a hidden same-origin iframe and prints it from there. §21 does not change one
byte of it. What §21 does is make every other route arrive at it.

| route | behaviour, from v3.5 |
|---|---|
| the shared bar's **Report** entry | unchanged — `report({record:rec})` |
| **`Ctrl`/`Cmd`+`P`** | intercepted; prints the report. Byte-identical to the button, because it is the same call |
| `app.print()`, `app.printAction()`, `header:{print:true}`, `DiagramUI.print()` | the declared affordance. **A tool must not write `window.print()`** except as the degraded arm — §21.8 |
| **File → Print** from the browser menu | cannot be intercepted by any page. The framework's `@media print` fallback sheet, §21.3 |

A tool with **no record** is not hijacked. The print shortcut declines before `preventDefault`, and
the browser's own print dialogue opens onto the fallback sheet. A tool with nothing to report must
keep its keyboard.

### 21.2 What the framework owns, and what a tool may still say

The framework owns the **furniture**: the page box, the paper colour, the token layer, the hiding of
every control this framework created, the single-column reading order, `break-inside` on every
framework component, and the running header and footer. **A tool must not restate any of it.**

The framework does **not** own the **content decision** — which of the tool's own regions belong on
paper. `decayheat` deliberately prints its inputs, and un-collapses a folded panel to do it;
`regelkring` deliberately does not, because its inputs region is 39 fields. Both are right about
their own tool. A tool-side print rule is therefore legitimate when, and only when, it is about:

* a selector the framework did not create (`.en-svgwrap`, `.rpbar`, `.card`, `.noprint`);
* a token the framework does not publish (`regelkring`'s `--warm`/`--cold`,
  `protectioncoordination`'s `--text`);
* which of the tool's own regions or components reach paper at all.

Anything else belongs here. `decayheat`'s block was the proof: it carried
`html:root{--bg:#fff!important…}` with a comment explaining that a bare `html` selector loses to the
`:root` the framework declares its tokens on. A tool cannot win that argument. The framework can,
because `:root` is its own — so the framework must own it.

### 21.3 The fallback sheet, and its limits — stated, not hidden

The fallback sheet is what File → Print produces. It is the honest floor, not a second report. It
carries an A4 page box, the tool's own content in one column with every piece of chrome gone, a
running header (*tool title · tools.petrov.re* and the localised words **Screen printout**, so it
can never be mistaken for the record), and a running footer carrying `Diagram.report.attribution()`
verbatim plus a localised line naming the Report entry as the paginated version.

Three mechanical facts, each measured in this tree against Chromium 141.0.7390.37 by printing to PDF
and reading the text back page by page:

1. A `position:fixed` block **repeats on every printed page** — but only if it is positioned inside
   the page content box (`top:0` / `bottom:0`) with the space reserved by `body` padding. Given a
   negative offset into the `@page` margin it is dropped from the first or the last sheet.
2. **`counter(page)` does not resolve inside such a block.** It does resolve in an `@page` margin
   box, and this Chromium supports those: `@page{@bottom-right{content:… counter(page) …}}` printed
   *page 3 of 6* on page 3.
3. **`@page` margin boxes are not supported by Firefox or Safari.** There the page number silently
   disappears. **The framework must never rely on it.** The sheet is attributed and carries its
   source URL without it, and the footer tells the reader in their own language that the paginated
   record — which numbers its own pages in script, and therefore works everywhere — is the Report
   entry.

The rule that hides the running boxes on screen is written **before** the `@media print` block. That
order is load bearing: a media query adds no specificity, so the same rule written after it wins
inside print too and the sheet comes out unattributed.

### 21.4 A tool that keeps a document of its own

Two shipped tools generate a report document of their own that `Diagram.report()` cannot yet
replace — `protectioncoordination` (a study report with a reproducibility appendix, also its HTML
export) and `probabilisticrisk` (reachable only when `diagram-common.js` failed to load). AGENTS.md
§2.2 already governs them: **such a path must stamp `Diagram.report.attribution({page, pages})`
verbatim on every page.** Neither did before v3.5; both do now.

### 21.5 Known gap — the report pager cannot carry a raster figure

`diagram-common.js`'s pager appends each flow item and compares `scrollHeight` with `clientHeight`.
It runs **before** a `data:` URL `<img>` has laid out, so a raster figure measures as zero height, no
page break happens, and `.pc{overflow:hidden}` clips the overflow away.

* Measured on the shipped tree at v3.4.0: `fastenergrades`' report page 2 overflows by 330 px and
  **fourteen table rows never reach paper**. The same page prints a literal `[object Object]` in a
  report cell.
* Inline SVG is unaffected, because it lays out synchronously — which is why `mollier` and
  `moodydiagram` pass their charts as `svg:` and not as PNG.
* Until it is repaired, **a tool whose figure is a picture should pass inline SVG.** A canvas-drawn
  chart has no such option; `heat_exchangers`' six charts are held out of its report for this reason.
* The repair is in the pager, not in a tool: wait for the images before the first append.


### 21.6 Conformance, as measured — not as intended **[2026-08-21e]**

§21.1–21.5 were written by the pass that implemented them. What follows was measured afterwards by a
party that wrote none of it, against `http://127.0.0.1:8099/` serving `/root/refactored3`, framework
`2026-08-21.v3.5.0` (`md5 5f3c9bd67ebcc86ba7621256c4f55fb2`). A rule in this section is conformant
only where the measurement says so.

| claim in §21 | method | result |
|---|---|---|
| `Ctrl`/`Cmd`+`P` prints the report and never `window.print()` | real `Control+p` through CDP, `Diagram.report` and `window.print` wrapped, `defaultPrevented` read from a window-level listener behind the framework's | `report` called once, `window.print` **0**, `defaultPrevented` **true** — on every cell tested, including with the caret in a text field and on the two pages not on `DiagramUI.app()` |
| a tool with no record keeps its keyboard | `cfd.html`, which builds no record | `canPrintReport()` **false**, `report` **0**, `window.print` **0**, `defaultPrevented` **false**. The decline happens before `preventDefault`, as §21.1 requires |
| the fallback sheet reaches every page on the framework | all 67 HTML pages in the tree loaded under print media | **61 of 67** carry `#dgu-print` + `#dgu-print-head` + `#dgu-print-foot`. The six that do not are named in §21.7. **Re-measured after §21.9: 65 of 67**, the two remaining being `index.html` and `flowstep.html`, both refused with a reason in §21.9 |
| the sheet hides framework and site chrome | 14 chrome selectors counted under print media | **0 visible** on every tool checked |
| the footer carries `Diagram.report.attribution()` on every page | `page.pdf()`, text extracted one page at a time | present on every page of every sheet |
| the page number is localised in six languages | the generated `@page` rule read back | correct in `en uk de nl fr es`; all five new `UI_STRINGS` keys carry six languages |
| tool-owned page-level print CSS was reduced | every `@media print` block inside a `<style>` element measured on both trees | **10 891 B → 3 608 B, −66.9 %**, matching the claim exactly |
| `Diagram.report()` is unchanged | `diagram-common.js` md5 on both trees; report HTML captured and re-paginated | byte-identical file; 14 of 15 report documents byte-identical after normalising the ISO timestamp and the random table id; `moodydiagram` 3 → 4 pages is pure addition, no line lost |

The four probes used are kept at `/root/harness/print-sheet.mjs`, `print-chrome.mjs`,
`print-contrast.mjs` and `print-css-size.py`, each carrying its method and its known artefacts in its
own header. **None of them is wired into any gate**, so nothing in this project will notice if a
future change breaks §21 — that is the honest state of the print contract's enforcement.

**The refresh is on `beforeprint`, and that is load-bearing for anyone measuring this.** The two
running boxes are filled once at `App.build()` and refilled on every `beforeprint`. A test that only
calls `emulateMedia({media:'print'})` reads whatever the boxes held at build time, which on a tool
that registers with `Diagram.init` late is a bare `Source: <location.href>`. `page.pdf()` and the
browser's own File → Print both fire `beforeprint` and both read correctly. Measured on
`debrisrunout`, where the two differ.

### 21.7 What does not conform, named **[2026-08-21e]**

None of these is a regression — every one is either older than §21 or a consequence of a tool's own
CSS — but §21 claims *one path*, and these are the places where that claim is not yet true.

> **[2026-08-21f] Items 1–4 are CLOSED.** Each was re-measured first, and **two of the four figures
> below were wrong** — the instrument that produced them is described in §21.9, which also records
> what was repaired, what the repair measured afterwards, and the two things left open. Item 5 was
> closed earlier the same day; item 6 is still open. **Read §21.9 before quoting any number in
> items 1–4.**

1. **Six site pages have no print sheet at all**: `index.html`, `flowstep.html`, `validation.html`,
   `smr-changes.html`, and — worse, because these two are documents a reader would deliberately
   print — **`benchmark.html`** and **`disclaimer.html`**. None of them loads `diagram-ui.js`, so
   File → Print gives them the browser default with no attribution and no source URL. The irony is
   sharp: `benchmark.html` is the page every attributed footer in the project links to as its
   evidence, and it is the one page that prints unattributed. §21 is a framework contract and the
   framework is not on those pages; making it project-wide means either putting it there or writing
   the same sheet for the site shell.
2. **`generatorgrid` prints its dark theme onto white paper.** Under print media, **133 text nodes
   sit at a contrast ratio below 2.0 against their effective background**, most at
   `rgb(231,240,248)` on `rgb(255,255,255)` — a ratio of **1.15**. `generatorgrid` is one of the two
   pages not on `DiagramUI.app()`; it received `DiagramUI.printStyles()` and the `Ctrl`+`P` bridge
   but not the palette repair its twin got. `printStyles()` installs the framework sheet, which
   declares white paper on `:root`; it cannot know a tool's private `--text`. **A tool that ships a
   dark default must force its own light palette under print** — see §21.8.
3. **`protectioncoordination` — the tool §21 repaired — still prints four rows dark-on-dark.**
   `#tccLegend.legend` keeps `background: rgb(8,12,17)` under print while its four `.legend-row`
   children take the forced light palette's `rgb(23,32,42)`: ratio **1.19**. With Chrome's default
   "background graphics: off" the rows are readable and the defect is invisible; with backgrounds on
   they vanish. Forcing a palette repairs text colour, not the backgrounds a tool paints behind it.
4. **`solargaincalculator`'s File → Print produces a page with no tool content on it.** Its retained
   `@media print{#app{display:none!important}}` out-ranks the framework sheet and substitutes
   `#report-view`, which is empty until the reader opens the overlay. Measured: **one A4 page,
   391 non-space characters, all of them the framework's own header and footer**. The sheet is
   correctly formed, correctly attributed and carries nothing. §21.2's "which of the tool's own
   regions reach paper is the tool's decision" permits this rule; it does not permit the result.
   **A tool that substitutes its own document under print must guarantee that document exists.**
5. **Eight tools print a source URL for a file that does not exist.** `debrisrunout`, `ductnetwork`,
   `gasdynamics`, `heat2d`, `hydraulicnetwork`, `outdoornoise`, `probabilisticrisk` and
   `roomacoustics` each call `Diagram.init({id:'<name>-v2', file:'<name>-v2.html'})`, and no
   `-v2.html` exists in the tree; the benchmark artifact is `benchmarks/<name>.json`, not
   `<name>-v2.json`. So every sheet and **every page of every report** from those eight carries
   `Source: https://tools.petrov.re/debrisrunout-v2.html` and
   `Benchmark report: …?tool=debrisrunout-v2`, both dead. This is a tool defect and it is older than
   §21 — `Diagram.report()` has always used `Diagram.init`'s `file` — but before §21 the screen
   printout carried no URL at all, so §21 took the defect from one document to every sheet the tool
   can produce. **`Diagram.init`'s `file` is the canonical published filename, not a build alias**,
   and nothing in the tree checks it.
6. **`protectioncoordination`'s own study report stamps `attribution({})`, not
   `attribution({page, pages})`.** AGENTS.md §2.2 asks for the second form. Its page number comes
   from an `@page` margin box instead — so in Firefox and Safari that document prints attributed but
   unnumbered. It is a real improvement on what it did before v3.5, which was to carry no
   attribution at all, and it is not yet what §2.2 asks for.

### 21.8 Two rules that needed an exception **[2026-08-21e]**

**`window.print()` — the degraded arm is legitimate.** §21.1 said a tool must not write it. Three
shipped tools do, and are right to: `heat_exchangers`, `moodydiagram` and `solargaincalculator` each
end a print button with

```js
if (window.DiagramUI && DiagramUI.print) DiagramUI.print();
else if (window.Diagram && Diagram.report) Diagram.report({});
else window.print();
```

The third arm is reachable only when `diagram-common.js` did not load, in which state
`Diagram.report()` does not exist to be called. A page whose shared runtime failed should still be
able to hand a reader its result. **The rule, precisely:** a tool must never write `window.print()`
as a *route* to paper; it may write it as the last arm of a chain that has already tried
`DiagramUI.print()` and `Diagram.report()`. Any `window.print()` not preceded by both is a defect.

**A dark-default tool must force its own light palette under print.** §21.2 says the framework owns
the token layer and a tool must not restate it. That is true of framework tokens, declared on
`:root`. It is not true of a token the framework has never heard of: a tool that ships
`--text:#e8edf3` and paints its own surfaces is not overridden by anything the framework can write,
because the framework does not know the name. `protectioncoordination` demonstrates the repair
(force `.light` in print); `generatorgrid` demonstrates the cost of not doing it (§21.7 item 2).
This belongs in the list of legitimate tool-side print rules in §21.2 as a **requirement**, not a
permission: **if your default theme is dark, print rules that restore a light palette — text
colours and the backgrounds you paint behind them — are yours to write and nobody else can.**

### 21.9 Items 1–4 closed, and what re-measuring them changed **[2026-08-21f]**

*Written by the pass that did the work, after re-measuring every item in §21.7 rather than
believing it. Framework `2026-08-21.v3.5.1`. `diagram-common.js` untouched
(`60b816a5f9d5abab5a2d56e11dc1e184`); `fwgate.mjs` GREEN at the same 84/84 with the same 52 waivers
across the same 7 known defects, before and after; `php catalog.php` 0 errors and the same 3
pre-existing warnings.*

#### 21.9.1 The instrument, and the fact it overturned

`/root/harness/print-contrast2.mjs` measures the foreground against the **actually painted**
background under print emulation, with Chrome's "Background graphics" **both on and off**. It
supersedes `print-contrast.mjs`, whose two structural blind spots produced two wrong numbers in
§21.7: it ignores `background-image`, so a panel painted with a gradient reads as white paper; and
it treats an `rgba()` background as opaque instead of compositing it.

The background-graphics-off model is **calibrated, not assumed**. A synthetic five-cell page was
printed with `page.pdf({printBackground:true|false})` — which is exactly the Chrome checkbox —
rasterised with `pdftoppm -r 72` and sampled per pixel:

| cell | bg on | bg off |
|---|---|---|
| `background-color`, `print-color-adjust:economy` | `(8,17,28)` | `(255,255,255)` |
| `background-color`, `print-color-adjust:exact` | `(8,17,28)` | `(8,17,28)` |
| `background-color`, `exact` **inherited** from a parent | `(8,17,28)` | `(8,17,28)` |
| `background-image` gradient, `economy` | `(8,17,28)` | `(255,255,255)` |

So the checkbox suppresses `background-color` and `background-image` alike, **and
`print-color-adjust:exact` overrides the suppression and inherits.**

**That last fact is normative for anyone reasoning about this sheet.** `PRINT_CSS` sets
`body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`, and the property inherits, so on
every page carrying the framework sheet **backgrounds print whether the reader ticked the box or
not**, and the two states cannot diverge. Measured on `generatorgrid` before its repair: identical
page count, character count and ink coverage in both states. Any claim of the form "with background
graphics off this sheet is white on white" is false for a framework-sheet page, and §21.7 item 2 was
written on that premise.

#### 21.9.2 The four items, before and after

| | measured before | measured after |
|---|---|---|
| **1** pages of 67 carrying `#dgu-print` and both running boxes | 61 | **65** |
| **2** `generatorgrid`, text nodes below 2.0 contrast (bg on / off) | 9 / 9, worst **1.15** — *not* 133 | **0 / 0** |
| **2** `generatorgrid`, page-1 ink coverage, of which near-black | 66.5 % / 63.3 % | **2.3 % / 0.4 %** |
| **3** `protectioncoordination`, nodes below 2.0 (bg on / off) | 4 / 4, worst **1.36** — *not* 1.19 | **0 / 0** |
| **4** `solargaincalculator`, File → Print with the report closed | 1 page, 385 characters | **5 pages, 3 692 characters** |
| **4** `solargaincalculator`, File → Print with the report open | 5 pages, 5 803 characters | **5 pages, 5 803 characters** |

**Item 2, `generatorgrid`.** The published figure of 133 nodes at 1.15 was an artefact: 131 of them
were light text on a dark gradient panel the old probe could not see. The nine real ones had **two
different causes on one page**, and the second is worth writing into this specification:

* the tool's own `--text` stayed `#e7f0f8`, so `div.title` printed near-white on white at **1.15**.
  This is §21.8's rule, unapplied.
* the framework's `--muted:#3b434d` — a *dark* grey, correct on white paper — landed on the tool's
  own dark `#101e2f` surfaces, printing eight `.hint` blocks **dark on dark at 1.80**.

So the collision runs in **both** directions. Forcing a palette repairs text colour and does not
repair a surface, and a framework token forced light will be wrong wherever a tool still paints
dark. **A dark-default tool must repair both its own token names and its own painted surfaces**, and
neither is the framework's to do. `generatorgrid`'s print block now does exactly that and restates
no framework token.

**Item 3, `protectioncoordination`.** It was already forcing the *tokens* `.light` sets. But
`.light` also carries two rules as a **class** selector — `.light .legend` and `.light .pane-title`
— and a print block cannot put a class on `:root`. The verbatim bodies of those two rules now
appear inside its `@media print`. **"Force the tool's light palette" means the class's rules, not
only its token values**; a tool whose light theme is a class must copy every rule that class carries.

**Item 4, `solargaincalculator`.** `@media print{#app{display:none!important}}` is now
`html.sgc-report-open #app{…}` — the class the same function sets when it fills and opens
`#report-view`. The rule this establishes: **a tool that substitutes its own document under print
must key the substitution on that document existing.** The tool loses nothing — with the report open
the printed artefact is identical, and `#report-view`'s HTML is byte-identical at 203 951
characters.

**Item 1, the site pages.** `benchmark`, `disclaimer`, `validation` and `smr-changes` now load
`diagram-ui.js` and call `DiagramUI.printStyles()`. That is the entire change: no `DiagramUI.app()`,
no shared bar, no `Ctrl`+`P` interception — measured on all four, `report` 0, `window.print` 0,
`defaultPrevented` **false**, which is §21.1's rule that a page with no record keeps its keyboard.
Each page additionally hides its own language switcher and site nav under print, which §21.2 leaves
to the page. After: an attributed, localised footer on **every** page of every sheet (`benchmark`
7 of 7, `disclaimer` 3 of 3, `validation` 1 of 1, `smr-changes` 2 of 2), **0** chrome selectors
visible, **0** low-contrast nodes in both background states.

**One defect class this section's instrument cannot see: content clipped off the right margin.**
A4 at the framework's 12 mm margins is **703 px** of content, and a screen affordance backed by a
scrollbar has nothing to scroll on paper. Rendering the sheets to PNG and reading them found
`generatorgrid`'s `display:flex;overflow:auto` tab strip cut in the middle of a word (**3** elements
past the margin) and `protectioncoordination` losing the right-hand end of its one-line diagram, its
last legend row and its last axis label (**15** elements, by 18–20 px — `.sld{min-width:720px}` is
wider than the page, and `.pane` is a grid item whose automatic minimum size is its content's). Both
are now **0** and **2 at 1 px**. **Contrast is not readability**: a probe that reads computed style
scores a clipped node as perfectly legible. Look at the sheet.

**Tool-owned print CSS went back up, and that is correct.** `print-css-size.py` across the 14 tools
it tracks: **3 608 B → 9 351 B**, of which **+3 319 B is comment text inside the blocks** and
**+2 424 B is declarations**. v3.5.0's −66.9 % was the removal of *duplicated framework furniture*;
what §21.9 added is the category §21.2 reserves to the tool. **`print-css-size.py` is not a quality
metric in either direction** — some tool-owned print CSS is mandatory, and that is the whole of
§21.8.

`UI_STRINGS` gained one key for this, `print_source`, in six languages copied verbatim from
`diagram-common.js`'s `rSource`; the fallback attribution is now localised and carries an ISO
timestamp, because a printed disclaimer with no date is not evidence of anything. The branch is
reached **only** where `Diagram.report.attribution` does not exist, so it is inert on all 61 pages
that had the sheet already — proved by `Diagram.report.html({})`, `Diagram.record.build()` and
`Diagram.report.attribution({})` being byte-identical before and after on all three edited tools.

**Two pages were refused, with the reason.** `index.html` is navigation, not a record — a printed
list of links nobody can click — and it is the one page every visitor loads, so putting 341 kB of
framework on it to improve a printout nobody takes is the wrong trade. `flowstep.html` is
`lang="ru"`, outside the site's six languages, and **linked from nowhere in the tree**; the sheet
would arrive in a language the page does not speak. Until either judgement is overturned, "one path
project-wide" means 65 of 67 and two named exclusions, not 67 of 67.

#### 21.9.3 Left open

1. **A bottom-anchored `position:fixed` box stops repeating after the first `page.pdf()` on the same
   page.** The attributed running footer disappears from print #2 onward on `solargaincalculator`,
   `moodydiagram`, `heat_exchangers` and `mollier`, survives on `decayheat` and `regelkring`, and
   the top-anchored running header always survives. A freshly injected fixed box behaves the same
   way, so it is not the framework's element that is at fault. **Unresolved on purpose:** this
   environment is headless and `page.pdf()` is CDP `Page.printToPDF`, not the browser's print path,
   so nobody here can say whether a real File → Print does it too. `print-contrast2.mjs` loads a
   fresh page per print rather than tolerate it. **Anyone re-measuring §21 by printing one page
   twice will read a footer as missing when it is not.**
2. **What a tabbed tool prints is still undefined.** `generatorgrid` prints its open tab only, as
   `regelkring` does. Three shipped tools use `.dgu-tabs`, and this pass did not invent an answer.
3. **`generatorgrid` still has zero `h1`** and still fails `check.js` at all four viewports, exactly
   as before this pass. Its printed running header is right anyway, because `printFill()` falls back
   to the manifest title — which is the framework covering for a tool defect, not the defect being
   fixed.
4. **Nothing here is wired into a gate.** `print-contrast2.mjs` joins the four probes of §21.6 in
   being a thing someone has to remember to run.

---

## 22. The reader controls the panel **[v3.6.1]**

v3.6 put four layout primitives in the framework and left every one of them opt-in. This section is
what happened when the tree was measured to see who had opted in.

| primitive | tools that had adopted it, of 59 |
|---|---|
| `scroll:` — an independently scrolling column | 2 |
| `resize:` — a drag handle | **0** |
| `.dgu-fields` as a grid | not in the runtime at all |

Three drag handles existed across 59 pages, all three on tools that build their own. The report
that opened this release — *"the window handles have disappeared … the left panel is very long and
the results are not visible on screen"* — was therefore accurate about the symptom and wrong only
about the cause: nothing had disappeared, because nothing had ever been there.

**22.1 An archetype adopts its own layout.** The archetype already knows which of its tracks are
side rails and which is the stage; it declares its own panes and handles rather than waiting for 59
tools to opt in one at a time.

| archetype | paned from | handles |
|---|---|---|
| `calculator` | `inputs` md, `results` lg | `inputs` 260–620, `results` 260–560 |
| `studio` | `inputs` md, `detail` lg | `inputs` 220–620, `detail` 240–560 |
| `wizard` | `nav` md, `results` lg | `nav` 200–520, `results` 260–560 |
| `reference` | `nav` md | `nav` 220–560 |

`panes:false` and `handles:false` opt a tool out. A tool's own `scroll:` is merged **per region**,
not treated as a blanket opt-out — see 22.4 for what the blanket form cost.

**22.2 No handle without a pane.** The handle is placed in the region's wrapper and spans it. The
pane's `max-height` is the only thing that bounds that wrapper, so a handle on an unpaned region can
be taller than any screen. The framework declines to create one.

**22.3 A pane is earned, not declared.** `applyPanes()` measures each declared region against the
cap the CSS would impose and hangs `data-dgu-pane` only where the content really overflows, with
4 px of hysteresis. Stickiness is separate and unconditional: a short column that rides the top of
the screen costs nothing, while the cap, the scrollbar gutter and the `--dgu-safe-bottom`
reservation cost 15 px of width and up to 95 px of height — and because `results` is a full-width
row *beneath* the columns in `studio` and `reference`, that dead height pushes the first number
down. Rule: **a region may not reserve room for a scrollbar it does not have.**

**22.4 The pane sticks by its wrapper, not by the region.** The wrapper is the grid item (§17.9)
and was `align-self:stretch`, so where a rail spans rows — `reference` is `"nav stage" "nav
results"` — the item is as tall as both rows while the region inside is capped at one screen.
normenwijzer's handle measured **11 × 140 611 px** and fwgate took the framework RED for a control
no pointer can reach. Sticking the wrapper and letting it shrink to its content makes the handle
exactly as tall as the column it drags. This is a correction to §17.9, not a contradiction of it:
the wrapper is still the grid item and the handle still sits in the gutter outside the region's
scroll box.

**22.5 The scrollbar is charged to the track.** `scrollbar-gutter:stable` reserves the scrollbar
*inside* the column, so a 250 px studio rail handed its fields 216 px before the pane release and
201 px after. `--dgu-sb-a` / `--dgu-sb-z` add the measured gutter to the side track, on the side
that got a pane, capped so the flexible track never drops below `SPLIT_MIN_FLEX`. Two rules fall out
of getting this wrong twice:

- **Measure the gutter with the pane's own declarations.** A plain `overflow:scroll` probe reports
  an overlay scrollbar's 0 on platforms where `scrollbar-gutter:stable` reserves 15.
- **The stage is track 1, not the widest track.** On moodydiagram at 1120 the rails are 355 and
  375 px against a 310 px stage; picking the largest track finds a rail.

**22.6 The field stack is container-relative.** `.dgu-fields` is
`repeat(auto-fill, minmax(min(100%, var(--dgu-col,240px)), 1fr))`; only `.dgu-field` takes a track
and every other child spans. The `min(…,100%)` clamp is load-bearing and was measured before it was
written: a plain `minmax(240px,1fr)` injects horizontal overflow into 21 of 59 tools — every studio
tool, at exactly 240 − 216 = 24 px — while the clamped form leaves the same 11 tools that already
overflowed, with the same 597 px worst case, at 240, 260 and 280 px alike. This is the rule that
makes dragging a rail wider buy *columns of fields* rather than wider fields.

**22.7 A scroll container with no scrollbar and no fade is a defect.** `.dgu-strip` wraps. It was
`overflow-x:auto` with `scrollbar-width:none` and `::-webkit-scrollbar{display:none}`, hiding a
headline number on 33 of 472 measured cells, 3 400 px in total. `.dgu-tabs` is the same defect and
is still open (three C3 waivers in `fwgate`).

**22.8 Judge a control by what the reader can see of it.** `getBoundingClientRect()` reports a
control's full box even where a pane clips most of it. `DiagramUI.check` intersects a control with
every enclosing pane before asking whether it is buried under the shared chrome; without that it
reported debrisrunout's preset button — 58 px visible, ending 16 px above the reserved strip — as
unreachable on the strength of a phantom bottom edge 58 px lower.
