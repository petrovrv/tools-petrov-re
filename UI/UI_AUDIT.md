# tools.petrov.re — UI audit

Revision: 2026-08-15. Scope: the 51 tools listed by `catalog.php`, plus the shared runtimes
`diagram-common.js`, `site-disclaimer.js`, `diagram-scene3d.js` and the site pages `index.html`,
`validation.html`, `benchmark.html`.

This document is evidence, not opinion. It is the input to `UI_FRAMEWORK_SPEC.md`; every rule in
that spec should trace back to a finding here.

---

## 0. Method

| Pass | What was done |
|---|---|
| Mirror | The deployed site was mirrored locally (51 tools + framework files + declared dependencies, ~35 MB) and served from `php -S`, so `catalog.php` behaves as in production. |
| Static | Every tool's HTML was parsed for CSS custom properties, media queries, font stacks, colour literals, control counts, event bindings, i18n tables, print CSS and ARIA usage. |
| Runtime | Every tool was loaded in headless Chromium at **1440×900** and **390×844**, with console and `pageerror` capture, readiness timing, layout-overflow measurement, landmark geometry, accessible-name and tap-target checks, plus a screenshot at each size. Each tool was additionally re-loaded at `?lang=nl` and `?lang=uk` and its rendered text compared. |
| Visual | All 102 screenshots were reviewed against the source, tool by tool. |

Counts quoted below are measured, not estimated.

---

## 1. What is already right

Stating this first, because the defects that follow are defects of *uniformity*, not of engineering quality.

- **No JavaScript errors.** Across 51 tools, with all declared dependencies present, the only console
  error on the whole site is `cfd.html`'s `WebGPU adapter is unavailable` in a software-rendered
  headless browser. Zero `pageerror`s. Zero unhandled rejections.
- **Readiness is fast and universal.** All 51 tools set `window.__diagramReady` in under 2 s
  (median well under 1 s). The `Diagram.ready()` gate contract from framework v2 is honoured.
- **Localisation works.** 49 of 51 tools render genuinely different text for `?lang=nl` and
  `?lang=uk`, with Cyrillic present in the Ukrainian rendering. Only `kernnormenwijzer.html`
  (English-only by design) and `RWA_calculator.html` (no `uk`) do not.
- **No desktop horizontal overflow.** At 1440 px, zero tools overflow the viewport.
- **Accessible names are mostly present**: 70 unnamed focusable controls out of 5 392 site-wide.
  No tool uses a positive `tabindex`. No `<img>` is missing `alt`.
- **`index.html` and `benchmark.html` already contain a coherent design system** — a full token set
  with a pure-token dark-mode override. It is the obvious baseline; it simply was never adopted by
  the tools.
- **`diagram-scene3d.js` is already a framework** in the architectural sense: host resolution,
  idempotent namespaced style injection, declarative toolbar with derived state, a full
  declarative form schema with a `mixed` sentinel for multi-select, `changed(reason)` → `refresh()`
  fan-out, explicit `destroy()`, and layout persisted through CSS custom properties. Generalising
  *this* is the right move; it does not need to be invented.

---

## 2. Systemic defects

These are framework-level. Each one is present in the majority of tools, and no tool can fix it
alone.

### S-1 — The shared chrome overlaps tool content on every page. **Critical.**

`diagram-common.js` docks `#dgc-bar` at `position:fixed; left:14px; bottom:14px; z-index:2147482900`
and `site-disclaimer.js` docks `#eng-disc-badge` at `right:14px; bottom:14px; z-index:2147483000`.
**Neither reserves space in the document.** The source comment in `diagram-common.js` guarantees
only that the bar and the badge do not overlap *each other*.

Measured: the bar is 560 × 67 px on desktop (two wrapped rows) and grows to three or four rows at
390 px. Of 51 tools, exactly **two** compensate — `heat_exchangers.html`
(`body{padding-bottom:calc(58px + env(safe-area-inset-bottom))}`) and `regelkring.html`
(`body{padding-bottom:76px}`, 104 px under 560 px) — and both only fix the end-of-document case,
not mid-scroll overlap.

