<?php
/**
 * tools.petrov.re — static catalogue builder (TZ-engineering-workflow.md §7).
 *
 * Command line only:   php build-static.php [--base=https://tools.petrov.re]
 *                                           [--catalog=catalog.json] [--check]
 *
 * Reads the catalogue that catalog.php emits and writes what a crawler needs
 * without running JavaScript:
 *   - index.html, between <!--static-head:start--> … <!--static-head:end-->:
 *     <title>, meta description, canonical, hreflang alternates, Open Graph;
 *   - index.html, between <!--static-catalog:start--> … <!--static-catalog:end-->:
 *     every listed tool grouped by category (title, summary, link, language links),
 *     then JSON-LD (WebSite + ItemList of SoftwareApplication);
 *   - sitemap.xml, robots.txt (replaced only when absent or carrying the
 *     generator marker, so a hand-written file is never overwritten);
 *   - c/<category>.html and stage/<stage>.html, one page per non-empty category
 *     and lifecycle stage.
 * Everything outside the two marker pairs in index.html is left byte-identical.
 *
 * Lifecycle data: the tool's `workflow` field in the catalogue first, then
 * workflow-map.json in the site root (TZ-engineering-workflow.md §5). A tool
 * with neither is listed by category only.
 *
 * Output is deterministic: no build timestamp is written, so a rerun on an
 * unchanged catalogue rewrites nothing. A generated page carries
 * <meta name="generator" content="build-static.php">; a page in c/ or stage/
 * with that marker whose category or stage no longer has tools is removed,
 * and a file without the marker is never touched.
 *
 * --check writes nothing and exits 1 when any output would change, and also when a
 * hand-written robots.txt or sitemap.xml is out of date and therefore left alone.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    if (!headers_sent()) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo "build-static.php runs from the command line only.\n";
    exit(1);
}

const BS_LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
const BS_OG_LOCALE = ['en' => 'en_GB', 'uk' => 'uk_UA', 'de' => 'de_DE', 'nl' => 'nl_NL',
                      'fr' => 'fr_FR', 'es' => 'es_ES', 'pl' => 'pl_PL'];
const BS_CAT_ORDER = ['nuclear-physics', 'nuclear-eng', 'thermo', 'transients', 'hvac', 'acoustics',
                      'envelope', 'electrical', 'control', 'safety', 'project-delivery', 'tendering', 'engineering-change', 'mep-maintenance', 'plumbing', 'vertical-transport', 'ccus', 'oil-gas-h2', 'struct',
                      'physics', 'optics', 'mat'];
/* English labels of index.html CATS; the intro follows AGENTS.md §4. */
const BS_CATS = [
    'nuclear-physics'  => ['Nuclear Physics & Radiation', 'nuclear and particle physics: nuclides, reactions, spectra and evaluated nuclear data'],
    'nuclear-eng'      => ['Nuclear Engineering, Safety & Fuel', 'reactor engineering: kinetics, shielding, fuel, source terms, reactor standards and nuclear risk'],
    'thermo'           => ['Thermodynamics, Heat & Fluid Flow', 'thermodynamic properties, heat-transfer equipment, fluid flow and hydraulic and gas-flow systems'],
    'transients'       => ['Pipe & Vessel Transients', 'pipe and vessel transients: blowdown, line packing, flashing and relief flow, filling and draining, pressurisation and water hammer'],
    'hvac'             => ['HVAC & Indoor Climate', 'ventilation, air handling, heating and cooling, and indoor and process climate'],
    'acoustics'        => ['Acoustics & Noise', 'room acoustics, environmental and industrial noise, sound propagation, and Belgian building acoustics: sound insulation requirements, airborne and impact sound between rooms and façade sound insulation'],
    'envelope'         => ['Building Physics & Envelope', 'building physics: walls, envelope heat and moisture, solar gain, roof drainage, window performance classes, glass thickness for wind and snow, safety glazing and thermal breakage of glass'],
    'electrical'       => ['Electrical Engineering', 'electrical networks, cables, short-circuit currents, protection and generation'],
    'control'          => ['Control & Systems', 'control loops, automation, and hydraulic and air network dynamics'],
    'safety'           => ['Occupational Safety', 'occupational safety and health: work permits, PPE, workplace hazards, confined spaces, hazardous substances and fire and explosion prevention'],
    'project-delivery' => ['Project & Delivery', 'project definition, requirements, interfaces, deliverables, vendor documents, design review and commissioning and turnover'],
    'tendering'        => ['Tendering & Contracts', 'tendering and contracts for client, contractor and equipment supplier: procurement strategy and procedure, award criteria and price scoring, commercial bid normalisation and life-cycle cost, abnormally low tenders, bid/no-bid, estimates, quote levelling, Monte Carlo contingency, back-to-back terms, contract risk, cash flow, price indexation, liquidated damages and bonds, supplier compliance, lead time and conformity'],
    'engineering-change' => ['Engineering Change & Plant Life', 'engineering changes to an operating plant and plant-life decisions: change impact, repair or replace, obsolescence, operating envelope and margins, fatigue, wall thinning and degradation, design basis and long-term operation, temporary configurations, control software changes, post-modification closeout and maintenance and test intervals'],
    'mep-maintenance' => ['MEP Maintenance & Operations', 'maintenance of building services (HVAC, plumbing, fire protection, electrical and controls): asset criticality, risk-based and reliability-centred maintenance strategy, condition monitoring, maintenance planning and budgets, critical spares and renewal planning'],
    'plumbing' => ['Plumbing & Sanitary', 'building plumbing and sanitary installations: sanitary fixture counts, drinking-water pipe sizing, hot water storage and circulation, legionella control, backflow protection, booster sets, drainage and venting, lifting stations, rainwater reuse and water saving'],
    'vertical-transport' => ['Buildings / Vertical Transport', 'vertical transport in buildings: lift (elevator) passenger waiting times and group control, round-trip-time traffic design and sizing, zoning of tall buildings and lift energy and efficiency class'],
    'ccus' => ['CCUS — CO₂ Capture, Transport & Storage', 'carbon capture, utilisation and storage across the value chain: CO₂ capture, compression and conditioning, pipeline and ship transport, geological storage, utilisation, carbon pricing and project economics'],
    'oil-gas-h2' => ['Oil, Gas & Hydrogen', 'oil, gas and hydrogen engineering across the value chain: separation and flow assurance, pipeline integrity and cathodic protection, process safety and consequence modelling, methane emissions, hydrogen production, compression, storage, transport, blending and refuelling, hydrogen economics and RFNBO compliance'],
    'struct'           => ['Structures & Mechanics', 'structures, stress, frames and engineering mechanics'],
    'physics'          => ['Physics & Mathematics', 'general physics and mathematics'],
    'optics'           => ['Optics & Photonics', 'optics and photonics: 3D optical bench with ray tracing, polarisation and Gaussian beams, laser beam propagation and mode matching, lens design with aberrations, spot diagrams and MTF, thin-film coatings, laser safety (MPE, NOHD, laser class, eyewear) and machine-vision lens selection'],
    'mat'              => ['Materials & Chemistry', 'materials, phase diagrams and chemistry'],
];
const BS_STAGE_ORDER = ['concept', 'basic', 'detailed', 'procurement', 'factory', 'construction',
                        'commissioning', 'handover', 'operations'];
