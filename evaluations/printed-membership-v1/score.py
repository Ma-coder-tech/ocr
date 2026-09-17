"""Disconnected exact source-cell/member scoring; never imported by the engine."""
import json
import re
from pathlib import Path
from structure import validate_saved

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'artifacts/printed-membership-v1'
GOLD = json.loads((Path(__file__).parent / 'holdout-gold.json').read_text())
GOLD['statements'] += json.loads((Path(__file__).parent / 'holdout-v2-gold.json').read_text())['statements']
report = {'holdout': [], 'knownAnchors': [], 'provenance': []}
def refs(row): return frozenset(x for c in row['cells'] for x in c['fragmentRefs'])
def cells(row): return [frozenset(c['fragmentRefs']) for c in row['cells']]
for statement in GOLD['statements']:
    name = statement['id']; result = json.loads((ART / f'{name}-structure.json').read_text())
    allrows = [(t, r) for t in result['tables'] for r in t['rows'] if r['kind'] == 'detail']
    byrefs = {refs(r): (t, r) for t, r in allrows}
    matched = set()
    for table in statement['tables']:
        score = {'id': name, 'kind': table['kind'], 'expectedRows': len(table['rows']),
                 'cohort': 'fresh_after_revision' if int(name.split('-')[-1]) >= 4 else 'first_pass_then_regression',
                 'exactRowCells': 0, 'explicitHeaderRows': 0, 'inheritedHeaderRows': 0,
                 'missedOrWrongRows': [], 'regionsDetected': 0, 'expectedRegions': len(table['regions'])}
        expectedmembers = set()
        for row in table['rows']:
            found = byrefs.get(refs(row))
            if found and cells(found[1]) == cells(row) and found[1]['status'] == 'accepted':
                t, r = found; matched.add(r['id']); expectedmembers.add(r['id']); score['exactRowCells'] += 1
                score['inheritedHeaderRows' if t['headerMode'] == 'inherited_proposal' else 'explicitHeaderRows'] += 1
            else: score['missedOrWrongRows'].append({'page': row['page'], 'y': row['y']})
        for page, lo, hi, _ in table['regions']:
            if any(t['page'] == page and any(lo <= r['y'] <= hi and r['kind'] == 'detail' for r in t['rows']) for t in result['tables']): score['regionsDetected'] += 1
        totalrefs = set(table['totalFragmentRefs'])
        totals = [(t, total) for t in result['tables'] for total in t['totals']
                  if any(r['id'] == total['totalRowRef'] and set(r['fragmentRefs']) == totalrefs for r in t['rows'])]
        score['totalStatus'] = totals[0][1]['status'] if len(totals) == 1 else 'missing_or_duplicate'
        score['exactFullMembership'] = len(totals) == 1 and set(totals[0][1]['memberRowRefs']) == expectedmembers and len(expectedmembers) == len(table['rows'])
        score['incorrectAcceptedTotal'] = score['totalStatus'] == 'accepted_printed_run' and not score['exactFullMembership']
        report['holdout'].append(score)
    report['provenance'].append({'id': name, 'extraDetailRowsOutsideGold': [r['id'] for t, r in allrows if r['id'] not in matched], 'continuations': result['continuations']})

norm = lambda x: re.sub(r'\s+', '', x).lower()
selected = set('P2 F3 Z1 Z2 Z3 B3 O1 O2 O3 N1 N2 N3'.split())
oldgold = json.loads((ROOT / 'evaluations/document-structure-comparison-v1/gold.json').read_text())
for anchor in oldgold['anchors']:
    if anchor['id'] not in selected: continue
    result = json.loads((ART / f"{anchor['doc']}-structure.json").read_text())
    found = [(t, r) for t in result['tables'] for r in t['rows'] if r['page'] == anchor['page'] and
             all(any(norm(v) in norm(c['rawText']) for c in r['cells']) for v in anchor['cells'])]
    report['knownAnchors'].append({'id': anchor['id'], 'uniqueAcceptedRow': len(found) == 1 and found[0][1]['status'] == 'accepted',
                                   'matchedCells': [c['rawText'] for c in found[0][1]['cells']] if len(found) == 1 else []})

for resultpath in sorted(ART.glob('*-structure.json')):
    name = resultpath.name.removesuffix('-structure.json')
    packetpath = (ART / 'holdout-sealed' if name.startswith('holdout') else ART) / f'{name}-native.json'
    packet = json.loads(packetpath.read_text()); result = json.loads(resultpath.read_text())
    fs = {f['id']: f for p in packet['pages'] for f in p['fragments']}
    failures = []
    for t in result['tables']:
        for c in t['columns']:
            if any(x not in fs for x in c['headerRefs']): failures.append('missing_header_ref')
        for r in t['rows']:
            for c in r['cells']:
                if c['rawText'] != ' '.join(fs[x]['text'] for x in c['fragmentRefs']): failures.append('raw_text_not_reversible')
    report['provenance'].append({'id': name, 'savedReplayExact': validate_saved(packet, result), 'referenceFailures': failures})

(ART / 'scores.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
