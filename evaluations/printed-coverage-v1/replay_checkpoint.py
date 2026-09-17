"""Restore retained evaluation records and replay, without network or runtime imports."""
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
manifest = json.loads((BASE / 'checkpoint/manifest.json').read_text())
for entry in manifest['files']:
    data = gzip.decompress((BASE / 'checkpoint' / entry['file']).read_bytes())
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['file']
    path = ROOT / entry['restorePath']
    assert path.resolve().is_relative_to(ROOT / 'artifacts')
    if path.exists():
        assert path.read_bytes() == data, f'Refusing to overwrite differing evidence: {path}'
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(BASE), '-p', 'test_*.py'], check=True, cwd=ROOT)
subprocess.run([sys.executable, str(BASE / 'score.py')], check=True, cwd=ROOT)
subprocess.run([sys.executable, str(BASE / 'challenge_holdouts.py')], check=True, cwd=ROOT)
print('Preserved records restored and independently recomputed. PDF extraction itself was not rerun.')
