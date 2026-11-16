# tools.petrov.re

Source of [tools.petrov.re](https://tools.petrov.re) — free browser-based engineering calculators
(HVAC, plumbing, nuclear, oil & gas & hydrogen, CCUS, optics, acoustics, tendering and more).
Every tool is a self-contained HTML page that computes in the browser; nothing is sent to a server.

This repository mirrors what is deployed on the live site. Each release is a commit with a tag.

- `*.html` — tools (manifest in `<head>`, see `FRAMEWORK_V2_SPEC.md`)
- `diagram-*.js`, `*-core.js` — shared framework and domain engines
- `benchmarks/` — benchmark artifacts behind the "benchmarked" status of tools; `bench-src/` — drivers and independent reference implementations
- `c/`, `stage/` — category and project-stage pages; `catalog.php`, `build-static.php` — catalog and static index builder
- `AGENTS.md`, `AUTHORING.md` — authoring rules

Numbers taken from standards (EN, ISO, NBN, …) are cited in each tool; the standards themselves are not included.
Results are for preliminary engineering only — see [disclaimer](https://tools.petrov.re/disclaimer.html).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, study, modify and share for any noncommercial purpose
(personal, research, education, nonprofit). Commercial use needs a separate licence — contact Roman Petrov via
[petrov.re](https://petrov.re).

Third-party libraries bundled in some pages keep their own licences.
