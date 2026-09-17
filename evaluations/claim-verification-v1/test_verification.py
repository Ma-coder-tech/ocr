import copy
import json
import unittest
from verification import verify_claims, validate_saved
from semantics import analyze, digest
from evidence import load
from structure import assemble
from coverage import source_inventory
from test_structure import fee, packet


def admit(p):
    inv=source_inventory(p);s=json.loads(json.dumps(assemble(p,inv)))
    return p,s,inv,analyze(p,s,inv)


def claim(inputs, request):
    return verify_claims(*inputs,[request])['claims'][0]


def total(s):return {'kind':'printed_total','totalRowRef':s['totalRowRef'],'role':s['role']}

def fee_scope(inputs):
    return next(s for s in inputs[-1]['scopes'] if s['role']=='fee_charge' and s['printedTitle']!='Amounts funded by batch')


def fee_atom(inputs):return next(a for a in inputs[-1]['atoms'] if a['role']=='fee_charge' and 'description' in a)

class VerificationTests(unittest.TestCase):
    def test_complete_signed_total_supported(self):
        inputs=admit(packet([fee()]));r=claim(inputs,total(fee_scope(inputs)))
        self.assertEqual(r['status'],'supported');self.assertEqual(r['calculation']['computedValue'],-240)
        self.assertEqual(r['evidenceStrength'],'strong_for_this_scoped_assertion')
        self.assertTrue(r['evidence']['controlFragmentRefs'])

    def test_one_cent_contradiction_not_tolerance(self):
        p=packet([fee()]);p['pages'][0]['fragments'][-1]['text']='-$2.41';inputs=admit(p)
        r=claim(inputs,total(fee_scope(inputs)))
        self.assertEqual(r['status'],'contradicted');self.assertEqual(r['calculation']['residualComputedMinusClaimed'],1)
        self.assertFalse(r['calculation']['roundingOrToleranceApplied'])

    def test_control_sign_not_silently_reversed(self):
        p=packet([fee()]);p['pages'][0]['fragments'][-1]['text']='$2.40';inputs=admit(p)
        r=claim(inputs,total(fee_scope(inputs)))
        self.assertEqual(r['status'],'contradicted');self.assertEqual(r['calculation']['residualComputedMinusClaimed'],-480)

    def test_known_paysafe_disagreements_are_scoped_not_repaired(self):
        inputs=load('paysafe')
        expected={'fee_charge':(-154713,156573,-311286),'funded_amount':(3534722,3534721,1)}
        for role,values in expected.items():
            s=next(s for s in inputs[-1]['scopes'] if s['role']==role);r=claim(inputs,total(s))
            self.assertEqual(r['status'],'contradicted')
            self.assertEqual(tuple(r['calculation'][k] for k in ['computedValue','claimedValue','residualComputedMinusClaimed']),values)

    def test_incomplete_fee_populations_not_contradictions(self):
        inputs=load('paysafe')
        for s in inputs[-1]['withheldStructuralScopes']:
            r=claim(inputs,{'kind':'printed_total','totalRowRef':s['totalRowRef'],'role':'fee_charge'})
            self.assertEqual(r['status'],'incomplete_evidence');self.assertNotIn('calculation',r)

    def test_partial_run_never_supported_by_matching_amount(self):
        inputs=admit(packet([fee(total=False)]))
        r=claim(inputs,{'kind':'printed_total','totalRowRef':'absent-total','role':'fee_charge'})
        self.assertEqual(r['status'],'incomplete_evidence')

    def test_non_additive_average_ticket_refused(self):
        inputs=load('basys');s=next(s for s in inputs[-1]['scopes'] if s['role']=='average_ticket')
        self.assertEqual(claim(inputs,total(s))['status'],'unresolved_interpretation')

    def test_printed_count_uses_its_own_control(self):
        inputs=load('basys');s=next(s for s in inputs[-1]['scopes'] if s['role']=='gross_sales_count')
        r=claim(inputs,total(s));self.assertEqual(r['status'],'supported');self.assertEqual(r['calculation']['unit'],'printed_count')

    def test_grand_and_subtotals_deduplicated(self):
        inputs=load('priority');ss=[s for s in inputs[-1]['scopes'] if s['role']=='fee_charge' and s['printedTitle']=='Fees charged']
        req={'kind':'printed_union','scopeRefs':[s['id'] for s in ss],'claimedValue':-308282}
        r=claim(inputs,req);self.assertEqual(r['status'],'supported');self.assertEqual(r['calculation']['duplicateReferencesRemoved'],14)
        req['claimedValue']*=2;self.assertEqual(claim(inputs,req)['status'],'contradicted')

    def test_repeated_same_scope_not_doubled(self):
        inputs=admit(packet([fee()]));s=fee_scope(inputs)
        r=claim(inputs,{'kind':'printed_union','scopeRefs':[s['id'],s['id']],'claimedValue':-240})
        self.assertEqual(r['status'],'supported');self.assertEqual(r['calculation']['duplicateReferencesRemoved'],1)

    def test_different_measures_not_added(self):
        inputs=load('basys');ss=[s['id'] for s in inputs[-1]['scopes'] if s['role'] in ('gross_sales_amount','submitted_amount')]
        r=claim(inputs,{'kind':'printed_union','scopeRefs':ss,'claimedValue':0})
        self.assertEqual(r['status'],'unresolved_interpretation');self.assertNotIn('calculation',r)

    def test_equal_fee_and_funding_totals_do_not_prove_identity_or_separation(self):
        inputs=load('paysafe-zero');ss=[s for s in inputs[-1]['scopes'] if s['role']=='fee_charge']
        funding=next(s for s in ss if s['printedTitle']=='Amounts funded by batch');grand=max((s for s in ss if s['printedTitle']=='Fees charged'),key=lambda s:len(s['atomRefs']))
        self.assertEqual(funding['printedControl']['amountMinor'],grand['printedControl']['amountMinor'])
        for relation in ['same_activity','separate_activity','overlapping_activity','left_activity_subset']:
            r=claim(inputs,{'kind':'economic_relation','scopeRefs':[funding['id'],grand['id']],'relation':relation})
            self.assertEqual(r['status'],'unresolved_interpretation')
        r=claim(inputs,{'kind':'printed_union','scopeRefs':[funding['id'],grand['id']],'claimedValue':-8980})
        self.assertEqual(r['status'],'unresolved_interpretation')

    def test_printed_subset_does_not_establish_economic_subset(self):
        inputs=load('priority');ss=[s for s in inputs[-1]['scopes'] if s['role']=='fee_charge' and s['printedTitle']=='Fees charged'];child=ss[0];grand=ss[-1]
        r=claim(inputs,{'kind':'printed_relation','scopeRefs':[child['id'],grand['id']],'relation':'left_contribution_subset'})
        self.assertEqual(r['status'],'supported')
        r=claim(inputs,{'kind':'economic_relation','scopeRefs':[child['id'],grand['id']],'relation':'left_activity_subset'})
        self.assertEqual(r['status'],'unresolved_interpretation')

    def test_complete_printed_scope_not_financial_completeness(self):
        inputs=admit(packet([fee()]));r=claim(inputs,{'kind':'financial_completeness','scopeRef':fee_scope(inputs)['id']})
        self.assertEqual(r['status'],'unresolved_interpretation')

    def test_explicit_basis_supported_but_exact_product_not_pricing_proof(self):
        inputs=admit(packet([fee()]));a=fee_atom(inputs)
        r=claim(inputs,{'kind':'basis_phrase','atomRef':a['id']});self.assertEqual(r['status'],'supported')
        r=claim(inputs,{'kind':'fee_calculation','atomRef':a['id']})
        self.assertEqual(r['status'],'unresolved_interpretation');self.assertTrue(r['conditionalDiagnostic']['exactMagnitudeAgreement']);self.assertFalse(r['conditionalDiagnostic']['provesFinancialCalculation'])

    def test_fractional_cent_not_rounded_to_pass_or_called_overcharge(self):
        p=packet([fee()])
        for f in p['pages'][0]['fragments']:
            f['text']=f['text'].replace('.0020 TIMES $1200.00','.0013 TIMES $10013.64')
        inputs=admit(p);r=claim(inputs,{'kind':'fee_calculation','atomRef':fee_atom(inputs)['id']})
        self.assertEqual(r['status'],'unresolved_interpretation');self.assertEqual(r['conditionalDiagnostic']['product'],'13.017732')

    def test_unsupported_compact_basis_phrase_stays_missing(self):
        p=packet([fee()])
        for f in p['pages'][0]['fragments']:f['text']=f['text'].replace('.0020 TIMES $1200.00','$1200.00 AT0.0020')
        inputs=admit(p)
        for kind in ['basis_phrase','fee_calculation']:
            r=claim(inputs,{'kind':kind,'atomRef':fee_atom(inputs)['id']})
            self.assertEqual(r['status'],'incomplete_evidence')

    def test_count_totaling_amount_does_not_supply_missing_rate(self):
        p=packet([fee()])
        for f in p['pages'][0]['fragments']:f['text']=f['text'].replace('.0020 TIMES $1200.00','1 TRANS TOTALING $1200.00')
        inputs=admit(p);r=claim(inputs,{'kind':'fee_calculation','atomRef':fee_atom(inputs)['id']})
        self.assertEqual(r['status'],'incomplete_evidence')
        self.assertEqual(next(o['state'] for o in r['obligations'] if o['name']=='supported_rate'),'not_established')

    def test_volume_rate_columns_do_not_establish_units(self):
        inputs=load('priority');a=next(a for a in inputs[-1]['atoms'] if a.get('description',{}).get('rawText')=='CHARGEBACKS')
        r=claim(inputs,{'kind':'fee_calculation','atomRef':a['id']});self.assertEqual(r['status'],'unresolved_interpretation')
        self.assertEqual(len(r['evidence']['relatedBasisAndRateAtoms']),2)

    def test_combined_zero_remains_combined_and_fee_not_principal(self):
        inputs=load('paysafe-zero');a=next(a for a in inputs[-1]['atoms'] if a['role']=='combined_adjustments_chargebacks')
        self.assertEqual(a['amountMinor'],0)
        self.assertEqual(claim(inputs,{'kind':'printed_role','atomRef':a['id'],'role':a['role']})['status'],'supported')
        self.assertEqual(claim(inputs,{'kind':'printed_role','atomRef':a['id'],'role':'chargeback_principal'})['status'],'contradicted')
        inputs=load('priority');a=next(a for a in inputs[-1]['atoms'] if a.get('description',{}).get('rawText')=='CHARGEBACKS')
        self.assertEqual(claim(inputs,{'kind':'printed_role','atomRef':a['id'],'role':'chargeback_principal'})['status'],'contradicted')

    def test_unknown_ref_missing_not_financial_false(self):
        inputs=load('priority');r=claim(inputs,{'kind':'basis_phrase','atomRef':'not-admitted'})
        self.assertEqual(r['status'],'incomplete_evidence')

    def test_upstream_tamper_is_invalid_not_contradiction(self):
        inputs=list(load('priority'));req=total(fee_scope(inputs));inputs[-1]['atoms'][0]['amountMinor']=9999;inputs[-1]['resultFingerprint']=digest(inputs[-1])
        self.assertEqual(claim(inputs,req)['status'],'invalid_evidence')

    def test_missing_source_page_invalidates_evidence(self):
        inputs=list(load('priority'));req=total(fee_scope(inputs));inputs[0]['pages'].pop()
        self.assertEqual(claim(inputs,req)['status'],'invalid_evidence')

    def test_saved_claim_tamper_even_rehashed_rejected(self):
        inputs=admit(packet([fee()]));req=[total(fee_scope(inputs))];out=verify_claims(*inputs,req)
        self.assertTrue(validate_saved(*inputs,req,json.loads(json.dumps(out))))
        for change in ['status','evidence','obligation','boolean','request']:
            bad=copy.deepcopy(out)
            if change=='status':bad['claims'][0]['status']='contradicted'
            elif change=='evidence':bad['claims'][0]['evidence']['controlFragmentRefs']=[]
            elif change=='obligation':bad['claims'][0]['obligations'].pop()
            elif change=='boolean':bad['claims'][0]['calculation']['roundingOrToleranceApplied']=0
            else:bad['claims'][0]['request']['role']='funded_amount'
            bad['resultFingerprint']=digest(bad)
            self.assertFalse(validate_saved(*inputs,req,bad),change)

    def test_request_binding_is_independent_of_saved_record(self):
        inputs=admit(packet([fee()]));req=[total(fee_scope(inputs))];out=verify_claims(*inputs,req)
        new=[{'kind':'financial_completeness','scopeRef':fee_scope(inputs)['id']}]
        self.assertFalse(validate_saved(*inputs,new,out))

    def test_duplicate_requests_rejected(self):
        inputs=admit(packet([fee()]));r=total(fee_scope(inputs))
        with self.assertRaises(ValueError):verify_claims(*inputs,[r,r])

    def test_invalid_contracts_do_not_pass(self):
        inputs=admit(packet([fee()]))
        for req in [{'kind':'invent_a_principal'}, {'kind':'printed_union','scopeRefs':[fee_scope(inputs)['id']],'claimedValue':True},
                    {**total(fee_scope(inputs)),'tolerance':1}]:
            self.assertEqual(claim(inputs,req)['status'],'invalid_request')

    def test_no_input_mutation(self):
        inputs=admit(packet([fee()]));before=copy.deepcopy(inputs);claim(inputs,total(fee_scope(inputs)))
        self.assertEqual(inputs,before)

if __name__=='__main__':unittest.main()
