<?php
/**
 * tools.petrov.re — tool catalog.
 *
 * Scans every HTML file in the site root for the embedded manifest
 *   <script type="application/json" id="diagram-tool-manifest"> … </script>
 * (which must sit in <head> within the first 256 KiB) and emits one JSON
 * document describing every listed tool.
 *
 * Manifest schema v1 and v2 are both accepted; the version is reported per tool
 * as `manifest_version`. v2 adds status/validation/report/python_export/handoff/
 * state_codec — see FRAMEWORK_V2_SPEC.md §2.
 *
 * Validation outcomes come in two classes.
 *
 * `errors` — structural faults that make the entry unusable. The tool is left
 * out of `tools` because there is nothing serviceable to list:
 *   - the manifest is absent, unreadable or not parseable JSON;
 *   - manifest.file does not match the deployed filename;
 *   - a required field is missing (or category/status/languages are invalid);
 *   - a declared local dependency does not exist (see SERVER_DATA);
 *   - validation.benchmarks[].artifact does not exist or does not parse;
 *   - status "benchmarked"/"verified" without a passing benchmark entry
 *     (and, for "verified", without a documented review).
 *
 * `warnings` — honesty/consistency defects that do not stop the tool working.
 * The tool STAYS in `tools` and carries the same warning in its own
 * `warnings` array, so the index still lists it and validation.html can show
 * the flag against that tool:
 *   - network_access.mode "none" while the page really loads an off-site URL;
 *   - report.pdf true while the HTML does not load diagram-common.js;
 *   - handoff.accepts naming a quantity outside the §1.5 vocabulary;
 *   - Diagram.init() signing the page with an id or file that is not the
 *     manifest's (see `init_*` below);
 *   - the mode/note/dependency bookkeeping checks below.
 *
 * Dropping a working tool off the site because of a metadata defect it can be
 * flagged for is a worse outcome than the defect itself.
 */

declare(strict_types=1);

const CATALOG_SCHEMA   = 'tools.petrov.re/catalog/v2';
const CATALOG_REVISION = '2026-10-16.provenance-merge-1';
const MANIFEST_V1      = 'tools.petrov.re/tool-manifest/v1';
const MANIFEST_V2      = 'tools.petrov.re/tool-manifest/v2';
const RECORD_SCHEMA    = 'tools.petrov.re/calculation-record/v1';
const HEAD_BYTES       = 262144;   /* 256 KiB — the manifest must be inside this */
const CHUNK            = 1048576;  /* 1 MiB scan window                          */
const OVERLAP          = 4096;     /* carried between windows so tags do not split */

const LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];
const CATEGORIES = ['nuclear-physics', 'nuclear-eng', 'thermo', 'transients', 'hvac', 'acoustics', 'envelope', 'electrical', 'control', 'safety', 'project-delivery', 'tendering', 'engineering-change', 'mep-maintenance', 'plumbing', 'vertical-transport', 'ccus', 'oil-gas-h2', 'struct', 'physics', 'optics', 'mat'];
const STATUSES = ['prototype', 'benchmarked', 'verified'];
const SKIP = ['index.html', 'validation.html', 'disclaimer.html', 'benchmark.html'];

/* TZ-project-package.md §2 — canonical project-package sections. A register has
   exactly one writer; where two tools genuinely hold one, the register is split.
   `structure` is the one section owned per array, so a writer of one array
   declares the dotted path and the runtime refuses a patch reaching outside it. */
const PKG_SCHEMA = 'tools.petrov.re/project-package/v1';
/* The one list of section names in this file. The first eleven are
   TZ-project-package.md §2; the rest are TZ-engineering-workflow.md §2 (twelve
   registers, each with one writer, plus `calculations`). */
const PKG_SECTIONS = [
    'project', 'structure', 'requirements', 'deliverables', 'vendor_documents',
    'interfaces', 'verification_evidence', 'commissioning_evidence',
    'definition_decisions', 'review_decisions', 'flags',
    'equipment_datasheets', 'requisitions', 'bid_evaluations', 'deviations',
    'package_readiness', 'punch_items', 'turnover_dossiers', 'control_functions',
    'cause_effect', 'io_points', 'functional_tests', 'electrical_loads',
    'calculations',
];
const PKG_SPLIT_SECTIONS = ['structure'];
const PKG_SUBPATHS = ['structure.systems', 'structure.packages'];
/* TZ-engineering-workflow.md §3: `calculations` is keyed by tool id and the
   runtime grants `calculations.<manifest id>` to every page implicitly, so the
   section is written by the framework on behalf of each tool. A reader of it is
   therefore never reading "a section no tool writes", and the only write a
   manifest may declare there is its own key. */
const PKG_FRAMEWORK_SECTIONS = ['calculations'];

/* TZ-engineering-workflow.md §5 — the workflow graph. A framework data file in
   the site root, merged per tool with the manifest's optional `workflow` field
   (the manifest wins, field by field). The stage vocabulary is the package's
   project.lifecycle list (TZ-project-package.md §2.1, §8); the map may use a
   subset of it and nothing outside it. */
const WORKFLOW_SCHEMA = 'tools.petrov.re/workflow-map/v1';
const WORKFLOW_FILE   = 'workflow-map.json';
const PKG_LIFECYCLE   = ['concept', 'basic', 'detailed', 'procurement', 'factory', 'construction',
                         'commissioning', 'handover', 'operations', 'close-out', 'decommissioning'];
const WORKFLOW_ENTRIES = ['calculate', 'deliver'];
const WORKFLOW_CARRIES = ['handoff', 'package', 'link'];
/* TZ-engineering-workflow.md §5.1 — the map records every edge that can be
   carried; the toolbar shows a short list a person reads while working, so each
   edge carries `offer` and every tool a `medium`. The flags are authored in the
   map and passed through here; the rules W-1 and W-2 that produce them are
   checked below but never rewritten, so one file decides what is offered. */
const WORKFLOW_MEDIA = ['liquid', 'gas', 'steam', 'humid-air', 'solid', 'electrical',
                        'neutronic', 'none', 'any'];
/* Quantities whose value has no meaning without the medium (§5.1 W-1). */
const WORKFLOW_MEDIUM_BOUND = ['rho', 'h', 's', 'u', 'v', 'x', 'w', 'mdot', 'Vdot',
                               'Re', 'f_darcy', 'M'];
/* A shared set inside this one is a bare state point (§5.1 W-2). */
const WORKFLOW_STATE_POINT = ['T', 'p'];

/* FRAMEWORK_V2_SPEC.md §1.5 — canonical handoff quantity vocabulary. */
const QUANTITIES = ['T', 'p', 'rho', 'h', 's', 'u', 'v', 'x', 'w', 'mdot', 'Vdot', 'Q', 'U', 'A',
                    'NTU', 'eps', 'f_darcy', 'Re', 'D', 'L', 'dp', 'M', 'phi', 'rho_reac',
                    'E', 'I', 'V_volt', 'Z', 'XR', 'Ik', 'ip', 'Ib', 'Ith', 'Ires', 't_clear'];

/* Hosts that are this site (a reference to them is not "off-site").
 *
 * The canonical pair is kept for ever — records and pages written before a move
 * still cite it — but the host the catalog is actually being served from counts
 * too, otherwise a deploy on a new host (tools.petrov.re) flags the site's own
 * absolute links as external. DIAGRAM_OWN_HOSTS overrides the canonical pair
 * (comma-separated); the request host is added either way. Ports are stripped
 * and the list is deduped. */
const OWN_HOSTS_CANONICAL = ['tools.petrov.re', 'www.tools.petrov.re'];

function own_hosts(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $env = getenv('DIAGRAM_OWN_HOSTS');
    $list = ($env !== false && trim($env) !== '')
        ? preg_split('~\s*,\s*~', trim($env), -1, PREG_SPLIT_NO_EMPTY)
        : OWN_HOSTS_CANONICAL;
    foreach (['HTTP_HOST', 'SERVER_NAME'] as $k) {
        if (!empty($_SERVER[$k])) {
            $list[] = (string) $_SERVER[$k];
        }
    }
    $out = [];
    foreach ($list as $h) {
        /* strip a port, and any scheme or path someone pasted in with it */
        $h = strtolower(trim((string) $h));
        $h = preg_replace('~^[a-z][a-z0-9+.-]*://~', '', $h);
        $h = preg_replace('~[/?#].*$~', '', $h);
        $h = preg_replace('~:\d+$~', '', $h);
        if ($h !== '' && !in_array($h, $out, true)) {
            $out[] = $h;
        }
    }
    $cache = $out;
    return $cache;
}

/* network_access.mode vocabulary — FRAMEWORK_V2_SPEC.md §2.
 *   none             literally no network at all;
 *   same-origin-data fetches only its own declared local dependencies and
 *                    contacts no external service;
 *   external         contacts a third-party host; `note` must say what and why.
 */
const NET_MODES = ['none', 'same-origin-data', 'external'];

/* Runtime datasets that are maintained on the server and deliberately are not
 * part of a framework deploy package (AGENTS.md §9 for neutron-data/, the SMR
 * section for the smr-*.json trio; nuclide-data.js is the generated IAEA
 * snapshot in the same class). Their absence from a deploy tree is reported as
 * a warning, not as a reason to drop an otherwise complete tool. */
