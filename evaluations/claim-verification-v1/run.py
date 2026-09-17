import argparse
import hashlib
import json
import time
from collections import Counter
from evidence import load, BASE, ART, DEVELOPMENT, HOLDOUT
from verification import verify_claims, validate_saved

parser=argparse.ArgumentParser()
parser.add_argument('--cohort',choices=['development','reserved'],required=True)
args=parser.parse_args()
frozen=json.loads((BASE/'frozen.json').read_text())
for name,sha in frozen['sha256'].items():assert hashlib.sha256((BASE/name).read_bytes()).hexdigest()==sha,name
summary=[]
for name in DEVELOPMENT if args.cohort=='development' else HOLDOUT:
    inputs=load(name);requests=json.loads((ART/f'{name}-requests.json').read_text());start=time.perf_counter()
    assert hashlib.sha256((ART/f'{name}-requests.json').read_bytes()).hexdigest()==frozen['requestHashes'][name]
    out=verify_claims(*inputs,requests)
    path=ART/f'{name}-verification.json';path.write_text(json.dumps(out,indent=2)+'\n')
    assert validate_saved(*inputs,requests,json.loads(path.read_text()))
    summary.append({'id':name,'claims':len(requests),'statusCounts':dict(Counter(c['status'] for c in out['claims'])),
                    'byKind':{kind:dict(Counter(c['status'] for c in out['claims'] if c['request']['kind']==kind)) for kind in sorted({c['request']['kind'] for c in out['claims']})},
                    'secondsIncludingReplay':round(time.perf_counter()-start,3)})
(ART/f'{args.cohort}-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
