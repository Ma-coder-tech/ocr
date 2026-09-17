"""Post-freeze admission challenges; never tune the engine from these results."""
import copy
import json
from io_evidence import load, HOLDOUT, ART, assert_frozen
from semantics import analyze, digest, validate_semantic_record

assert_frozen();results=[]
for name in HOLDOUT:
    inputs=load(name);saved=json.loads((ART/f'{name}-semantic.json').read_text())
    for mutation in ['charge_changed_and_rehashed','component_meaning_invented','economic_identity_invented','evidence_removed','missing_source_page']:
        p,s,inv=copy.deepcopy(inputs);out=copy.deepcopy(saved)
        if mutation=='charge_changed_and_rehashed':
            next(a for a in out['atoms'] if a['role']=='fee_charge')['amountMinor'] = -999999
        elif mutation=='component_meaning_invented':
            out['atoms'][0]['role']='chargeback_principal'
        elif mutation=='economic_identity_invented':
            next(r for r in out['relationships'] if r['relation']=='unknown')['economicActivityRelation']='same'
        elif mutation=='evidence_removed':
            out['atoms'][0]['provenance']['columnHeaderRefs']=[]
        else:
            p['pages'].pop()
        out['resultFingerprint']=digest({k:v for k,v in out.items() if k!='resultFingerprint'})
        accepted=validate_semantic_record(p,s,inv,out)
        results.append({'id':name,'mutation':mutation,'incorrectAdmission':accepted})
        assert not accepted
(ART/'holdout-challenges.json').write_text(json.dumps(results,indent=2)+'\n')
print('15/15 altered or incomplete evidence records rejected')
