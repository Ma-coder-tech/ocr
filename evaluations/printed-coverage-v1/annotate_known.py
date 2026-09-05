"""Source-only annotation transcription, written after source review of development cases.

These explicit source regions are evaluation gold, never engine parameters.
All nine known source fee pages were visually reviewed. Native fragments transcribe
the rendered rows without retyping amounts. No structure engine import.
"""
import bisect
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'artifacts/printed-membership-v1'
# page, inclusive detail baseline range, visually counted detail rows
REGIONS = {
 'basys': [('transaction',[(4,162,706,56),(5,133,586,42)],5,596.6,'-$3,512.68'),
           ('account',[(5,661,692,4),(6,133,135,1)],6,145.4,'-$18.87')],
 'clover-october': [('transaction',[(4,253,701,46),(5,133,702,54),(6,133,226,9)],6,236.6,'-$1,210.89')],
 'clover-november': [('transaction',[(4,233,598,33),(5,149,721,49),(6,149,472,27)],6,481.4,'-$1,228.33')],
}

gold = {'method': 'Single-reviewer source-page visual annotation, then source-only native transcription; after development outputs; this is regression gold, not holdout gold. Exhaustive detail cells in nine in-scope logical tables, not whole-document gold.',
        'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'layout_families': 1, 'statements': [],
        'limits': ['No independent second reviewer', 'One previously unstudied merchant/layout family',
                   'Day/card/chargeback/interchange and fee-category summaries are outside positive scope',
                   'No natural split-number/wrapped-row positive in this holdout; adversarial and known cases cover these separately']}
for name, specs in REGIONS.items():
    packet = json.loads((ART / f'{name}-native.json').read_text())
    pages = {p['page']: p for p in packet['pages']}
    statement = {'id': name, 'sourceSha256': packet['sourceSha256'], 'tables': []}
    for kind, regions, totalpage, totaly, totalamount in specs:
        table = {'kind': kind, 'regions': regions, 'rows': [], 'totalPage': totalpage,
                 'totalAmount': totalamount, 'expectedMemberCount': sum(x[3] for x in regions),
                 'continuation': 'repeated_header' if kind == 'batch' and len(regions) > 1 else 'headerless' if len(regions) > 1 else None}
        for page, lo, hi, count in regions:
            fs = pages[page]['fragments']
            anchors = [f for f in fs if lo <= f['y'] <= hi and
                       (bool(re.fullmatch(r'\d{2}/\d{2}/\d{2}', f['text'])) and 110 < f['x'] < 130 if kind == 'batch'
                        else f['text'] in ('Fees', 'Interchange charges', 'Service charges', 'Program Fees') and 420 < f['x'] < 470)]
            assert len(anchors) == count, (name, kind, page, count, len(anchors))
            for anchor in sorted(anchors, key=lambda f: f['y']):
                rowfs = sorted([f for f in fs if abs(f['y'] - anchor['y']) < 1 and f['text'].strip()], key=lambda f: f['x'])
                cuts = [110, 160, 226, 277, 351, 400, 470, 525] if kind == 'batch' else [410, 520]
                cells = [[] for _ in range(len(cuts) + 1)]
                for f in rowfs: cells[bisect.bisect(cuts, f['x'])].append(f)
                assert all(cells), (name, kind, page, anchor)
                table['rows'].append({'page': page, 'y': anchor['y'], 'cells': [
                    {'rawText': ' '.join(f['text'] for f in cell), 'fragmentRefs': [f['id'] for f in cell]} for cell in cells]})
        totalfs = [f for f in pages[totalpage]['fragments'] if abs(f['y'] - totaly) < 1]
        assert totalamount in [f['text'] for f in totalfs], (name, kind, totalfs)
        table['totalFragmentRefs'] = [f['id'] for f in totalfs]
        statement['tables'].append(table)
    gold['statements'].append(statement)
out = ROOT / 'evaluations/printed-coverage-v1/known-gold.json'
assert not out.exists(), 'Never silently regenerate an unblinded gold set'
out.write_text(json.dumps(gold, indent=2) + '\n')
print(json.dumps({'path': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'detail_rows': sum(len(t['rows']) for s in gold['statements'] for t in s['tables'])}))
