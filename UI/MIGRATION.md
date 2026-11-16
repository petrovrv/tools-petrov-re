# tools.petrov.re — migrating the tools onto `diagram-ui.js`

Companion to `UI_FRAMEWORK_SPEC.md`. This document is operational: what to change, in what
order, and how to prove it worked.

Files shipped with this change:

| File | What it is |
|---|---|
| `diagram-ui.js` | the shared UI runtime, ~2 500 lines, dependency-free |
| `ui-demo.html` | the reference implementation at level 3 — read it before refactoring anything |
| `UI_FRAMEWORK_SPEC.md` | the normative spec |
| `UI_AUDIT.md` | the evidence the spec is answering |

---

## 1. Level 0 — one line, all 51 tools

Insert one tag after the existing runtime pair:

```html
<script src="site-disclaimer.js" defer></script>
<script src="diagram-common.js"  defer></script>
<script src="diagram-ui.js"      defer></script>
```

That is the whole of level 0. The file is side-effect-safe: a page that never calls
`DiagramUI.app()` gets only the token layer, the theme resolution, the shared-chrome repair and
`DiagramUI.check()`.

The insertion is mechanical:

```bash
for f in *.html; do
  grep -q 'diagram-ui.js' "$f" && continue
  perl -0pi -e 's{(<script[^>]*src=["\x27]diagram-common\.js["\x27][^>]*>\s*</script>)}
                 {$1\n<script src="diagram-ui.js" defer></script>}s' "$f"
done
```

Applied to the mirror of the live site, this patched **51 of 51** tools with no manual cases.

### What level 0 measurably buys

Measured in headless Chromium over the full catalogue, with and without the file loaded
(`diagram-ui.js` request aborted for the control run), counting a tool's own interactive controls
that sit under the fixed shared chrome with the document scrolled to the bottom — that is, controls
the user cannot reach at all:

| Viewport | Without | With | Tools fully cleared |
|---|---|---|---|
| 390 px | 32 controls, 13 of 51 tools | **20 controls, 6 of 51 tools** | cablesizing, heat_exchangers, mollier, neutron_transport, normenwijzer, probabilisticrisk, procesklimaat |
| 1440 px | 57 controls, 19 of 51 tools | **43 controls, 13 of 51 tools** | cablesizing, heat2d, luchtgroepselector, neutron_transport, ontvochtiging, procesklimaat, verwarmenkoelenselector |

Zero new page errors across 102 loads. No tool lost its toolbar, its badge or its language.

Below 768 px the framework additionally takes the shared bar and badge **out of fixed positioning
and puts them in the document flow** at the end of the page, where they cannot overlap anything —
active on 43 of 51 tools. The eight it declines are the ones whose scroll container is
`overflow:hidden`; moving the chrome there would push it somewhere the user cannot scroll to, so
the framework leaves it alone and reports the overlap instead.

### What level 0 does not buy, and why

The six tools still occluded at 390 px — `outdoornoise`, `debrisrunout`, `roomacoustics`,
`heat2d`, `cfd`, `thermodynamiccycles` — are exactly the fixed app-shell tools from `UI_AUDIT.md`
S-5. A body padding cannot help a layout that does not scroll. They are fixed at level 2, by
adopting the shell.

Two tools measure *worse* on desktop after level 0: `klimaatcalculator` (2 → 4) and
`gesloten-atmosfeer` (0 → 2). Both have inner-scroll panels
(`max-height:calc(100vh - 28px); overflow:auto` and `max-height:calc(100vh - 58px)`), so document
padding cannot move their content and only changes which rows land in the band at maximum scroll.
Neither is a new defect; both are level-2 candidates. This is reported rather than smoothed over
because a migration that hides its own regressions is not measurable.

---

## 2. Level 1 — adopt the tokens

A CSS-only pass, per tool. Delete the tool's `:root` block and rewrite its rules against the
§2 tokens.

