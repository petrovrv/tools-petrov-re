#!/usr/bin/env python3
"""Independent reference for kernnormenwijzer.html — DATA-INTEGRITY benchmark.

The tool computes nothing: it maps the normative landscape of nuclear projects by
facility type, lifecycle stage and jurisdiction.  The reference re-implements, from the
documented meaning of the taxonomy alone,

  * the record schema of the register, the studies, the bodies and the scenarios,
  * the referential closure (study -> body/document, code grid -> document, scenario ->
    facet value, catalogue text -> record),
  * the jurisdiction visibility rule (own layer + the layers above it),
  * the register filter semantics and the free-text search,
  * the facet verdict rule (an area is expected when the facet values that expect it
    outnumber those that do not),
  * six-language completeness.

Input: bench-src/ref/kernnormenwijzer_data.json, dumped from the page by
dump_kernnormenwijzer.mjs.  The data is the thing under test; the logic below is written
from the taxonomy's stated meaning and never calls the page's own functions.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, re, itertools, unicodedata

D = json.load(open(_gp.ref('kernnormenwijzer_data.json'), encoding='utf8'))
OUT = _gp.ref('kernnormenwijzer_ref.json')

LANGS, DEF = D['LANGS'], D['DEF']
CATS, GEOS, AREAS = D['CATS'], D['GEOS'], D['AREAS']
DOCS, T = D['DOCS'], D['T']
STUDIES, ST = D['STUDIES'], D['ST']
BODIES, BT = D['BODIES'], D['BT']
SCEN, SCT = D['SCEN'], D['SCT']
CODEGRID, ITEMS = D['CODEGRID'], D['ITEMS']
FEXP, FKEYS = D['FEXP'], D['FKEYS']
ORGN, ACCS, STATUS = D['ORGN'], D['ACCS'], D['STATUS']
EUMEM, DEPTH, DEPTHT = D['EUMEM'], D['DEPTH'], D['DEPTHT']
CLUSTERS = D['CLUSTERS']
UI = D['UI']

OBJ_IDS = [x[0] for x in D['OBJ']]
STAGE_IDS = [x[0] for x in D['STAGE']]
SITE_IDS = [x[0] for x in D['SITEF']]
FORM_IDS = [x[0] for x in D['FORM']]
NOV_IDS = [x[0] for x in D['NOV']]
ROLE_IDS = [x[0] for x in D['ROLE']]
SC_IDS = [x[0] for x in D['SC']]
DOC_IDS = [d['id'] for d in DOCS]
STUDY_IDS = [s['id'] for s in STUDIES]
BODY_IDS = [b['id'] for b in BODIES]

rep = {}

# ------------------------------------------------------------------ 1. record schema
DOC_REQ = ['id', 'cat', 'acc', 'st', 'geo', 'org', 'idn', 'ar', 'obj', 'stg']
doc_err, seen = [], {}
for d in DOCS:
    for k in DOC_REQ:
        if k not in d or d[k] in (None, '') or (isinstance(d[k], list) and not d[k]):
            doc_err.append('%s: missing/empty required field %s' % (d.get('id'), k))
    extra = [k for k in d if k not in DOC_REQ]
    if extra:
        doc_err.append('%s: unexpected field(s) %s' % (d['id'], extra))
    if not re.fullmatch(r'[A-Z]{1,3}\d{2,3}', str(d.get('id', ''))):
        doc_err.append('%s: id has an unexpected shape' % d.get('id'))
    if d['id'] in seen:
        doc_err.append('%s: duplicate id' % d['id'])
    seen[d['id']] = 1
    if d['cat'] not in CATS:
        doc_err.append('%s: category %r unknown' % (d['id'], d['cat']))
    if d['acc'] not in ACCS:
        doc_err.append('%s: access %r unknown' % (d['id'], d['acc']))
    if d['st'] not in STATUS:
        doc_err.append('%s: status %r unknown' % (d['id'], d['st']))
    if d['geo'] not in GEOS:
        doc_err.append('%s: jurisdiction %r unknown' % (d['id'], d['geo']))
    if d['org'] not in ORGN:
        doc_err.append('%s: issuing body %r has no name' % (d['id'], d['org']))
    for a in d['ar']:
        if a not in AREAS:
            doc_err.append('%s: subject area %r unknown' % (d['id'], a))
    for o in d['obj']:
        if o != '*' and o not in OBJ_IDS:
            doc_err.append('%s: facility type %r unknown' % (d['id'], o))
    for s in d['stg']:
        if s not in STAGE_IDS:
            doc_err.append('%s: lifecycle stage %r unknown' % (d['id'], s))

stu_err = []
for s in STUDIES:
    for k in ['id', 'stg', 'obj', 'ar', 'trig', 'nov', 'by', 'basis', 'bears']:
        if k not in s:
            stu_err.append('%s: missing field %s' % (s.get('id'), k))
    for a in s.get('ar', []):
        if a not in AREAS:
            stu_err.append('%s: subject area %r unknown' % (s['id'], a))
    for x in s.get('stg', []):
        if x not in STAGE_IDS:
            stu_err.append('%s: stage %r unknown' % (s['id'], x))
    for x in s.get('obj', []):
        if x != '*' and x not in OBJ_IDS:
            stu_err.append('%s: facility type %r unknown' % (s['id'], x))
    for x in s.get('trig', []):
        if x not in SITE_IDS:
            stu_err.append('%s: trigger %r is not a site characteristic' % (s['id'], x))
    for x in s.get('nov', []):
        if x not in NOV_IDS:
            stu_err.append('%s: novelty %r unknown' % (s['id'], x))

bod_err = []
for b in BODIES:
    for k in ['id', 'kind', 'geo', 'stg', 'ar']:
        if k not in b:
            bod_err.append('%s: missing field %s' % (b.get('id'), k))
    for x in b.get('stg', []):
        if x not in STAGE_IDS:
            bod_err.append('%s: stage %r unknown' % (b['id'], x))
    for a in b.get('ar', []):
        if a not in AREAS:
            bod_err.append('%s: subject area %r unknown' % (b['id'], a))
    if b.get('geo') not in GEOS:
        bod_err.append('%s: jurisdiction %r unknown' % (b['id'], b.get('geo')))

scen_err = []
FKMAP = {f[0]: (f[2], f[3]) for f in FKEYS}
VALID = {'obj': OBJ_IDS, 'stg': STAGE_IDS, 'geo': list(GEOS), 'role': ROLE_IDS,
         'nov': NOV_IDS, 'sc': SC_IDS, 'site': SITE_IDS, 'form': FORM_IDS}
for s in SCEN:
    for k in VALID:
        if k not in s['set']:
            scen_err.append('%s: preset does not set %s' % (s['id'], k))
            continue
        v = s['set'][k]
        for x in (v if isinstance(v, list) else [v]):
            if x and x not in VALID[k]:
                scen_err.append('%s: %s value %r is not an option' % (s['id'], k, x))

rep['schema'] = {'doc_errors': doc_err, 'study_errors': stu_err, 'body_errors': bod_err,
                 'scen_errors': scen_err, 'n_docs': len(DOCS), 'n_studies': len(STUDIES),
                 'n_bodies': len(BODIES), 'n_scen': len(SCEN)}

# ------------------------------------------------------------------ 2. cross references
dangling = []
for s in STUDIES:
    for x in s.get('by', []):
        if x not in BODY_IDS:
            dangling.append('study %s names body %s which does not exist' % (s['id'], x))
    for x in s.get('basis', []):
        if x not in DOC_IDS:
            dangling.append('study %s names basis document %s which does not exist' % (s['id'], x))
    for x in s.get('bears', []):
        if x not in DOC_IDS:
            dangling.append('study %s names bearing document %s which does not exist' % (s['id'], x))
for it, per_sc in CODEGRID.items():
    if it not in [x[0] for x in ITEMS]:
        dangling.append('code grid has an item category %r that is not in ITEMS' % it)
    for sc, per_l in per_sc.items():
        if sc not in SC_IDS:
            dangling.append('code grid item %s has safety class %r which is not an option' % (it, sc))
        for lvl, ids in per_l.items():
            for x in ids:
                if x not in DOC_IDS:
                    dangling.append('code grid %s/%s/%s names document %s which does not exist'
                                    % (it, sc, lvl, x))
for lang in LANGS:
    for k in T.get(lang, {}):
        if k not in DOC_IDS:
            dangling.append('document text %s/%s has no register record' % (lang, k))
    for k in ST.get(lang, {}):
        if k not in STUDY_IDS:
            dangling.append('study text %s/%s has no study record' % (lang, k))
    for k in BT.get(lang, {}):
        if k not in BODY_IDS:
            dangling.append('body text %s/%s has no body record' % (lang, k))
    for k in SCT.get(lang, {}):
        if k not in [s['id'] for s in SCEN]:
            dangling.append('scenario text %s/%s has no scenario record' % (lang, k))

# every facet value must be known to the expectation table, and every area it names must exist
facet_gaps = []
for k, ids in VALID.items():
    if k == 'geo':
        continue
    for v in ids:
        if v not in FEXP:
            facet_gaps.append('facet value %s has no entry in the expectation table' % v)
for v, pair in FEXP.items():
    for a in pair[0] + pair[1]:
        if a not in AREAS:
            facet_gaps.append('expectation table value %s names unknown area %r' % (v, a))
areas_no_doc = [a for a in AREAS if not any(a in d['ar'] for d in DOCS)]
areas_no_cluster = [a for a in AREAS if not any(a in c[2] for c in CLUSTERS)]
cluster_unknown_area = [a for c in CLUSTERS for a in c[2] if a not in AREAS]
cats_no_doc = [c for c in CATS if not any(d['cat'] == c for d in DOCS)]
geo_no_doc = [g for g in GEOS if not any(d['geo'] == g for d in DOCS)]
geo_no_depth = [g for g in GEOS if g not in DEPTH]
depth_unknown_class = [g for g, v in DEPTH.items() if v not in DEPTHT]
org_no_doc = [o for o in ORGN if not any(d['org'] == o for d in DOCS)]
stage_no_doc = [s for s in STAGE_IDS if not any(s in d['stg'] for d in DOCS)]
obj_no_doc = [o for o in OBJ_IDS
              if not any('*' in d['obj'] or o in d['obj'] for d in DOCS)]

rep['references'] = {'dangling': dangling, 'facet_gaps': facet_gaps,
                     'areas_without_a_document': areas_no_doc,
                     'areas_without_a_cluster': areas_no_cluster,
                     'clusters_naming_unknown_area': cluster_unknown_area,
                     'categories_without_a_document': cats_no_doc,
                     'jurisdictions_without_a_document': geo_no_doc,
                     'jurisdictions_without_a_declared_depth': geo_no_depth,
                     'depth_classes_unknown': depth_unknown_class,
                     'issuing_bodies_without_a_document': org_no_doc,
                     'stages_without_a_document': stage_no_doc,
                     'facility_types_without_a_document': obj_no_doc}

# ------------------------------------------------------------------ 3. languages
# This tool declares tool_languages: ["en"] — the interface and the corpus are English,
# and only the catalogue metadata is carried in the six site languages.  So the six-language
# requirement is checked where it actually applies (the manifest), while the content packs
# are checked for internal consistency and for the fallback path that a missing language
# would take.
MAN = json.loads(re.search(r'id="diagram-tool-manifest">(.*?)</script>',
                           open(_gp.site('kernnormenwijzer.html'), encoding='utf8').read(),
                           re.S).group(1))
# The site languages are the ones this page's own manifest declares in catalog_languages,
# which is exactly what catalog.php validates the metadata fields against (it errors with
# 'Field "x" must carry every language declared in catalog_languages'). Typing the list here
# made the check miss a language the moment the site gained one: it was written as
# ['en','uk','de','nl','fr','es'] and Polish was added in 2026-08, so the Polish metadata
# went unchecked. Derived, it cannot fall behind again.
SITE_LANGS = [l for l in (MAN.get('catalog_languages') or ['en']) if isinstance(l, str)]
cat_missing, cat_placeholder = [], []
for field in ['title', 'summary', 'description', 'limitations']:   # intended_use is an enum list, not prose
    v = MAN.get(field)
    if not isinstance(v, dict):
        cat_missing.append('manifest field %s is not a six-language object' % field)
        continue
    for lang in SITE_LANGS:
        s = v.get(lang)
        if not isinstance(s, str) or not s.strip():
            cat_missing.append('manifest %s is missing or empty in %s' % (field, lang))
        elif re.search(r'(\bTODO\b|\bTBD\b|(?i:untranslated))', s):
            cat_placeholder.append('manifest %s/%s looks like a placeholder' % (field, lang))
        elif lang != 'en' and isinstance(v.get('en'), str) and s.strip() == v['en'].strip():
            cat_placeholder.append('manifest %s/%s is byte-identical to the English text' % (field, lang))

i18n = {'missing': {}, 'placeholders': [], 'shape': [],
        'declared_tool_languages': MAN.get('tool_languages'),
        'declared_catalog_languages': MAN.get('catalog_languages'),
        'catalogue_missing': cat_missing, 'catalogue_placeholders': cat_placeholder,
        'interface_languages': list(LANGS),
        'content_language_note':
            'The content packs are checked for shape and completeness in every language the page '
            'offers (D["LANGS"]), and the catalogue metadata in every language the manifest '
            'declares in catalog_languages. Both lists are read, not typed: this tool was '
            'English-interface-only when the reference was written and now offers %d languages.'
            % len(LANGS)}
PLACE = re.compile(r'(\bTODO\b|\bFIXME\b|\bTBD\b|\bXXX\b|\bPLACEHOLDER\b|\btodo:'
                   r'|(?i:lorem ipsum|untranslated)|\{\{[^}]*\}\}|%[A-Z_]+%)')
for name, pack, arity in (('document texts', T, 3), ('study texts', ST, 3),
                          ('body texts', BT, 2), ('scenario texts', SCT, None),
                          ('interface strings', UI, None)):
    for lang in [l for l in LANGS if l in pack]:
        miss = sorted(set(pack[DEF]) - set(pack.get(lang, {})))
        if miss:
            i18n['missing'].setdefault(name, {})[lang] = miss
        for k, v in pack.get(lang, {}).items():
            blob = json.dumps(v, ensure_ascii=False)
            if PLACE.search(blob):
                i18n['placeholders'].append('%s %s/%s looks like a placeholder' % (name, lang, k))
            if isinstance(v, list):
                if arity and len(v) != arity:
                    i18n['shape'].append('%s %s/%s has %d parts, expected %d'
                                         % (name, lang, k, len(v), arity))
                for part in v:
                    if not isinstance(part, str) or not part.strip():
                        i18n['shape'].append('%s %s/%s has an empty part' % (name, lang, k))
            elif isinstance(v, str):
                if not v.strip():
                    i18n['shape'].append('%s %s/%s is empty' % (name, lang, k))

# the taxonomy names (areas, categories, jurisdictions, facet options) are held once, in
# English, inside the code — record which of them are shown untranslated in every language
rep['i18n'] = i18n

# ------------------------------------------------------------------ 4. jurisdiction visibility
def geo_visible(doc_geo, sel):
    if not sel:
        return True
    if doc_geo == sel:
        return True
    if doc_geo in ('intl', 'none', 'nat'):
        return True
    if doc_geo == 'eu' and (sel in EUMEM or sel == 'eu'):
        return True
    return False


def match_obj(d, o):
    return (not o) or '*' in d['obj'] or o in d['obj']


def fold(s):
    return str(s).lower()


def register_expected(fcat='', fgeo='', far='', facc='', q='', obj='', stg='', geo=''):
    out = []
    for d in DOCS:
        if fcat and d['cat'] != fcat:
            continue
        if not geo_visible(d['geo'], fgeo or geo):
            continue
        if far and far not in d['ar']:
            continue
        if facc and d['acc'] != facc:
            continue
        if obj and not match_obj(d, obj):
            continue
        if stg and stg not in d['stg']:
            continue
        if q:
            hay = fold(' '.join([d['idn'], T[DEF][d['id']][0], ORGN[d['org']], d['id']]))
            if any(w not in hay for w in fold(q).split()):
                continue
        out.append(d['id'])
    return out


reg_cases = [{'id': 'all', 'f': {}}]
for c in CATS:
    reg_cases.append({'id': 'cat_' + c, 'f': {'fcat': c}})
for g in GEOS:
    reg_cases.append({'id': 'geo_' + g, 'f': {'fgeo': g}})
for a in AREAS:
    reg_cases.append({'id': 'area_' + a, 'f': {'far': a}})
for acc in ACCS:
    reg_cases.append({'id': 'acc_' + acc, 'f': {'facc': acc}})
for o in OBJ_IDS:
    reg_cases.append({'id': 'obj_' + o, 'f': {'obj': o}})
for s in STAGE_IDS:
    reg_cases.append({'id': 'stg_' + s, 'f': {'stg': s}})
for q in ['iaea', 'gsr', 'ssg', 'asme', 'euratom', 'wenra', 'nrc part 50', 'kta',
          'zzzznothing', 'safety', 'iso', 'onr saps', 'afcen rcc-m', 'convention']:
    reg_cases.append({'id': 'q_' + re.sub(r'\W+', '_', q), 'f': {'q': q}})
combos = [
    {'fcat': 'std', 'facc': 'paid'},
    {'fcat': 'law', 'fgeo': 'eu'},
    {'far': 'ar_neut', 'obj': 'ob_geo'},
    {'fgeo': 'fi', 'fcat': 'reg'},
    {'fgeo': 'us', 'far': 'ar_civ', 'facc': 'open'},
    {'obj': 'ob_tra', 'stg': 'st_rel', 'fcat': 'code'},
    {'fcat': 'method', 'far': 'ar_psa', 'q': 'code'},
    {'fgeo': 'jp', 'fcat': 'own', 'far': 'ar_safeg', 'q': 'zzz'},
    {'obj': 'ob_micro', 'stg': 'st_lic', 'fgeo': 'uk'},
    {'far': 'ar_fire', 'facc': 'restricted', 'fcat': 'guide'},
]
for i, c in enumerate(combos):
    reg_cases.append({'id': 'combo_%d' % (i + 1), 'f': c})
for rc in reg_cases:
    rc['expected'] = register_expected(**rc['f'])
    rc['n'] = len(rc['expected'])
rep['register'] = reg_cases

# ------------------------------------------------------------------ 5. facet verdicts
def verdict(state):
    exp, not_ = {}, {}
    chosen = [state.get('obj'), state.get('stg'), state.get('role'), state.get('nov'),
              state.get('sc')] + list(state.get('site', [])) + list(state.get('form', []))
    for v in [x for x in chosen if x]:
        r = FEXP.get(v)
        if not r:
            continue
        for a in r[0]:
            exp[a] = exp.get(a, 0) + 1
        for a in r[1]:
            not_[a] = not_.get(a, 0) + 1
    areas = [a for a in exp if not_.get(a, 0) < exp[a]]
    excluded = [a for a in exp if not_.get(a, 0) >= exp[a]]
    return areas, excluded


def base_docs(state):
    return [d for d in DOCS if match_obj(d, state.get('obj', ''))
            and geo_visible(d['geo'], state.get('geo', ''))]


def area_doc_counts(state, area):
    """what the task panel prints per subject area: the register filtered by facility
       type, stage and jurisdiction, restricted to that area, tallied by category"""
    sel = [d for d in DOCS if area in d['ar'] and match_obj(d, state.get('obj', ''))
           and (not state.get('stg') or state['stg'] in d['stg'])
           and geo_visible(d['geo'], state.get('geo', ''))]
    by = {}
    for d in sel:
        by[d['cat']] = by.get(d['cat'], 0) + 1
    return len(sel), by


def studies_expected(state):
    out = []
    for s in STUDIES:
        if state.get('obj') and '*' not in s['obj'] and state['obj'] not in s['obj']:
            continue
        if state.get('stg') and state['stg'] not in s['stg']:
            continue
        if s['nov'] and state.get('nov') and state['nov'] not in s['nov']:
            continue
        out.append(s['id'])
    return out


def bodies_expected(state):
    st = studies_expected(state)
    ids = set()
    for s in STUDIES:
        if s['id'] in st:
            ids |= set(s['by'])
    out = []
    for b in BODIES:
        if state.get('stg') and state['stg'] not in b['stg']:
            continue
        if b['geo'] != 'nat' and not geo_visible(b['geo'], state.get('geo', '')):
            continue
        if ids and b['id'] not in ids:
            continue
        out.append(b['id'])
    return out


EMPTY = {'obj': '', 'stg': '', 'geo': '', 'role': '', 'nov': '', 'sc': '', 'site': [], 'form': []}
task_cases = [{'id': 'task_empty', 'state': dict(EMPTY, site=[], form=[])}]
for s in SCEN:
    st = dict(EMPTY)
    st.update({k: (list(v) if isinstance(v, list) else v) for k, v in s['set'].items()})
    task_cases.append({'id': 'task_' + s['id'], 'state': st, 'scenario': s['id']})
for key, ids in VALID.items():
    for v in ids:
        st = dict(EMPTY, site=[], form=[])
        if key in ('site', 'form'):
            st[key] = [v]
        else:
            st[key] = v
        task_cases.append({'id': 'task_only_%s_%s' % (key, v), 'state': st})
allsel = {'obj': OBJ_IDS[0], 'stg': STAGE_IDS[0], 'geo': 'fi', 'role': ROLE_IDS[0],
          'nov': NOV_IDS[0], 'sc': SC_IDS[0], 'site': list(SITE_IDS), 'form': list(FORM_IDS)}
task_cases.append({'id': 'task_all_selected', 'state': allsel})
for tc in task_cases:
    areas, excluded = verdict(tc['state'])
    tc['expected_areas'] = sorted(areas)
    tc['expected_excluded'] = sorted(excluded)
    tc['area_counts'] = {a: area_doc_counts(tc['state'], a)[0] for a in sorted(areas)}
    tc['area_gaps'] = sorted(a for a in areas if area_doc_counts(tc['state'], a)[0] == 0)
    tc['expected_studies'] = studies_expected(tc['state'])
    tc['expected_bodies'] = bodies_expected(tc['state'])
    tc['expected_register'] = register_expected(obj=tc['state'].get('obj', ''),
                                                stg=tc['state'].get('stg', ''),
                                                geo=tc['state'].get('geo', ''))
rep['tasks'] = task_cases

# ------------------------------------------------------------------ 6. counts
rep['counts'] = {
    'total_docs': len(DOCS),
    'by_cat': {c: sum(1 for d in DOCS if d['cat'] == c) for c in CATS},
    'by_geo': {g: sum(1 for d in DOCS if d['geo'] == g) for g in GEOS},
    'by_acc': {a: sum(1 for d in DOCS if d['acc'] == a) for a in ACCS},
    'by_area': {a: sum(1 for d in DOCS if a in d['ar']) for a in AREAS},
    'by_stage': {s: sum(1 for d in DOCS if s in d['stg']) for s in STAGE_IDS},
    'map_grid': {a: {s: sum(1 for d in DOCS if a in d['ar'] and s in d['stg']) for s in STAGE_IDS}
                 for a in AREAS},
    'cov_grid': {a: {c: sum(1 for d in DOCS if a in d['ar'] and d['cat'] == c) for c in CATS}
                 for a in AREAS},
    'total_studies': len(STUDIES), 'total_bodies': len(BODIES), 'total_scen': len(SCEN),
}

json.dump(rep, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('wrote', OUT)
print('doc_errors', len(doc_err), 'study_errors', len(stu_err), 'body_errors', len(bod_err),
      'scen_errors', len(scen_err))
print('dangling', len(dangling), dangling[:5])
print('facet_gaps', len(facet_gaps), facet_gaps[:5])
for k, v in rep['references'].items():
    if k not in ('dangling', 'facet_gaps') and v:
        print(' ', k, v)
print('i18n missing', {k: {l: len(x) for l, x in d.items()} for k, d in i18n['missing'].items()})
print('i18n placeholders', len(i18n['placeholders']), 'shape', len(i18n['shape']), i18n['shape'][:5])
print('register cases', len(reg_cases), 'task cases', len(task_cases))