This is not cosmetic. Confirmed casualties include **live, interactive controls**:

| Tool | What the chrome covers |
|---|---|
| `gasdynamics.html` | `Transition Re` input (label and value) |
| `thermodynamiccycles.html` | the three ISOLINES checkboxes — unclickable |
| `roomacoustics.html` | Floor / Ceiling material `<select>`s |
| `operatingpoint.html` | `Send state → Moody` / `Send state → Water Hammer` buttons + Roughness slider |
| `solargaincalculator.html` | Tilt and Azimuth sliders |
| `relativity.html` | "Start route" button |
| `stress_transformation.html` | Plane-finder `Find` button |
| `wallthermalcalculator.html` | `Snap to 10 mm` checkbox; the `U` result row |
| `waterhammer.html` | Vapour-pressure and atmospheric-pressure inputs |
| `ventilation.html` | HEAT SOURCES heading and its Power/Height inputs |
| `procesklimaat.html` (390 px) | `Selected industry` — the control the page's own step 1 tells you to use first |
| `outdoornoise.html` | the tour card's **Next/Prev buttons** — the first-run onboarding cannot be advanced |
| `iron_carbon_diagram.html` | `#expMsg`, the page's only `role="status"` element |
| `doppler.html`, `spectrum.html`, `xenon.html`, `kinetics.html` | the entire KPI readout strip — the tool's answer |

### S-2 — The shared chrome disappears when a tool's data load fails. **Critical.**

`buildBar()` is reachable only from `Diagram.init()`, and 5 tools call `Diagram.init()` from inside
the success branch of their own asynchronous data load:

- `thermodynamiccycles.html` — gated on the 6.5 MB CoolProp WASM (`cpready`)
- `normenwijzer.html` — inside `fetch("normenwijzer-data.json").then(...)`, `.catch(fail)` returns
- `regelkring.html` — after `regelkring-data.json` resolves
- `luchtgroepselector.html` — inside `LANGDATA.ensureThen(lang, …)`, which calls back **only on
  success**; Dutch is inlined, so a lang-file failure costs the toolbar for the other five
  languages only
- `nuclideatlas.html` — aborts the whole IIFE with `document.body.innerHTML = '…missing'` before
  `dgcInit` is defined, which would also erase an already-built bar

Reproduced empirically. With those dependencies absent, 6 tools rendered **no toolbar at all**;
with the same files restored, all 6 render it. In every failing case
**`window.__diagramReady === true`** — so the readiness signal reports success on a page that lost
its entire shared chrome, and no automated check can currently detect the regression.

### S-3 — There is no design system, so there are 51 of them.

Measured across the 51 tools:

| Dimension | Distinct values | Notes |
|---|---|---|
| CSS custom property names | **269** | only 4 (`--bg`, `--line`, `--panel`, `--muted`) appear in ≥40 tools; **156 appear in exactly one tool** |
| body `font-family` | **18** stacks | |
| body `font-size` | 4 (13/14/15/16 px) | 21 tools at 14 px, 15 at 16 px |
| body background colour | **27** | |
| body text colour | **29** | |
| `<h1>` font-size | **17** values, 15 px – 28 px | and **12 tools have no `<h1>` at all** |
| responsive breakpoints | **32 distinct px values** (390…1500) | **7 tools have no `@media` rule whatsoever** |

Synonym drift is the visible symptom: `--ok` (27 files) vs `--good` (51); `--accent` vs `--acc` vs
`--accent2` vs `--acc2`; `--line` vs `--border`; `--muted` vs `--text-muted`; `--panel` vs
`--surface-1`; `--r` vs `--radius`.

### S-4 — Theming is per-tool and the shared chrome cannot follow it.

Four incompatible strategies coexist:

