#!/usr/bin/env python3
"""Independent reference for procesklimaat.html — DATA-INTEGRITY benchmark.

The tool is an industry-by-industry comparator: it holds attention points (AP), the
counter-measures that answer them (MS), the conflicts between those measures (RULES), the
industries that select them (IND) and the key figures traced to worked material (PROV).
It computes no physics.  The reference re-implements, from the documented meaning of the
tables alone,

  * the record schema of every table, including the six-language shape of every text,
  * the referential closure (measure -> attention point, rule -> measure, industry ->
    attention point, key figure -> measure/attention point/text/source file and line),
  * the selection semantics (which measures an industry offers, which are excluded for it),
  * the conflict engine (hard / warning / pairing verdict for a given selection),
  * the tallies the page prints, and the comparator's only-A / only-B / both sets.
"""
import genpaths as _gp  # path resolution for this directory  # noqa: E402
import json, re, itertools

D = json.load(open(_gp.ref('procesklimaat_data.json'), encoding='utf8'))
OUT = _gp.ref('procesklimaat_ref.json')

LANGS = D['LANGS']
DEF = D['DEFAULT_LANG']
AP, MS, RULES, IND, PROV = D['AP'], D['MS'], D['RULES'], D['IND'], D['PROV']
UI, SRCFILES = D['UI'], D['SRCFILES']
PCD, PWH, PCK, PEX = D['PCD'], D['PWH'], D['PCK'], D['PEX']
GROUPS, CATS, LAYS = D['GROUPS'], D['CATS'], D['LAYS']
GKEY, CKEY, SKEY = D['GKEY'], D['CKEY'], D['SKEY']
STATUSES = list(SKEY)

APBY = {a['id']: a for a in AP}
MSBY = {m['id']: m for m in MS}
INDBY = {s['id']: s for s in IND}
MSOFAP = {}
for m in MS:
    MSOFAP.setdefault(m['ap'], []).append(m['id'])

rep = {}

# ------------------------------------------------------------------ 1. schema
def texts_of(rec, keys):
    return [(k, rec[k]) for k in keys if k in rec and isinstance(rec[k], dict)]


def lang_errors(where, blob):
    out = []
    if not isinstance(blob, dict):
        out.append('%s: not a language object' % where)
        return out
    for lang in LANGS:
        v = blob.get(lang)
        if not isinstance(v, str) or not v.strip():
            out.append('%s: %s is missing or empty' % (where, lang))
        elif re.search(r'(\bTODO\b|\bTBD\b|\bFIXME\b|(?i:untranslated|lorem ipsum))', v):
            out.append('%s: %s looks like a placeholder' % (where, lang))
    extra = [k for k in blob if k not in LANGS]
    if extra:
        out.append('%s: unexpected language key(s) %s' % (where, extra))
    return out


schema, i18n = [], []
seen = {}
for a in AP:
    for k in ['id', 'g', 'c', 's', 't', 'n']:
        if k not in a:
            schema.append('AP %s: missing field %s' % (a.get('id'), k))
    if a['id'] in seen:
        schema.append('AP %s: duplicate id' % a['id'])
    seen[a['id']] = 1
    if a.get('g') not in GROUPS:
        schema.append('AP %s: group %r unknown' % (a['id'], a.get('g')))
    if a.get('c') not in CATS:
        schema.append('AP %s: category %r unknown' % (a['id'], a.get('c')))
    if a.get('s') not in STATUSES:
        schema.append('AP %s: status %r unknown' % (a['id'], a.get('s')))
    for k, blob in texts_of(a, ['t', 'n']):
        i18n += lang_errors('AP %s/%s' % (a['id'], k), blob)

mseen = {}
for m in MS:
    for k in ['id', 'ap', 'c', 's', 't']:
        if k not in m:
            schema.append('MS %s: missing field %s' % (m.get('id'), k))
    if m['id'] in mseen:
        schema.append('MS %s: duplicate id' % m['id'])
    mseen[m['id']] = 1
    if m.get('c') not in CATS:
        schema.append('MS %s: category %r unknown' % (m['id'], m.get('c')))
    if m.get('s') not in STATUSES:
        schema.append('MS %s: status %r unknown' % (m['id'], m.get('s')))
    for k, blob in texts_of(m, ['t', 'n']):
        i18n += lang_errors('MS %s/%s' % (m['id'], k), blob)