const SERVER_DATA = ['neutron-data/', 'nuclide-data.js', 'smr-data.json',
                     'smr-change-log.json', 'smr-update-status.json'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');

$root    = __DIR__;
$tools   = [];
$errors  = [];
$warnings = [];
$tool_warnings = [];   /* warnings raised for the file currently being read */
$known_ids = [];       /* manifest id => file, for every parseable manifest */

/* ------------------------------------------------------------------ helpers */

/* A benchmark reference or tolerance is a plain string or, like the rest of
   the manifest, a localized object {en, uk, ...}; the page report prints the
   object in the report language (diagram-common evidText). The catalogue keeps
   one string per field: the English text, else the first language present. */
function bench_text($v) {
    if (is_array($v)) {
        if (isset($v['en']) && is_string($v['en'])) return $v['en'];
        foreach ($v as $x) { if (is_string($x) && $x !== '') return $x; }
        return '';
    }
    return is_scalar($v) ? (string) $v : '';
}
function err(string $file, string $code, string $msg): void
{
    global $errors;
    $errors[] = ['file' => $file, 'code' => $code, 'message' => $msg];
}

/**
 * A warning never hides a tool: it is recorded site-wide and, when the tool is
 * emitted, attached to the tool entry as well.
 */
function warn(string $file, string $code, string $msg): void
{
    global $warnings, $tool_warnings;
    $w = ['file' => $file, 'code' => $code, 'message' => $msg];
    $warnings[] = $w;
    $tool_warnings[] = ['code' => $code, 'message' => $msg];
}

function head_of(string $path, int $bytes): string
{
    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return '';
    }
    $s = (string) @fread($fh, $bytes);
    fclose($fh);
    return $s;
}

/** Extract the embedded manifest JSON text, or null. */
function manifest_text(string $head): ?string
{
    if (!preg_match(
        '~<script\b[^>]*\bid\s*=\s*["\']diagram-tool-manifest["\'][^>]*>(.*?)</script\s*>~is',
        $head,
        $m
    )) {
        /* attribute order may differ: type first, id second is handled above; try the reverse */
        if (!preg_match(
            '~<script\b[^>]*\btype\s*=\s*["\']application/json["\'][^>]*\bid\s*=\s*["\']diagram-tool-manifest["\'][^>]*>(.*?)</script\s*>~is',
            $head,
            $m
        )) {
            return null;
        }
    }
    return trim($m[1]);
}

/* The manifest_revision declared by a page in the site root, or null when the page is
   absent or declares none.  Cached: one artifact check per benchmarked tool reads a page,
   and several artifacts name the same one. */
function page_manifest_revision(string $root, string $file): ?string
{
    static $cache = [];
    $file = basename(trim($file));
    if ($file === '' || !preg_match('~\.html$~i', $file)) {
        return null;
    }
    if (array_key_exists($file, $cache)) {
        return $cache[$file];
    }
    $cache[$file] = null;
    $path = $root . '/' . $file;
    if (!is_file($path)) {
        return null;
    }
    $json = manifest_text(head_of($path, HEAD_BYTES));
    if ($json === null) {
        return null;
    }
    $m = json_decode($json, true);
    if (is_array($m) && isset($m['manifest_revision']) && is_string($m['manifest_revision'])
        && $m['manifest_revision'] !== '') {
        $cache[$file] = $m['manifest_revision'];
    }
    return $cache[$file];
}

/** True when $url points somewhere that is not this site and not an inline scheme. */
function is_offsite(string $url): bool
{
    $u = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($u === '') {
        return false;
    }
    if (preg_match('~^(data:|blob:|javascript:|about:|mailto:|tel:|#)~i', $u)) {
        return false;
    }
    if (preg_match('~^(https?:)?//~i', $u)) {
        $host = parse_url(preg_match('~^//~', $u) ? 'https:' . $u : $u, PHP_URL_HOST);
        if ($host === null || $host === false) {
            return false;
        }
        $host = strtolower($host);
        if (in_array($host, own_hosts(), true)) {
            return false;
        }
        /* XML/SVG namespace declarations are identifiers, not fetches */
        if ($host === 'www.w3.org' || $host === 'w3.org') {
            return false;
        }
        return true;
    }
    return false; /* relative path — same origin */
}

/**
 * Scan the whole file for things the browser would actually fetch, plus the
 * runtime <script src=> includes we need to confirm. Streams in windows so a
 * 10 MB tool does not have to be held in memory.
 *
 * Two strengths of evidence, deliberately kept apart:
 *
 * `offsite` — a real request target: a <script src=>, <link href=> or <img src=>
 * attribute, a fetch(…) argument or an XMLHttpRequest .open(method, url) target.
 * This is the only thing strong enough to contradict a manifest, because a
 * URL-shaped string sitting anywhere else is NOT a fetch: a vendored library
 * that mentions a CDN URL in a code path the tool never enters used to be
 * reported as an external dependency, which is a false positive.
 *
 * `mentions` — any off-site URL literal at all. Far too weak to accuse a tool
 * with, but strong enough to STOP us telling a tool that declares `external`
 * that nothing external was found: a `fetch(endpoint)` whose URL is built from
 * a constant is invisible to the strong scan, and the honest thing is to
 * believe the manifest rather than to file a warning we cannot substantiate.
 *
 * @return array{offsite:string[], mentions:bool, loads_common:bool,
 *               loads_disclaimer:bool, init:array<int,array{id:?string,file:?string,raw_id:?string,raw_file:?string}>}
 */
/**
 * Diagram.init() identity sites inside one scan window.
 *
 * The manifest is not the only place a page states who it is: diagram-common.js
 * reads `Diagram.init({id, file})` FIRST and only falls back to the manifest
 * (`toolId()`/`toolFile()`), so an init call that disagrees with the manifest
 * silently wins — and it is what the source URL on every printed page, the
 * permalink, the benchmark-report link and the record's tool.id are built from.
 * Nine tools shipped pointing at a `<name>-v2.html` that was never deployed and
 * nothing here noticed, because nothing here had ever read the init call.
 *
 * The argument object is delimited by brace matching, not by a distance guess,
 * so a `Diagram.init(...)` named in a comment cannot pick up an `id:` that
 * belongs to something else further down the file. A site whose object does not
 * close inside the window is skipped here and picked up whole from the next
 * window's OVERLAP carry (the largest shipped init object is ~0.6 KiB against a
 * 4 KiB overlap).
 *
 * `id`/`file` are the literal values; when the call passes an identifier
 * instead (`{id: ID, file: FILE}`), the identifier is returned in `raw_*` for
 * the caller to resolve or to report as unverifiable. An unresolvable identity
 * is reported, never silently passed — a silent pass is how this defect lived.
 *
 * @return array<int,array{id:?string,file:?string,raw_id:?string,raw_file:?string}>
 */
function init_sites(string $win): array
{
    $out = [];
    $len = strlen($win);
    $off = 0;
    while (($hit = strpos($win, 'Diagram.init', $off)) !== false) {
        $off = $hit + 12;
        /* require an actual call: optional space, '(', optional space, '{' */
        $i = $off;
        while ($i < $len && ($win[$i] === ' ' || $win[$i] === "\t")) { $i++; }
        if ($i >= $len || $win[$i] !== '(') { continue; }
        $i++;
        while ($i < $len && ($win[$i] === ' ' || $win[$i] === "\t" || $win[$i] === "\n" || $win[$i] === "\r")) { $i++; }
        if ($i >= $len || $win[$i] !== '{') { continue; }

        /* brace-match the argument object */
        $depth = 0;
        $end = -1;
        for ($j = $i; $j < $len; $j++) {
            $c = $win[$j];
            if ($c === '{') {
                $depth++;
            } elseif ($c === '}') {
                $depth--;
                if ($depth === 0) { $end = $j; break; }
            }
        }
        if ($end < 0) { continue; }          /* truncated — the carry will re-present it */
        $obj = substr($win, $i, $end - $i + 1);

        $site = ['id' => null, 'file' => null, 'raw_id' => null, 'raw_file' => null];
        foreach (['id', 'file'] as $k) {
            if (preg_match('~(?:^|[{,\s])' . $k . '\s*:\s*(["\'])([^"\']*)\1~', $obj, $mm)) {
                $site[$k] = $mm[2];
            } elseif (preg_match('~(?:^|[{,\s])' . $k . '\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]~', $obj, $mm)) {
                $site['raw_' . $k] = $mm[1];
            }
        }
        if ($site['id'] !== null || $site['file'] !== null
            || $site['raw_id'] !== null || $site['raw_file'] !== null) {
            $out[] = $site;
        }
    }
    return $out;
}

function scan_file(string $path): array
{
    $patterns = [
        '~<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']~i',
        '~<link\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']~i',
        '~<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']~i',
        /* fetch(…) and its wrapper functions (safeFetch, jsonFetch, …) */
        '~\b\w*fetch\s*\(\s*["\'`]((?:https?:)?//[^"\'`\s]+)~i',
        /* XMLHttpRequest: xhr.open("GET", url) */
        '~\.open\s*\(\s*["\'](?:GET|POST|PUT|DELETE|HEAD|PATCH)["\']\s*,\s*["\']((?:https?:)?//[^"\']+)~i',
    ];

    /* weak evidence only — never used to raise a warning against a tool */
    $mention_re = '~["\'`](https?://[^"\'`\s]+)~i';

    $offsite = [];
    $mentions = false;
    $common = false;
    $disclaimer = false;
    $init = [];        /* keyed by id|file so the OVERLAP carry cannot double-count */
    $consts = [];      /* SCREAMING_CASE = 'literal', for `Diagram.init({id: ID})` */

    $fh = @fopen($path, 'rb');
    if ($fh === false) {
        return ['offsite' => [], 'mentions' => false, 'loads_common' => false,
                'loads_disclaimer' => false, 'init' => []];
    }
    $carry = '';
    while (!feof($fh)) {
        $buf = (string) fread($fh, CHUNK);
        if ($buf === '') {
            break;
        }
        $win = $carry . $buf;

        if (preg_match('~<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*\bdiagram-common\.js\b~i', $win)) {
            $common = true;
        }
        if (preg_match('~<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*\bsite-disclaimer\.js\b~i', $win)) {
            $disclaimer = true;
        }
        foreach ($patterns as $re) {
            if (preg_match_all($re, $win, $mm)) {
                foreach ($mm[1] as $u) {
                    if (is_offsite($u)) {
                        $u = trim($u);
                        if (strlen($u) > 200) {
                            $u = substr($u, 0, 200) . '…';
                        }
                        $offsite[$u] = true;
                    }
                }
            }
        }
        foreach (init_sites($win) as $site) {
            $key = ($site['id'] ?? $site['raw_id'] ?? '') . '|' . ($site['file'] ?? $site['raw_file'] ?? '');
            $init[$key] = $site;
        }
        if (preg_match_all('~\b([A-Z][A-Z0-9_]*)\s*=\s*(["\'])([^"\']*)\2~', $win, $mm, PREG_SET_ORDER)) {
            foreach ($mm as $one) {
                $consts[$one[1]] = $one[3];
            }
        }
        if (!$mentions && preg_match_all($mention_re, $win, $mm)) {
            foreach ($mm[1] as $u) {
                if (is_offsite($u)) {
                    $mentions = true;
                    break;
                }
            }
        }
        $carry = substr($win, -OVERLAP);
    }
    fclose($fh);

    /* resolve `{id: ID, file: FILE}` against the literals assigned to those names */
    foreach ($init as $k => $site) {
        foreach (['id', 'file'] as $f) {
            if ($site[$f] === null && $site['raw_' . $f] !== null
                && isset($consts[$site['raw_' . $f]])) {
                $init[$k][$f] = $consts[$site['raw_' . $f]];
            }
        }
    }

    return ['offsite' => array_keys($offsite), 'mentions' => $mentions,
            'loads_common' => $common, 'loads_disclaimer' => $disclaimer,
            'init' => array_values($init)];
}

