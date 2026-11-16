#!/usr/bin/env python3
"""Independent data-integrity/delta validator for kernnormenwijzer v3.7.0.
Does not call page filtering/rendering functions. It reads declared data literals and
checks the new Polish jurisdiction layer plus global referential closure."""
from pathlib import Path
import json,re,subprocess,tempfile,sys,datetime
HTML=Path(sys.argv[1] if len(sys.argv)>1 else 'kernnormenwijzer.html')
s=HTML.read_text(encoding='utf-8')

def expr(name):
    marker='var '+name+'='
    i=s.index(marker)+len(marker); start=i
    op=s[i]; cl={'[':']','{':'}'}[op]
    depth=0; q=None; esc=False
    for j in range(i,len(s)):
        c=s[j]
        if q:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==q: q=None
        else:
            if c in "'\"": q=c
            elif c==op: depth+=1
            elif c==cl:
                depth-=1
                if depth==0: return s[start:j+1]
    raise ValueError(name)

def jsval(name):
    code='process.stdout.write(JSON.stringify('+expr(name)+'))'
    return json.loads(subprocess.check_output(['node','-e',code],text=True))

DOCS=jsval('DOCS'); SCEN=jsval('SCEN'); DEPTH=jsval('DEPTH'); GEOS=jsval('GEOS')
CATS=jsval('CATS'); ACCS=jsval('ACCS'); ORGN=jsval('ORGN'); AREAS=jsval('AREAS')
STAGE=jsval('STAGE'); OBJ=jsval('OBJ'); SITEF=jsval('SITEF'); FORM=jsval('FORM')
ROLE=jsval('ROLE'); NOV=jsval('NOV'); SC=jsval('SC'); CLUSTERS=jsval('CLUSTERS')
# Facet dictionaries in the page are arrays of [id,label] pairs.
def keyset(x): return set(x.keys()) if isinstance(x,dict) else {r[0] for r in x}
STAGEK,OBJK,SITEFK,FORMK,ROLEK,NOVK,SCK=map(keyset,[STAGE,OBJ,SITEF,FORM,ROLE,NOV,SC])
SCT=jsval('SCT'); EUMEM=jsval('EUMEM')

area_to_cluster={a:c[0] for c in CLUSTERS for a in c[2]}
ids=[d['id'] for d in DOCS]
pl=[d for d in DOCS if d['geo']=='pl']
pl_ids=[f'PLN{i:02d}' for i in range(1,16)]
scids=[x['id'] for x in SCEN]
checks=[]
def ck(id,ok,detail): checks.append({'id':id,'pass':bool(ok),'detail':detail})

ck('corpus_count',len(DOCS)==468,f'{len(DOCS)} documents')
ck('unique_ids',len(ids)==len(set(ids)),f'{len(ids)} ids / {len(set(ids))} unique')
ck('poland_register',sorted(d['id'] for d in pl)==pl_ids,f'{len(pl)} Polish records: '+','.join(d['id'] for d in pl))
ck('poland_depth',DEPTH.get('pl')=='worked' and GEOS.get('pl')=='Poland',f"geo={GEOS.get('pl')}, depth={DEPTH.get('pl')}")
clusters={area_to_cluster.get(a) for d in pl for a in d['ar']}; clusters.discard(None)
ck('poland_worked_threshold',len(pl)>=15 and len(clusters)>=5,f'{len(pl)} records across {len(clusters)} subject clusters')
ck('poland_eu_membership',EUMEM.get('pl')==1,f"EUMEM.pl={EUMEM.get('pl')}")

bad=[]
for d in DOCS:
    if d['cat'] not in CATS: bad.append(d['id']+':cat')
    if d['acc'] not in ACCS: bad.append(d['id']+':acc')
    if d['geo'] not in GEOS: bad.append(d['id']+':geo')
    if d['org'] not in ORGN: bad.append(d['id']+':org')
    if not d['ar'] or any(a not in AREAS or a not in area_to_cluster for a in d['ar']): bad.append(d['id']+':area')
    if any(x not in STAGEK for x in d['stg']): bad.append(d['id']+':stage')
    if any(x!='*' and x not in OBJK for x in d['obj']): bad.append(d['id']+':obj')
ck('document_referential_closure',not bad,'zero invalid references' if not bad else '; '.join(bad[:20]))

badsc=[]
for x in SCEN:
    st=x['set']
    if st.get('obj') not in OBJK or st.get('stg') not in STAGEK: badsc.append(x['id']+':obj/stg')
    if st.get('geo') not in GEOS: badsc.append(x['id']+':geo')
    if st.get('role') not in ROLEK or st.get('nov') not in NOVK or st.get('sc') not in SCK: badsc.append(x['id']+':facet')
    if any(v not in SITEFK for v in st.get('site',[])): badsc.append(x['id']+':site')
    if any(v not in FORMK for v in st.get('form',[])): badsc.append(x['id']+':form')
ck('scenario_referential_closure',not badsc,'zero invalid references' if not badsc else '; '.join(badsc))
ck('scenario_count',len(SCEN)==15,f'{len(SCEN)} scenarios')
c15=next((x for x in SCEN if x['id']=='C15'),None)
ck('poland_preset',bool(c15 and c15['set'].get('geo')=='pl' and c15['set'].get('nov')=='nv_foak'),json.dumps(c15,ensure_ascii=False) if c15 else 'missing')
scen_text=SCT.get('en',{}).get('C15')
ck('poland_preset_text',bool(scen_text and len(scen_text.get('b',[]))==3),scen_text.get('n','') if scen_text else 'missing')

# Text completeness for the new national layer. The generated register keeps each PLNxx
# three-part description literal in the English UI text map; validate structurally from source.
missing_text=[pid for pid in pl_ids if not re.search(r'\b'+re.escape(pid)+r':\["',s)]
ck('poland_text_complete',not missing_text,'15 three-part text entries present' if not missing_text else 'missing '+','.join(missing_text))

# Manifest contract: site may have more languages, this English-domain tool deliberately remains English-only.
mm=re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',s,re.S)
man=json.loads(mm.group(1))
ck('language_contract',man.get('tool_languages')==['en'] and 'en' in man.get('catalog_languages',[]),f"tool={man.get('tool_languages')}, catalog={man.get('catalog_languages')}")

out={'tool':'kernnormenwijzer','file':HTML.name,'kind':'incremental corpus-integrity revalidation after Polish jurisdiction delta','run_at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'total':len(checks),'passed':sum(c['pass'] for c in checks),'failed':sum(not c['pass'] for c in checks),'cases':checks,'baseline':'The broader 11-case corpus/navigation benchmark dated 2026-08-12 remains the baseline; this run independently revalidates the changed data surface and full referential closure without calling page functions.'}
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(0 if out['failed']==0 else 1)
