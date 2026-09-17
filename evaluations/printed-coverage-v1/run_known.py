import sys,json,hashlib
from pathlib import Path
sys.path.insert(0,'evaluations/printed-coverage-v1')
from structure import assemble
from coverage import source_inventory
old=Path('artifacts/printed-membership-v1');new=Path('artifacts/printed-coverage-v1')
pdfs={hashlib.sha256(p.read_bytes()).hexdigest():str(p) for p in Path('test').rglob('*.pdf')}
pdfs[hashlib.sha256((old/'holdout-sealed/monroe.pdf').read_bytes()).hexdigest()]=str(old/'holdout-sealed/monroe.pdf')
for name in ['priority','paysafe','paysafe-zero','basys','clover-october','clover-november']+[f'holdout-{i}' for i in range(1,7)]:
 p=old/(f'holdout-sealed/{name}-native.json' if name.startswith('holdout') else f'{name}-native.json');packet=json.loads(p.read_text());assert packet['sourceSha256'] in pdfs
 ref=source_inventory(packet);refpath=new/f'{name}-inventory.json'
 if refpath.exists():assert json.loads(refpath.read_text())==ref
 else:refpath.write_text(json.dumps(ref,indent=2))
 out=assemble(packet,ref);(new/f'{name}-structure.json').write_text(json.dumps(out,indent=2));print(name)
 for t in out['tables']:
  if t['totals']:print(t['id'],t['title'],[(x['printedMembershipStatus'],len(x['memberRowRefs']),x['coverageReasons']) for x in t['totals']])
 for c in out['continuations']:
  if 'evidence' in c:print('JOIN',c['sourcePages'],c['status'],c['reasons'])
 for t in out['tables']:
  if t['coverage']['unexplainedFragmentRefs']:print('GAP',t['id'],[f['text'] for page in packet['pages'] for f in page['fragments'] if f['id'] in t['coverage']['unexplainedFragmentRefs']])