/* Fallback English labels; the catalogue's workflow_stages, then workflow-map.json stage_labels, win where present. */
const BS_STAGES = [
    'concept'       => ['Concept', 'feasibility and concept selection, before a design basis is fixed'],
    'basic'         => ['Basic engineering', 'basic engineering, where the design basis, main sizing and system definition are set'],
    'detailed'      => ['Detailed engineering', 'detailed engineering, where equipment, networks and documents are worked out for construction and purchase'],
    'procurement'   => ['Procurement', 'procurement: datasheets, requisitions, bid evaluation and vendor queries'],
    'factory'       => ['Manufacture & FAT', 'manufacture and factory acceptance testing, while the equipment is at the vendor'],
    'construction'  => ['Construction & installation', 'construction and installation on site'],
    'commissioning' => ['Commissioning', 'commissioning, functional testing and punch clearing'],
    'handover'      => ['Handover', 'handover: turnover dossiers and acceptance by the owner'],
    'operations'    => ['Operation & maintenance', 'operation and maintenance of the installed plant'],
];
const BS_ENTRIES = [
    'calculate' => 'Calculate / Analyse',
    'deliver'   => 'Define / Specify / Verify / Deliver',
];
const BS_STATUS = ['prototype' => 'Prototype', 'benchmarked' => 'Benchmark tested',
                   'verified' => 'Reviewed by a third party', 'partial' => 'Benchmark partially passed'];

/* ------------------------------------------------------------------ options */

$BS_DIR  = __DIR__;
$BS_OPT  = ['base' => 'https://tools.petrov.re', 'catalog' => '', 'check' => false];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--base=(https?:\/\/[^\s\/]+)\/?$/', $a, $m)) { $BS_OPT['base'] = $m[1]; }
    elseif (preg_match('/^--catalog=(.+)$/', $a, $m)) { $BS_OPT['catalog'] = $m[1]; }
    elseif ($a === '--check') { $BS_OPT['check'] = true; }
    elseif ($a === '--help' || $a === '-h') {
        fwrite(STDOUT, "usage: php build-static.php [--base=https://tools.petrov.re] [--catalog=file.json] [--check]\n");
        exit(0);
    } else { fwrite(STDERR, "unknown argument: $a\n"); exit(2); }
}
$BS_BASE = rtrim($BS_OPT['base'], '/');

function bs_fail(string $msg): void { fwrite(STDERR, "build-static: $msg\n"); exit(1); }

/* ------------------------------------------------------------------ catalogue */

/* catalog.php runs in its own process where the host allows it; otherwise it is
   included here, at file scope, because its helpers use `global`. */
function bs_catalog_subprocess(string $dir): ?array
{
    if (!function_exists('proc_open') || PHP_BINARY === '' || !is_executable(PHP_BINARY)) { return null; }
    $cmd = escapeshellarg(PHP_BINARY) . ' -d display_errors=stderr ' . escapeshellarg($dir . '/catalog.php');
    $p = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $dir);
    if (!is_resource($p)) { return null; }
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    stream_get_contents($pipes[2]); fclose($pipes[2]);
    proc_close($p);
    $j = json_decode((string) $out, true);
    return is_array($j) && isset($j['tools']) && is_array($j['tools']) ? $j : null;
}