- **Hard-coded dark, no `prefers-color-scheme`** — `mollier`, `operatingpoint`, `periodictable`,
  `probabilisticrisk`, `relativity`, `roomacoustics`, `steam_tables`, `thermodynamiccycles`,
  `ventilation`, `solargaincalculator`, `heat2d`, `gasdynamics`, `heat_exchangers`, `cfd`,
  `debrisrunout`, `outdoornoise` (light), …
- **Auto via `prefers-color-scheme`** — 24 tools
- **Manual `data-theme` toggle with localStorage** — 15 tools, with five different button ids and
  five different labels (`Theme`, `◐`, `‹ Dark`, a sun glyph, a contrast icon)
- **Neither** — 27 tools are not dark-aware at all

`#dgc-bar` styles itself from `@media(prefers-color-scheme:dark)` alone. A tool that is dark by its
own CSS on a light-mode OS therefore gets **white pills glued onto a near-black page** — visible in
every dark screenshot in this audit. `stress_transformation.html` additionally ships a dark header
on a light body.

### S-5 — Mobile is not a supported viewport for a third of the catalogue.

Six tools overflow horizontally at 390 px (`electricalnetwork` +405 px, `cablesizing` +342,
`steam_tables` +334, `cfd` +224, `decayheat` +69, `klimaatcalculator` +35). Two distinct root
causes recur: a `table{min-width:690–720px}` inside a non-flex `.scroll` wrapper with no
`min-width:0` on the grid item, and an inner `grid-template-columns:1fr 1fr` with no breakpoint of
its own.

Worse than overflow is **unreachability**. Tools that combine a fixed multi-column grid with
`html,body{overflow:hidden}` do not merely push content off-screen — the user cannot scroll to it:

| Tool | What is unreachable at 390 px |
|---|---|
| `heat2d.html` | centre pane collapses to 0 px; canvas, timeline and the primary `▶ Compute` are gone. Zero media queries. |
| `moleculeconstructor.html` | 438 px of fixed rails on a 390 px viewport; **the drawing canvas has zero width**. Zero media queries. |
| `thermodynamiccycles.html` | chart column ~38 px wide; KPI tiles and exports off-screen. Zero media queries. |
| `roomacoustics.html` | minimum layout ~997 px; the whole results column. |
| `debrisrunout.html` | PROPERTIES panel + 3 of 4 bottom panels; one results panel is `display:none`. |
| `outdoornoise.html` | INSPECTOR, RESULTS and the primary `Calculate map`. |
| `cfd.html` | PROPERTIES panel. Zero media queries. |
| `probabilisticrisk.html` | `.left{display:none}` **and** `.kpi{display:none}` — the model column and the headline probability are deliberately hidden with no replacement. |

Tap targets: **every one of the 51 tools** has focusable controls under 32 px on the 390 px
viewport; the worst are `kernnormenwijzer` (563 of 992), `procesklimaat` (351 of 1 251),
`luchtbalans` (229 of 236).

### S-6 — Every tool ships its own duplicate of the shared exports.

The shared bar always offers `Copy link · PDF report · JSON record · CSV · Python · Send to…`.
On top of that, tools add their own, with different labels for the identical artefact:

`Export PDF` (RWA) · `Report (PDF)` (klimaatcalculator) · `Report / PDF` **and** a `Report` nav item
(luchtgroepselector, verwarmenkoelenselector) · `⇩ PDF` (heat_exchangers) · `Print calculation`
(cablesizing) · `Open report` (solargain) · `Export Excel / Diagram (PNG) / PDF`
(thermodynamiccycles) · `Save case / Load case / Export CSV` (waterhammer) · `Save JSON / Load JSON /
Export CSV` (hydraulicnetwork, ductnetwork) · `Project JSON / Load` (roomacoustics) ·
`Save project / Open project / Print/PDF` (wallthermal) · `Data (CSV)` whose button id is
`btnXlsx` and which downloads a `.csv` (fourier_series).

`verwarmenkoelenselector.html` offers **three** distinct routes to the same PDF on one screen.
`operatingpoint.html` ships its own `Send state → Moody` next to the framework's `Send to…`.

