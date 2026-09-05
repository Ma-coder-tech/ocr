"""Source-only annotation transcription, written before opening engine results.

These explicit source regions are evaluation gold, never engine parameters.
All 15 original source pages were visually reviewed. Native fragments transcribe
the rendered rows without retyping amounts. No structure engine import.
"""
import bisect
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'artifacts/printed-membership-v1/holdout-sealed'
# page, inclusive detail baseline range, visually counted detail rows
REGIONS = {
    'holdout-1': [('batch', [(146, 589, 706, 13), (147, 166, 216, 6)], 147, 228.4, '$112,695.50'),
                  ('transaction', [(147, 480, 716, 22), (148, 130, 307, 15)], 148, 308.6, '-$759.35'),
                  ('account', [(148, 334, 365, 4)], 148, 375.8, '-$39.88')],
    'holdout-2': [('batch', [(152, 608, 706, 11), (153, 166, 245, 9)], 153, 257.2, '$128,020.79'),
                  ('transaction', [(153, 508, 716, 19), (154, 130, 327, 17)], 154, 327.8, '-$1,038.52'),
                  ('account', [(154, 353, 365, 2)], 154, 375.8, '-$36.20')],
    'holdout-3': [('batch', [(159, 282, 496, 23)], 159, 507.8, '$138,659.29'),
                  ('transaction', [(160, 161, 562, 38)], 160, 572.6, '-$1,129.54'),
                  ('account', [(160, 598, 649, 6)], 160, 659, '-$43.70')],
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
out = ROOT / 'evaluations/printed-membership-v1/holdout-gold.json'
assert not out.exists(), 'Never silently regenerate an unblinded gold set'
out.write_text(json.dumps(gold, indent=2) + '\n')
print(json.dumps({'path': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'detail_rows': sum(len(t['rows']) for s in gold['statements'] for t in s['tables'])}))
