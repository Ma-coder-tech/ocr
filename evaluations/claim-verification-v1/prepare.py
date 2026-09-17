"""Retain explicit requests and source-based control expectations before verification.

Evaluation scaffolding only. No verifier import and no inference from its outputs.
The semantic scopes locate source evidence; known expected outcomes come from
source/control review. This is regression gold, not independent blind annotation.
"""
import itertools
import json
from datetime import datetime, timezone
from evidence import BASE, ART, load, DEVELOPMENT, HOLDOUT

ART.mkdir(parents=True,exist_ok=True)
gold={'createdUtc':datetime.now(timezone.utc).isoformat(),'method':'Single-reviewer source/control expectations over prior admitted semantic evidence; all documents previously studied','statements':[]}
for name in DEVELOPMENT+HOLDOUT:
    inputs=load(name);semantic=inputs[-1];requests=[];expected=[]
    for scope in semantic['scopes']:
        request={'kind':'printed_total','totalRowRef':scope['totalRowRef'],'role':scope['role']}
        requests.append(request)
        status='unresolved_interpretation' if scope['role'] in ('average_ticket','fee_basis_or_volume','printed_rate') else 'contradicted' if name=='paysafe' and scope['role'] in ('fee_charge','funded_amount') else 'supported'
        entry={'request':request,'status':status}
        if name=='paysafe' and scope['role']=='fee_charge':entry['calculation']={'computedValue':-154713,'claimedValue':156573,'residualComputedMinusClaimed':-311286}
        if name=='paysafe' and scope['role']=='funded_amount':entry['calculation']={'computedValue':3534722,'claimedValue':3534721,'residualComputedMinusClaimed':1}
        expected.append(entry)
    for withheld in semantic['withheldStructuralScopes']:
        request={'kind':'printed_total','totalRowRef':withheld['totalRowRef'],'role':'fee_charge'}
        requests.append(request);expected.append({'request':request,'status':'incomplete_evidence'})
    for atom in semantic['atoms']:
        if atom['role']=='fee_charge' and 'description' in atom:
            requests.extend({'kind':kind,'atomRef':atom['id']} for kind in ['basis_phrase','fee_calculation'])
    fees=[s for s in semantic['scopes'] if s['role']=='fee_charge']
    for a,b in itertools.combinations(fees,2):
        for relation in ['same_activity','separate_activity']:
            req={'kind':'economic_relation','scopeRefs':[a['id'],b['id']],'relation':relation}
            requests.append(req);expected.append({'request':req,'status':'unresolved_interpretation'})
    if fees:
        scope=max(fees,key=lambda s:len(s['atomRefs']))
        req={'kind':'financial_completeness','scopeRef':scope['id']}
        requests.append(req);expected.append({'request':req,'status':'unresolved_interpretation'})
    if name in ('priority','paysafe-zero'):
        ss=[s for s in fees if s['printedTitle']=='Fees charged']
        req={'kind':'printed_union','scopeRefs':[s['id'] for s in ss],'claimedValue':-308282 if name=='priority' else -4490}
        requests.append(req);expected.append({'request':req,'status':'supported','duplicateReferencesRemoved':14 if name=='priority' else 6})
    assert not (ART/f'{name}-verification.json').exists(), 'Do not rewrite expectations after results'
    (ART/f'{name}-requests.json').write_text(json.dumps(requests,indent=2)+'\n')
    gold['statements'].append({'id':name,'expectedClaims':expected})
(BASE/'control-relationship-gold.json').write_text(json.dumps(gold,indent=2)+'\n')
print('Requests and source/control expectations retained for 15 previously studied statements')
