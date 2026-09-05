"""Post-freeze negative probes on held-out layouts; never used for tuning."""
import copy
import json
from pathlib import Path
from structure import assemble
from coverage import source_inventory

ROOT=Path(__file__).resolve().parents[2];ART=ROOT/'artifacts/printed-coverage-v1'
gold=json.loads((Path(__file__).parent/'holdout-gold.json').read_text());results=[]
for statement in gold['statements']:
 name=statement['id'];original=json.loads((ART/f'{name}-native.json').read_text())
 target=next(t for t in statement['tables'] if t['continuation']=='headerless');page=target['totalPage'];targetrefs=set(target['totalFragmentRefs'])
 for mutation in ['missing_page','changed_identity','shifted_amount_column','unrelated_section','different_named_end']:
  packet=copy.deepcopy(original);pg=next(p for p in packet['pages'] if p['page']==page)
  if mutation=='missing_page':packet['pages']=[p for p in packet['pages'] if p['page']!=page-1]
  elif mutation=='changed_identity':
   field=next(f for f in pg['fragments'] if f['text']=='984031332880');field['text']='DIFFERENT_ACCOUNT'
  elif mutation=='shifted_amount_column':
   ids={x for r in target['rows'] if r['page']==page for x in r['cells'][-1]['fragmentRefs']}
   for f in pg['fragments']:
    if f['id'] in ids:f['x']-=10
  elif mutation=='different_named_end':
   field=next(f for f in pg['fragments'] if f['id'] in targetrefs and 'TOTAL' in f['text']);field['text']='TOTAL UNRELATED FEES'
  else:
   for f in pg['fragments']:
    if f['y']>=130:f['y']+=20;f['baseline']+=20
   pg['fragments'].append({'id':'challenge-section','text':'UNRELATED FEES','x':40,'y':130,'width':130,'height':10,'baseline':140,'font':'challenge-heading','dir':'ltr'})
  # Missing-source probes use the retained original inventory. Other probes
  # deliberately describe changed source structure, to exercise structural
  # refusal independently of the byte/inventory mismatch check.
  ref=source_inventory(original if mutation=='missing_page' else packet)
  out=assemble(packet,ref)
  complete=[total for t in out['tables'] for total in t['totals'] if total['printedMembershipStatus']=='complete' and any(r['id']==total['totalRowRef'] and set(r['fragmentRefs'])==targetrefs for r in t['rows'])]
  results.append({'id':name,'mutation':mutation,'incorrectComplete':bool(complete)})
(ART/'holdout-challenges.json').write_text(json.dumps(results,indent=2)+'\n')
print(f"{sum(not x['incorrectComplete'] for x in results)}/{len(results)} negative probes withheld the challenged membership")
assert not any(x['incorrectComplete'] for x in results)