$BS_CAT = null;
if ($BS_OPT['catalog'] !== '') {
    $BS_CAT = json_decode((string) @file_get_contents($BS_OPT['catalog']), true);
    if (!is_array($BS_CAT) || !isset($BS_CAT['tools'])) { bs_fail('cannot read catalogue JSON from ' . $BS_OPT['catalog']); }
} else {
    $BS_CAT = bs_catalog_subprocess($BS_DIR);
    if ($BS_CAT === null) {
        if (!is_file($BS_DIR . '/catalog.php')) { bs_fail('catalog.php not found beside build-static.php'); }
        ob_start();
        include $BS_DIR . '/catalog.php';
        $BS_RAW = (string) ob_get_clean();
        $BS_CAT = json_decode($BS_RAW, true);
        if (!is_array($BS_CAT) || !isset($BS_CAT['tools'])) { bs_fail('catalog.php did not return catalogue JSON'); }
    }
}

$BS_MAP = null;
if (is_file($BS_DIR . '/workflow-map.json')) {
    $BS_MAP = json_decode((string) file_get_contents($BS_DIR . '/workflow-map.json'), true);
    if (!is_array($BS_MAP)) { fwrite(STDERR, "build-static: workflow-map.json does not parse; lifecycle pages use catalogue data only\n"); $BS_MAP = null; }
}

/* ------------------------------------------------------------------ helpers */

function bs_h($s): string { return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8'); }
function bs_x($s): string { return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE | ENT_XML1, 'UTF-8'); }
function bs_en($v): string
{
    if (is_array($v)) { return trim((string) ($v['en'] ?? (reset($v) ?: ''))); }
    return trim((string) $v);
}
function bs_json($v): string
{
    return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
}
function bs_date($s): ?string
{
    return (is_string($s) && preg_match('/^(\d{4}-\d{2}-\d{2})/', $s, $m)) ? $m[1] : null;
}
function bs_max_date(array $ds): ?string
{
    $ds = array_values(array_filter($ds));
    if (!$ds) { return null; }
    sort($ds);
    return end($ds);
}
function bs_langs(array $t): array
{
    $tl = is_array($t['tool_languages'] ?? null) ? $t['tool_languages'] : ['en'];
    return array_values(array_filter(BS_LANGS, static fn($l) => in_array($l, $tl, true)));
}
function bs_has_report(array $t): bool
{
    foreach (($t['validation']['benchmarks'] ?? []) as $b) { if (is_array($b) && !empty($b['artifact'])) { return true; } }
    return false;
}
/* The displayed status, same rule as index.html shownStatus() minus the
   BENCHMARK_SUMMARY.md overlay: "verified" needs validation.review. */
function bs_status(array $t): string
{
    $v = $t['validation'] ?? [];
    $st = $t['status'] ?? 'prototype';
    $r = $v['review'] ?? null;
    $has = (is_array($r) && $r) || (is_string($r) && trim($r) !== '');
    if ($st === 'verified') { return $has ? 'verified' : 'benchmarked'; }
    if (($v['benchmark_status'] ?? null) === 'partial') { return 'partial'; }
    return $st === 'benchmarked' ? 'benchmarked' : 'prototype';
}
function bs_status_text(array $t): string
{
    $st = bs_status($t);
    $v = $t['validation'] ?? [];
    $n = ($st !== 'prototype' && !empty($v['cases'])) ? ' · ' . (int) ($v['passed'] ?? 0) . '/' . (int) $v['cases'] : '';
    return BS_STATUS[$st] . $n;
}
function bs_workflow(array $t, ?array $map): ?array
{
    $w = $t['workflow'] ?? null;
    if (!is_array($w) || (!isset($w['entry']) && !isset($w['lifecycle']))) {
        $w = $map['tools'][$t['id'] ?? ''] ?? null;
    }
    if (!is_array($w)) { return null; }
    $entry = in_array($w['entry'] ?? null, array_keys(BS_ENTRIES), true) ? $w['entry'] : null;
    $life = array_values(array_filter(is_array($w['lifecycle'] ?? null) ? $w['lifecycle'] : [], 'is_string'));
    return ['entry' => $entry, 'lifecycle' => $life];
}
function bs_write(string $path, string $data, bool $check, array &$changed): void
{
    $old = is_file($path) ? (string) file_get_contents($path) : null;
    if ($old === $data) { return; }
    $changed[] = $path;
    if ($check) { return; }
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) { bs_fail("cannot create $dir"); }
    $tmp = $path . '.tmp-' . getmypid();
    if (file_put_contents($tmp, $data) !== strlen($data)) { @unlink($tmp); bs_fail("cannot write $path"); }
    if ($old !== null) { @chmod($tmp, fileperms($path) & 0777); } else { @chmod($tmp, 0644); }
    if (!rename($tmp, $path)) { @unlink($tmp); bs_fail("cannot replace $path"); }
}
/* robots.txt and sitemap.xml sit in the site root beside hand-maintained files, so
   they are replaced only when absent or when they carry the generator marker; a
   hand-written file is left alone and reported. */