function catalog_language_list_ok($v): bool
{
    if (!is_array($v) || count($v) < 1) return false;
    $seen = [];
    foreach ($v as $l) {
        if (!is_string($l) || !in_array($l, LANGS, true) || isset($seen[$l])) return false;
        $seen[$l] = true;
    }
    return isset($seen['en']);
}

function tool_language_list_ok($v): bool
{
    /* Domain languages may include a tool-local language which is not a global
       site language (the current estate has several legacy Russian UIs). Such
       a language is not added to the global picker or catalogue by this fact. */
    if (!is_array($v) || count($v) < 1) return false;
    $seen = [];
    foreach ($v as $l) {
        if (!is_string($l) || !preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/', $l) || isset($seen[$l])) return false;
        $seen[$l] = true;
    }
    return isset($seen['en']);
}

function site_tool_languages_are_catalogued(array $tool, array $catalog): bool
{
    $catalog_set = array_fill_keys($catalog, true);
    foreach ($tool as $l) {
        if (in_array($l, LANGS, true) && !isset($catalog_set[$l])) return false;
    }
    return true;
}

function all_langs(array $m, string $key, array $langs): bool
{
    if (!isset($m[$key]) || !is_array($m[$key])) return false;
    foreach ($langs as $l) {
        if (!isset($m[$key][$l]) || !is_string($m[$key][$l]) || trim($m[$key][$l]) === '') return false;
    }
    return true;
}

/* --------------------------------------------------------------------- scan */

$files = glob($root . '/*.html') ?: [];
sort($files, SORT_STRING);

foreach ($files as $path) {
    $file = basename($path);
    if (in_array($file, SKIP, true)) {
        continue;
    }

    $tool_warnings = [];

    $head = head_of($path, HEAD_BYTES);
    if ($head === '') {
        continue;
    }
    $json = manifest_text($head);
    if ($json === null) {
        /* Not a tool (or the manifest is past 256 KiB). Silent for plain pages,
           but say so when the file clearly wants to be one. */
        if (strpos($head, 'diagram-tool-manifest') !== false) {
            err($file, 'manifest_unreadable', 'A diagram-tool-manifest block exists but could not be extracted from the first 256 KiB.');
        }
        continue;
    }

    $m = json_decode($json, true);
    if (!is_array($m)) {
        err($file, 'manifest_json', 'Manifest is not parseable JSON: ' . json_last_error_msg() . '.');
        continue;
    }
    /* every id a page on disk claims, listed or not, so a workflow edge to a tool
       that exists but is held out of the catalogue by an error is not reported a
       second time as an unknown tool */
    if (isset($m['id']) && is_string($m['id']) && $m['id'] !== '') {
        $known_ids[$m['id']] = $file;
    }

    /* ---- schema version ------------------------------------------------ */
    $schema = isset($m['schema']) && is_string($m['schema']) ? $m['schema'] : '';
    if ($schema === MANIFEST_V2) {
        $v = 2;
    } elseif ($schema === MANIFEST_V1) {
        $v = 1;
    } else {
        err($file, 'schema', 'Unknown manifest schema "' . $schema . '"; expected ' . MANIFEST_V1 . ' or ' . MANIFEST_V2 . '.');
        continue;
    }

    /* ---- v1 fields, unchanged ------------------------------------------ */
    foreach (['manifest_revision', 'id', 'file', 'category', 'intended_use',
              'catalog_languages', 'tool_languages', 'dependencies', 'network_access'] as $req) {
        if (!array_key_exists($req, $m)) {
            err($file, 'missing_field', 'Required manifest field "' . $req . '" is absent.');
            continue 2;
        }
    }
    if (!isset($m['file']) || $m['file'] !== $file) {
        err($file, 'file_mismatch', 'manifest.file is "' . (string) ($m['file'] ?? '') . '" but the deployed filename is "' . $file . '".');
        continue;
    }
    if (!in_array($m['category'], CATEGORIES, true)) {
        err($file, 'category', 'Category "' . (string) $m['category'] . '" is not one of: ' . implode(', ', CATEGORIES) . '.');
        continue;
    }
    if (!catalog_language_list_ok($m['catalog_languages']) || !tool_language_list_ok($m['tool_languages'])) {
        err($file, 'languages', 'catalog_languages must be a non-empty unique subset of the site language registry (' . implode(', ', LANGS) . ') and include en; tool_languages must be a non-empty unique list of language codes and include en.');
        continue;
    }
    if (!site_tool_languages_are_catalogued($m['tool_languages'], $m['catalog_languages'])) {
        err($file, 'languages', 'Every global site language declared in tool_languages must also be declared in catalog_languages. Tool-local extra languages are allowed but do not become site languages.');
        continue;
    }
    foreach (['title', 'summary', 'description', 'limitations'] as $k) {
        if (!all_langs($m, $k, $m['catalog_languages'])) {
            err($file, 'languages', 'Field "' . $k . '" must carry every language declared in catalog_languages (' . implode(', ', $m['catalog_languages']) . ').');
            continue 2;
        }
    }

    $scan = scan_file($path);

    /* A declared local dependency that is not there makes the entry unusable —
       the tool would load and fail. The only exception is SERVER_DATA: datasets
       maintained on the server that a framework deploy deliberately does not
       ship (AGENTS.md §9). Those are reported, not fatal. */
    $dep_missing = [];
    foreach ((array) $m['dependencies'] as $dep) {
        $dep = (string) $dep;
        if (trim($dep) === '') {
            continue;
        }
        $p = $root . '/' . rtrim($dep, '/');
        if (file_exists($p)) {
            continue;
        }
        if (in_array($dep, SERVER_DATA, true) || in_array(rtrim($dep, '/') . '/', SERVER_DATA, true)) {
            warn($file, 'dependency_missing_server_data',
                'Declared dependency "' . $dep . '" is not present in this deployment tree; it is a server-maintained dataset (AGENTS.md §9) and must be preserved on the server.');
            continue;
        }
        $dep_missing[] = $dep;
    }
    if ($dep_missing) {
        err($file, 'dependency_missing',
            'Declared local dependency ' . implode(', ', array_map(static fn($d) => '"' . $d . '"', $dep_missing))
            . ' is not present in the site root. dependencies lists local files deployed beside the HTML; a library fetched from a CDN belongs in network_access.note.');
        continue;
    }

    /* ---- status ladder (§3) -------------------------------------------- */
    $status = isset($m['status']) && is_string($m['status']) ? $m['status'] : 'prototype';
    if (!in_array($status, STATUSES, true)) {
        err($file, 'status', 'Status "' . $status . '" is not one of: ' . implode(', ', STATUSES) . '.');
        continue;
    }

    $validation = (isset($m['validation']) && is_array($m['validation'])) ? $m['validation'] : [];
    $benchmarks = (isset($validation['benchmarks']) && is_array($validation['benchmarks']))
        ? array_values($validation['benchmarks']) : [];

    $indep = false;
    if (array_key_exists('independent_validation', $validation)) {
        $indep = (bool) $validation['independent_validation'];
    } elseif (array_key_exists('independent_validation', $m)) {
        $indep = (bool) $m['independent_validation']; /* v1 mirror, kept one release */
    }
    if (array_key_exists('independent_validation', $m)
        && array_key_exists('independent_validation', $validation)
        && ((bool) $m['independent_validation']) !== ((bool) $validation['independent_validation'])) {
        warn($file, 'independent_validation_mirror',
            'Top-level independent_validation disagrees with validation.independent_validation; the validation object wins.');
    }

    /* benchmark entries: normalise, and confirm the artifact exists and parses */
    $bench_out = [];
    $bench_fatal = null;
    $cases_total = 0;
    $cases_passed = 0;
    foreach ($benchmarks as $i => $b) {
        if (!is_array($b)) {
            $bench_fatal = 'validation.benchmarks[' . $i . '] is not an object.';
            break;
        }
        $cases  = isset($b['cases']) ? (int) $b['cases'] : 0;
        $passed = isset($b['passed']) ? (int) $b['passed'] : 0;
        $art    = isset($b['artifact']) ? (string) $b['artifact'] : '';
        $art_ok = false;
        $prov_missing = [];
        $prov_bad = null;
        $prov_build_mismatch = [];
        $art_page_out = null;
        $page_rev_out = null;
        $art_run_at = null;
        $art_run_field = null;
        if ($art !== '') {
            $ap = $root . '/' . ltrim($art, '/');
            if (!is_file($ap)) {
                $bench_fatal = 'validation.benchmarks[' . $i . '].artifact "' . $art . '" does not exist.';
                break;
            }
            $raw = head_of($ap, 64 * 1048576);
            $art_doc = json_decode($raw, true);
            if ($art_doc === null && strtolower(trim($raw)) !== 'null') {
                $bench_fatal = 'validation.benchmarks[' . $i . '].artifact "' . $art . '" is not parseable JSON.';
                break;
            }
            $art_ok = true;
            /* ---- provenance on the artifact (§5) ---------------------------------
             * §5 requires the artifact to carry run_at, build, reference_provenance
             * and a one-sentence provenance_note.  Nothing in this tree looked, and
             * no driver wrote any of it: the four fields were absent from every
             * driver's output, so the values added to eighteen artifacts by hand on
             * 2026-10-03 were one re-run from gone, and three re-runs that same round
             * dropped exactly those fields.  The drivers write them now
             * (bench-src/provenance.mjs); this names an artifact that does not carry
             * them, so a dropped field is visible instead of silent.
             *
             * `generated_at` is accepted in place of `run_at`: the older artifacts
             * date the run under that name.
             *
             * A warning and not an error: the field is evidence ABOUT the evidence,
             * and delisting a tool over it would hide the tool and the gap together.
             */
            if (is_array($art_doc)) {
                foreach (['run_at', 'generated_at'] as $rf) {
                    $rv = $art_doc[$rf] ?? null;
                    if (is_string($rv) && $rv !== '') { $art_run_at = $rv; $art_run_field = $rf; break; }
                }
                $has_run = $art_run_at !== null;
                if (!$has_run) $prov_missing[] = 'run_at';
                foreach (['build', 'manifest_revision', 'reference_provenance', 'provenance_note'] as $pf) {
                    $pv = $art_doc[$pf] ?? null;
                    if ($pv === null || $pv === '' || $pv === []) $prov_missing[] = $pf;
                }
                $rp = $art_doc['reference_provenance'] ?? null;
                if (is_string($rp) && $rp !== ''
                    && !in_array($rp, ['recomputed', 'recorded', 'mixed'], true)) {
                    $prov_bad = $rp;
                }

                /* ---- the build named against the page it names (§5) -----------------
                 * The check above measures whether the four fields are present.  This one
                 * measures them against the tree.  An artifact names a page — its own
                 * `file`, or the page whose manifest points at it — and that page declares
                 * a manifest_revision.  Where the artifact's `build` or `manifest_revision`
                 * is a different string, the artifact states that it graded a build the
                 * page is not.
                 *
                 * The shared stamp read the revision from the page file next to the driver
                 * and never consulted the page the browser fetched, so a driver pointed at
                 * another tree produced an artifact naming this tree's revision: a run
                 * against a page declaring 2026-08-14.taxonomy1 wrote
                 * build 2026-10-03.prototype-1.  Nothing in this tree looked, and the field
                 * the whole ladder rests on — "is this true of the page you are reading" —
                 * was free to say anything.
                 *
                 * An error and not a warning: the presence check reports a field that is
                 * missing, and a reader can see that it is missing.  A build that
                 * disagrees is a statement about which page was graded, it reads as
                 * evidence, and §5's benchmarked tier is built on it.  A tool is withheld
                 * from the catalogue until the artifact and the page agree.
                 */
                $art_page = (isset($art_doc['file']) && is_string($art_doc['file'])
                             && preg_match('~\\.html$~i', $art_doc['file']))
                    ? basename($art_doc['file'])
                    : $file;
                $page_rev = page_manifest_revision($root, $art_page);
                $art_page_out = $art_page;
                $page_rev_out = $page_rev;
                if ($page_rev !== null) {
                    foreach (['build', 'manifest_revision'] as $bf) {
                        $bv = $art_doc[$bf] ?? null;
                        if (is_string($bv) && $bv !== '' && $bv !== $page_rev) {
                            $prov_build_mismatch[] = $bf . ' "' . $bv . '"';
                        }
                    }
                }
            }
        }
        $cases_total  += $cases;
        $cases_passed += $passed;
        $bench_out[] = [
            'id'         => isset($b['id']) ? (string) $b['id'] : ('benchmark-' . $i),
            'reference'  => isset($b['reference']) ? bench_text($b['reference']) : '',
            'citations'  => isset($b['citations']) && is_array($b['citations']) ? array_values($b['citations']) : [],
            'cases'      => $cases,
            'passed'     => $passed,
            'complete'   => ($cases > 0 && $passed === $cases),
            'tolerance'  => isset($b['tolerance']) ? bench_text($b['tolerance']) : '',
            /* ---- the run date comes off the artifact (§5) ------------------------
             * One piece of evidence, two dates.  The manifest entry's `run_at` is a
             * string inside the page, typed by whoever last edited the page, and no
             * code in this tree writes it; the artifact's `run_at` is written by
             * bench-src/provenance.mjs at the moment the run finishes.  The register
             * (validation.html) rendered the manifest's and the report
             * (benchmark.html) prefers the artifact's, so re-running a driver moved
             * one date and left the other, and the two pages quoted different runs
             * for the same evidence: 11 of 96 entries disagreed at day level, the
             * widest by 53 days (regelkring, manifest 2026-08-11, artifact
             * 2026-10-03).  The disagreement grew as tools were re-run honestly.
             *
             * The artifact wins because the artifact is the only one of the two that
             * a run writes.  Writing the date into the page instead would make
             * re-running a benchmark edit the page, which moves manifest_revision,
             * which makes every artifact graded against the old revision stale: the
             * run would invalidate its own evidence.  So the register now reads what
             * the run produced, the manifest entry is a fallback for an artifact
             * that carries no date at all, `run_at_source` says which was used, and
             * `run_at_manifest` keeps the page's own string visible rather than
             * silently discarded.
             *
             * benchmark_run_at_drift (below) names the pages whose manifest string
             * now disagrees with the run, so the dead field cannot drift unseen. */
            'run_at'     => ($art_run_at !== null) ? (string) $art_run_at
                             : (isset($b['run_at']) ? (string) $b['run_at'] : ''),
            'run_at_source' => ($art_run_at !== null) ? ('artifact:' . $art_run_field)
                             : ((isset($b['run_at']) && $b['run_at'] !== '') ? 'manifest' : ''),
            'run_at_manifest' => isset($b['run_at']) ? (string) $b['run_at'] : '',
            'artifact'   => $art,
            'artifact_ok' => $art_ok,
            'provenance_missing' => $prov_missing,
            'provenance_enum_bad' => $prov_bad,
            'provenance_build_mismatch' => $prov_build_mismatch,
            'provenance_page' => $art_page_out,
            'provenance_page_revision' => $page_rev_out,
        ];
    }
    if ($bench_fatal !== null) {
        err($file, 'benchmark_artifact', $bench_fatal);
        continue;
    }

    /* The build an artifact names, against the page it names. */
    $build_fatal = null;
    foreach ($bench_out as $b) {
        if (empty($b['provenance_build_mismatch'])) {
            continue;
        }
        $build_fatal = 'Artifact "' . $b['artifact'] . '" declares '
            . implode(' and ', $b['provenance_build_mismatch'])
            . ', while the page it names, ' . $b['provenance_page']
            . ', declares manifest_revision "' . $b['provenance_page_revision']
            . '". The artifact states that it graded a build that page is not; AGENTS §5 asks '
            . 'whether the benchmark is true of the page the reader is reading. Re-run the driver '
            . 'against this build, or publish the artifact beside the build it graded.';
        break;
    }
    if ($build_fatal !== null) {
        if ($status === 'benchmarked' || $status === 'verified') {
            err($file, 'benchmark_build_mismatch', $build_fatal);
            continue;
        }
        warn($file, 'benchmark_build_mismatch', $build_fatal);
    }

    $all_complete = count($bench_out) > 0;
    foreach ($bench_out as $b) {
        if (!$b['complete']) {
            $all_complete = false;
        }
        if ($b['reference'] === '' || count($b['citations']) === 0) {
            $all_complete = false;
        }
    }

    if (($status === 'benchmarked' || $status === 'verified') && !$all_complete) {
        err($file, 'status_unsupported',
            'Status "' . $status . '" requires at least one validation.benchmarks entry with passed == cases (> 0), a named reference and at least one citation.');
        continue;
    }
    if ($status === 'verified') {
        $review = isset($validation['review']) ? $validation['review'] : null;
        if (!is_array($review) && (!is_string($review) || trim((string) $review) === '')) {
            err($file, 'verified_without_review',
                'Status "verified" additionally requires validation.review documenting a review by someone other than the author.');
            continue;
        }
    }
    /* ---- 2026-08-22: status_understated is GONE, and what replaced it -------
     *
     * `status_understated` fired when a prototype's benchmark entries all
     * passed, and invited the author to publish it as "benchmarked".  It was
     * removed because every instance it ever produced was a false positive,
     * and because the thing it was inviting is not decidable from what it
     * looked at.
     *
     * At the moment of removal it fired on five tools and was wrong about all
     * five.  `neutron_transport`: neutron-data/ is empty in this deployment, so
     * no transport result -- the tool's entire headline claim -- has ever been
     * executed; what passes is a data-integrity benchmark of the tables the
     * page carries by itself.  `cfd`: the graded cases are conservation
     * identities and one published cavity, the scene definitions had to be
     * reconstructed, and the run is on a software rasteriser.  `roomacoustics`:
     * 29 of its 229 checks prove only that the tool integrates its OWN declared
     * scheme, and a priority-1 defect is open.  `nuclideatlas` and
     * `smrselector`: nobody has re-executed either since the port.  In every
     * case the artifact says plainly why the status is what it is, and the
     * warning contradicted it on the strength of a count.
     *
     * The general point: a passing benchmark is NECESSARY for "benchmarked",
     * never SUFFICIENT.  Whether the cases cover the claim, whether the
     * reference was independent, and whether the run happened against the build
     * that is shipping are all outside what a pass count can see.  A checker
     * that pushes a status up on a count it cannot interpret is a checker that
     * manufactures overclaims.
     *
     * What replaces it checks the one thing that IS decidable here, and checks
     * it in the direction that can only ever remove an overclaim:
     *
     *   benchmark_evidence_stale  the tool claims "benchmarked"/"verified"
     *                             while the run_at of one of its cited
     *                             benchmarks is OLDER than the date its own
     *                             manifest_revision carries.  Evidence that
     *                             predates the build it is attached to answers
     *                             "was this true of some earlier page", not
     *                             "is this true of the page you are reading".
     *   benchmark_undated         the same claim with no parseable run date at
     *                             all, so freshness cannot be established
     *                             either way.
     *
     * KNOWN LIMIT, stated because it matters more than the check does: this
     * compares against manifest_revision, and a manifest_revision is only as
     * honest as the person who bumps it.  In this tree 43 of 53 pages were
     * rewritten for the diagram-ui port between 2026-08-15 and 2026-08-21
     * without their revision moving, so their evidence is older than their code
     * and this check cannot see it.  It under-reports; it does not
     * over-report.  The ledger in STATUS.md carries the full picture.
     */
    $revday = (preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) ($m['manifest_revision'] ?? ''), $mm))
        ? $mm[1] : null;
    if ($status === 'benchmarked' || $status === 'verified') {
        foreach ($bench_out as $b) {
            $runday = (preg_match('/^(\d{4}-\d{2}-\d{2})/', (string) $b['run_at'], $rm)) ? $rm[1] : null;
            if ($runday === null) {
                warn($file, 'benchmark_undated',
                    'Status "' . $status . '" rests on benchmark "' . $b['id']
                    . '", which declares no parseable run_at, so it cannot be shown to have been run against this build.');
            } elseif ($revday !== null && $runday < $revday) {
                warn($file, 'benchmark_evidence_stale',
                    'Status "' . $status . '" rests on benchmark "' . $b['id'] . '", run ' . $runday
                    . ', while manifest_revision is ' . $revday
                    . ': the evidence predates the build it is published against.');
            }
        }
    }

    /* One warning per ARTIFACT, not per benchmark entry: roofstormwater names the same
       artifact from four entries and printed the same gap four times. */
    $prov_seen = [];
    foreach ($bench_out as $b) {
        if ($b['artifact'] === '') continue;
        if (isset($prov_seen[$b['artifact']])) continue;
        $prov_seen[$b['artifact']] = true;
        if (!empty($b['provenance_missing'])) {
            warn($file, 'benchmark_provenance_incomplete',
                'Artifact "' . $b['artifact'] . '" does not carry '
                . implode(', ', $b['provenance_missing'])
                . '. AGENTS §5 requires an artifact to name the build it was executed against'
                . ' and where its reference values come from.');
        }
        if ($b['provenance_enum_bad'] !== null) {
            warn($file, 'benchmark_provenance_enum',
                'Artifact "' . $b['artifact'] . '" declares reference_provenance "'
                . $b['provenance_enum_bad'] . '"; §5 allows recomputed, recorded or mixed.');
        }
        /* The page's own run_at string against the date the run wrote.  The register
           no longer renders the page's string, so a disagreement can no longer put two
           dates in front of a reader; it is still a stale sentence inside the page, and
           this is where it is named.  Day level, because the two values are a hand-typed
           timestamp and a machine one and agreeing to the second is not the claim. */
        if ($b['run_at_source'] !== '' && strpos($b['run_at_source'], 'artifact:') === 0
            && $b['run_at_manifest'] !== ''
            && preg_match('/^(\d{4}-\d{2}-\d{2})/', $b['run_at'], $rd1)
            && preg_match('/^(\d{4}-\d{2}-\d{2})/', $b['run_at_manifest'], $rd2)
            && $rd1[1] !== $rd2[1]) {
            warn($file, 'benchmark_run_at_drift',
                'Artifact "' . $b['artifact'] . '" was run ' . $rd1[1]
                . ', while this page\'s validation.benchmarks entry still says ' . $rd2[1]
                . '. The register and the report both quote the artifact now, so no reader sees two '
                . 'dates; the string in the page is out of date and nothing writes it. Remove it, or '
                . 'set it to the run.');
        }
    }

    /* ---- report (§1.3) -------------------------------------------------- */
    $report = (isset($m['report']) && is_array($m['report'])) ? $m['report'] : [];
    $report_out = [
        'pdf'                => (bool) ($report['pdf'] ?? false),
        'source_attribution' => (bool) ($report['source_attribution'] ?? false),
    ];
    if ($report_out['pdf'] && !$scan['loads_common']) {
        warn($file, 'report_without_runtime',
            'report.pdf is true but the HTML does not load diagram-common.js, which provides the report and its mandatory source attribution.');
    }
    if ($report_out['pdf'] && !$report_out['source_attribution']) {
        warn($file, 'report_without_attribution',
            'report.pdf is true while report.source_attribution is false; source attribution on every page is mandatory.');
    }

    /* ---- python export (§1.4) ------------------------------------------- */
    $pe = (isset($m['python_export']) && is_array($m['python_export'])) ? $m['python_export'] : [];
    $py_out = [
        'supported' => (bool) ($pe['supported'] ?? false),
        'reason'    => $pe['reason'] ?? null,
        'requires'  => isset($pe['requires']) && is_array($pe['requires']) ? array_values($pe['requires']) : [],
    ];
    if (!$py_out['supported'] && $v === 2 && ($py_out['reason'] === null || $py_out['reason'] === '')) {
        warn($file, 'python_export_reason', 'python_export.supported is false without a reason; §1.4 asks for a one-line reason.');
    }
    /* §1.4.0: the exported script runs on a bare python3, standard library only. A surviving
       dependency is an exception and has to be argued for, not merely declared. */
    if ($v === 2 && $py_out['requires']) {
        warn($file, 'python_export_requires',
            'python_export.requires names ' . implode(', ', $py_out['requires'])
            . '; §1.4.0 requires the exported script to run on a bare python3 (standard library only). '
            . 'Port the missing piece, scope the export with covers / a per-state decline, or decline outright — '
            . 'and if the dependency really must stay, the provider must supply requires_reason so the generated header can justify it.');
    }

    /* ---- handoff (§1.5) -------------------------------------------------- */
    $ho = (isset($m['handoff']) && is_array($m['handoff'])) ? $m['handoff'] : [];
    $provides = isset($ho['provides']) && is_array($ho['provides']) ? array_values($ho['provides']) : [];
    $accepts  = isset($ho['accepts']) && is_array($ho['accepts']) ? array_values($ho['accepts']) : [];

    $bad_accepts = [];
    foreach ($accepts as $q) {
        if (!in_array($q, QUANTITIES, true)) {
            $bad_accepts[] = (string) $q;
        }
    }
    if ($bad_accepts) {
        warn($file, 'handoff_vocabulary',
            'handoff.accepts names quantities outside the §1.5 vocabulary: ' . implode(', ', $bad_accepts)
            . '. The runtime will not offer those quantities; the rest of the tool is unaffected.');
    }
    $bad_provides = [];
    foreach ($provides as $q) {
        if (!in_array($q, QUANTITIES, true)) {
            $bad_provides[] = (string) $q;
        }
    }
    if ($bad_provides) {
        warn($file, 'handoff_vocabulary_provides',
            'handoff.provides names quantities outside the §1.5 vocabulary: ' . implode(', ', $bad_provides) . '.');
    }

    /* ---- project package (TZ-project-package.md §6) ---------------------- */
    $pp = (isset($m['project_package']) && is_array($m['project_package'])) ? $m['project_package'] : [];
    $pp_out = null;
    if ($pp) {
        $pp_reads  = isset($pp['reads']) && is_array($pp['reads']) ? array_values($pp['reads']) : [];
        $pp_writes = isset($pp['writes']) && is_array($pp['writes']) ? array_values($pp['writes']) : [];
        if (($pp['schema'] ?? '') !== PKG_SCHEMA) {
            warn($file, 'project_package_schema',
                'project_package.schema is "' . (string) ($pp['schema'] ?? '') . '"; expected ' . PKG_SCHEMA
                . '. The runtime compares this for equality and will ignore the declaration.');
        }
        $bad_reads = [];
        foreach ($pp_reads as $s) {
            if (!in_array($s, PKG_SECTIONS, true)) { $bad_reads[] = (string) $s; }
        }
        if ($bad_reads) {
            warn($file, 'project_package_reads',
                'project_package.reads names sections outside the §2 vocabulary: ' . implode(', ', $bad_reads)
                . '. A reads entry is always a whole section, never a dotted path.');
        }
        $bad_writes = [];
        $framework_writes = [];
        foreach ($pp_writes as $s) {
            $s = (string) $s;
            if (in_array($s, PKG_SUBPATHS, true)) { continue; }
            /* a framework-written section: only the page's own key is declarable */
            $s_root = explode('.', $s)[0];
            if (in_array($s_root, PKG_FRAMEWORK_SECTIONS, true)) {
                if ($s === $s_root . '.' . (string) $m['id']) { continue; }
                $framework_writes[] = $s;
                continue;
            }
            if (in_array($s, PKG_SECTIONS, true)) { continue; }
            $bad_writes[] = $s;
        }
        if ($bad_writes) {
            warn($file, 'project_package_writes',
                'project_package.writes names sections outside the §2 vocabulary: ' . implode(', ', $bad_writes) . '.');
        }
        /* The name is in the §2 vocabulary; nobody owns it whole. Saying "outside
           the vocabulary" here sends the author looking for a typo. */
        if ($framework_writes) {
            warn($file, 'project_package_writes',
                'project_package.writes names ' . implode(', ', $framework_writes)
                . '. The framework writes ' . implode(', ', PKG_FRAMEWORK_SECTIONS)
                . ' on behalf of each tool, so no manifest owns the section whole; the one declarable path is "'
                . PKG_FRAMEWORK_SECTIONS[0] . '.' . (string) $m['id'] . '", which the runtime grants without a declaration.');
        }
        /* §6 item 5: a tool that writes a register and never reads it back tells
           the user on every reload that it is discarding data it wrote itself. */
        $unread = [];
        foreach ($pp_writes as $s) {
            $pp_root = explode('.', (string) $s)[0];
            /* the runtime hands every caller its own calculations key back */
            if (in_array($pp_root, PKG_FRAMEWORK_SECTIONS, true)) { continue; }
            if (!in_array($pp_root, $pp_reads, true)) { $unread[] = $pp_root; }
        }
        if ($unread) {
            warn($file, 'project_package_write_without_read',
                'project_package writes ' . implode(', ', array_unique($unread))
                . ' but does not read it back, so a reload reports the tool\'s own data as ignored.');
        }
        $pp_out = ['schema' => (string) ($pp['schema'] ?? ''), 'reads' => $pp_reads, 'writes' => $pp_writes];
    }

    /* ---- state codec ----------------------------------------------------- */
    $sc = (isset($m['state_codec']) && is_array($m['state_codec'])) ? $m['state_codec'] : [];
    $sc_out = [
        'permalink' => (bool) ($sc['permalink'] ?? false),
        'record'    => isset($sc['record']) ? (string) $sc['record'] : '',
    ];
    if ($sc_out['permalink'] && !$scan['loads_common']) {
        warn($file, 'permalink_without_runtime',
            'state_codec.permalink is true but the HTML does not load diagram-common.js.');
    }
    if ($sc_out['record'] !== '' && $sc_out['record'] !== RECORD_SCHEMA) {
        warn($file, 'record_schema', 'state_codec.record is "' . $sc_out['record'] . '"; the current record schema is ' . RECORD_SCHEMA . '.');
    }

    /* ---- network access must be accurate (§2) ---------------------------- */
    $na = is_array($m['network_access']) ? $m['network_access'] : ['mode' => (string) $m['network_access']];
    $mode = isset($na['mode']) ? (string) $na['mode'] : 'none';
    if (!in_array($mode, NET_MODES, true)) {
        warn($file, 'network_access_mode',
            'network_access.mode is "' . $mode . '"; the vocabulary is: ' . implode(', ', NET_MODES) . '.');
    }
    if ($mode !== 'external' && $scan['offsite']) {
        warn($file, 'network_access_false',
            'network_access.mode is "' . $mode . '" but the page really loads off-site URLs: '
            . implode(', ', array_slice($scan['offsite'], 0, 6))
            . (count($scan['offsite']) > 6 ? ' (+' . (count($scan['offsite']) - 6) . ' more)' : '')
            . '. Either remove the external dependency or declare mode "external" with a note.');
    }
    if ($mode === 'external' && !$scan['offsite'] && !$scan['mentions']) {
        warn($file, 'network_access_overstated',
            'network_access.mode is "external" but the page contains no off-site URL at all; if the external dependency has been removed, declare mode "none".');
    }
    /* the note may be a plain string or a per-language object */
    $has_note = false;
    foreach (['note', 'notes'] as $nk) {
        if (isset($na[$nk]) && (is_array($na[$nk]) ? count($na[$nk]) > 0 : trim((string) $na[$nk]) !== '')) {
            $has_note = true;
        }
    }
    if ($mode !== 'none' && !$has_note) {
        warn($file, 'network_access_note', 'network_access.mode is "' . $mode . '" without a note naming what is fetched, transmitted or downloaded.');
    }
    if ($mode === 'none' && $has_note) {
        warn($file, 'network_access_stale_note',
            'network_access.mode is "none" but a note is still present. A note describes what the tool fetches; a leftover one from a removed dependency tells the reader something that is no longer true.');
    }
    if ($mode === 'same-origin-data' && !array_filter((array) $m['dependencies'])) {
        warn($file, 'network_access_no_dependencies',
            'network_access.mode is "same-origin-data" but the manifest declares no dependencies; that mode means the tool fetches its own declared local files.');
    }
    if (!$scan['loads_disclaimer']) {
        warn($file, 'no_site_disclaimer', 'The HTML does not load site-disclaimer.js.');
    }

    /* ---- Diagram.init() identity ----------------------------------------
       `manifest.file` is checked against the deployed filename above, but the
       manifest is not what the runtime reads first. diagram-common.js resolves
       toolId()/toolFile() as `CFG.id || manifest.id` and `CFG.file ||
       manifest.file`, where CFG is whatever Diagram.init() was handed — so an
       init call that disagrees with the manifest overrides a manifest this
       catalog has just certified, and it does so on the surfaces a reader is
       most likely to trust: the "Source:" URL stamped on every printed page and
       every page of every record report, the permalink, the benchmark-report
       link behind the status chip, and the record's own tool.id/tool.file.

       This is a warning, not an error: the page works, the catalog entry built
       from the manifest is sound, and dropping the tool would be the worse
       outcome (see the class definitions at the top). It is a provenance
       defect, and provenance is exactly what a warning is for. */
    foreach ($scan['init'] as $site) {
        if ($site['file'] === null && $site['raw_file'] !== null) {
            warn($file, 'init_identity_unresolved',
                'Diagram.init() passes file: ' . $site['raw_file'] . ', a name this scanner could not resolve to a literal, so the source URL the tool signs itself with could not be verified.');
        } elseif ($site['file'] !== null) {
            if (!is_file(__DIR__ . '/' . $site['file'])) {
                warn($file, 'init_file_missing',
                    'Diagram.init() declares file: "' . $site['file'] . '", which is not present in the tree. That string becomes the "Source:" URL on every printed page and in every calculation record, so the tool cites a link that 404s.');
            }
            if ($site['file'] !== $file) {
                warn($file, 'init_file_mismatch',
                    'Diagram.init() declares file: "' . $site['file'] . '" but the page is deployed as "' . $file . '".');
            }
        }
        if ($site['id'] === null && $site['raw_id'] !== null) {
            warn($file, 'init_identity_unresolved',
                'Diagram.init() passes id: ' . $site['raw_id'] . ', a name this scanner could not resolve to a literal, so the identity the tool signs itself with could not be verified.');
        } elseif ($site['id'] !== null && $site['id'] !== (string) $m['id']) {
            warn($file, 'init_id_mismatch',
                'Diagram.init() declares id: "' . $site['id'] . '" but manifest.id is "' . (string) $m['id'] . '". The init value wins at runtime, so the benchmark-report link (benchmark.html?tool=…) and the record\'s tool.id use an identifier this catalog does not publish.');
        }
    }

    if (!(isset($m['listed']) ? (bool) $m['listed'] : true)) {
        continue; /* parsed and valid, but deliberately not in the catalog */
    }

    /* ---- emit ------------------------------------------------------------ */
    $entry = $m;                       /* every v1 field is passed through unchanged */
    $entry['manifest_version'] = $v;
    $entry['status'] = $status;
    $entry['independent_validation'] = $indep;
    $entry['validation'] = [
        'basis'                  => $validation['basis'] ?? null,
        'independent_validation' => $indep,
        'benchmarks'             => $bench_out,
        'cases'                  => $cases_total,
        'passed'                 => $cases_passed,
        'complete'               => $all_complete,
        'review'                 => $validation['review'] ?? null,
    ];
    $entry['report'] = $report_out;
    $entry['python_export'] = $py_out;
    $entry['handoff'] = ['provides' => $provides, 'accepts' => $accepts];
    $entry['project_package'] = $pp_out;
    $entry['state_codec'] = $sc_out;
    $entry['runtime'] = [
        'site_disclaimer' => $scan['loads_disclaimer'],
        'diagram_common'  => $scan['loads_common'],
    ];
    $entry['network_access'] = $na;
    $entry['offsite_references'] = $scan['offsite'];
    /* every non-fatal defect found above, carried on the tool itself so the
       index and validation.html can flag it without re-reading the file */
    $entry['warnings'] = $tool_warnings;
    $entry['order'] = isset($m['order']) ? (int) $m['order'] : 9999;
    $tools[] = $entry;
}

