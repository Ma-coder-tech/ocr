"""Source-only transcription from previously reviewed exact structural cell gold.

No semantic engine or generated semantic results are imported. Role vectors are
reviewer assignments for the source headers, not predictions from the classifier.
"""
import argparse
import gzip
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
EVAL = BASE.parent
parser = argparse.ArgumentParser()
parser.add_argument('--cohort', choices=['development', 'holdout'], required=True)
args = parser.parse_args()
paths = ([EVAL/'printed-coverage-v1/holdout-gold.json'] if args.cohort == 'holdout' else
         [EVAL/'printed-coverage-v1/known-gold.json', EVAL/'printed-membership-v1/holdout-gold.json', EVAL/'printed-membership-v1/holdout-v2-gold.json'])
result = {'cohort': args.cohort, 'method': 'Single-reviewer role assignment to source-first structural gold; not independent dual annotation',
          'limit': 'This is not economic transaction identity gold. Holdout PDFs were studied structurally before this milestone.', 'statements': []}
for path in paths:
    for statement in json.loads(path.read_text())['statements']:
        name = statement['id']
        packet = json.loads(gzip.decompress((EVAL/f'printed-coverage-v1/checkpoint/{name}-native.json.gz').read_bytes()))
        fs = {f['id']:f for p in packet['pages'] for f in p['fragments']}
        out = {'id':name, 'tables':[]}
        for table in statement['tables']:
            width = len(table['rows'][0]['cells'])
            if width == 3:
                roles = [None,None,'fee_charge']
            elif width == 9:
                roles = [None,None,'average_ticket','gross_sales_count','gross_sales_amount','refunds_count','refunds_amount','submitted_count','submitted_amount']
            else:
                raise ValueError('Requires fresh source role review')
            expected = {'kind':table['kind'], 'totalFragmentRefs':table['totalFragmentRefs'], 'rows':[]}
            for row in table['rows']:
                cells = []
                for role, cell in zip(roles,row['cells']):
                    if role:
                        refs = cell['fragmentRefs']
                        cells.append({'role':role, 'fragmentRefs':refs, 'rawText':' '.join(fs[x]['text'] for x in refs)})
                expected['rows'].append({'page':row['page'], 'cells':cells})
            out['tables'].append(expected)
        result['statements'].append(out)
(BASE/f'{args.cohort}-semantic-gold.json').write_text(json.dumps(result,indent=2)+'\n')
print('Recorded source-first',args.cohort,'role gold')