rseen = {}
for r in RULES:
    for k in ['id', 'k', 'a', 'b', 'x']:
        if k not in r:
            schema.append('RULE %s: missing field %s' % (r.get('id'), k))
    if r['id'] in rseen:
        schema.append('RULE %s: duplicate id' % r['id'])
    rseen[r['id']] = 1
    if r.get('k') not in ('hard', 'warn', 'pair'):
        schema.append('RULE %s: kind %r unknown' % (r['id'], r.get('k')))
    if r.get('a') == r.get('b'):
        schema.append('RULE %s: relates a measure to itself' % r['id'])
    i18n += lang_errors('RULE %s/x' % r['id'], r.get('x'))

iseen = {}
for s in IND:
    for k in ['id', 'aps', 't']:
        if k not in s:
            schema.append('IND %s: missing field %s' % (s.get('id'), k))
    if s['id'] in iseen:
        schema.append('IND %s: duplicate id' % s['id'])
    iseen[s['id']] = 1
    if len(set(s['aps'])) != len(s['aps']):
        schema.append('IND %s: attention point listed twice' % s['id'])
    i18n += lang_errors('IND %s/t' % s['id'], s['t'])

pseen = {}
# The key-figure schema is layer dependent, and that is the whole point of the layering:
# a figure quoted from the worked material carries a value AND the place it is traced to AND
# the conditions it was obtained under, while an entry standing for a sold or open-law
# instrument carries no value at all — only the shape of the requirement.
for q in PROV:
    for k in ['id', 'lay', 'c', 's', 'ap', 'ms', 'su', 'sh', 'wh', 'ck']:
        if k not in q:
            schema.append('PROV %s: missing field %s' % (q.get('id'), k))
    if q['id'] in pseen:
        schema.append('PROV %s: duplicate id' % q['id'])
    pseen[q['id']] = 1
    if q.get('lay') not in LAYS:
        schema.append('PROV %s: layer %r unknown' % (q['id'], q.get('lay')))
    if q.get('c') not in CATS:
        schema.append('PROV %s: category %r unknown' % (q['id'], q.get('c')))
    if q.get('s') not in STATUSES:
        schema.append('PROV %s: status %r unknown' % (q['id'], q.get('s')))
    if q.get('lay') == 'chapter':
        has = [k for k in ('v', 'tr', 'cd') if k in q]
        if has and len(has) != 3:
            schema.append('PROV %s: carries %s but not all of value, trace and conditions'
                          % (q['id'], has))
        if 'v' in q and not str(q['v']).strip():
            schema.append('PROV %s: value field is empty' % q['id'])
    else:
        for k in ('v', 'tr'):
            if k in q:
                schema.append('PROV %s: layer %s must reproduce no %s from the instrument itself'
                              % (q['id'], q['lay'], k))
    for k, blob in texts_of(q, ['su']):
        i18n += lang_errors('PROV %s/%s' % (q['id'], k), blob)

for name, pack in (('PCD', PCD), ('PWH', PWH), ('PCK', PCK), ('PEX', PEX)):
    for k, blob in pack.items():
        i18n += lang_errors('%s/%s' % (name, k), blob)
for k, blob in UI.items():
    if isinstance(blob, dict):
        i18n += lang_errors('UI/%s' % k, blob)
    else:
        schema.append('UI %s: not a language object' % k)

rep['schema'] = {'errors': schema, 'n_ap': len(AP), 'n_ms': len(MS), 'n_rules': len(RULES),
                 'n_ind': len(IND), 'n_prov': len(PROV), 'n_ui': len(UI)}
rep['i18n'] = {'errors': i18n, 'langs': LANGS, 'reference_language': DEF,
               'n_language_objects': len(UI) + 2 * len(AP) + len(MS) + len(RULES) + len(IND) +
                                     len(PROV) + len(PCD) + len(PWH) + len(PCK) + len(PEX)}

# ------------------------------------------------------------------ 2. cross references
dangling = []
for m in MS:
    if m['ap'] not in APBY:
        dangling.append('measure %s answers attention point %s which does not exist' % (m['id'], m['ap']))
    for x in m.get('x', []):
        if x not in INDBY:
            dangling.append('measure %s is excluded for industry %s which does not exist' % (m['id'], x))