/* ---- project package, across the whole catalogue -------------------------
   The runtime refuses a bad PATCH; only this can catch a bad DECLARATION.
   A single-array owner declaring the whole section is legal to the runtime and
   wrong: its ordinary save would replace the other owner's array. */
$pkg_writers = [];
$pkg_readers = [];
foreach ($tools as $t) {
    $pp = $t['project_package'] ?? null;
    if (!$pp) { continue; }
    foreach ($pp['writes'] as $w) { $pkg_writers[(string) $w][] = $t['file']; }
    foreach ($pp['reads'] as $r)  { $pkg_readers[(string) $r][] = $t['file']; }
}
foreach ($pkg_writers as $section => $files) {
    if (count($files) > 1) {
        foreach ($files as $f) {
            warn($f, 'project_package_two_writers',
                'Section "' . $section . '" is written by ' . count($files) . ' tools (' . implode(', ', $files)
                . '). A register has exactly one writer; a whole-array write from a legitimate owner is '
                . 'indistinguishable from a correct one, so the register must be split.');
        }
    }
}
foreach (PKG_SPLIT_SECTIONS as $split) {
    $whole = $pkg_writers[$split] ?? [];
    $dotted = [];
    foreach ($pkg_writers as $section => $files) {
        if (strpos((string) $section, $split . '.') === 0) { $dotted = array_merge($dotted, $files); }
    }
    if ($whole && $dotted) {
        foreach ($whole as $f) {
            warn($f, 'project_package_whole_section_write',
                'Declares the whole section "' . $split . '" while ' . implode(', ', array_unique($dotted))
                . ' declare an array inside it. Declare the array you own (' . implode(' or ', PKG_SUBPATHS)
                . '); the runtime cannot refuse a declaration, only a patch.');
        }
    }
}
foreach ($pkg_readers as $section => $files) {
    if (in_array((string) $section, PKG_FRAMEWORK_SECTIONS, true)) { continue; }
    $written = false;
    foreach ($pkg_writers as $w => $_) {
        if ((string) $w === (string) $section || strpos((string) $w, $section . '.') === 0) { $written = true; break; }
    }
    if (!$written) {
        foreach ($files as $f) {
            warn($f, 'project_package_read_never_written',
                'Reads section "' . $section . '", which no catalogued tool writes.');
        }
    }
}

