"""Post-freeze challenges on previously studied reserved layouts; no tuning."""
import copy
import json
from evidence import ART, load, HOLDOUT
from verification import verify_claims, validate_saved, digest
from semantics import analyze
from structure import assemble
from coverage import source_inventory

results=[]
for name in HOLDOUT:
    inputs=load(name);requests=json.loads((ART/f'{name}-requests.json').read_text());original=json.loads((ART/f'{name}-verification.json').read_text())
    for mutation in ['promote_identity','promote_pricing','remove_control_evidence','remove_obligation','alter_operand','alter_request','remove_source_page']:
        inp=copy.deepcopy(inputs);out=copy.deepcopy(original)
        if mutation=='promote_identity':next(c for c in out['claims'] if c['request']['kind']=='economic_relation')['status']='supported'
        elif mutation=='promote_pricing':next(c for c in out['claims'] if c['request']['kind']=='fee_calculation')['status']='supported'
        elif mutation=='remove_control_evidence':next(c for c in out['claims'] if c['request']['kind']=='printed_total' and c['status']=='supported')['evidence']['controlFragmentRefs']=[]
        elif mutation=='remove_obligation':out['claims'][0]['obligations']=[]
        elif mutation=='alter_operand':next(c for c in out['claims'] if c.get('calculation'))['calculation']['computedValue']=0
        elif mutation=='alter_request':out['claims'][0]['request']['role']='chargeback_principal'
        else:inp[0]['pages'].pop()
        out['resultFingerprint']=digest({k:v for k,v in out.items() if k!='resultFingerprint'})
        accepted=validate_saved(*inp,requests,out);assert not accepted
        results.append({'id':name,'challenge':mutation,'incorrectAdmission':accepted})
    # Change the source control while preserving geometry/membership; supply a new
    # inventory to test contradiction handling independently of integrity rejection.
    p,s,inv,semantic=copy.deepcopy(inputs)
    scope=next(s for s in semantic['scopes'] if s['role']=='fee_charge')
    refs=scope['printedControl']['fragmentRefs'];assert len(refs)==1
    fragment=next(f for page in p['pages'] for f in page['fragments'] if f['id']==refs[0]);fragment['text']='-$999.99'
    inv=source_inventory(p);struct=json.loads(json.dumps(assemble(p,inv)));sem=analyze(p,struct,inv)
    changed_scope=next(x for x in sem['scopes'] if x['id']==scope['id'])
    assert changed_scope['memberRowRefs']==scope['memberRowRefs']
    req=[{'kind':'printed_total','totalRowRef':scope['totalRowRef'],'role':scope['role']}]
    out=verify_claims(p,struct,inv,sem,req)
    assert out['claims'][0]['status']=='contradicted'
    results.append({'id':name,'challenge':'changed_valid_source_total','status':'contradicted','membersChanged':False})
(ART/'challenges.json').write_text(json.dumps(results,indent=2)+'\n')
print('21/21 edited/incomplete records rejected; 3/3 changed-source control contradictions detected')
