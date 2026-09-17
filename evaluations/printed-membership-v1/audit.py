"""Read-only checks of evaluation boundaries and recorded source bindings."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = Path(__file__).parent
ART = ROOT / 'artifacts/printed-membership-v1'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
before = json.loads((ART / 'existing-files.json').read_text())
freeze = json.loads((BASE / 'frozen-v2.json').read_text())
oldfreeze = json.loads((BASE / 'frozen.json').read_text())
changed = [p for p,h in before.items() if not (ROOT/p).is_file() or sha(ROOT/p) != h]
frozenchanged = [p for p,h in freeze['files'].items() if sha(BASE/p) != h]
archivechanged = [p for p,h in oldfreeze['files'].items() if sha(ART/'round-1'/p) != h]
native = json.loads((ART / 'holdout-sealed/monroe-native.json').read_text())
source_verified = sha(ART/'holdout-sealed/monroe.pdf') == native['sourceSha256']
subsets = []
for n in range(1,7):
    packet = json.loads((ART / f'holdout-sealed/holdout-{n}-native.json').read_text())
    pages = {p['page'] for p in packet['pages']}
    subsets.append({'id': f'holdout-{n}', 'exactOriginalPacketSubset': packet == {**native, 'pages': [p for p in native['pages'] if p['page'] in pages]}})
knownpdfs = list((ROOT/'test').rglob('*.pdf'))
knownhashes = {sha(p): str(p.relative_to(ROOT)) for p in knownpdfs}
bindings = []
for p in sorted(ART.glob('*-native.json')):
    packet = json.loads(p.read_text())
    bindings.append({'packet': p.name, 'source': knownhashes.get(packet['sourceSha256']), 'sha256': packet['sourceSha256']})
result = {'preexistingFilesChecked':len(before), 'preexistingFilesChanged':changed,
          'trackedDiffIdenticalToStart':subprocess.check_output(['git','diff','--binary'],cwd=ROOT)==(ART/'tracked-before.diff').read_bytes(),
          'frozenV2FilesChanged':frozenchanged, 'round1ArchiveChanged':archivechanged,
          'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
          'knownPdfFilesChecked':len(knownpdfs), 'sourceByteDuplicates':[knownhashes[native['sourceSha256']]] if native['sourceSha256'] in knownhashes else [],
          'priorAccountTextMatches':(ART/'prior-account-search.txt').read_text().splitlines(),
          'originalPdfBytesVerified':source_verified, 'holdoutPackets':subsets, 'knownBindings':bindings}
(ART/'boundary-audit.json').write_text(json.dumps(result,indent=2)+'\n')
assert not changed and not frozenchanged and not archivechanged
assert result['trackedDiffIdenticalToStart'] and source_verified
assert all(x['exactOriginalPacketSubset'] for x in subsets)
assert all(x['source'] for x in bindings)
print(json.dumps(result,indent=2))