### S-7 — Five language switchers, two spellings of one language, one missing.

Idioms: a pill row `class="langs"`; a pill row `class="langbar"` with codes; the same with full
names; a bare `<select>`; a `<select>` with a visible "Language" label; a compact `EN ⌄`. Ids in
use: `#lang`, `#langSel`, `#langsel`, `#lang-sel`, `#langbar`, `#langs`, `#langsel`+`#langLabel`.
Position: top-right, top-left, second row, or inside a run bar.

`uk` is displayed as **`UA`** in `spectrum`, `xenon`, `kinetics`, `mollier`, `nuclideatlas` and
`index.html`, and as **`UK`** in `cablesizing`, `klimaatcalculator`, `reactorstand`, `regelkring`.
`periodictable.html` labels its switcher `Язык / Lang` — hard-coded Russian in an English UI — and
offers a 7th language (`ru`) that the site does not have. `ductnetwork.html` and
`kernnormenwijzer.html` have **no** language control while their manifests list six catalog
languages. `reactionbuilder.html` ships a complete `ru:` string table that no `<option>` exposes.

### S-8 — Units are labelled four different ways, and sometimes not at all.

1. Appended to the label after a comma — `Heavy-metal mass, kg`, `Boiler pressure, MPa`
2. In parentheses — `Length L (m)`
3. A separate `.unit` element beside the field — `cablesizing`, `electricalnetwork`, `ductnetwork`
4. A per-field unit `<select>` — `steam_tables`, `stress_transformation`

`steam_tables` and `stress_transformation` ship **both** a per-field unit select and a separate
global unit control, so one setting exists twice on one screen. `neutron_transport`'s `Temperature`
and `Pressure`, `cfd`'s 16 numeric inputs, `nuclideatlas`'s `Depth`/`Branch cutoff` and
`probabilisticrisk`'s `max order`/`product cutoff` carry **no unit anywhere**. Only
`heat_exchangers` and `mollier` offer a unit-system switch, and they implement it independently.

### S-9 — There is no shared notion of "not computed yet", and no shared error surface.

`Diagram.notify()` is the runtime's only messaging primitive, and it is used by 9 tools. Everything
else is hand-built: `showErr/hideErr`, `fail()`, `overlay(text,isError,detail)`, `#boot`,
`#nw-boot`, `#overlay`. Consequences seen on screen:

- `luchtgroepselector` shows a fully populated zero state before any input, including the
  physically absurd `Estimated dimensions 0.16 × 0.16 × 5.8 m ≈ 560 kg`.
- `verwarmenkoelenselector` mixes placeholder `0.0 kW` with real computed values (`COP 2.52`) in
  the same rail, with no visual distinction — **and prints Dutch strings into the English UI**
  (`seizoen ≈ 3.80`, `0.0 kW beschikbaar`, `expansie 0 l`, `bijstook`).
- `steam_tables` renders three fully enabled export buttons under an empty results table.
- `debrisrunout` shows every result tile as `—` with no statement of what to press.
- `solargaincalculator` shows `Computing…` beside already-final KPI tiles carrying a *different*
  GHI value (1 174 vs 1 171 kWh/m²).
- `iron_carbon_diagram` silently no-ops on invalid input (`if(isNaN(c)||c<0||c>CEM) return;`).
- `beam_diagrams` clamps a load position to the beam length but prints the unclamped value in the
  load list — the diagram and the list disagree with no message.

### S-10 — "Explain before you touch" ranges from a tour to nothing.

Only ~10 of 51 tools contain any onboarding/tutorial/tour token. Where onboarding exists it is
implemented five different ways: an 8-step tour card (`outdoornoise`), an auto-opening first-run
coach popover that **blocks the UI it describes and whose Back button is enabled on step 1**
(`relativity`), a `Learn` button (`roofstormwater`), a `Guide` button (`cfd`, `debrisrunout`), a
`How to play` (`moleculeconstructor`), dedicated `How to`/`Manual` tabs plus per-field `?` buttons
and a 175 KB help JSON (`regelkring`), or 430 px of prose before the first control (`reactorstand`).
`thermodynamiccycles`, `roomacoustics` and `steam_tables` never state what the tool is for.