/* ---- workflow graph (TZ-engineering-workflow.md §5) ----------------------
   workflow-map.json annotates the existing estate centrally; a tool may carry
   the same fields in its own manifest `workflow`, and for that tool the
   manifest wins field by field. Every tool entry gets `workflow` (null when
   neither source names it). Warnings raised here are attached to the tool
   entry they concern as well as to the site-wide list. */
function wf_list($v): array
{
    if (!is_array($v)) { return []; }
    $out = [];
    foreach ($v as $x) {
        if (is_string($x) && $x !== '' && !in_array($x, $out, true)) { $out[] = $x; }
    }
    return $out;
}
function wf_langs_ok($o): bool
{
    if (!is_array($o)) { return false; }
    foreach (LANGS as $l) {
        if (!isset($o[$l]) || !is_string($o[$l]) || trim($o[$l]) === '') { return false; }
    }
    return true;
}
/* workflow-map.json is hand-written JSON: any value there can be an array where
   a string is expected. `(string) []` raises "Array to string conversion", and
   with display_errors on at the host that notice lands inside the JSON body and
   every consumer of catalog.php fails to parse it. */
/* An empty PHP array serialises as [], so a label with no language at all would
   flip the type of `label` exactly where the data is already missing. */
function wf_obj(array $a)
{
    return $a === [] ? new stdClass() : $a;
}
function wf_str($v): string
{
    if (is_string($v)) { return $v; }
    if (is_int($v) || is_float($v)) { return (string) $v; }
    if (is_bool($v)) { return $v ? 'true' : 'false'; }
    if ($v === null) { return ''; }
    return '(' . gettype($v) . ')';
}
function wf_label($o): array
{
    $out = [];
    if (!is_array($o)) { return $out; }
    foreach (LANGS as $l) {
        if (isset($o[$l]) && is_string($o[$l]) && trim($o[$l]) !== '') { $out[$l] = $o[$l]; }
    }
    return $out;
}

