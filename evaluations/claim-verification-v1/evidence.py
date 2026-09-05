"""Read-only binding to the existing structural checkpoint and semantic artifacts."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'financial-population-scope-v1'))
from io_evidence import load as load_structure, DEVELOPMENT, HOLDOUT, assert_frozen as assert_semantics_frozen
BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
ART = ROOT / 'artifacts/claim-verification-v1'


def load(name):
    assert_semantics_frozen()
    semantic = json.loads((ROOT/f'artifacts/financial-population-scope-v1/{name}-semantic.json').read_text())
    return (*load_structure(name), semantic)