### S-11 — Reset, presets and undo are arbitrary.

Presets exist in 27 tools, reset in 19, undo in 9. Where reset exists it is called `Reset`,
`Clear`, `Clear all`, `Reset motion`, `Reset example`, `Reload preset values`, `Reset to
equilibrium`, `Clear all ticks` or `Restore`, and it sits under the inputs, at the bottom of the
*results* column, in a left-rail card, in the top bar, or three times on one page with three
different scopes (`normenwijzer`: `scen_restore`, `task_clear`, `f_reset`).

Nine tools are direct-manipulation editors (drag a wall, delete a node, move a shape) **with no
undo at all**: `heat2d`, `hydraulicnetwork`, `ductnetwork`, `luchtbalans`, `gasdynamics`,
`moleculeconstructor`, `wallthermalcalculator`, `ventilation`, `nuclideatlas`.

### S-12 — Nothing tells the user whether a result is live or stale.

Live recompute, an explicit run button, Enter-only commit and no commit at all all coexist:

- live: `spectrum`, `xenon`, `kinetics`, `stress_transformation`, `thermodynamiccycles`,
  `ventilation`, `wallthermal`, `solargain`, `fourier_series`, `gasdynamics`, `ontvochtiging`, …
- explicit: `steam_tables` (`Compute properties`), `waterhammer` (`Run transient`), `heat2d`
  (`▶ Compute`), `heat_exchangers` (`⚙ Calculate`), `roofstormwater` (`Run storm`),
  `hydraulicnetwork`/`ductnetwork` (`Solve network`), `outdoornoise` (`Calculate map`)
- Enter-key or an unlabelled `↵` glyph button only: `iron_carbon_diagram` — typing a value and
  clicking away silently does nothing
- `hydraulicnetwork` auto-solves on load, so its only primary button starts in an
  already-done state, and nothing marks the result stale after an edit

Only `roomacoustics` states its mode on screen (`● Live calculation`). Only `waterhammer` explains
it in copy ("Presets change inputs only. Press Run transient to solve.").

### S-13 — Chart and canvas sizing is unmanaged on small screens.

Charts are raster-scaled rather than re-laid-out. `spectrum` and `xenon` compute `H = cssW*0.52`
with fixed-px label fonts: at 390 px the plot is ~185 px tall and annotations, ticks and legend
collapse into each other. `doppler`'s axis labels render at ~4 px. `luchtbalans`'s SVG node text
renders at ~4 px. `iron_carbon_diagram` scales a 920×640 canvas to 39 %. `hydraulicnetwork` and
`ductnetwork` keep a 520–620 px-tall box while drawing the graph at ~37 % scale in one corner, with
no fit-to-view. `nuclideatlas` fits its N–Z chart by `Math.min` of both axes into a pane whose
height changed after layout, leaving ~85 % of the canvas empty. No tool drops annotations, reduces
tick density or enforces a minimum plot height.

### S-14 — Two contradictory status claims on screen at once.

Bottom-left, `#dgc-bar` shows a green `Benchmark tested · N/N` chip. Bottom-right,
`#eng-disc-badge` shows an amber `Prototype · Not independently validated`. On 49 of 51 tools both
are visible simultaneously, ~1 000 px apart, saying different things about the same tool.
`neutron_transport` shows **three** status indicators. On `nuclideatlas` the same bottom-left slot
is amber (`Prototype · 77/77`), so one visual slot means different things on different tools.

### S-15 — Accessibility gaps that a component library would close by construction.