```css
/* before */
:root{--bg:#f7f8fa;--card:#fff;--txt:#1b2733;--sub:#5c6675;--brd:#e6e9ef;--acc:#2f6fe4}
.panel{background:var(--card);border:1px solid var(--brd);border-radius:12px;padding:14px}
h2{font-size:12.5px;letter-spacing:.07em;color:var(--sub)}

/* after */
.panel{background:var(--panel);border:1px solid var(--line);
       border-radius:var(--radius-md);padding:var(--sp-4)}
h2{font:650 var(--fs-section)/1.3 var(--font);letter-spacing:.08em;color:var(--muted)}
```

The deprecated spellings `--good`, `--acc`, `--accent2`, `--acc2`, `--border`, `--text-muted`,
`--surface-1` and `--r` are aliased for one release, so a half-migrated file still renders.

Two rules do the heavy lifting:

- **delete every `@media(prefers-color-scheme:dark)` block in the tool.** The token layer handles
  dark mode centrally; a tool that keeps its own will fight `data-theme`. Tools with a manual
  toggle delete the toggle too — the framework owns it.
- **collapse the breakpoints to 480 / 768 / 1120 / 1440.** The catalogue currently uses 32
  distinct values.

A quick census of what a tool still owns:

```bash
grep -o '#[0-9a-fA-F]\{3,8\}' tool.html | sort -u | wc -l      # colour literals: target 0
grep -o '@media[^{]*' tool.html | sort -u                       # breakpoints: target ⊆ {480,768,1120,1440}
grep -c 'prefers-color-scheme' tool.html                        # target 0
```

---

## 3. Level 2 — adopt the shell

This is where the site starts to look like one product, and where the remaining occlusion,
the unreachable mobile regions and the duplicated exports all go away at once.

```js
const ui = DiagramUI.app({
  id: 'mytool',
  mount: '#app',
  layout: 'calculator',        // or studio / wizard / reference
  compute: 'live',             // or run
  state, defaults: DEFAULTS,
  panels: [ /* section 6 fields */ ],
  on: { compute: s => ({ tiles: [...], tables: [...] }) }
});
ui.examples([...]);
ui.ready();
```

Checklist per tool:

1. **Delete the tool's own header.** Title, language switcher, theme button, home link and status
   chip are framework furniture now. Keep exactly one `h1` — the framework writes it from the
   manifest.
2. **Delete the tool's export buttons.** `Export PDF`, `Report (PDF)`, `⇩ PDF`, `Print calculation`,
   `Export CSV`, `Save JSON`, `Open report`, `Export Excel` — every one of these duplicates the
   shared bar. Where the tool has a genuinely richer report, register `report.render` with
   `Diagram.init` instead; the attribution stays with the runtime either way.
3. **Move content into slots**: `inputs`, `stage`, `results`, `detail`, `dock`, `footer`.
   Delete the tool's own grid, its column widths and its splitters.
4. **Delete `overflow:hidden` from `html`/`body`** and any `height:100vh` app frame. If a region
   genuinely needs its own scroll, the archetype gives it one.
5. **Move presets to `ui.examples()`** and reset to the `inputs` footer via `ui.resetAction()`.
6. **Move the primary action** (`run` tools) to the bottom of `inputs`; below 768 px the framework
   renders the sticky action bar itself.
7. **Keep `Diagram.init()` unconditional.** If the tool loads data, call `ui.fail(reason)` in the
   failure path — never skip `Diagram.init`. This is the single change that fixes `UI_AUDIT.md`
   S-2, and it is two lines:

```js
// before — the chrome dies with the data
fetch('mytool-data.json').then(r => r.json()).then(d => { boot(d); Diagram.init({...}); }).catch(fail);

// after — the chrome survives, the results say why they are missing
Diagram.init({ id:'mytool', file:'mytool.html', state:{...}, record:() => last ? {...} : null });
fetch('mytool-data.json').then(r => r.json())
  .then(d => { boot(d); ui.ready(); })
  .catch(e => ui.fail({ en:'The reference data file could not be loaded.', nl:'…' }));
```

### Recommended order