$wf_map = null;
$wf_map_file = $root . '/' . WORKFLOW_FILE;
$wf_meta = ['schema' => WORKFLOW_SCHEMA, 'file' => WORKFLOW_FILE, 'loaded' => false, 'revision' => null];
if (is_file($wf_map_file)) {
    $raw = json_decode((string) @file_get_contents($wf_map_file), true);
    if (!is_array($raw)) {
        warn(WORKFLOW_FILE, 'workflow_map_invalid', WORKFLOW_FILE . ' is not parseable JSON: ' . json_last_error_msg() . '. No workflow edges from the map are published.');
    } elseif (($raw['schema'] ?? '') !== WORKFLOW_SCHEMA) {
        warn(WORKFLOW_FILE, 'workflow_map_invalid', WORKFLOW_FILE . ' declares schema "' . wf_str($raw['schema'] ?? '') . '"; expected ' . WORKFLOW_SCHEMA . '. No workflow edges from the map are published.');
    } else {
        $wf_map = $raw;
        $wf_meta['loaded'] = true;
        $rev = $raw['revision'] ?? null;
        if ($rev !== null && !is_string($rev) && !is_int($rev) && !is_float($rev)) {
            warn(WORKFLOW_FILE, 'workflow_map_invalid', 'workflow-map.json revision is ' . gettype($rev) . ', not a string; the catalogue reports no map revision.');
            $rev = null;
        }
        $wf_meta['revision'] = $rev === null ? null : (string) $rev;
    }
}

