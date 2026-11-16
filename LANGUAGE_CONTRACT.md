# tools.petrov.re — language contract

Revision: 2026-09-01 / v3.7.0. **Normative for agents and tool authors.**

**Read this before touching localisation.** This section supersedes every historical reference later
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


## Adding a language

There are two different operations:

1. **Add a language to one tool only**: the code must already be in the global site registry. Add it
   to that tool's `catalog_languages` and/or `tool_languages` as appropriate, populate every field
   promised by the declaration, and test both direct load and switching.
2. **Add a new site language**: update the global registry and every shared framework/site dictionary
   (`diagram-ui.js`, `diagram-common.js`, `index.html`, `site-disclaimer.js` and any other shared
   shell surface), then add regression tests. Do **not** bulk-edit every tool. Existing tool
   manifests remain valid subsets and may continue to fall back to English domain content.

## Agent checklist

Before modifying a tool:

- Read its manifest; record `catalog_languages` and `tool_languages` separately.
- Read the global registry from the framework; do not copy a stale language array from another tool.
- Preserve `siteLang` in navigation/query state even when domain content falls back.
- Use `domainLang` for tool dictionaries and `siteLang` for framework/shared-shell dictionaries.
- Never make `<html lang>` follow the fallback domain language; it follows the selected site language.
- Test one supported domain language, one unsupported-site-language fallback, switching both ways,
  and an unknown language code falling back safely.
- When adding a new global site language, verify that old tools with smaller `tool_languages` still
  load without edits.

## Current known inventory at v3.7.0

Global shared site/framework support: **7 languages** — `en`, `uk`, `de`, `nl`, `fr`, `es`, `pl`.

Canaries shipped with v3.7.0:

- `xenon.html`: catalogue 7 / domain 7, including Polish calculation UI and Learn content.
- `cfd.html`: catalogue 7 / domain 6 (`en uk de nl fr es`); `pl` exercises Polish shell + English
  domain fallback.
- `kernnormenwijzer.html`: catalogue 7 / domain English only; `pl` exercises Polish shell + English
  domain fallback. The dataset nevertheless contains Polish jurisdiction material (`PLN01…PLN15`)
  and scenario `C15`.

For every other tool, the manifest is the source of truth. A future agent must not write “the site
has seven languages, therefore this tool has seven domain translations.”