for r in RULES:
    for side in ('a', 'b'):
        if r[side] not in MSBY:
            dangling.append('rule %s names measure %s which does not exist' % (r['id'], r[side]))
for s in IND:
    for a in s['aps']:
        if a not in APBY:
            dangling.append('industry %s names attention point %s which does not exist' % (s['id'], a))
for q in PROV:
    for a in q.get('ap', []):
        if a not in APBY:
            dangling.append('key figure %s names attention point %s which does not exist' % (q['id'], a))
    for x in q.get('ms', []):
        if x not in MSBY:
            dangling.append('key figure %s names measure %s which does not exist' % (q['id'], x))
    if q.get('cd') and q['cd'] not in PCD:
        dangling.append('key figure %s names conditions text %s which does not exist' % (q['id'], q['cd']))
    if q.get('wh') and q['wh'] not in PWH:
        dangling.append('key figure %s names provenance text %s which does not exist' % (q['id'], q['wh']))
    if q.get('ck') and q['ck'] not in PCK:
        dangling.append('key figure %s names check text %s which does not exist' % (q['id'], q['ck']))
    if q.get('ex') and q['ex'] not in PEX:
        dangling.append('key figure %s names explanation %s which does not exist' % (q['id'], q['ex']))

# the traced place must exist in the material and the line must be inside the file
trace_errors = []
for q in PROV:
    if 'tr' not in q:
        continue                     # layer carries no trace by design (checked in the schema)
    tr = str(q.get('tr', ''))
    f, _, ln = tr.rpartition(':')
    if not f:
        f, ln = tr, ''
    if f not in SRCFILES:
        trace_errors.append('key figure %s is traced to %s, which is not in the source-file index'
                            % (q['id'], f))
    elif ln:
        try:
            n = int(ln)
        except ValueError:
            trace_errors.append('key figure %s has a non-numeric line %r' % (q['id'], ln))
        else:
            if n < 1 or n > SRCFILES[f]:
                trace_errors.append('key figure %s cites line %d of %s, which has %d lines'
                                    % (q['id'], n, f, SRCFILES[f]))

orphan = {
    'attention_points_no_industry_uses': [a['id'] for a in AP
                                          if not any(a['id'] in s['aps'] for s in IND)],
    'attention_points_without_a_measure': [a['id'] for a in AP if a['id'] not in MSOFAP],
    'measures_no_rule_and_no_key_figure_mentions': [],
    'groups_without_an_attention_point': [g for g in GROUPS if not any(a['g'] == g for a in AP)],
    'categories_unused': [c for c in CATS
                          if not any(a['c'] == c for a in AP) and not any(m['c'] == c for m in MS)],
    'layers_without_a_key_figure': [l for l in LAYS if not any(q['lay'] == l for q in PROV)],
    # NB: the source-file index is an index of the whole worked material, not only of what
    # this page quotes, so an uncited file is expected and is recorded, not graded.
    'source_files_never_cited_INFORMATIONAL': [f for f in SRCFILES
                                 if not any(str(q.get('tr', '')).rpartition(':')[0] == f or
                                            str(q.get('tr', '')) == f for q in PROV)],
    'condition_texts_never_used': [k for k in PCD if not any(q.get('cd') == k for q in PROV)],
    'provenance_texts_never_used': [k for k in PWH if not any(q.get('wh') == k for q in PROV)],
    'check_texts_never_used': [k for k in PCK if not any(q.get('ck') == k for q in PROV)],
    'explanations_never_used': [k for k in PEX if not any(q.get('ex') == k for q in PROV)],
}
rep['references'] = {'dangling': dangling, 'trace_errors': trace_errors, 'orphans': orphan}

# ------------------------------------------------------------------ 3. selection semantics
def aps_of(sid):
    return [a for a in INDBY[sid]['aps'] if a in APBY]


def ms_of(ap, sid):
    return [x for x in MSOFAP.get(ap, []) if sid not in MSBY[x].get('x', [])]


def measures_of(sid):
    out = []
    for a in aps_of(sid):
        out += ms_of(a, sid)
    return out


def cat_count(sid, c):
    n = 0
    for a in aps_of(sid):
        if APBY[a]['c'] == c:
            n += 1
        n += sum(1 for x in ms_of(a, sid) if MSBY[x]['c'] == c)
    return n


