#!/usr/bin/env python3
"""Independent reference for normenwijzer.html — DATA-INTEGRITY benchmark.

This tool computes no physics: it is a navigator over a corpus of legal instruments,
standards, sector guidance, calculation methods and rules of thumb.  The reference
therefore is a re-implementation, from the published data file alone, of

  * the record schema every entry must satisfy,
  * the referential closure of the corpus (scenario -> document, key condition ->
    document/scenario, facet value -> subject actually carried by a record),
  * the registry filter semantics (section / category / domain / geography / query),
  * the task-facet selection semantics (expected / not-expected verdict per subject),
  * the six-language catalogue completeness.

Nothing here reads the tool's own selection functions; the semantics are written out
again from the documented meaning of the facet table (option = [id, expects[],
does-not-expect[]]) and compared with what the page actually renders in the DOM.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, re, sys, unicodedata, itertools, os

SITE = _gp.SITE_ROOT
OUT = _gp.ref('normenwijzer_ref.json')

html = open(os.path.join(SITE, 'normenwijzer.html'), encoding='utf8').read()
data = json.load(open(os.path.join(SITE, 'normenwijzer-data.json'), encoding='utf8'))


def const(name):
    m = re.search(r'^var ' + name + r'=(.*?);\s*$', html, re.M)
    if not m:
        raise SystemExit('constant %s not found' % name)
    return json.loads(m.group(1))


CATS = const('CATS')
STATUS = const('STATUS')
DOMS = const('DOMS')
GEOS = const('GEOS')
AREAS = const('AREAS')
FACETS = const('FACETS')
SUBJ = const('SUBJ')
TPSUBJ = const('TPSUBJ')
FKEYS = const('FKEYS')
SCEN = const('SCEN')
LAYERS = const('LAYERS')
SRCFILES = const('SRCFILES')
BANNED = const('BANNED')
LANGS = const('LANGS')
DEFAULT_LANG = 'en'

DOCS = data['docs']
PROV = data['prov']
I18N = data['i18n']
TITLES = data['titles']
DESC = data['desc']
PTX = data['ptx']
SCN = data['scn']

report = {}

# ---------------------------------------------------------------- 1. record schema
DOC_REQUIRED = ['id', 'cat', 'st', 'geo', 'org', 'ar', 'dom', 'chk', 'fc']
DOC_OPTIONAL = ['idn']
FC_VALUES = sorted({d.get('fc') for d in DOCS})
CHK_VALUES = sorted({c for d in DOCS for c in d.get('chk', [])})
ORG_VALUES = sorted({d.get('org') for d in DOCS})

doc_errors = []
seen = {}
for d in DOCS:
    for k in DOC_REQUIRED:
        if k not in d or d[k] is None or d[k] == '' or (isinstance(d[k], list) and not d[k]):
            doc_errors.append('%s: missing/empty required field %s' % (d.get('id'), k))
    extra = [k for k in d if k not in DOC_REQUIRED + DOC_OPTIONAL]
    if extra:
        doc_errors.append('%s: unexpected field(s) %s' % (d.get('id'), extra))
    if not re.fullmatch(r'N\d{2,3}', str(d.get('id', ''))):
        doc_errors.append('%s: id does not match N<digits>' % d.get('id'))
    if d.get('id') in seen:
        doc_errors.append('%s: duplicate id' % d.get('id'))
    seen[d.get('id')] = 1
    if d.get('cat') not in CATS:
        doc_errors.append('%s: cat %r not in CATS' % (d.get('id'), d.get('cat')))
    if d.get('st') not in STATUS:
        doc_errors.append('%s: st %r not in STATUS' % (d.get('id'), d.get('st')))
    if d.get('geo') not in GEOS:
        doc_errors.append('%s: geo %r not in GEOS' % (d.get('id'), d.get('geo')))
    for a in d.get('ar', []):
        if a not in AREAS:
            doc_errors.append('%s: area %r not in AREAS' % (d.get('id'), a))
    for x in d.get('dom', []):
        if x not in DOMS:
            doc_errors.append('%s: domain %r not in DOMS' % (d.get('id'), x))

PROV_REQUIRED = ['id', 'ly', 'cat', 'st', 'tp', 'or', 'wl', 'v', 'docs', 'scen']
prov_errors = []
pseen = {}
for r in PROV:
    for k in PROV_REQUIRED:
        if k not in r:
            prov_errors.append('%s: missing required field %s' % (r.get('id'), k))
    if not re.fullmatch(r'(PV|RQ|CG)-\d{2,3}', str(r.get('id', ''))):
        prov_errors.append('%s: id does not match (PV|RQ|CG)-<digits>' % r.get('id'))
    else:
        # the id prefix and the provenance layer must agree: an RQ entry is quoted from a
        # published instrument (openlaw/paidstd), a PV or CG entry is traced to the worked
        # material (chapter)
        pref = str(r['id']).split('-')[0]
        want_chapter = pref in ('PV', 'CG')
        if want_chapter != (r.get('ly') == 'chapter'):
            prov_errors.append('%s: id prefix %s disagrees with layer %r' % (r['id'], pref, r.get('ly')))
    if r.get('id') in pseen:
        prov_errors.append('%s: duplicate id' % r.get('id'))
    pseen[r.get('id')] = 1
    if r.get('ly') not in LAYERS:
        prov_errors.append('%s: layer %r not in LAYERS' % (r.get('id'), r.get('ly')))
    if r.get('cat') not in CATS:
        prov_errors.append('%s: cat %r not in CATS' % (r.get('id'), r.get('cat')))
    if r.get('st') not in STATUS:
        prov_errors.append('%s: st %r not in STATUS' % (r.get('id'), r.get('st')))
    if r.get('tp') not in TPSUBJ:
        prov_errors.append('%s: tp %r has no TPSUBJ entry' % (r.get('id'), r.get('tp')))
    if not isinstance(r.get('v'), list) or not all(isinstance(x, list) and len(x) == 2 for x in r.get('v', [])):
        prov_errors.append('%s: value chips malformed' % r.get('id'))
    if r.get('tr') and r['tr'] not in SRCFILES:
        prov_errors.append('%s: traced file %r not in SRCFILES' % (r.get('id'), r['tr']))
    if r.get('tc') and r['tc'] not in SRCFILES:
        prov_errors.append('%s: condition file %r not in SRCFILES' % (r.get('id'), r['tc']))
    if not r.get('docs') and not r.get('scen'):
        prov_errors.append('%s: attached to neither a document nor a scenario' % r.get('id'))

SCEN_IDS = [s['id'] for s in SCEN]
DOC_IDS = [d['id'] for d in DOCS]
scen_errors = []
for s in SCEN:
    if not re.fullmatch(r'S\d{2}', s['id']):
        scen_errors.append('%s: id does not match S<2 digits>' % s['id'])
    for f in FACETS:
        if f['id'] not in s['set']:
            scen_errors.append('%s: preset does not set facet %s' % (s['id'], f['id']))
        else:
            v = s['set'][f['id']]
            opts = [o[0] for o in f['opts']]
            vals = v if isinstance(v, list) else [v]
            for x in vals:
                if x not in opts:
                    scen_errors.append('%s: facet %s value %r is not an option' % (s['id'], f['id'], x))
    for a in s.get('ar', []):
        if a not in AREAS:
            scen_errors.append('%s: highlighted area %r not in AREAS' % (s['id'], a))

report['schema'] = {'doc_errors': doc_errors, 'prov_errors': prov_errors, 'scen_errors': scen_errors,
                    'n_docs': len(DOCS), 'n_prov': len(PROV), 'n_scen': len(SCEN),
                    'fc_values': FC_VALUES, 'chk_values': CHK_VALUES, 'org_values': ORG_VALUES}

# ---------------------------------------------------------------- 2. dangling references
dangling = []
for r in PROV:
    for x in r.get('docs', []):
        if x not in DOC_IDS:
            dangling.append('key condition %s points at document %s which does not exist' % (r['id'], x))
    for x in r.get('scen', []):
        if x not in SCEN_IDS:
            dangling.append('key condition %s points at scenario %s which does not exist' % (r['id'], x))
for lang in LANGS:
    for sid in SCN.get(lang, {}):
        if sid not in SCEN_IDS:
            dangling.append('scenario text %s/%s has no scenario record' % (lang, sid))
    for did in TITLES.get(lang, {}):
        if did not in DOC_IDS:
            dangling.append('title %s/%s has no document record' % (lang, did))
    for did in DESC.get(lang, {}):
        if did not in DOC_IDS:
            dangling.append('description %s/%s has no document record' % (lang, did))
    for pid in PTX.get(lang, {}):
        if pid not in pseen:
            dangling.append('key-condition text %s/%s has no key-condition record' % (lang, pid))

# every facet value must name subjects that at least one record carries
def doc_subjects(d):
    out = list(d['dom'])
    for a in d['ar']:
        if a in SUBJ and a not in out:
            out.append(a)
    return out

carried = set()
for d in DOCS:
    carried |= set(doc_subjects(d))
facet_value_unused = []
for f in FACETS:
    for o in f['opts']:
        for s in o[1] + o[2]:
            if s not in SUBJ:
                facet_value_unused.append('facet %s/%s names subject %r which is not in SUBJ' % (f['id'], o[0], s))
            elif s not in carried:
                facet_value_unused.append('facet %s/%s names subject %r that no record carries' % (f['id'], o[0], s))
for tp, subs in TPSUBJ.items():
    for s in subs:
        if s not in SUBJ:
            facet_value_unused.append('TPSUBJ %s names subject %r which is not in SUBJ' % (tp, s))
subj_unused = [s for s in SUBJ if s not in carried]
area_unused = [a for a in AREAS if not any(a in d['ar'] for d in DOCS)]
dom_unused = [x for x in DOMS if not any(x in d['dom'] for d in DOCS)]
geo_unused = [g for g in GEOS if not any(g == d['geo'] for d in DOCS)]
cat_unused = [c for c in CATS if not any(c == d['cat'] for d in DOCS)]

report['references'] = {'dangling': dangling, 'facet_value_unused': facet_value_unused,
                        'subj_unused': subj_unused, 'area_unused': area_unused,
                        'dom_unused': dom_unused, 'geo_unused': geo_unused, 'cat_unused': cat_unused}

# ---------------------------------------------------------------- 3. i18n completeness
i18n_missing = {}
placeholders = []
# NB: the uppercase markers are matched case-sensitively on purpose — "todo" is an ordinary
# Spanish word and "tbd" occurs inside Ukrainian transliterations.
PLACE_RE = re.compile(r'(\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b|\bPLACEHOLDER\b|\btodo:|\btbd\b'
                      r'|(?i:lorem ipsum|untranslated|\bt\.b\.d\b)'
                      r'|\{\{[^}]*\}\}|<[a-z_]+>|%[A-Z_]+%)')
for lang in LANGS:
    if lang == DEFAULT_LANG:
        continue
    miss = sorted(set(I18N[DEFAULT_LANG]) - set(I18N.get(lang, {})))
    if miss:
        i18n_missing[lang] = miss
for lang in LANGS:
    for k, v in I18N.get(lang, {}).items():
        if not isinstance(v, str) or not v.strip():
            placeholders.append('i18n %s/%s is empty' % (lang, k))
        elif PLACE_RE.search(v):
            placeholders.append('i18n %s/%s looks like a placeholder: %r' % (lang, k, v[:60]))

pack_missing = {}
for name, pack in (('titles', TITLES), ('desc', DESC), ('ptx', PTX), ('scn', SCN)):
    for lang in LANGS:
        miss = sorted(set(pack[DEFAULT_LANG]) - set(pack.get(lang, {})))
        if miss:
            pack_missing.setdefault(name, {})[lang] = miss
        for k, v in pack.get(lang, {}).items():
            if isinstance(v, str):
                items = [v]
            elif isinstance(v, list):
                items = [x for x in v if isinstance(x, str)]
            elif isinstance(v, dict):
                items = [x for x in itertools.chain.from_iterable(
                    (y if isinstance(y, list) else [y]) for y in v.values()) if isinstance(x, str)]
            else:
                items = []
            for s in items:
                if not s.strip():
                    placeholders.append('%s %s/%s has an empty string' % (name, lang, k))
                elif PLACE_RE.search(s):
                    placeholders.append('%s %s/%s looks like a placeholder: %r' % (name, lang, k, s[:60]))

# untranslated leftovers: a non-English pack whose string is byte-identical to English
identical = {}
for name, pack in (('titles', TITLES), ('i18n', I18N)):
    for lang in LANGS:
        if lang == DEFAULT_LANG:
            continue
        same = [k for k, v in pack.get(lang, {}).items()
                if isinstance(v, str) and k in pack[DEFAULT_LANG]
                and isinstance(pack[DEFAULT_LANG][k], str)
                and v.strip() == pack[DEFAULT_LANG][k].strip() and len(v.strip()) > 12]
        if same:
            identical.setdefault(name, {})[lang] = sorted(same)

# every key the code asks for must exist in the reference language
literal_keys = set(re.findall(r'\bT\("([^"]+)"\)', html))
constructed = set()
for c in CATS:
    constructed |= {'cat_' + c}
for x in DOMS:
    constructed |= {'dom_' + x}
for g in GEOS:
    constructed |= {'geo_' + g}
for c in CHK_VALUES:
    constructed |= {'ck_' + c}
for v in FC_VALUES:
    constructed |= {'fc_' + v}
for f in FACETS:
    constructed |= {'fa_' + f['id']}
    constructed |= {o[0] for o in f['opts']}
constructed |= set(AREAS)
constructed |= set(ORG_VALUES)
for r in PROV:
    if r.get('or'):            # the origin line is optional and is guarded in the renderer
        constructed |= {r['or']}
    constructed |= {x[1] for x in r.get('v', []) if isinstance(x[1], str) and x[1].strip()}
    if r.get('ly'):
        constructed |= {'ly_' + r['ly']}
for st in STATUS:
    constructed |= {'st_' + st}
code_keys = sorted(literal_keys | constructed)
missing_in_ref = sorted(k for k in code_keys if k not in I18N[DEFAULT_LANG])

report['i18n'] = {'langs': LANGS, 'reference_language': DEFAULT_LANG,
                  'n_keys_reference': len(I18N[DEFAULT_LANG]),
                  'missing_per_language': i18n_missing,
                  'pack_missing': pack_missing,
                  'placeholders': placeholders,
                  'identical_to_reference': identical,
                  'code_keys': code_keys,
                  'code_keys_missing_in_data': missing_in_ref}

# banned wording must not appear in any catalogue string
def fold(s):
    x = unicodedata.normalize('NFD', str(s).lower())
    return ''.join(ch for ch in x if not unicodedata.combining(ch))

# scope: the corpus content, not the interface chrome.  The interface strings legitimately
# quote the banned wording in order to deny it ("this does not apply to your project"), so
# i18n is excluded here exactly as the tool's own v4e check excludes it.
banned_hits = []
for name, pack in (('titles', TITLES), ('desc', DESC), ('ptx', PTX), ('scn', SCN)):
    for lang in LANGS:
        for k, v in pack.get(lang, {}).items():
            blob = json.dumps(v, ensure_ascii=False)
            f = fold(blob)
            for b in BANNED:
                if fold(b) in f:
                    banned_hits.append('%s %s/%s contains banned wording %r' % (name, lang, k, b))
report['banned'] = banned_hits

# ---------------------------------------------------------------- 4. registry filters
def haystack(d, lang='en'):
    p = [d['id'], d.get('idn', ''), TITLES[lang].get(d['id'], TITLES['en'].get(d['id'], '')),
         TITLES['en'].get(d['id'], ''), I18N[lang].get(d['org'], I18N['en'].get(d['org'], '')),
         I18N['en'].get(d['org'], '')]
    return fold(' '.join(p))


def qhit(hay, q):
    q = fold(q).strip()
    if not q:
        return True
    for t in q.split():
        cuts = [t]
        if len(t) >= 4:
            cuts.append(t[:-1])
        if len(t) >= 6:
            cuts.append(t[:-2])
        if not any(len(c) >= 2 and c in hay for c in cuts):
            return False
    return True


def filter_expected(sec='', cat='', dom='', geo='', q='', lang='en'):
    out = []
    for d in DOCS:
        if sec and sec not in d['ar']:
            continue
        if cat and d['cat'] != cat:
            continue
        if dom and dom not in d['dom']:
            continue
        if geo and d['geo'] != geo:
            continue
        if q and not qhit(haystack(d, lang), q):
            continue
        out.append(d['id'])
    # the page groups by category in CATS order, keeping data order inside a group
    order = {c: i for i, c in enumerate(CATS)}
    byid = {d['id']: d for d in DOCS}
    pos = {d['id']: i for i, d in enumerate(DOCS)}
    out.sort(key=lambda i: (order[byid[i]['cat']], pos[i]))
    return out


filter_cases = []
filter_cases.append({'id': 'all', 'f': {}})
for a in AREAS:
    filter_cases.append({'id': 'sec_' + a, 'f': {'sec': a}})
for c in CATS:
    filter_cases.append({'id': 'cat_' + c, 'f': {'cat': c}})
for x in DOMS:
    filter_cases.append({'id': 'dom_' + x, 'f': {'dom': x}})
for g in GEOS:
    filter_cases.append({'id': 'geo_' + g, 'f': {'geo': g}})
for q in ['iso', 'en 1822', 'atex', 'ISO 14644', '9001', 'zzzznothing', 'directive',
          'nen', 'vdi', 'cleanroom', 'iso 16890', 'imo', 'iaea', '852/2004', 'filtr']:
    filter_cases.append({'id': 'q_' + re.sub(r'\W+', '_', q), 'f': {'q': q}})
# combinations, including the empty result and the everything-selected case
combos = [
    {'cat': 'std', 'geo': 'intl'},
    {'cat': 'law', 'geo': 'eu'},
    {'sec': 'ar_ex', 'cat': 'law'},
    {'sec': 'ar_cleanroom', 'dom': 'clean'},
    {'sec': 'ar_nuc', 'cat': 'rule'},
    {'cat': 'law', 'dom': 'clean', 'geo': 'us'},
    {'sec': 'ar_marine', 'cat': 'std', 'geo': 'intl'},
    {'sec': 'ar_hyg', 'dom': 'hyg', 'geo': 'eu', 'q': 'regulation'},
    {'cat': 'method', 'dom': 'nuc'},
    {'sec': 'ar_energy', 'cat': 'guide', 'dom': 'chem', 'geo': 'us', 'q': 'zzz'},
]
for i, c in enumerate(combos):
    filter_cases.append({'id': 'combo_%d' % (i + 1), 'f': c})
for fc in filter_cases:
    fc['expected'] = filter_expected(**fc['f'])
    fc['n'] = len(fc['expected'])

report['filters'] = filter_cases

# ---------------------------------------------------------------- 5. task facet selection
def verdicts(state, lift=None):
    lift = lift or {}
    y, n, why = {}, {}, {}
    for f in FACETS:
        v = state.get(f['id'])
        ch = list(v or []) if f.get('multi') else ([v] if v else [])
        for o in f['opts']:
            if o[0] not in ch:
                continue
            for s in o[1]:
                y[s] = 1
            for s in o[2]:
                n[s] = 1
                why[s] = {'f': f['id'], 'o': o[0]}
    v, lifted = {}, {}
    for s in SUBJ:
        if s in n and lift.get(s):
            v[s] = 1
            lifted[s] = 1
        elif s in n:
            v[s] = -1
        elif s in y:
            v[s] = 1
        else:
            v[s] = 0
    return v, why, lifted


def selection_of(state, lift=None):
    v, why, lifted = verdicts(state, lift)
    sel, exc = [], []
    for d in DOCS:
        su = doc_subjects(d)
        neg = [s for s in su if v[s] == -1]
        pos = [s for s in su if v[s] == 1]
        if neg:
            exc.append({'id': d['id'], 'neg': neg})
        elif pos:
            sel.append(d['id'])
    return sel, exc, v


task_cases = []
empty = {f['id']: ([] if f.get('multi') else '') for f in FACETS}
task_cases.append({'id': 'task_empty', 'state': dict(empty)})
for s in SCEN:
    st = {f['id']: (list(s['set'][f['id']]) if f.get('multi') else s['set'][f['id']]) for f in FACETS}
    task_cases.append({'id': 'task_' + s['id'], 'state': st, 'scenario': s['id']})
for f in FACETS:
    for o in f['opts']:
        st = dict(empty)
        st[f['id']] = [o[0]] if f.get('multi') else o[0]
        task_cases.append({'id': 'task_only_%s_%s' % (f['id'], o[0]), 'state': st})
# everything selected that can be selected at once (all multi values, last option of each single)
st = {f['id']: ([o[0] for o in f['opts']] if f.get('multi') else f['opts'][-1][0]) for f in FACETS}
task_cases.append({'id': 'task_all_selected', 'state': st})
for tc in task_cases:
    sel, exc, v = selection_of(tc['state'])
    tc['expected_selected'] = sel
    tc['expected_excluded'] = sorted(x['id'] for x in exc)
    tc['n_selected'] = len(sel)
    tc['verdicts'] = v

report['tasks'] = task_cases

# key conditions attached to each scenario / document (for the UI counts)
report['prov_index'] = {
    'by_doc': {d['id']: sorted(r['id'] for r in PROV if d['id'] in r.get('docs', [])) for d in DOCS},
    'by_scen': {s['id']: sorted(r['id'] for r in PROV if s['id'] in r.get('scen', [])) for s in SCEN},
}

# category tallies the UI shows
report['counts'] = {
    'total_docs': len(DOCS),
    'by_cat': {c: sum(1 for d in DOCS if d['cat'] == c) for c in CATS},
    'by_geo': {g: sum(1 for d in DOCS if d['geo'] == g) for g in GEOS},
    'by_status': {s: sum(1 for d in DOCS if d['st'] == s) for s in STATUS},
    'by_area': {a: sum(1 for d in DOCS if a in d['ar']) for a in AREAS},
    'by_dom': {x: sum(1 for d in DOCS if x in d['dom']) for x in DOMS},
    'total_prov': len(PROV),
    'total_scen': len(SCEN),
}

json.dump(report, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('wrote', OUT)
for k in ['doc_errors', 'prov_errors', 'scen_errors']:
    print(k, len(report['schema'][k]))
print('dangling', len(dangling), 'facet_value_unused', len(facet_value_unused))
print('subj_unused', subj_unused, 'area_unused', area_unused, 'dom_unused', dom_unused,
      'geo_unused', geo_unused, 'cat_unused', cat_unused)
print('i18n missing per language', {k: len(v) for k, v in i18n_missing.items()})
print('pack missing', {k: {l: len(v) for l, v in d.items()} for k, d in pack_missing.items()})
print('placeholders', len(placeholders))
print('identical', {k: {l: len(v) for l, v in d.items()} for k, d in identical.items()})
print('code keys missing in data', missing_in_ref[:40], len(missing_in_ref))
print('banned', len(banned_hits))
print('filter cases', len(filter_cases), 'task cases', len(task_cases))