function bs_write_managed(string $path, string $data, string $marker, bool $check, array &$changed, array &$skipped): void
{
    if (is_file($path) && strpos((string) file_get_contents($path), $marker) === false) {
        if ((string) file_get_contents($path) !== $data) { $skipped[] = $path; }
        return;
    }
    bs_write($path, $data, $check, $changed);
}
function bs_replace_between(string $doc, string $name, string $inner): string
{
    $a = "<!--$name:start-->";
    $b = "<!--$name:end-->";
    $i = strpos($doc, $a);
    $j = strpos($doc, $b);
    if ($i === false || $j === false || $j < $i || substr_count($doc, $a) !== 1 || substr_count($doc, $b) !== 1) {
        bs_fail("index.html must contain exactly one $a … $b pair");
    }
    return substr($doc, 0, $i + strlen($a)) . $inner . substr($doc, $j);
}

/* ------------------------------------------------------------------ model */

$BS_TOOLS = array_values(array_filter($BS_CAT['tools'], static fn($t) => is_array($t) && ($t['listed'] ?? true) !== false && !empty($t['file'])));

$BS_STAGE_LABEL = [];
foreach (BS_STAGES as $k => $v) { $BS_STAGE_LABEL[$k] = $v[0]; }
foreach ((array) ($BS_MAP['stage_labels'] ?? []) as $k => $v) {
    if (isset($BS_STAGE_LABEL[$k]) && is_array($v) && !empty($v['en'])) { $BS_STAGE_LABEL[$k] = (string) $v['en']; }
}
$BS_ENTRY_LABEL = BS_ENTRIES;
foreach ((array) ($BS_MAP['entries'] ?? []) as $k => $v) {
    if (isset($BS_ENTRY_LABEL[$k]) && is_array($v) && !empty($v['en'])) { $BS_ENTRY_LABEL[$k] = (string) $v['en']; }
}
/* catalog.php publishes the same labels as workflow_stages / workflow_entries: [{id, label}] */
foreach ((array) ($BS_CAT['workflow_stages'] ?? []) as $x) {
    if (is_array($x) && isset($BS_STAGE_LABEL[$x['id'] ?? '']) && !empty($x['label']['en'])) { $BS_STAGE_LABEL[$x['id']] = (string) $x['label']['en']; }
}
foreach ((array) ($BS_CAT['workflow_entries'] ?? []) as $x) {
    if (is_array($x) && isset($BS_ENTRY_LABEL[$x['id'] ?? '']) && !empty($x['label']['en'])) { $BS_ENTRY_LABEL[$x['id']] = (string) $x['label']['en']; }
}

$BS_BY_CAT = [];
$BS_BY_STAGE = [];
$BS_WF = [];
foreach ($BS_TOOLS as $t) {
    $BS_BY_CAT[$t['category']][] = $t;
    $w = bs_workflow($t, $BS_MAP);
    $BS_WF[$t['id']] = $w;
    foreach (($w['lifecycle'] ?? []) as $s) {
        if (in_array($s, BS_STAGE_ORDER, true)) { $BS_BY_STAGE[$s][] = $t; }
    }
}
$BS_CATS_USED = array_values(array_filter(BS_CAT_ORDER, static fn($c) => !empty($BS_BY_CAT[$c])));
foreach (array_keys($BS_BY_CAT) as $c) {
    if (!in_array($c, $BS_CATS_USED, true)) { $BS_CATS_USED[] = $c; }   /* a category index.html does not know yet */
}
$BS_STAGES_USED = array_values(array_filter(BS_STAGE_ORDER, static fn($s) => !empty($BS_BY_STAGE[$s])));

function bs_cat_label(string $c): string { return BS_CATS[$c][0] ?? ucwords(str_replace('-', ' ', $c)); }
function bs_tool_url(string $base, array $t, ?string $l = null): string
{
    return $base . '/' . rawurlencode($t['file']) . ($l !== null ? '?lang=' . $l : '');
}

/* One tool as a list item. $up is '' on the index and '../' on a sub-page. */
function bs_tool_li(array $t, string $up, array $extra = []): string
{
    $file = rawurlencode($t['file']);
    $langs = bs_langs($t);
    $ll = [];
    foreach ($langs as $l) {
        $ll[] = '<a href="' . $up . $file . '?lang=' . $l . '" hreflang="' . $l . '">' . ($l === 'uk' ? 'UA' : strtoupper($l)) . '</a>';
    }
    $meta = array_merge([bs_h(bs_status_text($t))], $extra);
    if (bs_has_report($t)) {
        $meta[] = '<a href="' . $up . 'benchmark.html?tool=' . rawurlencode((string) $t['id']) . '&amp;lang=en">Benchmark report</a>';
    }
    return '<li><a class="t" href="' . $up . $file . '">' . bs_h(bs_en($t['title'])) . '</a>'
        . '<span class="s">' . bs_h(bs_en($t['summary'])) . '</span>'
        . '<span class="m">' . implode(' · ', $meta) . '</span>'
        . ($ll ? '<span class="l">' . implode(' ', $ll) . '</span>' : '')
        . "</li>\n";
}

function bs_stage_links(array $w, array $labels, string $up): string
{
    $out = [];
    foreach ($w['lifecycle'] ?? [] as $s) {
        if (isset($labels[$s])) { $out[] = '<a href="' . $up . 'stage/' . $s . '.html">' . bs_h($labels[$s]) . '</a>'; }
    }
    return $out ? 'Stages: ' . implode(', ', $out) : '';
}

