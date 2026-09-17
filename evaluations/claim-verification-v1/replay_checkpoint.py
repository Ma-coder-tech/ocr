"""Portable replay of the approved claims and their semantic dependency."""
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[1]
for entry in json.loads((BASE/'checkpoint/manifest.json').read_text())['files']:
    raw=gzip.decompress((BASE/'checkpoint'/entry['file']).read_bytes())
    assert hashlib.sha256(raw).hexdigest()==entry['sha256']
    path=ROOT/entry['restorePath'];assert path.resolve().is_relative_to(ROOT/'artifacts')
    if path.exists():assert path.read_bytes()==raw,f'Refusing to overwrite differing evidence: {path}'
    else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
for name in ['printed-coverage-v1','financial-population-scope-v1','claim-verification-v1']:
    subprocess.run([sys.executable,'-m','unittest','discover','-s',str(ROOT/'evaluations'/name),'-p','test_*.py'],check=True,cwd=ROOT)
for script in ['score.py','challenges.py']:
    subprocess.run([sys.executable,str(BASE/script)],check=True,cwd=ROOT)
print('108 tests passed; all 15 claim reports replayed. PDF extraction and historical worktree audits were not rerun.')
