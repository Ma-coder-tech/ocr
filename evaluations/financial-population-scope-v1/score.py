"""Exact source-cell role/set and independently annotated basis scoring."""
import json
from decimal import Decimal
from collections import Counter
from io_evidence import BASE, ART, load, assert_frozen
from semantics import aggregate, validate_semantic_record

assert_frozen()
report = {'roleScores': [], 'basisScores': [], 'basisMisses': [], 'relationshipChecks': [], 'replay': []}
for cohort in ['development','holdout']:
    gold = json.loads((BASE/f'{cohort}-semantic-gold.json').read_text())
    for statement in gold['statements']:
        name = statement['id'];p, structure, inv = load(name)
        result = json.loads((ART/f'{name}-semantic.json').read_text())
        atoms = {(a['role'],frozenset(a['provenance']['fragmentRefs'])):a for a in result['atoms']}
        structural_rows = {r['id']:r for t in structure['tables'] for r in t['rows']}
        correct_cells, expected_cells, correct_sets, expected_sets = 0,0,0,0
        expected_keys = set()
        for table in statement['tables']:
            by_role = {}
            for row in table['rows']:
                for cell in row['cells']:
                    key = cell['role'],frozenset(cell['fragmentRefs'])
                    expected_keys.add(key);expected_cells += 1
                    observed = atoms.get(key)
                    correct_cells += bool(observed and observed['rawText'] == cell['rawText'] and observed['provenance']['page'] == row['page'] and observed['status'] == 'printed_meaning_supported' and observed['provenance']['columnHeaderRefs'])
                    by_role.setdefault(cell['role'],set()).add(key)
            for role, keys in by_role.items():
                expected_sets += 1
                candidates = [s for s in result['scopes'] if s['role'] == role and set(structural_rows[s['totalRowRef']]['fragmentRefs']) == set(table['totalFragmentRefs'])]
                if len(candidates) == 1:
                    s = candidates[0]
                    actual_keys = {(a['role'],frozenset(a['provenance']['fragmentRefs'])) for a in result['atoms'] if a['id'] in s['atomRefs']}
                    correct_sets += actual_keys == keys and len(s['atomRefs']) == len(keys)
        extra = len(set(atoms)-expected_keys) if cohort == 'holdout' else None
        row = {'id':name,'cohort':cohort,'expectedCells':expected_cells,'correctCells':correct_cells,'expectedMeasureSets':expected_sets,'correctMeasureSets':correct_sets,'extraAtomsOutsideGold':extra}
        report['roleScores'].append(row)
        assert correct_cells == expected_cells and correct_sets == expected_sets and extra in (None,0), row

basis = json.loads((BASE/'holdout-basis-gold.json').read_text())
for statement in basis['statements']:
    result = json.loads((ART/f"{statement['id']}-semantic.json").read_text())
    atoms = {frozenset(a['provenance']['fragmentRefs']):a for a in result['atoms'] if a['role'] == 'fee_charge'}
    score = Counter()
    for row in statement['feeRows']:
        a = atoms[frozenset(row['chargeRefs'])];q = a['basisPhrase']
        accepted = q['status'] == 'explicit_printed_basis'
        if row['expectedStatus'] == 'clear_basis':
            score['clearBasisPhrases'] += 1
            if accepted:
                correct = set(q['values']) == set(row['values']) and all(Decimal(q['values'][k]) == Decimal(v) for k,v in row['values'].items())
                score['correctBasisPhrases' if correct else 'wrongBasisPhrases'] += 1
                assert correct
            else:
                score['missedClearBasisPhrases'] += 1
                report['basisMisses'].append({'id':statement['id'],'description':row['rawDescription'],'reason':q['reason']})
        else:
            score['ambiguousPhrases' if row['expectedStatus'] == 'ambiguous' else 'noExplicitPhrase'] += 1
            score['falsePositivePhrases'] += accepted
            assert not accepted
    report['basisScores'].append({'id':statement['id'],**score})
    rel = Counter(r['relation'] for r in result['relationships'])
    assert rel == {'different_measures_shared_rows':21,'unknown':15}
    assert all(r['economicActivityRelation'] == 'unknown' and not r['canAddHeadlineTotals'] for r in result['relationships'])
    fee_scopes = [s['id'] for s in result['scopes'] if s['role'] == 'fee_charge']
    assert aggregate(result,fee_scopes)['status'] == 'withheld'
    report['relationshipChecks'].append({'id':statement['id'],'differentMeasurePairs':21,'unknownPairs':15,'feeSectionJointAggregation':'withheld','economicIdentityClaims':0})

for path in sorted(ART.glob('*-semantic.json')):
    name = path.name.removesuffix('-semantic.json');inputs=load(name);result=json.loads(path.read_text())
    ok=validate_semantic_record(*inputs,result);assert ok
    report['replay'].append({'id':name,'exactReplay':ok})
(ART/'scores.json').write_text(json.dumps(report,indent=2)+'\n')
for cohort in ['development','holdout']:
    rows=[r for r in report['roleScores'] if r['cohort']==cohort]
    print(cohort,{key:sum(r[key] for r in rows) for key in ['expectedCells','correctCells','expectedMeasureSets','correctMeasureSets']})
print('basis',dict(sum((Counter({k:v for k,v in r.items() if k!='id'}) for r in report['basisScores']),Counter())))
print('All',len(report['replay']),'saved semantic records replayed exactly')