function bs_software(string $base, array $t): array
{
    return [
        '@type' => 'SoftwareApplication',
        'name' => bs_en($t['title']),
        'url' => bs_tool_url($base, $t),
        'applicationCategory' => 'DesignApplication',
        'applicationSubCategory' => bs_cat_label((string) $t['category']),
        'operatingSystem' => 'Any (runs in a web browser)',
        'description' => bs_en($t['summary']),
        'inLanguage' => bs_langs($t),
        'isAccessibleForFree' => true,
        'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR'],
    ];
}

/* ------------------------------------------------------------------ index.html */

$BS_N = count($BS_TOOLS);
$BS_TITLE = 'tools.petrov.re — interactive engineering models and calculators';
$BS_DESC = $BS_N . ' engineering tools that run in the browser: calculators, models and project-delivery registers in '
    . count($BS_CATS_USED) . ' disciplines, from thermodynamics and HVAC to electrical, nuclear and occupational safety; '
    . 'site interface in seven languages.';

$head = "\n<title>" . bs_h($BS_TITLE) . "</title>\n"
    . '<meta name="description" content="' . bs_h($BS_DESC) . "\">\n"
    . '<link rel="canonical" href="' . bs_h($BS_BASE . '/') . "\">\n";
foreach (BS_LANGS as $l) {
    $head .= '<link rel="alternate" hreflang="' . $l . '" href="' . bs_h($BS_BASE . '/' . ($l === 'en' ? '' : '?lang=' . $l)) . "\">\n";
}
$head .= '<link rel="alternate" hreflang="x-default" href="' . bs_h($BS_BASE . '/') . "\">\n"
    . '<link rel="sitemap" type="application/xml" href="sitemap.xml">' . "\n"
    . '<meta property="og:type" content="website">' . "\n"
    . '<meta property="og:site_name" content="tools.petrov.re">' . "\n"
    . '<meta property="og:title" content="' . bs_h($BS_TITLE) . "\">\n"
    . '<meta property="og:description" content="' . bs_h($BS_DESC) . "\">\n"
    . '<meta property="og:url" content="' . bs_h($BS_BASE . '/') . "\">\n"
    . '<meta property="og:locale" content="en_GB">' . "\n";
foreach (BS_LANGS as $l) {
    if ($l !== 'en') { $head .= '<meta property="og:locale:alternate" content="' . BS_OG_LOCALE[$l] . "\">\n"; }
}
if (is_file($BS_DIR . '/apple-touch-icon.png')) {
    $head .= '<meta property="og:image" content="' . bs_h($BS_BASE . '/apple-touch-icon.png') . "\">\n";
}
$head .= '<meta name="twitter:card" content="summary">' . "\n";
$items = [];
foreach ($BS_CATS_USED as $c) {
    foreach ($BS_BY_CAT[$c] as $t) { $items[] = ['@type' => 'ListItem', 'position' => count($items) + 1, 'item' => bs_software($BS_BASE, $t)]; }
}
$ld = ['@context' => 'https://schema.org', '@graph' => [
    ['@type' => 'WebSite', '@id' => $BS_BASE . '/#website', 'name' => 'tools.petrov.re', 'url' => $BS_BASE . '/',
     'description' => $BS_DESC, 'inLanguage' => BS_LANGS],
    ['@type' => 'ItemList', '@id' => $BS_BASE . '/#tools', 'name' => 'Engineering tools', 'numberOfItems' => count($items),
     'itemListOrder' => 'https://schema.org/ItemListUnordered', 'itemListElement' => $items],
]];

$body = "\n<div id=\"static-catalog\">\n"
    . '<p class="st-intro">' . bs_h($BS_N . ' tools in ' . count($BS_CATS_USED) . ' categories. A title opens the tool; the language codes open it in that language.') . "</p>\n"
    . '<nav class="st-nav" aria-label="Categories"><b>Categories:</b> ';
$nav = [];
foreach ($BS_CATS_USED as $c) { $nav[] = '<a href="c/' . $c . '.html">' . bs_h(bs_cat_label($c)) . '</a>'; }
$body .= implode(' · ', $nav) . "</nav>\n";
if ($BS_STAGES_USED) {
    $nav = [];
    foreach ($BS_STAGES_USED as $s) { $nav[] = '<a href="stage/' . $s . '.html">' . bs_h($BS_STAGE_LABEL[$s]) . '</a>'; }
    $body .= '<nav class="st-nav" aria-label="Lifecycle stages"><b>Lifecycle stages:</b> ' . implode(' · ', $nav) . "</nav>\n";
}
foreach ($BS_CATS_USED as $c) {
    $body .= '<section class="st-cat" id="static-cat-' . $c . '"><h2><a href="c/' . $c . '.html">' . bs_h(bs_cat_label($c)) . '</a> <span>' . count($BS_BY_CAT[$c]) . "</span></h2>\n<ul>\n";
    foreach ($BS_BY_CAT[$c] as $t) { $body .= bs_tool_li($t, ''); }
    $body .= "</ul></section>\n";
}
$body .= '<p class="st-intro"><a href="validation.html">Validation register</a> · <a href="disclaimer.html">Disclaimer</a> · <a href="sitemap.xml">Sitemap</a></p>' . "\n</div>\n"
    /* JSON-LD sits after the list so the head stays small; parsers read it anywhere in the document */
    . '<script type="application/ld+json">' . bs_json($ld) . "</script>\n";

