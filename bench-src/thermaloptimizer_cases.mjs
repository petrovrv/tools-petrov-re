// thermaloptimizer_cases.mjs — read ThermalCore.runBenchmarks() from the page and shape it for the artifact (2026-10-17, r14).
export async function collect(page) {
  return await page.evaluate(() => {
    const b = globalThis.ThermalCore.runBenchmarks();
    return JSON.parse(JSON.stringify(b));
  });
}

export function toArtifactCases(raw, prevCases) {
  const prev = new Map(
    Array.isArray(prevCases) ? prevCases.map(c => [c.id, c]) : Object.entries(prevCases ?? {})
  );
  const rawCases = raw?.cases ?? [];
  const ids = new Set(rawCases.map(c => c.id));
  const cases = rawCases.map(({ id, group, kind, source, actual, expected, absoluteError, tolerance, ok, notes }) => {
    const p = prev.get(id);
    return {
      id, group, kind, note: notes || '', pass: ok, actual, expected,
      absolute_error: absoluteError, tolerance, source,
      reference_check: p
        ? { previous_expected: p.expected, same: p.expected === expected }
        : { previous_expected: null, same: false },
    };
  });
  return {
    cases,
    refDrift: cases.filter(c => !c.reference_check.same).map(c => c.id),
    missing: [...prev.keys()].filter(id => !ids.has(id)),
    added: [...ids].filter(id => !prev.has(id)),
  };
}
