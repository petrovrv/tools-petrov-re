<?php
// Regenerate benchmarks/index.json from catalog.php plus the artifacts themselves.
// One entry per tool id that owns an artifact; never a duplicate; every field read, none guessed.
//
// Usage:  php _mkindex.php [site-root] [catalog-source]
//
//   site-root       the deployment root to read artifacts from and write index.json into.
//                   Defaults to the production path, so the deploy step that calls this
//                   script with no argument behaves exactly as it did before.
//                   Overridable with the BENCH_ROOT environment variable.
//   catalog-source  a URL or a local .php file to take the tool catalogue from. With no
//                   argument it is the production URL when the root is the production
//                   path, and $root/catalog.php executed locally otherwise.
//                   Overridable with BENCH_CATALOG.
//
// Both were hardcoded to production until 2026-10-03, so the register could not be
// regenerated in any local tree: a local run reported "0 artifacts, missing 93" and
// wrote nothing, because it globbed a production path that does not exist here, and it
// read the LIVE catalogue, which describes the deployed site and not the tree in hand.
// A register that can only be built on the server is a register that goes stale between
// deploys, which is what it did.
const PROD_ROOT = '/home/u392879469/domains/tools.petrov.re/public_html';
const PROD_CATALOG = 'https://tools.petrov.re/catalog.php';

$root = $argv[1] ?? getenv('BENCH_ROOT') ?: PROD_ROOT;
$root = rtrim($root, '/');
if (!is_dir($root)) { fwrite(STDERR, "site root not a directory: $root\n"); exit(1); }
if (!is_dir("$root/benchmarks")) { fwrite(STDERR, "no benchmarks/ under $root\n"); exit(1); }

$src = $argv[2] ?? getenv('BENCH_CATALOG') ?:
       ($root === PROD_ROOT ? PROD_CATALOG : "$root/catalog.php");

// A local catalog.php has to be executed, not read: read as text it is PHP source, and
// json_decode of PHP source returns null. This is the failure that put one-line pages on
// the server in 2026-08 (AGENTS §8).
if (preg_match('~^https?://~', $src)) {
  $raw = @file_get_contents($src);
} elseif (substr($src, -4) === '.php') {
  if (!is_file($src)) { fwrite(STDERR, "catalog not found: $src\n"); exit(1); }
  $raw = shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($src));
} else {
  $raw = @file_get_contents($src);
}
$cat = $raw === null || $raw === false ? null : json_decode($raw, true);
if (!$cat) { fwrite(STDERR, "catalog unreadable: $src\n"); exit(1); }
$tools = $cat['tools'] ?? [];
fwrite(STDERR, "root $root\ncatalog $src (" . count($tools) . " tools)\n");