$BS_CHANGED = [];
$idxPath = $BS_DIR . '/index.html';
$idx = (string) @file_get_contents($idxPath);
if ($idx === '') { bs_fail('index.html not found'); }
$idx2 = bs_replace_between($idx, 'static-head', $head);
$idx2 = bs_replace_between($idx2, 'static-catalog', $body);
bs_write($idxPath, $idx2, $BS_OPT['check'], $BS_CHANGED);

/* ------------------------------------------------------------------ sub-pages */

const BS_PAGE_CSS = ':root{--bg:#f6f8fb;--panel:#fff;--ink:#12161d;--muted:#5b6675;--line:#e2e7ee;--accent:#3763e6}'
    . '@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--panel:#161b22;--ink:#e6edf3;--muted:#9aa7b4;--line:#293240;--accent:#6f98ff}}'
    . '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}'
    . '.wrap{max-width:960px;margin:auto;padding:26px 16px 60px}a{color:var(--accent)}'
    . '.brand{font-weight:700;font-size:20px;text-decoration:none;color:var(--ink)}.brand span{color:var(--accent)}'
    . '.crumb{font-size:13px;color:var(--muted);margin:14px 0 4px}h1{font-size:clamp(22px,3vw,30px);margin:0 0 6px;letter-spacing:-.02em}'
    . '.intro{color:var(--muted);margin:0 0 18px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:22px 0 8px}'
    . 'ul{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--panel)}'
    . 'li{padding:10px 14px;border-bottom:1px solid var(--line);display:grid;gap:2px;overflow-wrap:anywhere}li:last-child{border-bottom:0}'
    . '.t{font-weight:650;text-decoration:none}.s{color:var(--muted);font-size:13px}.m,.l{font-size:11px;color:var(--muted)}.l a{margin-right:6px}'
    . 'nav{font-size:13px;color:var(--muted);margin:10px 0;line-height:1.9}footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}';

function bs_page(string $base, string $path, string $title, string $h1, string $intro, string $crumb, string $main, string $nav, array $ld): string
{
    return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n"
        . '<meta name="viewport" content="width=device-width,initial-scale=1">' . "\n"
        . '<meta name="generator" content="build-static.php">' . "\n"
        . '<title>' . bs_h($title) . "</title>\n"
        . '<meta name="description" content="' . bs_h($intro) . "\">\n"
        . '<link rel="canonical" href="' . bs_h($base . '/' . $path) . "\">\n"
        . '<link rel="icon" type="image/svg+xml" href="../favicon.svg"><link rel="icon" href="../favicon.ico" sizes="any">' . "\n"
        . '<meta property="og:type" content="website"><meta property="og:site_name" content="tools.petrov.re">' . "\n"
        . '<meta property="og:title" content="' . bs_h($title) . '"><meta property="og:description" content="' . bs_h($intro) . '"><meta property="og:url" content="' . bs_h($base . '/' . $path) . "\">\n"
        . '<script type="application/ld+json">' . "\n" . bs_json($ld) . "\n</script>\n"
        . '<style>' . BS_PAGE_CSS . "</style></head>\n<body><div class=\"wrap\">\n"
        . '<a class="brand" href="../index.html">tools<span>.</span>petrov<span>.</span>re</a>' . "\n"
        . '<p class="crumb">' . $crumb . "</p>\n"
        . '<h1>' . bs_h($h1) . "</h1>\n<p class=\"intro\">" . bs_h($intro) . "</p>\n"
        . $main . $nav
        . '<footer><a href="../index.html">All tools</a> · <a href="../validation.html">Validation register</a> · <a href="../disclaimer.html">Disclaimer</a></footer>' . "\n"
        . "</div></body></html>\n";
}
function bs_crumb_ld(string $base, string $path, string $sectionName, string $name): array
{
    return ['@type' => 'BreadcrumbList', 'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'tools.petrov.re', 'item' => $base . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => $sectionName . ': ' . $name, 'item' => $base . '/' . $path],
    ]];
}
function bs_itemlist_ld(string $base, string $name, array $tools): array
{
    $items = [];
    foreach ($tools as $t) { $items[] = ['@type' => 'ListItem', 'position' => count($items) + 1, 'item' => bs_software($base, $t)]; }
    return ['@type' => 'ItemList', 'name' => $name, 'numberOfItems' => count($items), 'itemListElement' => $items];
}

$catNav = [];
foreach ($BS_CATS_USED as $c) { $catNav[$c] = '<a href="../c/' . $c . '.html">' . bs_h(bs_cat_label($c)) . '</a>'; }
$stageNav = [];
foreach ($BS_STAGES_USED as $s) { $stageNav[$s] = '<a href="../stage/' . $s . '.html">' . bs_h($BS_STAGE_LABEL[$s]) . '</a>'; }
$navBlock = static function (?string $curCat, ?string $curStage) use ($catNav, $stageNav): string {
    $c = []; foreach ($catNav as $k => $a) { $c[] = $k === $curCat ? '<b>' . strip_tags($a) . '</b>' : $a; }
    $out = '<nav aria-label="Categories"><b>Categories:</b> ' . implode(' · ', $c) . "</nav>\n";
    if ($stageNav) {
        $s = []; foreach ($stageNav as $k => $a) { $s[] = $k === $curStage ? '<b>' . strip_tags($a) . '</b>' : $a; }
        $out .= '<nav aria-label="Lifecycle stages"><b>Lifecycle stages:</b> ' . implode(' · ', $s) . "</nav>\n";
    }
    return $out;
};