`:focus-visible` is styled in 14 of 51 tools. `<dialog>` is used by **none** — every modal is a
hand-built div. `aria-live` appears in 8 tools. Two tools have a skip link. 70 focusable controls
have no accessible name, concentrated in `roofstormwater` (25), `cfd` (14), `outdoornoise` (11),
`normenwijzer` (5), `roomacoustics` (5). Unlabelled single-glyph buttons are a recurring idiom:
`decayheat`'s `<button id="panel-toggle" title="">‹</button>` (empty `title`, ~14 px hit area),
`iron_carbon_diagram`'s `↵`, the `◐` theme glyphs. `site-disclaimer.js`'s modal writes
`document.body.style.overflow` unconditionally on open and clears it to `''` on close, which will
clobber any scroll-lock a new layer sets.

### S-16 — Screen skeletons differ for identical jobs.

Across 51 tools the same "inputs → model → results" job is laid out as: left inputs / right results
(most), left inputs / centre canvas / right inspector (10 tools), a 15-step wizard with a live
result rail (`luchtgroepselector`, `verwarmenkoelenselector`), a centred single column with results
*below* the chart and below the fold (`doppler`, `spectrum`, `xenon`, `kinetics`), a tab-per-phase
app (`heat_exchangers`, whose `Calculate` silently jumps to another tab so inputs and results are
never visible together), and results *above* their own inputs (`stress_transformation`,
`waterhammer` on mobile).

Two tools make the **site name** their `<h1>` and demote the tool to a subtitle
(`hydraulicnetwork`, `waterhammer`, `ductnetwork`). `decayheat` ships a literal `…` as its `<h1>`
until JS fills it. `cablesizing`'s only `<h1>` lives inside a print-report template string.

On mobile, five tools stack the entire input column above the visualisation so the tool's own
answer is 700–1 000 px off-screen, and no tool provides a sticky result summary.

---

## 3. Divergence inventory

| Feature | Tools that have it (of 51) |
|---|---|
| localisation table | 41 |
| language switcher | 44 (5 idioms, 2 spellings of `uk`, 2 tools missing) |
| `prefers-color-scheme` | 24 |
| `data-theme` | 15 |
| explicit theme toggle | ~15, five different labels |
| presets / examples | 27 |
| reset | 19 |
| keyboard handling | 24 |
| tabs | 16 (exactly **one** uses `role="tab"`) |
| `:focus-visible` | 14 |
| print CSS | 13 |
| any onboarding/tutorial token | ~10 |
| undo | 9 |
| toast/notice of its own | 5 |
| `<dialog>` | 0 |
| unit-system toggle | 2 (independently implemented) |

---

## 4. Priorities

**P0 — cannot ship a framework without fixing.**

1. S-1 chrome overlap. A single `body{padding-bottom:var(--dgc-bar-h)}` published by the runtime,
   measured from the real bar height, fixes 51 tools at once.
2. S-2 chrome loss on data-load failure. Chrome must render from the manifest on DOM-ready and be
   *upgraded* by `Diagram.init()`, never gated on it. `__diagramReady` must not report true when
   the chrome never rendered.
3. S-5 unreachable content at 390 px (8 tools) and horizontal overflow (6 tools).

**P1 — the unification the framework exists to deliver.**

4. S-3 one token set, one type scale, one spacing ramp, one breakpoint ladder.
5. S-4 one theme model that the shared chrome participates in.
6. S-16 one app shell with fixed slots, so the same job looks the same everywhere.
7. S-6 one export surface: the shared bar owns it; tool-local duplicates are removed.
8. S-8 one unit convention; S-7 one language control.

**P2 — the affordances that make the tools teachable.**

9. S-10 one learn/tutorial mechanism, available in every tool.
10. S-9 shared empty / pending / stale / error states, and S-12 an explicit live-vs-run contract.
11. S-11 reset, presets and undo in fixed places with fixed names.
12. S-13 responsive chart rules; S-15 focus, dialog and live-region defaults.
13. S-14 one status statement per page.

---

## 5. Evidence artefacts

- `runtime.json` — per-tool, per-viewport runtime measurements (errors, readiness, overflow,
  landmark geometry, a11y counts, language comparison).
- `inv.json` — per-tool static feature matrix.
- `shots/` — 102 screenshots (51 tools × 2 viewports).
