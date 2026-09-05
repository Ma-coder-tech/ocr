import copy
import gzip
import json
import sys
import unittest
from pathlib import Path
from semantics import analyze, aggregate, aggregate_saved, validate_semantic_record, basis_proposal, amount_minor, relate, role_for
from structure import assemble
from coverage import source_inventory
from test_structure import fee, packet, funding, f, page

CHECKPOINT = Path(__file__).resolve().parents[1] / 'printed-coverage-v1/checkpoint'

def source(name):
    return tuple(json.loads(gzip.decompress((CHECKPOINT / f'{name}-{kind}.json.gz').read_bytes())) for kind in ('native', 'structure', 'inventory'))

def admit(p):
    inv = source_inventory(p)
    s = json.loads(json.dumps(assemble(p, inv)))
    return p, s, inv


def proposal(text):
    return basis_proposal({'rawText': text, 'fragmentRefs': ['description']})

class SemanticsTests(unittest.TestCase):
    def test_saved_structure_rehash_does_not_admit_edited_members(self):
        p, s, inv = source('priority')
        s['tables'][-1]['totals'][-1]['memberRowRefs'].pop()
        from semantics import digest
        s['resultFingerprint'] = digest(s)
        with self.assertRaises(ValueError): analyze(p, s, inv)

    def test_inventory_required(self):
        p, s, inv = source('priority')
        with self.assertRaises(ValueError): analyze(p, s, None)

    def test_missing_page_rejected(self):
        p, s, inv = source('priority'); p['pages'].pop()
        with self.assertRaises(ValueError): analyze(p, s, inv)

    def test_partial_scope_cannot_supply_semantic_population(self):
        p, s, inv = admit(packet([fee(total=False)]))
        self.assertEqual(analyze(p, s, inv)['scopes'], [])

    def test_partial_segments_contribute_through_complete_total(self):
        o = analyze(*source('clover-october'))
        s = next(s for s in o['scopes'] if s['role'] == 'fee_charge' and s['printedTitle'] == 'TRANSACTION FEES')
        self.assertEqual(len(s['atomRefs']), 109)
        self.assertEqual({a['provenance']['page'] for a in o['atoms'] if a['id'] in s['atomRefs']}, {4, 5, 6})

    def test_fee_basis_never_replaces_charge(self):
        o = analyze(*admit(packet([fee()])))
        a = next(a for a in o['atoms'] if a['role'] == 'fee_charge')
        self.assertEqual(a['amountMinor'], -240)
        self.assertEqual(a['basisPhrase']['values']['amount'], '1200.00')
        self.assertEqual(a['basisPhrase']['values']['rate'], '0.0020')

    def test_explicit_volume_is_not_automatically_transaction_count(self):
        o = analyze(*source('priority'))
        basis = [a for a in o['atoms'] if a['role'] == 'fee_basis_or_volume']
        self.assertTrue(any(a['value'] == '1' for a in basis))
        self.assertTrue(all(a['unit'] == 'basis_unit_unspecified' for a in basis))
        self.assertTrue(all(s['printedAggregationStatus'] == 'withheld' for s in o['scopes'] if s['role'] in ('fee_basis_or_volume','printed_rate')))

    def test_explicit_basis_grammars(self):
        for text, key, value in [('SERVICE 51 TRANSACTIONS AT .1','count','51'),
                                 ('SERVICE .002 TIMES $1,200.00','amount','1200.00'),
                                 ('SERVICE $26.71 AT .001','amount','26.71'),
                                 ('SERVICE 1 TRANS TOTALING $102.47','count','1')]:
            q = proposal(text)
            self.assertEqual(q['status'], 'explicit_printed_basis')
            self.assertEqual(q['values'][key], value)
            self.assertEqual(text[slice(*q['span'])], q['rawPhrase'])

    def test_ambiguous_basis_not_guessed(self):
        for text in ['SERVICE $400', 'SERVICE 12 AT 5', 'SERVICE 1 2 TRANSACTIONS AT .1',
                     'SERVICE 10 AT .1 PLUS 2 TRANSACTIONS AT .2', 'SERVICE 12 TRANSACTIONS AT .1 PLUS TAX']:
            self.assertNotEqual(proposal(text)['status'], 'explicit_printed_basis', text)

    def test_child_and_grandtotal_count_members_once(self):
        o = analyze(*source('priority'))
        scopes = [s for s in o['scopes'] if s['role'] == 'fee_charge' and s['printedTitle'] == 'Fees charged']
        out = aggregate(o, [s['id'] for s in scopes])
        self.assertEqual(out['status'], 'printed_contribution_union')
        self.assertEqual(len(out['atomRefs']), 14)
        self.assertEqual(out['duplicateReferencesRemoved'], 14)
        self.assertTrue(any(r['relation'] == 'separate_contributions_in_common_printed_scope' for r in o['relationships']))
        self.assertTrue(any(r['relation'] in ('left_contribution_subset','right_contribution_subset') for r in o['relationships']))

    def test_same_selection_twice_not_doubled(self):
        o = analyze(*admit(packet([fee()])))
        s = next(s for s in o['scopes'] if s['role'] == 'fee_charge')
        self.assertEqual(aggregate(o, [s['id'], s['id']])['amountMinor'], -240)

    def test_distinct_fee_and_funding_views_not_added(self):
        o = analyze(*source('paysafe-zero'))
        s = [s['id'] for s in o['scopes'] if s['role'] == 'fee_charge']
        self.assertEqual(aggregate(o, s)['reason'], 'no_common_admitted_scope_economic_overlap_unknown')

    def test_equal_amount_different_source_rows_unknown(self):
        p = packet([fee(1), fee(2)])
        o = analyze(*admit(p)); s = [s for s in o['scopes'] if s['role'] == 'fee_charge']
        self.assertEqual(len(s), 2)
        self.assertEqual(o['relationships'][0]['relation'], 'unknown')
        self.assertEqual(aggregate(o, [x['id'] for x in s])['status'], 'withheld')

    def test_different_measures_same_rows_not_added(self):
        o = analyze(*source('basys'))
        s = [s['id'] for s in o['scopes'] if s['role'] in ('gross_sales_amount','submitted_amount')]
        self.assertEqual(aggregate(o, s)['reason'], 'different_measures_cannot_be_added')
        self.assertTrue(any(r['relation'] == 'different_measures_shared_rows' for r in o['relationships']))

    def test_nonzero_combined_preserved(self):
        o = analyze(*source('priority'))
        combined = [a for a in o['atoms'] if a['role'] == 'combined_adjustments_chargebacks']
        self.assertTrue(any(a['amountMinor'] == -6317 for a in combined))
        self.assertTrue(all('no_component_allocation' in a['limits'] for a in combined))

    def test_zero_combined_does_not_prove_zero_components(self):
        o = analyze(*source('paysafe-zero'))
        a = next(a for a in o['atoms'] if a['role'] == 'combined_adjustments_chargebacks')
        self.assertEqual(a['amountMinor'], 0)
        self.assertIn('must_remain_combined_including_zero', a['limits'])
        self.assertFalse(any(a['role'] in ('chargeback_amount_unspecified_subtype','adjustment_amount_unspecified_subtype') for a in o['atoms']))

    def test_chargeback_fee_is_not_principal(self):
        o = analyze(*source('priority'))
        a = next(a for a in o['atoms'] if a.get('description', {}).get('rawText') == 'CHARGEBACKS')
        self.assertEqual(a['role'], 'fee_charge');self.assertEqual(a['amountMinor'], -1500)
        self.assertEqual(a['basisPhrase']['status'], 'not_explicit')
        self.assertIn('not_principal', a['categoryMeaning'])

    def test_direct_component_headers_have_only_their_printed_meaning(self):
        p = packet([funding(1,True)])
        fs = p['pages'][0]['fragments']
        for x in fs:
            if x['y'] == 130 and x['text'] == 'Third Party': x['text'] = 'Adjustments'
            if x['y'] == 139 and x['text'] == 'Transactions': x['text'] = 'Amount'
            if x['y'] == 130 and x['text'] == 'Adjustments/': x['text'] = 'Chargebacks'
            elif x['y'] == 139 and x['text'] == 'Chargebacks': x['text'] = 'Amount'
        o = analyze(*admit(p))
        roles = {a['role'] for a in o['atoms']}
        self.assertIn('adjustment_amount_unspecified_subtype', roles)
        self.assertIn('chargeback_amount_unspecified_subtype', roles)
        self.assertNotIn('combined_adjustments_chargebacks', roles)

    def test_source_amount_not_repaired(self):
        for raw in ['-0 02', '$7,8 12.27', '-$1.234']:
            self.assertIsNone(amount_minor(raw))
        self.assertEqual(amount_minor('$2 ,008.57'), 200857)

    def test_malformed_fee_scope_withheld(self):
        o = analyze(*source('paysafe'))
        self.assertEqual(len(o['withheldStructuralScopes']), 3)
        self.assertFalse(any(s['printedTitle'] == 'Fees charged' for s in o['scopes']))

    def test_saved_semantic_record_tampering_rejected_even_rehashed(self):
        p, s, inv = source('priority');o = analyze(p, s, inv)
        self.assertTrue(validate_semantic_record(p, s, inv, json.loads(json.dumps(o))))
        o['atoms'][0]['role'] = 'chargeback_principal'
        from semantics import digest
        o['resultFingerprint'] = digest(o)
        self.assertFalse(validate_semantic_record(p, s, inv, o))
        with self.assertRaises(ValueError): aggregate_saved(p, s, inv, o, [o['scopes'][0]['id']])

    def test_rehashed_semantic_evidence_omission_rejected(self):
        p, s, inv = source('priority');o = analyze(p, s, inv)
        del o['atoms'][0]['provenance']
        self.assertFalse(validate_semantic_record(p, s, inv, o))

    def test_json_boolean_number_substitution_is_not_exact_replay(self):
        p, s, inv = source('paysafe-zero')
        s['tables'][0]['page'] = True
        with self.assertRaises(ValueError): analyze(p, s, inv)
        p, s, inv = source('paysafe-zero');o = analyze(p, s, inv)
        a = next(a for a in o['atoms'] if a['amountMinor'] == 0)
        a['amountMinor'] = False
        self.assertFalse(validate_semantic_record(p, s, inv, o))

    def test_generated_title_is_not_source_fee_evidence(self):
        p, _, _ = source('priority')
        for pg in p['pages']:
            if pg['page'] >= 5:
                for frag in pg['fragments']:
                    frag['text'] = frag['text'].replace('Fees','Measures').replace('fees','measures').replace('Fee','Measure')
        o = analyze(*admit(p))
        self.assertTrue(any(s['role'] == 'unresolved_measure' for s in o['scopes']))
        self.assertFalse(any(s['role'] == 'fee_charge' and s['printedTitle'] == 'Fees charged' for s in o['scopes']))

    def test_basis_or_estimate_table_is_not_charged_fees(self):
        for title in ['FEE BASIS', 'ESTIMATED FEES', 'COFFEE']:
            o = analyze(*admit(packet([fee(heading=title)])))
            self.assertFalse(any(a['role'] == 'fee_charge' for a in o['atoms']), title)
            self.assertTrue(any(s['role'] == 'unresolved_measure' for s in o['scopes']), title)

    def test_no_input_mutation(self):
        args = source('priority');before = copy.deepcopy(args);o = analyze(*args)
        self.assertEqual(before, args)
        self.assertEqual(o['authority'], 'evaluation_only_no_canonical_authority')

    def test_same_subset_overlap_classification_without_amounts(self):
        def scope(i, atoms): return {'id':i,'role':'fee_charge','atomRefs':atoms,'memberRowRefs':atoms}
        a,b = scope('a',['x','y']),scope('b',['y','z'])
        self.assertEqual(relate(a,b,[a,b])['relation'], 'overlapping_printed_contributions')
        self.assertEqual(relate(a,a,[a])['relation'], 'same_printed_contributions')

    def test_arithmetic_does_not_select_members_or_meaning(self):
        p = packet([fee()]); first = analyze(*admit(p))
        p['pages'][0]['fragments'][-1]['text'] = '-$999.99'
        second = analyze(*admit(p))
        self.assertEqual(first['scopes'][0]['atomRefs'], second['scopes'][0]['atomRefs'])
        self.assertEqual(aggregate(second,[second['scopes'][0]['id']])['amountMinor'], -240)

    def test_source_ids_labels_values_not_merchant_dispatch(self):
        p = packet([fee()]);p['sourceSha256'] = 'b'*64
        for i,x in enumerate(p['pages'][0]['fragments']):
            x['id'] = str(i);x['text'] = x['text'].replace('EXAMPLE','UNFAMILIAR').replace('1200.00','7000.00')
        o = analyze(*admit(p))
        self.assertEqual(next(a for a in o['atoms'] if a['role'] == 'fee_charge')['amountMinor'], -240)

if __name__ == '__main__': unittest.main()
