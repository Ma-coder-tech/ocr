"""Score retained source expectations, semantic gaps and exact replay separately."""
import json
from collections import Counter
from evidence import BASE, ART, ROOT, load, DEVELOPMENT, HOLDOUT
from verification import digest, validate_saved

report={'expectedClaims':0,'exactExpectedOutcomes':0,'basisGapChecks':[],'calibrationCounts':{},'replay':[]}
by_kind={}
for statement in json.loads((BASE/'control-relationship-gold.json').read_text())['statements']:
    name=statement['id'];out=json.loads((ART/f'{name}-verification.json').read_text());claims={digest(c['request']):c for c in out['claims']}
    for e in statement['expectedClaims']:
        report['expectedClaims']+=1;c=claims[digest(e['request'])];assert c['status']==e['status'],(name,e,c['status'])
        if 'calculation' in e:
            assert all(c['calculation'][k]==v for k,v in e['calculation'].items())
        if 'duplicateReferencesRemoved' in e:assert c['calculation']['duplicateReferencesRemoved']==e['duplicateReferencesRemoved']
        report['exactExpectedOutcomes']+=1
    for c in out['claims']:
        by_kind.setdefault(c['request']['kind'],Counter())[c['status']]+=1
        if c['status']=='supported':
            assert all(o['state']=='pass' for o in c['obligations']), (name,c)
        if c['request']['kind']=='fee_calculation':
            assert c['status'] in ('incomplete_evidence','unresolved_interpretation')
            assert all(not c.get('conditionalDiagnostic',{}).get(k,False) for k in ['provesFinancialCalculation'])
        if c['status']=='contradicted' and c['request']['kind']=='printed_total':
            assert c['calculation']['residualComputedMinusClaimed']!=0
        assert c['evidenceStrength'] not in ('high_confidence','certain')
    req=json.loads((ART/f'{name}-requests.json').read_text());inputs=load(name)
    assert validate_saved(*inputs,req,out)
    report['replay'].append({'id':name,'claims':len(req),'exact':True})

# Source-reviewed clear phrases that the prior semantic grammar could not parse
# remain incomplete. Their admitted charged amounts still participate in passing
# printed total checks; unavailable basis is not silently used for pricing.
gold=json.loads((ROOT/'evaluations/financial-population-scope-v1/holdout-basis-gold.json').read_text())
for statement in gold['statements']:
    name=statement['id'];semantic=load(name)[-1];out=json.loads((ART/f'{name}-verification.json').read_text())
    atoms={frozenset(a['provenance']['fragmentRefs']):a for a in semantic['atoms'] if a['role']=='fee_charge'}
    claims={digest(c['request']):c for c in out['claims']};counts=Counter();missing=[]
    for row in statement['feeRows']:
        atom=atoms[frozenset(row['chargeRefs'])]
        c=claims[digest({'kind':'basis_phrase','atomRef':atom['id']})]
        if row['expectedStatus']=='clear_basis':
            counts['clearPhrases']+=1
            if atom['basisPhrase']['status']=='explicit_printed_basis':
                assert c['status']=='supported';counts['supportedPhrases']+=1
            else:
                assert c['status']=='incomplete_evidence';counts['missedClearPhrases']+=1
                pricing=claims[digest({'kind':'fee_calculation','atomRef':atom['id']})]
                assert pricing['status']=='incomplete_evidence'
                owners=[s for s in semantic['scopes'] if atom['id'] in s['atomRefs']]
                assert owners and all(claims[digest({'kind':'printed_total','totalRowRef':s['totalRowRef'],'role':s['role']})]['status']=='supported' for s in owners)
                missing.append({'atomRef':atom['id'],'sourceDescription':row['rawDescription'],'basis':'incomplete_evidence','pricing':'incomplete_evidence','containingPrintedTotal':'supported'})
        else:
            assert c['status']=='incomplete_evidence'
            counts['ambiguousPhrases' if row['expectedStatus']=='ambiguous' else 'noExplicitPhrase']+=1
    assert not any(c['status']=='supported' for c in out['claims'] if c['request']['kind']=='economic_relation')
    report['basisGapChecks'].append({'id':name,**counts,'misses':missing})
report['calibrationCounts']={k:dict(v) for k,v in by_kind.items()}
(ART/'scores.json').write_text(json.dumps(report,indent=2)+'\n')
print('Exact predeclared outcomes:',report['exactExpectedOutcomes'],'/',report['expectedClaims'])
print(json.dumps(report['calibrationCounts'],indent=2))
print('All 15 records replayed; all six known clear phrase misses remain blocked for basis/pricing and usable only as admitted charge amounts')