$BS_WANTED = [];
foreach ($BS_CATS_USED as $c) {
    $ts = $BS_BY_CAT[$c];
    $path = 'c/' . $c . '.html';
    $BS_WANTED[] = $path;
    $name = bs_cat_label($c);
    $n = count($ts);
    $intro = $n . ($n === 1 ? ' tool' : ' tools') . ' for ' . (BS_CATS[$c][1] ?? strtolower($name)) . '.';
    $main = "<ul>\n";
    foreach ($ts as $t) {
        $st = bs_stage_links($BS_WF[$t['id']] ?? [], $BS_STAGE_LABEL, '../');
        $main .= bs_tool_li($t, '../', $st !== '' ? [$st] : []);
    }
    $main .= "</ul>\n";
    $crumb = '<a href="../index.html">All tools</a> › Category';
    $ld = ['@context' => 'https://schema.org', '@graph' => [bs_crumb_ld($BS_BASE, $path, 'Category', $name), bs_itemlist_ld($BS_BASE, $name, $ts)]];
    $html = bs_page($BS_BASE, $path, $name . ' — tools.petrov.re', $name, $intro, $crumb,
        $main . '<p><a href="../index.html#cat-' . $c . '">Open this category in the interactive catalogue</a></p>' . "\n", $navBlock($c, null), $ld);
    bs_write($BS_DIR . '/' . $path, $html, $BS_OPT['check'], $BS_CHANGED);
}
foreach ($BS_STAGES_USED as $s) {
    $ts = $BS_BY_STAGE[$s];
    $path = 'stage/' . $s . '.html';
    $BS_WANTED[] = $path;
    $name = $BS_STAGE_LABEL[$s];
    $n = count($ts);
    $intro = $n . ($n === 1 ? ' tool is' : ' tools are') . ' used in ' . (BS_STAGES[$s][1] ?? strtolower($name)) . '.';
    $main = '';
    $groups = ['calculate' => [], 'deliver' => [], '' => []];
    foreach ($ts as $t) { $groups[$BS_WF[$t['id']]['entry'] ?? ''][] = $t; }
    foreach ($groups as $e => $gts) {
        if (!$gts) { continue; }
        $main .= '<h2>' . bs_h($e === '' ? 'Other tools' : $BS_ENTRY_LABEL[$e]) . ' <span>' . count($gts) . "</span></h2>\n<ul>\n";
        foreach ($gts as $t) { $main .= bs_tool_li($t, '../', ['<a href="../c/' . bs_h($t['category']) . '.html">' . bs_h(bs_cat_label((string) $t['category'])) . '</a>']); }
        $main .= "</ul>\n";
    }
    $crumb = '<a href="../index.html">All tools</a> › Lifecycle stage';
    $ld = ['@context' => 'https://schema.org', '@graph' => [bs_crumb_ld($BS_BASE, $path, 'Lifecycle stage', $name), bs_itemlist_ld($BS_BASE, $name, $ts)]];
    $html = bs_page($BS_BASE, $path, $name . ' — lifecycle stage — tools.petrov.re', $name, $intro, $crumb,
        $main . '<p><a href="../index.html?by=stage#stage-' . $s . '">Open this stage in the interactive catalogue</a></p>' . "\n", $navBlock(null, $s), $ld);
    bs_write($BS_DIR . '/' . $path, $html, $BS_OPT['check'], $BS_CHANGED);
}
/* a generated page whose category or stage is empty now */
$BS_REMOVED = [];
foreach (['c', 'stage'] as $d) {
    foreach (glob($BS_DIR . '/' . $d . '/*.html') ?: [] as $f) {
        $rel = $d . '/' . basename($f);
        if (in_array($rel, $BS_WANTED, true)) { continue; }
        if (strpos((string) file_get_contents($f, false, null, 0, 600), '<meta name="generator" content="build-static.php">') === false) { continue; }
        $BS_REMOVED[] = $rel;
        if (!$BS_OPT['check']) { @unlink($f); }
    }
}

/* ------------------------------------------------------------------ sitemap.xml */

function bs_url(string $loc, ?string $lastmod, array $alts = []): string
{
    $s = "<url><loc>" . bs_x($loc) . "</loc>";
    if ($lastmod) { $s .= "<lastmod>$lastmod</lastmod>"; }
    foreach ($alts as $hl => $href) {
        $s .= "\n  <xhtml:link rel=\"alternate\" hreflang=\"$hl\" href=\"" . bs_x($href) . '"/>';
    }
    return $s . "</url>\n";
}
/* Every language variant is its own <url> carrying the whole alternate set. */
function bs_url_set(string $plain, array $langs, ?string $lastmod, bool $enIsPlain): string
{
    $alts = [];
    foreach ($langs as $l) { $alts[$l] = ($enIsPlain && $l === 'en') ? $plain : $plain . '?lang=' . $l; }
    if (count($langs) < 2) { return bs_url($plain, $lastmod); }
    $alts['x-default'] = $plain;
    $s = bs_url($plain, $lastmod, $alts);
    foreach ($langs as $l) {
        if ($alts[$l] !== $plain) { $s .= bs_url($alts[$l], $lastmod, $alts); }
    }
    return $s;
}

