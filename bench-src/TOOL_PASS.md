# Standard tool pass — benchmark, fix, integrate, promote

Read `/root/bench/HARNESS.md` (how to drive pages, result schema, tolerance honesty) and
`/root/site/FRAMEWORK_V2_SPEC.md` (normative framework spec) before starting.
Use `/root/site/steam_tables.html` as the reference integration — it shows every part of the API wired
correctly. `/root/site/diagram-common.js` is the shared runtime; **do not modify it**. If it is missing
something, say so in your report.

Do the whole pass for each tool assigned to you, one tool at a time, finishing each before starting the
next.

## Step 1 — Benchmark (measure before touching anything)

Build an independent reference. "Independent" means: not derived from the tool's own code. Acceptable
sources are a published standard's verification table (cite standard + table number), a closed form you
derive and implement yourself in python, or an established library (`CoolProp`, `iapws`, `scipy`,
`numpy`, `sympy`, `python-control` — install what you need with `pip install --break-system-packages`).
Where two independent references exist, compute both and record their mutual deviation as `crosscheck`;
never grade the tool wrong where the references disagree by more than the tolerance — flag instead.

Choose tolerances from the physics and from the tool's own printed precision, never from what makes the
tool pass. Benchmark the mathematics the tool claims to implement. Do **not** benchmark an empirical
correlation against "truth" — instead check it is implemented faithfully, applied inside its stated
validity range, and that its scatter is disclosed.

Write `/root/bench/ref/<tool>_ref.json`, `/root/bench/run_<tool>.mjs`, `/root/bench/results/<tool>.json`.

**Non-numeric tools** (standards navigators, selectors, reference tables, data browsers) get a different
but equally real benchmark: schema validity of every record, no dangling cross-references, counts and
totals that agree with the underlying data, correct behaviour of every filter/facet against a
recomputed expected set, and spot-checks of factual entries against a cited primary source. Say plainly
in the artifact that this is a data-integrity benchmark, not a physics one.

## Step 2 — Fix what the benchmark found

Re-confirm each defect yourself before changing code. Fix the cause, not the symptom. A finding you
decide not to fix must be reported with your reasoning. Priority order: wrong numbers presented as
right > silent truncation/clamping/extrapolation > uncaught exceptions > undisclosed approximations >
cosmetic.

Never loosen a tolerance to make a test pass. If a tolerance was genuinely wrong, say so and justify it.

## Step 3 — Integrate the v2 runtime

Add `<script src="diagram-common.js" defer></script>` beside `site-disclaimer.js`, and call
`Diagram.init({...})` with:

- `state` — serialize/deserialize of the tool's inputs (permalink).
- `record` — inputs, outputs, units, `model.equations`, `model.ranges`, warnings.
- PDF via `Diagram.report(...)`. If the tool keeps its own jsPDF path, it **must** stamp
  `Diagram.report.attribution()`. Prefer replacing a CDN-dependent export with the runtime's
  dependency-free one — that also removes any `network_access` dishonesty.
- `python` — only where the computation can be honestly reproduced in a standalone script whose
  self-test passes. Verify by actually running it with `python3`. Where only part is reproducible,
  scope it explicitly in the generated header. Where it would mislead, set
  `python_export.supported: false` with a one-line reason. **Do not fake this.**
- `handoff` — `provides`/`accepts` using only the §1.5 SI quantity vocabulary. Empty arrays are the
  right answer when nothing fits; do not invent a pairing.

Also fix, if present: the tool ignoring `?lang=xx` for its own UI (precedence is
`?lang=` → `localStorage.diagram_lang` → browser → en, writing back on user change).

## Step 4 — Manifest v2

`schema` → `tools.petrov.re/tool-manifest/v2`, `manifest_revision` → `2026-08-11.2`, plus `validation`,
`report`, `python_export`, `handoff`, `state_codec`, and an accurate `network_access`
(`none` | `same-origin-data` | `external`).

`status` is evidence-based and you do not get to be generous:
- `benchmarked` only if every benchmark entry has `passed == cases`, names a genuinely independent
  reference, cites it, and its artifact exists at `/root/site/benchmarks/<tool>.json`.
- otherwise `prototype`, and `validation.basis` says why in one sentence.

Keep all six catalogue languages populated for every string you touch. Rewrite `limitations` in all six
wherever a fix changed what is true.

## Step 5 — Verify (a tool is not done without all of these)

1. `node /root/bench/run_<tool>.mjs` — 100 % pass.
2. Zero `pageerror` events on load; tool works in `?lang=en` and at least one other language.
3. Permalink round-trip: set a state, take the link, open it fresh, confirm identical state and outputs.
4. PDF report contains `https://tools.petrov.re/<file>` on **every** page
   (`page.pdf()` + `pdftotext -f N -l N`).
5. Exported python script runs and its self-test passes (where supported).
6. `cd /root/site && php catalog.php` — the tool is listed with no `errors` entry.

## Report back

Per tool: pass/total, a numbered list of findings with exact reproducing inputs / tool output /
reference value / your judgement, what you fixed, what you declined and why, the final `status` with
its justification, and the exact English `limitations` if you changed it.

Be skeptical of your own findings — re-derive every reference value a second, structurally different
way before reporting a discrepancy. Do not paste whole files. Other agents are editing the same tree
concurrently: only touch the files assigned to you, and never revert someone else's edit.