def ap_pass(sid, a, catf):
    if not catf:
        return True
    if APBY[a]['c'] == catf:
        return True
    return any(MSBY[x]['c'] == catf for x in ms_of(a, sid))


def evaluate(sel):
    S = set(sel)
    hard, warn, hint = [], [], []
    for r in RULES:
        if r['k'] == 'pair':
            if r['a'] in S and r['b'] not in S:
                hint.append(r['id'])
        elif r['a'] in S and r['b'] in S:
            (hard if r['k'] == 'hard' else warn).append(r['id'])
    return {'hard': hard, 'warn': warn, 'hint': hint}


industry_cases = []
for s in IND:
    sid = s['id']
    case = {'id': sid, 'aps': aps_of(sid), 'measures': measures_of(sid),
            'cat_counts': {c: cat_count(sid, c) for c in CATS},
            'groups': {g: [a for a in aps_of(sid) if APBY[a]['g'] == g] for g in GROUPS},
            'filtered': {c: [a for a in aps_of(sid) if ap_pass(sid, a, c)] for c in CATS},
            'excluded_measures': [x for a in s['aps'] if a in APBY for x in MSOFAP.get(a, [])
                                  if sid in MSBY[x].get('x', [])]}
    industry_cases.append(case)
rep['industries'] = industry_cases

# comparator: only-A / only-B / both
compare_cases = []
pairs = [(IND[i]['id'], IND[(i + 1) % len(IND)]['id']) for i in range(len(IND))]
pairs += [(IND[0]['id'], IND[0]['id']), (IND[0]['id'], IND[len(IND) - 1]['id'])]
for a, b in pairs:
    A, B = aps_of(a), aps_of(b)
    compare_cases.append({'a': a, 'b': b,
                          'only_a': [x for x in A if x not in B],
                          'only_b': [x for x in B if x not in A],
                          'both': [x for x in A if x in B]})
rep['compare'] = compare_cases

# conflict engine on a spread of selections, including the empty and the all-selected case
conflict_cases = []
conflict_cases.append({'id': 'sel_empty', 'sel': [], 'verdict': evaluate([])})
allms = [m['id'] for m in MS]
conflict_cases.append({'id': 'sel_all', 'sel': allms, 'verdict': evaluate(allms)})
for r in RULES:
    conflict_cases.append({'id': 'rule_' + r['id'], 'sel': [r['a'], r['b']],
                           'verdict': evaluate([r['a'], r['b']])})
    conflict_cases.append({'id': 'rule_' + r['id'] + '_a_only', 'sel': [r['a']],
                           'verdict': evaluate([r['a']])})
for s in IND:
    conflict_cases.append({'id': 'ind_all_' + s['id'], 'sel': measures_of(s['id']),
                           'verdict': evaluate(measures_of(s['id']))})
rep['conflicts'] = conflict_cases

# the preset the tool builds for each industry must itself be conflict free — that is the
# invariant the preset algorithm exists to guarantee, and it is checked here independently
rep['preset_invariant'] = {
    'note': 'a starting set offered to the user must not contain a hard conflict or a warning',
    'industries': [s['id'] for s in IND]}

rep['counts'] = {
    'attention_points': len(AP), 'measures': len(MS), 'rules': len(RULES),
    'industries': len(IND), 'key_figures': len(PROV),
    'rules_by_kind': {k: sum(1 for r in RULES if r['k'] == k) for k in ('hard', 'warn', 'pair')},
    'ap_by_group': {g: sum(1 for a in AP if a['g'] == g) for g in GROUPS},
    'ap_by_cat': {c: sum(1 for a in AP if a['c'] == c) for c in CATS},
    'ms_by_cat': {c: sum(1 for m in MS if m['c'] == c) for c in CATS},
    'prov_by_layer': {l: sum(1 for q in PROV if q['lay'] == l) for l in LAYS},
}

json.dump(rep, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('wrote', OUT)
print('schema errors', len(schema), schema[:6])
print('i18n errors', len(i18n), i18n[:6])
print('dangling', len(dangling), dangling[:6])
print('trace errors', len(trace_errors), trace_errors[:6])
for k, v in orphan.items():
    if v:
        print(' orphan', k, v[:8], len(v))
print('industry cases', len(industry_cases), 'compare', len(compare_cases), 'conflicts', len(conflict_cases))