1. **The four that are unusable on a phone**: `heat2d`, `moleculeconstructor`,
   `thermodynamiccycles`, `roomacoustics` — each currently renders a zero-width or unreachable
   working area at 390 px.
2. **The rest of the app-shell group**: `cfd`, `debrisrunout`, `outdoornoise`,
   `probabilisticrisk`. These are also the four already on `diagram-scene3d.js`, so they map onto
   the `studio` archetype almost directly.
3. **The six that overflow horizontally**: `electricalnetwork`, `cablesizing`, `steam_tables`,
   `decayheat`, `klimaatcalculator`, plus `cfd` from group 2.
4. **The two wizards**: `luchtgroepselector`, `verwarmenkoelenselector` — the `wizard` archetype
   exists for them, and it ends the bare-digit step strip.
5. Everything else, by traffic.

---

## 4. Level 3 — components

Fields, results, states, learn topics, stage sizing, units and shortcuts, as in `ui-demo.html`.
Read that file top to bottom before starting; it is deliberately small and covers every mechanism:

- a `calculator` shell with live compute and a debounced recompute;
- number and range fields with SI storage and a display unit (`unit:'Pa'` shown as kPa, `unit:'m'`
  shown as mm), including the clamp-and-announce behaviour;
- `examples` with per-entry descriptions, and `Reset` in the inputs footer;
- results as tiles, a verdict and a table, with `pending` / `computing` / `ready` states and the
  mobile result strip;
- five learn topics wired to fields, tiles and the stage, plus a four-step tour whose card places
  itself clear of both its target and the shared chrome;
- a canvas stage sized from a `ResizeObserver`, drawn at device pixel ratio, with tick density
  from `DiagramUI.ticks()` and a coarse mode below 768 px;
- `Diagram.init` with `state`, `record` and `handoff` — the data layer, unchanged.

Verified in headless Chromium at both viewports: `DiagramUI.check()` returns `{ok:true}`,
zero console errors, no horizontal overflow, one `h1`, language switching re-renders every string
including the derived ones, dark and light both render, and the tour's `Back` is disabled on step 1.

---

## 5. Verification

`DiagramUI.check()` runs the mechanical half of the spec's §16 gates from the console or from a
headless harness, and returns `{ok, problems[]}`:

- exactly one `h1`;
- no horizontal overflow;
- `#dgc-bar` present and non-empty — this is the S-2 regression check;
- no control unreachable under the shared chrome, evaluated at the bottom of the document;
- no focusable control without an accessible name.

Add to the existing headless harness, per tool, per viewport:

```js
await page.goto(url);
await page.waitForFunction('window.__diagramReady === true');
const r = await page.evaluate(() => DiagramUI.check());
expect(r.ok).toBe(true);
```

And one test that does not exist today and should:

```js
// the chrome must survive a data failure
await context.route('**/mytool-data.json', r => r.abort());
await page.goto(url);
await page.waitForSelector('#dgc-bar > *');     // fails today on five tools
```

`validation.html` gains a `ui.level` column so the register shows how far the migration has run;
the level is declared in the manifest:

```json
"ui": { "framework": "tools.petrov.re/ui/v1", "level": 2 }
```

---

## 6. Changes still owed by the v2 runtime

Three, from `UI_FRAMEWORK_SPEC.md` §14. Until they land, `diagram-ui.js` carries compatibility
shims that should be deleted afterwards (`CHROME_COMPAT`, `CHROME_FLOW_CSS`, `ensureL0Dock`).

1. `buildBar()` renders from the manifest on DOM-ready; `Diagram.init()` upgrades it.
2. `window.__diagramReady` is not set when the chrome never rendered.
3. `#dgc-bar`, `#dgc-menu`, `#dgc-notes` and `#eng-disc-badge` style themselves from
   `[data-theme]` as well as `prefers-color-scheme`.

Two unrelated defects found during the audit and worth the same deploy: `flowstep.html` does not
load `diagram-common.js` at all, and `protectioncoordination.html` is excluded from the catalogue
by a missing `benchmarks/protectioncoordination.json`.