/* stage vocabulary: the map's own list, restricted to the package lifecycle
   vocabulary; without a map, the lifecycle vocabulary itself */
$wf_stage_ids = [];
if ($wf_map !== null && isset($wf_map['stages']) && is_array($wf_map['stages'])) {
    foreach ($wf_map['stages'] as $st) {
        $st = wf_str($st);
        if (!in_array($st, PKG_LIFECYCLE, true)) {
            warn(WORKFLOW_FILE, 'workflow_unknown_stage', 'workflow-map.json stages names "' . $st . '", which is not in the project.lifecycle vocabulary (' . implode(', ', PKG_LIFECYCLE) . ').');
            continue;
        }
        if (!in_array($st, $wf_stage_ids, true)) { $wf_stage_ids[] = $st; }
    }
} else {
    $wf_stage_ids = PKG_LIFECYCLE;
}
$wf_stages_out = [];
foreach ($wf_stage_ids as $st) {
    $lab = ($wf_map !== null && isset($wf_map['stage_labels'][$st])) ? $wf_map['stage_labels'][$st] : null;
    if ($wf_map !== null && !wf_langs_ok($lab)) {
        warn(WORKFLOW_FILE, 'workflow_map_invalid', 'workflow-map.json stage_labels.' . $st . ' does not carry all seven languages (' . implode(', ', LANGS) . ').');
    }
    $wf_stages_out[] = ['id' => $st, 'label' => wf_obj(wf_label($lab))];
}
$wf_entries_out = [];
foreach (WORKFLOW_ENTRIES as $en) {
    $lab = ($wf_map !== null && isset($wf_map['entries'][$en])) ? $wf_map['entries'][$en] : null;
    if ($wf_map !== null && !wf_langs_ok($lab)) {
        warn(WORKFLOW_FILE, 'workflow_map_invalid', 'workflow-map.json entries.' . $en . ' does not carry all seven languages (' . implode(', ', LANGS) . ').');
    }
    $wf_entries_out[] = ['id' => $en, 'label' => wf_obj(wf_label($lab))];
}

$wf_index = [];                 /* tool id => index in $tools */
foreach ($tools as $i => $t) { $wf_index[(string) $t['id']] = $i; }
$wf_map_tools = ($wf_map !== null && isset($wf_map['tools']) && is_array($wf_map['tools'])) ? $wf_map['tools'] : [];
foreach ($wf_map_tools as $tid => $_) {
    $tid = (string) $tid;
    if (!isset($known_ids[$tid])) {
        warn(WORKFLOW_FILE, 'workflow_unknown_tool', 'workflow-map.json annotates tool "' . $tid . '", which no page in this tree declares as its manifest id.');
    }
}

$wf_edges = 0;              /* published edges, and how many carry no offer flag */
$wf_unflagged = 0;
$wf_nodes = 0;              /* tools with a workflow node, and how many name no medium */
$wf_nodes_no_medium = 0;

function wf_warn(array &$tools, int $i, string $code, string $msg): void
{
    global $warnings;
    $f = (string) $tools[$i]['file'];
    $warnings[] = ['file' => $f, 'code' => $code, 'message' => $msg];
    $tools[$i]['warnings'][] = ['code' => $code, 'message' => $msg];
}