$toolDates = [];
foreach ($BS_TOOLS as $t) { $toolDates[$t['id']] = bs_date($t['manifest_revision'] ?? null); }
$sm = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    . "<!-- generated by build-static.php -->\n"
    . "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n";
$sm .= bs_url_set($BS_BASE . '/', BS_LANGS, bs_max_date($toolDates), true);
foreach ($BS_TOOLS as $t) {
    $sm .= bs_url_set(bs_tool_url($BS_BASE, $t), bs_langs($t), $toolDates[$t['id']], false);
}
foreach ($BS_CATS_USED as $c) {
    $sm .= bs_url($BS_BASE . '/c/' . $c . '.html', bs_max_date(array_map(static fn($t) => $toolDates[$t['id']], $BS_BY_CAT[$c])));
}
foreach ($BS_STAGES_USED as $s) {
    $sm .= bs_url($BS_BASE . '/stage/' . $s . '.html', bs_max_date(array_map(static fn($t) => $toolDates[$t['id']], $BS_BY_STAGE[$s])));
}
if (is_file($BS_DIR . '/validation.html')) { $sm .= bs_url($BS_BASE . '/validation.html', null); }
if (is_file($BS_DIR . '/disclaimer.html')) { $sm .= bs_url($BS_BASE . '/disclaimer.html', null); }
if (is_file($BS_DIR . '/benchmark.html')) {
    foreach ($BS_TOOLS as $t) {
        if (!bs_has_report($t)) { continue; }
        $runs = [];
        foreach ($t['validation']['benchmarks'] as $b) { $runs[] = bs_date($b['run_at'] ?? null); }
        $sm .= bs_url($BS_BASE . '/benchmark.html?tool=' . rawurlencode((string) $t['id']), bs_max_date($runs));
    }
}
$sm .= "</urlset>\n";
$BS_SKIPPED = [];
bs_write_managed($BS_DIR . '/sitemap.xml', $sm, '<!-- generated by build-static.php -->', $BS_OPT['check'], $BS_CHANGED, $BS_SKIPPED);

/* ------------------------------------------------------------------ robots.txt */

$rb = "# generated by build-static.php; remove this line to keep a hand-written file\nUser-agent: *\nAllow: /\n";
foreach (['_backup/', '_new/', '_incoming/', '_docs/', '_stats/', 'bench-src/', 'tools/', 'tests/', 'UI/', 'smr-update/'] as $d) { $rb .= "Disallow: /$d\n"; }
/* 122 build notes, audits, changelogs and manifests sit in the site root beside the tools
   (AGENTS.md 64 447 B, STATUS.md 92 944 B, SHA256SUMS.txt, PACKAGE_MANIFEST.json). The
   path-suffix wildcard is an extension every major crawler honours; it keeps them out of a
   search index but does not stop a request, which needs a rule in .htaccess. The allow line
   is more specific than the .txt rule, so robots.txt itself stays fetchable. */
$rb .= "Allow: /robots.txt\n";
/* The specification of each 2026-09 tool is the evidence its benchmark report cites, and
   benchmark.html links to it, so those two documents stay indexable while the rest of _docs/
   does not. An Allow line longer than the Disallow it sits under wins for every major crawler. */
foreach (['/_docs/SPEC-', '/_docs/TZ-'] as $d) { $rb .= "Allow: $d\n"; }
foreach (['/*.md$', '/*.txt$', '/*.patch$', '/*.log$', '/error_log', '/PACKAGE_MANIFEST.json',
          '/Patch-v3.7.0-manifest.json'] as $f) { $rb .= "Disallow: $f\n"; }
$rb .= "\nSitemap: $BS_BASE/sitemap.xml\n";
bs_write_managed($BS_DIR . '/robots.txt', $rb, '# generated by build-static.php', $BS_OPT['check'], $BS_CHANGED, $BS_SKIPPED);

/* ------------------------------------------------------------------ report */

$rel = static fn($p) => ltrim(substr($p, strlen($BS_DIR)), '/');
$nerr = count($BS_CAT['errors'] ?? []);
fwrite(STDOUT, sprintf("build-static: %d tools, %d categories, %d stages%s; catalogue errors: %d\n",
    $BS_N, count($BS_CATS_USED), count($BS_STAGES_USED),
    $BS_MAP ? '' : ' (no workflow-map.json)', $nerr));
foreach ($BS_CHANGED as $p) { fwrite(STDOUT, ($BS_OPT['check'] ? 'would write ' : 'wrote ') . $rel($p) . "\n"); }
foreach ($BS_REMOVED as $p) { fwrite(STDOUT, ($BS_OPT['check'] ? 'would remove ' : 'removed ') . $p . "\n"); }
foreach ($BS_SKIPPED as $p) {
    /* the file is stale and this script will not overwrite it: say so on both streams and
       fail --check, so a hand-written sitemap.xml cannot pass as up to date. */
    fwrite(STDOUT, 'stale ' . $rel($p) . " (hand-written: no build-static.php marker, not replaced)\n");
    fwrite(STDERR, 'left unchanged: ' . $rel($p) . " has no build-static.php marker (hand-written file)\n");
}
if (!$BS_CHANGED && !$BS_REMOVED && !$BS_SKIPPED) { fwrite(STDOUT, "build-static: everything up to date\n"); }
exit(($BS_OPT['check'] && ($BS_CHANGED || $BS_REMOVED || $BS_SKIPPED)) ? 1 : 0);
