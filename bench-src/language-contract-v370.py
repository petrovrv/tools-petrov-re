#!/usr/bin/env python3
from pathlib import Path
import re,json,sys
R=Path(__file__).resolve().parent.parent
LANGS=['en','uk','de','nl','fr','es','pl']
checks=[]
def ck(id,ok,detail=''): checks.append({'id':id,'pass':bool(ok),'detail':detail})
def manifest(name):
    s=(R/name).read_text(encoding='utf-8')
    m=re.search(r'<script type="application/json" id="diagram-tool-manifest">(.*?)</script>',s,re.S)
    return json.loads(m.group(1))
common=(R/'diagram-common.js').read_text(); ui=(R/'diagram-ui.js').read_text(); cat=(R/'catalog.php').read_text(); idx=(R/'index.html').read_text(); sd=(R/'site-disclaimer.js').read_text()
ck('common_registry', 'const LANGS=["en","uk","de","nl","fr","es","pl"]' in common and 'pl:"Narzędzia"' in common, '7 site languages + Polish Tools')
ck('ui_registry', "var SITE_LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];" in ui and "pl: 'Polski'" in ui and 'function domainLang' in ui and 'function siteLang' in ui, 'site/domain split present')
ck('catalog_registry', "const LANGS = ['en', 'uk', 'de', 'nl', 'fr', 'es', 'pl'];" in cat and 'must be non-empty, unique subsets of the site language registry' in cat and "all_langs($m, $k, $m['catalog_languages'])" in cat, 'catalog/tool languages are subsets, not global equality')
ck('index_registry', '"pl":"Język"' in idx and 'diagram_site_lang' in idx, 'Polish catalogue shell + dedicated site-language persistence')
ck('disclaimer_registry', '"langs":["en","uk","de","nl","fr","es","pl"]' in sd and 'diagram_site_lang' in sd, 'Polish accepted by shared disclaimer')
mx,mc,mk=manifest('xenon.html'),manifest('cfd.html'),manifest('kernnormenwijzer.html')
def domain(m,site):
    tl=m.get('tool_languages') or ['en']
    return site if site in tl else ('en' if 'en' in tl else tl[0])
for n,site,m,want in [
    ('xenon','pl',mx,'pl'),('cfd','pl',mc,'en'),('kern','pl',mk,'en'),('cfd','de',mc,'de')]:
    got=domain(m,site); ck('matrix_'+n+'_'+site,got==want,f'site={site} domain={got}')
ck('xenon_catalog_pl','pl' in mx.get('catalog_languages',[]) and 'pl' in mx.get('tool_languages',[]),'Polish domain translation declared')
ck('kern_site_only',mk.get('tool_languages')==['en'] and 'pl' not in mk.get('catalog_languages',[]),'Polish shell + English domain is declared honestly')
ck('legacy_bootstrap_shield','diagram_site_lang' in ui and 'diagram_site_lang' in common and 'diagram_site_lang' in idx and 'diagram_site_lang' in sd,'new site language survives legacy six-language inline bootstraps')
auth=(R/'docs/AUTHORING.md').read_text(); agents=(R/'docs/AGENTS.md').read_text(); spec=(R/'docs/UI_FRAMEWORK_SPEC.md').read_text()
ck('authoring_contract','v3.7.0 language contract' in auth and 'Site language and domain language' in auth,'authoring guide updated')
ck('agents_contract','Canonical **site** languages' in agents and 'diagram_site_lang' in agents,'data/agent contract updated')
ck('spec_contract','site-language registry. v3.7.0 registry' in spec and 'domainLang' in spec,'UI specification updated')
out={'total':len(checks),'passed':sum(x['pass'] for x in checks),'failed':sum(not x['pass'] for x in checks),'cases':checks}
print(json.dumps(out,ensure_ascii=False,indent=2));sys.exit(0 if out['failed']==0 else 1)
