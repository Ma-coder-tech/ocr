"""One statement per analysis; the loop is an offline evaluation harness only."""
import argparse
import json
import time
from pathlib import Path
from semantics import analyze, aggregate, validate_semantic_record
from io_evidence import load, DEVELOPMENT, HOLDOUT, ART, BASE, assert_frozen

parser = argparse.ArgumentParser()
parser.add_argument('--cohort', choices=['development', 'holdout'], required=True)
args = parser.parse_args()
if args.cohort == 'holdout':
    assert_frozen()
    assert (BASE / 'holdout-semantic-gold.json').exists(), 'Record source-first holdout expectations before outputs'
ART.mkdir(exist_ok=True)
summary = []
for name in DEVELOPMENT if args.cohort == 'development' else HOLDOUT:
    inputs = load(name)
    start = time.perf_counter()
    result = analyze(*inputs)
    path = ART / f'{name}-semantic.json'
    path.write_text(json.dumps(result, indent=2) + '\n')
    assert validate_semantic_record(*inputs, json.loads(path.read_text()))
    unions = {s['id']: aggregate(result, [s['id']]) for s in result['scopes']}
    (ART / f'{name}-unions.json').write_text(json.dumps(unions, indent=2)+'\n')
    summary.append({'id': name, 'scopes': len(result['scopes']), 'atoms': len(result['atoms']),
                    'explicitBasisPhrases': sum(a.get('basisPhrase',{}).get('status') == 'explicit_printed_basis' for a in result['atoms']),
                    'unresolvedBasisPhrases': sum(a.get('basisPhrase',{}).get('status') == 'unresolved' for a in result['atoms']),
                    'unresolvedAtoms': sum(a['status'] == 'unresolved' for a in result['atoms']),
                    'withheldStructuralScopes': len(result['withheldStructuralScopes']),
                    'relationships': {kind: sum(r['relation'] == kind for r in result['relationships']) for kind in sorted({r['relation'] for r in result['relationships']})},
                    'secondsIncludingReplay': round(time.perf_counter()-start, 3)})
(ART / f'{args.cohort}-summary.json').write_text(json.dumps(summary, indent=2)+'\n')
print(json.dumps(summary, indent=2))