/* merge, validate each node on its own */
foreach ($tools as $i => $t) {
    $tid = (string) $t['id'];
    $from_map = (isset($wf_map_tools[$tid]) && is_array($wf_map_tools[$tid])) ? $wf_map_tools[$tid] : null;
    if (isset($wf_map_tools[$tid]) && !is_array($wf_map_tools[$tid])) {
        wf_warn($tools, $i, 'workflow_map_invalid',
            'workflow-map.json tools.' . $tid . ' is ' . gettype($wf_map_tools[$tid]) . ', not an object; no edge is published for this tool from the map.');
    }
    $from_man = (isset($t['workflow']) && is_array($t['workflow'])) ? $t['workflow'] : null;
    if (isset($t['workflow']) && !is_array($t['workflow'])) {
        wf_warn($tools, $i, 'workflow_manifest_invalid', 'manifest.workflow is not an object; the workflow-map.json entry, if any, is used instead.');
    }
    if ($from_map === null && $from_man === null) {
        $tools[$i]['workflow'] = null;
        continue;
    }
    $src = $from_man !== null && $from_map !== null ? 'manifest+map' : ($from_man !== null ? 'manifest' : 'map');
    $w = array_merge($from_map ?? [], $from_man ?? []);
    /* The merge is field by field, so outputsTo can come from the manifest while
       carries/why still come from the map. Warning then names entries the tool's
       author never wrote; those entries are dropped without a word instead. */
    $field_src = static function (string $k) use ($from_man): string {
        return ($from_man !== null && array_key_exists($k, $from_man)) ? 'manifest' : 'map';
    };
    $out_src     = $field_src('outputsTo');
    $carries_src = $field_src('carries');
    $why_src     = $field_src('why');
    $offer_src   = $field_src('offer');
    $node = [
        'entry'      => isset($w['entry']) ? wf_str($w['entry']) : null,
        'lifecycle'  => wf_list($w['lifecycle'] ?? []),
        'inputsFrom' => wf_list($w['inputsFrom'] ?? []),
        'outputsTo'  => wf_list($w['outputsTo'] ?? []),
        'carries'    => [],
        'why'        => [],
        'medium'     => null,
        'offer'      => [],
        'offer_reason' => [],
        'source'     => $src,
    ];
    $wf_nodes++;
    if (array_key_exists('medium', $w)) {
        $m = wf_str($w['medium']);
        if (in_array($m, WORKFLOW_MEDIA, true)) {
            $node['medium'] = $m;
        } else {
            wf_warn($tools, $i, 'workflow_medium_invalid', 'workflow.medium is "' . $m . '"; the vocabulary is: ' . implode(', ', WORKFLOW_MEDIA) . '.');
        }
    }
    if ($node['medium'] === null) { $wf_nodes_no_medium++; }
    if ($node['entry'] !== null && !in_array($node['entry'], WORKFLOW_ENTRIES, true)) {
        wf_warn($tools, $i, 'workflow_unknown_entry', 'workflow.entry is "' . $node['entry'] . '"; the vocabulary is: ' . implode(', ', WORKFLOW_ENTRIES) . '.');
        $node['entry'] = null;
    }
    $bad = array_values(array_diff($node['lifecycle'], $wf_stage_ids));
    if ($bad) {
        wf_warn($tools, $i, 'workflow_unknown_stage', 'workflow.lifecycle names ' . implode(', ', $bad) . ', outside the stage vocabulary (' . implode(', ', $wf_stage_ids) . ').');
        $node['lifecycle'] = array_values(array_intersect($node['lifecycle'], $wf_stage_ids));
    }
    $dropped = [];               /* already reported; carries/why for them are not */
    foreach (['inputsFrom', 'outputsTo'] as $k) {
        $keep = [];
        foreach ($node[$k] as $o) {
            if ($o === $tid) {
                wf_warn($tools, $i, 'workflow_unknown_tool', 'workflow.' . $k . ' names the tool itself.');
                continue;
            }
            if (!isset($known_ids[$o])) {
                wf_warn($tools, $i, 'workflow_unknown_tool', 'workflow.' . $k . ' names "' . $o . '", which no page in this tree declares as its manifest id.');
                $dropped[] = $o;
                continue;
            }
            $keep[] = $o;
        }
        $node[$k] = $keep;
    }
    $carries = (isset($w['carries']) && is_array($w['carries'])) ? $w['carries'] : [];
    $carries_seen = [];
    foreach ($carries as $to => $how) {
        $carries_seen[] = (string) $to;
        $to = (string) $to; $how = wf_str($how);
        if (in_array($to, $dropped, true)) { continue; }
        if (!in_array($to, $node['outputsTo'], true)) {
            if ($carries_src === $out_src) {
                wf_warn($tools, $i, 'workflow_carries', 'workflow.carries names "' . $to . '", which is not in outputsTo.');
            }
            continue;
        }
        if (!in_array($how, WORKFLOW_CARRIES, true)) {
            wf_warn($tools, $i, 'workflow_carries', 'workflow.carries.' . $to . ' is "' . $how . '"; the vocabulary is: ' . implode(', ', WORKFLOW_CARRIES) . '.');
            continue;
        }
        $node['carries'][$to] = $how;
    }
    $why = (isset($w['why']) && is_array($w['why'])) ? $w['why'] : [];
    foreach ($why as $to => $txt) {
        $to = (string) $to;
        if (in_array($to, $dropped, true)) { continue; }
        if (!in_array($to, $node['outputsTo'], true)) {
            if ($why_src === $out_src) {
                wf_warn($tools, $i, 'workflow_why', 'workflow.why names "' . $to . '", which is not in outputsTo.');
            }
            continue;
        }
        if (!wf_langs_ok($txt)) {
            wf_warn($tools, $i, 'workflow_why', 'workflow.why.' . $to . ' does not carry all seven languages (' . implode(', ', LANGS) . ').');
        }
        $node['why'][$to] = wf_obj(wf_label($txt));
    }
    foreach ($node['outputsTo'] as $to) {
        if (!isset($node['why'][$to])) {
            wf_warn($tools, $i, 'workflow_why', 'workflow.outputsTo names "' . $to . '" without a why sentence for the edge.');
        }
        if (!in_array($to, $carries_seen, true)) {
            wf_warn($tools, $i, 'workflow_carries', 'workflow.outputsTo names "' . $to . '" without saying in carries what crosses the edge (' . implode(', ', WORKFLOW_CARRIES) . ').');
        }
    }
    /* §5.1: an edge with no flag is offered, which is what the toolbar did
       before the addendum; a refused edge stays in the graph and names why. */
    $offer  = (isset($w['offer']) && is_array($w['offer'])) ? $w['offer'] : [];
    $reason = (isset($w['offer_reason']) && is_array($w['offer_reason'])) ? $w['offer_reason'] : [];
    $offer_seen = [];
    foreach ($offer as $to => $flag) {
        $to = (string) $to;
        if (in_array($to, $dropped, true)) { continue; }
        if (!in_array($to, $node['outputsTo'], true)) {
            if ($offer_src === $out_src) {
                wf_warn($tools, $i, 'workflow_offer', 'workflow.offer names "' . $to . '", which is not in outputsTo.');
            }
            continue;
        }
        if (!is_bool($flag)) {
            wf_warn($tools, $i, 'workflow_offer', 'workflow.offer.' . $to . ' is "' . wf_str($flag) . '", not true or false; the edge is offered.');
            continue;
        }
        $offer_seen[$to] = $flag;
    }
    foreach ($node['outputsTo'] as $to) {
        $wf_edges++;
        if (!array_key_exists($to, $offer_seen)) { $wf_unflagged++; }
        $flag = $offer_seen[$to] ?? true;
        $node['offer'][$to] = $flag;
        if ($flag) { continue; }
        $r = isset($reason[$to]) ? wf_str($reason[$to]) : '';
        if (trim($r) === '') {
            wf_warn($tools, $i, 'workflow_offer', 'workflow.offer.' . $to . ' is false and offer_reason says nothing; the toolbar hides the edge without a recorded reason.');
        } else {
            $node['offer_reason'][$to] = $r;
        }
    }
    if ($node['carries'] === []) { $node['carries'] = new stdClass(); }
    if ($node['why'] === [])     { $node['why'] = new stdClass(); }
    if ($node['offer'] === [])   { $node['offer'] = new stdClass(); }
    if ($node['offer_reason'] === []) { $node['offer_reason'] = new stdClass(); }
    $tools[$i]['workflow'] = $node;
}

/* across the graph: every edge must be stated from both ends, and a handoff
   edge must share at least one quantity */
foreach ($tools as $i => $t) {
    $node = $t['workflow'];
    if (!is_array($node)) { continue; }
    $tid = (string) $t['id'];
    foreach ($node['outputsTo'] as $to) {
        if (!isset($wf_index[$to])) { continue; }          /* held out of the catalogue */
        $other = $tools[$wf_index[$to]]['workflow'];
        if (!is_array($other) || !in_array($tid, $other['inputsFrom'], true)) {
            wf_warn($tools, $i, 'workflow_edge_asymmetric', 'workflow.outputsTo names "' . $to . '", whose inputsFrom does not name "' . $tid . '".');
        }
        $how = is_array($node['carries']) ? ($node['carries'][$to] ?? null) : null;
        $offered = (is_array($node['offer']) ? ($node['offer'][$to] ?? true) : true) !== false;
        if ($how === 'handoff') {
            $common = array_values(array_intersect((array) $t['handoff']['provides'], (array) $tools[$wf_index[$to]]['handoff']['accepts']));
            if (!$common) {
                wf_warn($tools, $i, 'workflow_handoff_no_quantities', 'workflow.carries.' . $to . ' is "handoff", but no quantity this tool provides is one "' . $to . '" accepts; the toolbar opens it as an ordinary link.');
            } elseif ($offered && is_array($other)) {
                /* W-1 and W-2 are read here, never applied: the map decides, and
                   an offered edge that breaks either rule is named so the map can
                   be corrected in one place. */
                $mine = $node['medium']; $theirs = $other['medium'] ?? null;
                $bound = array_values(array_intersect($common, WORKFLOW_MEDIUM_BOUND));
                if ($bound && is_string($mine) && is_string($theirs) && $mine !== $theirs
                    && $mine !== 'any' && $theirs !== 'any') {
                    wf_warn($tools, $i, 'workflow_offer', 'workflow.outputsTo offers "' . $to . '" carrying ' . implode(', ', $bound) . ', which is medium-bound, from medium "' . $mine . '" to medium "' . $theirs . '" (§5.1 W-1).');
                }
                if (!array_diff($common, WORKFLOW_STATE_POINT)) {
                    $ocat = (string) $tools[$wf_index[$to]]['category'];
                    $pkg_edge = ($how === 'package')
                        || (is_array($other['carries'] ?? null) && ($other['carries'][$tid] ?? null) === 'package');
                    if ($ocat !== (string) $t['category'] && !$pkg_edge) {
                        wf_warn($tools, $i, 'workflow_offer', 'workflow.outputsTo offers "' . $to . '" on ' . implode(', ', $common) . ' alone, across categories "' . (string) $t['category'] . '" and "' . $ocat . '", with no package edge between them (§5.1 W-2).');
                    }
                }
            }
        }
    }
    foreach ($node['inputsFrom'] as $from) {
        if (!isset($wf_index[$from])) { continue; }
        $other = $tools[$wf_index[$from]]['workflow'];
        if (!is_array($other) || !in_array($tid, $other['outputsTo'], true)) {
            wf_warn($tools, $i, 'workflow_edge_asymmetric', 'workflow.inputsFrom names "' . $from . '", whose outputsTo does not name "' . $tid . '".');
        }
    }
}

/* §5.1 is a property of the map, so a map that predates it is reported once
   with a figure rather than once per tool or per edge. */
if ($wf_unflagged > 0) {
    warn(WORKFLOW_FILE, 'workflow_offer_missing',
        $wf_unflagged . ' of ' . $wf_edges . ' published edges carry no offer flag (TZ-engineering-workflow.md §5.1); every one of them is offered.');
}
if ($wf_nodes_no_medium > 0) {
    warn(WORKFLOW_FILE, 'workflow_medium_missing',
        $wf_nodes_no_medium . ' of ' . $wf_nodes . ' tools with a workflow node name no medium (§5.1 W-1); the medium rule is not checked on their edges.');
}

/* order ascending, ties broken by filename — the v1 ordering */
usort($tools, static function (array $a, array $b): int {
    $c = $a['order'] <=> $b['order'];
    return $c !== 0 ? $c : strcmp((string) $a['file'], (string) $b['file']);
});

$out = [
    'schema'       => CATALOG_SCHEMA,
    'generated_at' => gmdate('c'),
    'revision'     => CATALOG_REVISION,
    'manifest_schemas' => [MANIFEST_V1, MANIFEST_V2],
    'quantities'   => QUANTITIES,
    'counts'       => ['tools' => count($tools), 'errors' => count($errors), 'warnings' => count($warnings)],
    'tools'        => $tools,
    'workflow_map'     => $wf_meta,
    'workflow_stages'  => $wf_stages_out,
    'workflow_entries' => $wf_entries_out,
    'workflow_media'   => WORKFLOW_MEDIA,
    'workflow_medium_bound' => WORKFLOW_MEDIUM_BOUND,
];
if ($errors) {
    $out['errors'] = $errors;
}
if ($warnings) {
    $out['warnings'] = $warnings;
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), "\n";
