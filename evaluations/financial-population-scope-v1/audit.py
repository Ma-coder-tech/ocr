"""Boundary, freeze and provenance audit for the uncommitted semantic slice."""
import hashlib
import json
import subprocess
from pathlib import Path
from io_evidence import BASE, ROOT, ART, assert_frozen, load, DEVELOPMENT, HOLDOUT
from semantics import analyze, validate_semantic_record

before=json.loads((ART/'before.json').read_text())
changed=[name for name,sha in before.items() if not (ROOT/name).exists() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=sha]
assert not changed, changed
assert subprocess.check_output(['git','diff','--binary'],cwd=ROOT)==(ART/'before.diff').read_bytes()
assert not subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT).strip()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
assert head=='f5e89d4e3afd63a7f687d1359f801fe62136b6fe'
assert_frozen()
goldfreeze=json.loads((BASE/'holdout-gold-freeze.json').read_text())
for name,sha in goldfreeze['sha256'].items():assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==sha
for name in DEVELOPMENT+HOLDOUT:
    p,s,inv=load(name);saved=json.loads((ART/f'{name}-semantic.json').read_text())
    assert validate_semantic_record(p,s,inv,saved)
    fs={f['id']:f for page in p['pages'] for f in page['fragments']}
    for atom in saved['atoms']:
        provenance=atom['provenance']
        assert atom['rawText']==' '.join(fs[x]['text'] for x in provenance['fragmentRefs'])
        assert provenance['sourceSha256']==p['sourceSha256']
        assert all(x in fs for x in provenance['columnHeaderRefs'])
        assert provenance['admittingTotalRefs']
    assert (ART/f'{name}-semantic.json').read_bytes()==(ART/'first-pass'/f'{name}-semantic.json').read_bytes()
# A runtime cannot import the evaluation layer via any newly edited application file:
# every preexisting src/test/script/config file is unchanged above. Keep additions confined.
tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
new=[str(p.relative_to(ROOT)) for p in BASE.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
assert not (set(new)&tracked)
assert subprocess.check_output(['git','check-ignore',str(ART/'scores.json')],cwd=ROOT,text=True).strip()
result={'preexistingFilesChecked':len(before),'changedPreexistingFiles':changed,'trackedDiffUnchanged':True,'indexEmpty':True,
        'preservationHead':head,'semanticWorkUncommitted':True,'frozenClassifierVerified':True,'sourceGoldUnchanged':True,
        'exactSavedReplays':15,'firstPassOutputsByteIdenticalAfterSafetyCorrection':15,
        'canonicalKernelAuthorityRuntimeUnchanged':True,'newReviewFiles':new}
(ART/'boundary-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='newReviewFiles'},indent=2))