$rows = []; $missing = []; $orphan = [];
foreach ($tools as $t) {
  $id = $t['id'] ?? null; if (!$id) continue;
  // The artifact is named after the tool's FILE, not its id: ids use hyphens
  // (steam-tables) where files use underscores (steam_tables.html).
  $stem = pathinfo($t['file'] ?? "$id.html", PATHINFO_FILENAME);

  /* Resolve the artifact the MANIFEST CITES, and only then fall back to guessing it from the
     tool's file name or id. Guessing first was wrong for seven of the 119 catalogued tools that
     cite an artifact, and for one of them it printed a different file's numbers: vessel-blowdown
     cites benchmarks/vessel_blowdown_v1101.json (48 cases) while benchmarks/vessel_blowdown.json
     also exists (5 cases, undated), so the guess won and the register published 5/5 for a page
     whose manifest, whose catalogue entry and whose benchmark report all say 48/47. The other six
     were saved by the id fallback or lost their artifact to the orphan list. catalog.php validates
     the cited path and benchmark.html reads it, so the register has to read the same file or it is
     a third answer to a question that already has two. */
  $cited = [];
  foreach (($t['validation']['benchmarks'] ?? []) as $bb) {
    if (is_array($bb) && !empty($bb['artifact']) && is_string($bb['artifact'])) $cited[] = $bb['artifact'];
  }
  $p = null;
  foreach ($cited as $c) {
    $cand = "$root/" . ltrim($c, '/');
    if (is_file($cand)) { $p = $cand; $stem = pathinfo($cand, PATHINFO_FILENAME); break; }
  }
  if ($p === null) {
    $p = "$root/benchmarks/$stem.json";
    if (!is_file($p) && $stem !== $id) { $p = "$root/benchmarks/$id.json"; $stem = $id; }
  }
  if (!is_file($p)) { if (in_array(($t['status'] ?? ''), ['benchmarked','verified'], true)) $missing[] = $id; continue; }
  $a = json_decode(file_get_contents($p), true);
  if ($a === null) { $missing[] = "$id (artifact does not parse)"; continue; }
  $b = $t['validation']['benchmarks'][0] ?? [];
  $corpus_cases = $a['total'] ?? $a['cases_total']
      ?? (is_array($a['cases'] ?? null) ? count($a['cases'])
          : (is_int($a['cases'] ?? null) ? $a['cases'] : null));
  // An ungraded case is recorded under `skipped` by the drivers that have them, and the
  // artifact's own `skipped_note` says what a skipped case is.
  $skipped = is_int($a['skipped'] ?? null) ? $a['skipped'] : 0;
  // An artifact may keep its counts under summary{} instead (2026-09-26; six live artifacts
  // do). That object's `cases` answers the same question `graded` does and not the corpus
  // size: in the one of the six where the two differ, corescoping, summary.cases is 81 -
  // which is summary.passed + summary.failed - against 94 entries in the cases array. So it
  // is read as a declared graded count, and the corpus is still counted from the array.
  $graded_declared = is_int($a['graded'] ?? null) ? $a['graded']
                     : (is_int($a['summary']['cases'] ?? null) ? $a['summary']['cases'] : null);
  $rows[$id] = [
    'artifact'   => "benchmarks/$stem.json",
    'tool'       => $id,
    'file'       => $t['file'] ?? "$id.html",
    'status'     => $t['status'] ?? null,
    'manifest_revision' => $t['manifest_revision'] ?? null,
    // `cases` is the GRADED set, which is what the status chip shows beside the status.
    // An artifact that records ungraded diagnostics - cases naming an input the page has
    // no control for, or a quantity it does not publish - carries them separately, and
    // the register has to carry them separately too: a row reading 171 cases and 97
    // passed invites a reader to subtract and find 74 failures that do not exist.
    // An artifact that counts its own graded set says so in `graded`; otherwise the
    // graded set is the corpus less the recorded diagnostics.
    'cases'      => $graded_declared !== null ? $graded_declared
                    : ($corpus_cases === null ? null : $corpus_cases - $skipped),
    'passed'     => $a['passed'] ?? $a['summary']['passed'] ?? null,
    'failed'     => $a['failed'] ?? $a['summary']['failed'] ?? null,
    'flagged'    => is_array($a['flagged'] ?? null) ? count($a['flagged'])
                    : ($a['flagged'] ?? $a['summary']['flagged'] ?? null),
    'recorded_diagnostics' => $skipped ?: null,
    'corpus_cases' => $corpus_cases,
    'run_at'     => $a['run_at'] ?? ($b['run_at'] ?? null),
    'build'      => $a['build'] ?? null,
    'reference_provenance' => $a['reference_provenance'] ?? null,
    'provenance_note'      => $a['provenance_note'] ?? null,
    'reference'  => is_string($a['reference'] ?? null) ? $a['reference'] : (isset($a['reference']) ? json_encode($a['reference'], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE) : null),
    'citations'  => $a['reference_citations'] ?? null,
    /* Every artifact this tool's manifest cites other than the one this row reads. A tool with
       four cited artifacts (roofstormwater) had three of them invisible here and all four counted
       as orphans. */
    'other_cited_artifacts' => (function($cited, $used) {
        $rest = array_values(array_filter($cited, fn($c) => ltrim($c, '/') !== $used));
        return $rest ?: null;
      })($cited, 'benchmarks/'.pathinfo($p, PATHINFO_BASENAME)),
    'tolerance'  => is_string($a['tolerance'] ?? null) ? $a['tolerance'] : (isset($a['tolerance']) ? json_encode($a['tolerance'], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE) : null),
  ];
}
// artifacts with no catalogued tool
foreach (glob("$root/benchmarks/*.json") as $p) {
  $id = basename($p, '.json');
  if ($id === 'index') continue;
  $claimed = false;
  foreach ($rows as $r) {
    if ($r['artifact'] === "benchmarks/$id.json") { $claimed = true; break; }
    foreach (($r['other_cited_artifacts'] ?? []) as $c) {
      if (ltrim($c, '/') === "benchmarks/$id.json") { $claimed = true; break 2; }
    }
  }
  if (!$claimed) $orphan[] = $id;
}
ksort($rows);

$today = gmdate('Y-m-d');
$current = 0; $stale = 0;
foreach ($rows as $r) {
  $rd = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)$r['manifest_revision'], $m1) ? $m1[1] : null;
  $ad = preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)$r['run_at'], $m2) ? $m2[1] : null;
  if ($rd && $ad) { if ($ad >= $rd) $current++; else $stale++; }
}
$out = [
  'schema'       => 'tools.petrov.re/benchmark-index/v1',
  'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
  'generated_by' => 'benchmarks/_mkindex.php, from catalog.php plus each artifact. One entry per tool id, sorted, no duplicates. Regenerate it in the same pass that republishes any artifact, or it becomes a second source of truth that disagrees with catalog.php.',
  'generated_from' => [ 'site_root' => $root, 'catalog_source' => $src ],
  'counts'       => [
    'artifacts'                     => count($rows),
    'run_against_the_page_they_grade' => $current,
    'older_than_the_page_they_grade'  => $stale,
    'catalogued_benchmarked_without_artifact' => count($missing),
    'artifacts_without_a_catalogued_tool'     => count($orphan),
  ],
  'catalogued_benchmarked_without_artifact' => $missing,
  'artifacts_without_a_catalogued_tool'     => $orphan,
  'benchmarks'   => array_values($rows),
];
file_put_contents("$root/benchmarks/index.json", json_encode($out, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)."\n");
echo "index.json: ".count($rows)." artifacts, current $current, stale $stale, missing ".count($missing).", orphan ".count($orphan)."\n";
if ($missing) echo "  benchmarked without artifact: ".implode(', ', $missing)."\n";
if ($orphan)  echo "  artifact without catalogued tool: ".implode(', ', $orphan)."\n";
echo "  bytes: ".filesize("$root/benchmarks/index.json")."\n";
