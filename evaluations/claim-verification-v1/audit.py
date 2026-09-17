"""Local protected-foundation, replay and evidence-boundary audit."""
import hashlib
import json
import subprocess
from evidence import BASE, ROOT, ART, load, DEVELOPMENT, HOLDOUT
from verification import validate_saved

before=json.loads((ART/'before.json').read_text())
changed=[n for n,sha in before.items() if not (ROOT/n).is_file() or hashlib.sha256((ROOT/n).read_bytes()).hexdigest()!=sha]
assert not changed,changed
assert subprocess.check_output(['git','diff','--binary'],cwd=ROOT)==(ART/'before.diff').read_bytes()
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT).strip()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
assert head=='f5e89d4e3afd63a7f687d1359f801fe62136b6fe'
frozen=json.loads((BASE/'frozen.json').read_text())
for name,sha in frozen['sha256'].items():assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==sha,name
counts={'records':0,'claims':0,'sourceAtomsChecked':0}
for name in DEVELOPMENT+HOLDOUT:
    p,s,inv,sem=load(name);requests=json.loads((ART/f'{name}-requests.json').read_text());out=json.loads((ART/f'{name}-verification.json').read_text())
    assert hashlib.sha256((ART/f'{name}-requests.json').read_bytes()).hexdigest()==frozen['requestHashes'][name]
    assert validate_saved(p,s,inv,sem,requests,out)
    assert out['authority']=='evaluation_only_no_canonical_authority'
    fs={f['id']:f for pg in p['pages'] for f in pg['fragments']};source_atoms={a['id']:a for a in sem['atoms']}
    for c in out['claims']:
        for a in c['evidence'].get('sourceAtoms',[]):
            assert a==source_atoms[a['id']]
            assert a['rawText']==' '.join(fs[ref]['text'] for ref in a['provenance']['fragmentRefs'])
            assert all(ref in fs for ref in a['provenance']['columnHeaderRefs'])
            counts['sourceAtomsChecked']+=1
        assert all(ref in fs for ref in c['evidence']['controlFragmentRefs'])
        if c['status']=='supported':assert all(o['state']=='pass' for o in c['obligations'])
    counts['records']+=1;counts['claims']+=len(out['claims'])
tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
new=[str(p.relative_to(ROOT)) for p in BASE.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
assert not set(new)&tracked
assert subprocess.check_output(['git','check-ignore',str(ART/'scores.json')],cwd=ROOT,text=True).strip()
result={'preexistingFilesChecked':len(before),'changedPreexistingFiles':changed,'trackedDiffUnchanged':True,'indexEmpty':True,'head':head,
        'frozenVerifierAndRequestContractsUnchanged':True,'replays':counts,'newMilestoneUncommitted':True,
        'foundationsKernelStructureSemanticsProofsAIAndFiveFactAuthorityUnchanged':True,'newFiles':new}
(ART/'boundary-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='newFiles'},indent=2))
