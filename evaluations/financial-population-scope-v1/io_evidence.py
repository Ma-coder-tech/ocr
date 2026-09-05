"""Evaluation corpus loader. Integrity references come from the preserved checkpoint."""
import gzip
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
CHECKPOINT = BASE.parent / 'printed-coverage-v1/checkpoint'
ART = ROOT / 'artifacts/financial-population-scope-v1'
NAMES = ['priority', 'paysafe', 'paysafe-zero', 'basys', 'clover-october', 'clover-november']
DEVELOPMENT = NAMES + [f'holdout-{i}' for i in range(1, 7)]
HOLDOUT = [f'holdout-{i}' for i in range(7, 10)]


def load(name):
    manifest = json.loads((CHECKPOINT / 'manifest.json').read_text())
    expected = {e['file']: e['sha256'] for e in manifest['files']}
    values = []
    for kind in ['native', 'structure', 'inventory']:
        filename = f'{name}-{kind}.json.gz'
        raw = gzip.decompress((CHECKPOINT / filename).read_bytes())
        assert hashlib.sha256(raw).hexdigest() == expected[filename], filename
        values.append(json.loads(raw))
    return tuple(values)


def assert_frozen():
    frozen = json.loads((BASE / 'frozen.json').read_text())
    for name, expected in frozen['sha256'].items():
        assert hashlib.sha256((BASE / name).read_bytes()).hexdigest() == expected, name
    return frozen
