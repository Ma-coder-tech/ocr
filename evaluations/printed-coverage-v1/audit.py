"""Read-only boundary and source-reference audit for this milestone."""
import hashlib
import json
import subprocess
from pathlib import Path
from coverage import source_inventory

ROOT=Path(__file__).resolve().parents[2];BASE=Path(__file__).parent
ART=ROOT/'artifacts/printed-coverage-v1';OLD=ROOT/'artifacts/printed-membership-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=json.loads((ART/'before.json').read_text());freeze=json.loads((BASE/'frozen.json').read_text())
changed=[p for p,h in before.items() if not (ROOT/p).is_file() or sha(ROOT/p)!=h]
frozen_changed=[p for p,h in freeze['files'].items() if sha(BASE/p)!=h]
source=json.loads((OLD/'holdout-sealed/monroe-native.json').read_text())
assert sha(OLD/'holdout-sealed/monroe.pdf')==source['sourceSha256']
bindings=json.loads((OLD/'boundary-audit.json').read_text())['knownBindings']
for item in bindings:assert sha(ROOT/item['source'])==item['sha256']
inventories=[]
for file in sorted(ART.glob('*-inventory.json')):
 name=file.name.removesuffix('-inventory.json')
 path=ART/f'{name}-native.json'
 if not path.exists():path=OLD/(f'holdout-sealed/{name}-native.json' if name.startswith('holdout') else f'{name}-native.json')
 packet=json.loads(path.read_text())
 if name.startswith('holdout'):
  pages={p['page'] for p in packet['pages']};original={**source,'pages':[p for p in source['pages'] if p['page'] in pages]}
  assert packet==original
 else:
  assert packet['sourceSha256']==next(b['sha256'] for b in bindings if b['packet']==f'{name}-native.json')
 assert json.loads(file.read_text())==source_inventory(packet)
 inventories.append(name)
current=[]
for directory in ['src','test','scripts','docs','evaluations','data']:
 current.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
new_files=[str(p.relative_to(ROOT)) for p in current if str(p.relative_to(ROOT)) not in before]
confined=all(p.startswith('evaluations/printed-coverage-v1/') for p in new_files)
ignored=subprocess.run(['git','check-ignore','artifacts/printed-coverage-v1/scores.json'],cwd=ROOT,capture_output=True).returncode==0
out={'preexistingFilesChecked':len(before),'changedPreexistingFiles':changed,'changedFrozenFiles':frozen_changed,
     'trackedDiffUnchanged':subprocess.check_output(['git','diff','--binary'],cwd=ROOT)==(ART/'before.diff').read_bytes(),
     'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
     'sourceInventoriesVerified':inventories,'originalPdfBindingsVerified':True,
     'newFilesConfinedToEvaluationAndIgnoredArtifacts':confined and ignored,'newEvaluationFiles':new_files}
(ART/'boundary-audit.json').write_text(json.dumps(out,indent=2)+'\n')
assert not changed and not frozen_changed and out['trackedDiffUnchanged'] and confined and ignored
print(json.dumps(out,indent=2))
