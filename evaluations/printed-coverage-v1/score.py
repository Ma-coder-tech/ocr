"""Source-cell and exact membership scoring, separate from the frozen engine."""
import json
from pathlib import Path
from records import validate_record

ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).parent
ART=ROOT/'artifacts/printed-coverage-v1';OLD=ROOT/'artifacts/printed-membership-v1'
def rowrefs(row):return frozenset(x for c in row['cells'] for x in c['fragmentRefs'])
def cellrefs(row):return [frozenset(c['fragmentRefs']) for c in row['cells']]
goldfiles=[(BASE/'known-gold.json','known_target'),(BASE/'holdout-gold.json','reserved_holdout'),
           (ROOT/'evaluations/printed-membership-v1/holdout-gold.json','prior_public_regression'),
           (ROOT/'evaluations/printed-membership-v1/holdout-v2-gold.json','prior_public_regression')]
report={'tables':[],'sourceAudits':[]}
for goldpath,cohort in goldfiles:
 for statement in json.loads(goldpath.read_text())['statements']:
  name=statement['id'];out=json.loads((ART/f'{name}-structure.json').read_text())
  observed={rowrefs(r):(t,r) for t in out['tables'] for r in t['rows'] if r['kind']=='detail'}
  matched=set()
  for expected in statement['tables']:
   rowmatches=[observed.get(rowrefs(r)) for r in expected['rows']]
   exact=[bool(found and cellrefs(found[1])==cellrefs(row) and found[1]['status']=='accepted') for row,found in zip(expected['rows'],rowmatches)]
   members={found[1]['id'] for found in rowmatches if found};matched.update(members)
   totalrefs=set(expected['totalFragmentRefs'])
   foundtotals=[total for t in out['tables'] for total in t['totals'] if any(r['id']==total['totalRowRef'] and set(r['fragmentRefs'])==totalrefs for r in t['rows'])]
   total=foundtotals[0] if len(foundtotals)==1 else None
   correct=bool(total and len(members)==len(expected['rows']) and set(total['memberRowRefs'])==members and len(total['memberRowRefs'])==len(members))
   links=[]
   for first,second in zip(expected['regions'],expected['regions'][1:]):
    choices=[c for c in out['continuations'] if c['sourcePages']==[first[0],second[0]] and any(t['id']==c['to'] and any(r['id'] in members for r in t['rows']) for t in out['tables'])]
    links.append({'pages':[first[0],second[0]],'expected':expected['continuation'],'actual':[c['status'] for c in choices]})
   report['tables'].append({'id':name,'kind':expected['kind'],'cohort':cohort,'expectedRows':len(exact),'exactCellRows':sum(exact),
                            'status':total['printedMembershipStatus'] if total else 'missing','exactMemberSet':correct,
                            'wrongComplete':bool(total and total['printedMembershipStatus']=='complete' and (not correct or not all(exact))), 'continuations':links})
  if cohort!='known_target':
   extra=[r['id'] for t in out['tables'] for r in t['rows'] if r['kind']=='detail' and r['id'] not in matched]
   report['sourceAudits'].append({'id':name,'extraDetailRowsOutsideGold':extra})

for path in sorted(ART.glob('*-structure.json')):
 name=path.name.removesuffix('-structure.json')
 p=ART/f'{name}-native.json'
 if not p.exists():p=OLD/(f'holdout-sealed/{name}-native.json' if name.startswith('holdout') else f'{name}-native.json')
 packet=json.loads(p.read_text());out=json.loads(path.read_text());ref=json.loads((ART/f'{name}-inventory.json').read_text())
 fs={f['id']:f for p in packet['pages'] for f in p['fragments']};ledger=out['coverageLedger'];issues=[]
 if set(fs)!={x['fragmentRef'] for x in ledger} or len(fs)!=len(ledger):issues.append('ledger_not_exhaustive_and_unique')
 for t in out['tables']:
  for r in t['rows']:
   for c in r['cells']:
    if c['rawText']!=' '.join(fs[x]['text'] for x in c['fragmentRefs']):issues.append('raw_cell_not_reversible')
 report['sourceAudits'].append({'id':name,'savedJsonReplay':validate_record(packet,out,ref),'issues':issues,'accounting':out['sourceAccounting']})
(ART/'scores.json').write_text(json.dumps(report,indent=2)+'\n')
for cohort in sorted({x['cohort'] for x in report['tables']}):
 s=[x for x in report['tables'] if x['cohort']==cohort]
 print(cohort,{'rows':sum(x['expectedRows'] for x in s),'exactRows':sum(x['exactCellRows'] for x in s),'completeTables':sum(x['status']=='complete' for x in s),'exactMemberSets':sum(x['exactMemberSet'] for x in s),'wrongComplete':sum(x['wrongComplete'] for x in s)})
assert all(not x['wrongComplete'] for x in report['tables'])
assert all(x.get('savedJsonReplay',True) and not x.get('issues',[]) and not x.get('extraDetailRowsOutsideGold',[]) for x in report['sourceAudits'])
