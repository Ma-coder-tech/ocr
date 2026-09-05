"""Source-only annotation transcription, written before opening engine results.

These explicit source regions are evaluation gold, never engine parameters.
All 13 reserved original source pages were visually reviewed. Native fragments transcribe
the rendered rows without retyping amounts. No structure engine import.
"""
import bisect
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'artifacts/printed-coverage-v1'
# page, inclusive detail baseline range, visually counted detail rows
REGIONS = {
 'holdout-7': [('batch',[(274,570,706,15),(275,166,178,2)],275,190,'$28,565.29'),
               ('transaction',[(275,449,706,24),(276,133,178,4)],276,188.6,'-$200.51'),
               ('account',[(276,214,245,4)],276,255.8,'-$11.00')],
 'holdout-8': [('batch',[(278,560,706,16),(279,166,168,1)],279,180.4,'$23,853.18'),
               ('transaction',[(279,440,644,19)],279,654.6,'-$206.03'),
               ('account',[(279,680,683,1),(280,133,135,1)],280,145.4,'-$9.76')],
 'holdout-9': [('batch',[(283,263,419,17)],283,431,'$27,060.13'),
               ('transaction',[(283,690,704,2),(284,133,389,23)],284,399.8,'-$262.67'),
               ('account',[(284,425,456,4)],284,467,'-$12.29')],
}

gold = {'method': 'Single-reviewer source-page visual annotation, then source-only native transcription; before structure outputs. Exhaustive detail cells in nine in-scope logical tables, not whole-document gold.',
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
                        else f['text'] in ('Fees', 'Interchange charges', 'Service charges') and 420 < f['x'] < 470)]
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
out = ROOT / 'evaluations/printed-coverage-v1/holdout-gold.json'
assert not out.exists(), 'Never silently regenerate an unblinded gold set'
out.write_text(json.dumps(gold, indent=2) + '\n')
print(json.dumps({'path': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'detail_rows': sum(len(t['rows']) for s in gold['statements'] for t in s['tables'])}))
