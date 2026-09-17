"""Claim-specific deterministic verification. Evaluation only; no runtime imports."""
from __future__ import annotations

import json
import sys
from decimal import Decimal, localcontext
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'financial-population-scope-v1'))
from semantics import digest, validate_semantic_record, aggregate, relate, decimal_text, amount_minor

SCHEMA = 'claim-verification-evidence-calibration-v1'
CONTRACTS = {
    'printed_total': {'kind', 'totalRowRef', 'role'},
    'printed_union': {'kind', 'scopeRefs', 'claimedValue'},
    'printed_relation': {'kind', 'scopeRefs', 'relation'},
    'economic_relation': {'kind', 'scopeRefs', 'relation'},
    'basis_phrase': {'kind', 'atomRef'},
    'fee_calculation': {'kind', 'atomRef'},
    'printed_role': {'kind', 'atomRef', 'role'},
    'financial_completeness': {'kind', 'scopeRef'},
}
PRINTED_RELATIONS = {'same_printed_contributions', 'left_contribution_subset', 'right_contribution_subset',
                     'overlapping_printed_contributions', 'separate_contributions_in_common_printed_scope',
                     'different_measures_shared_rows'}
ECONOMIC_RELATIONS = {'same_activity', 'separate_activity', 'overlapping_activity', 'left_activity_subset'}


def obligation(result, name, state, reason):
    result['obligations'].append({'name': name, 'state': state, 'reason': reason})


def finish(result, status, reason, wording):
    result.update(status=status, reason=reason, allowedStatement=wording)
    result['evidenceStrength'] = {'supported': 'strong_for_this_scoped_assertion',
                                  'contradicted': 'strong_for_this_scoped_contradiction',
                                  'incomplete_evidence': 'insufficient_coverage_or_missing_evidence',
                                  'unresolved_interpretation': 'observed_but_meaning_not_established',
                                  'invalid_evidence': 'unusable_integrity_failure',
                                  'invalid_request': 'not_evaluated'}[status]
    return result


def valid_request(request):
    if not isinstance(request, dict) or not isinstance(request.get('kind'), str):
        return False
    kind = request['kind']
    if kind not in CONTRACTS or set(request) != CONTRACTS[kind]:
        return False
    for key in ['atomRef', 'scopeRef', 'totalRowRef', 'role', 'relation']:
        if key in request and (not isinstance(request[key], str) or not request[key]):
            return False
    if 'scopeRefs' in request:
        refs = request['scopeRefs']
        if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or not ref for ref in refs):
            return False
        if kind.endswith('relation') and len(refs) != 2:
            return False
    if kind == 'printed_union' and type(request['claimedValue']) is not int:
        return False
    if kind == 'printed_relation' and request['relation'] not in PRINTED_RELATIONS:
        return False
    if kind == 'economic_relation' and request['relation'] not in ECONOMIC_RELATIONS:
        return False
    return True


def verify_claims(packet, structural, inventory, semantic, requests):
    # Request contracts are a separate retained input, not recovered from saved outcomes.
    if not isinstance(requests, list):
        raise ValueError('Expected a list of explicit claim requests')
    ids = [digest(request) for request in requests]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate claim requests cannot inflate support counts')
    try:
        bound = validate_semantic_record(packet, structural, inventory, semantic)
    except (IndexError, AttributeError, ArithmeticError):
        bound = False
    binding = {'sourceSha256': packet.get('sourceSha256'), 'structuralFingerprint': digest(structural),
               'inventoryFingerprint': digest(inventory), 'semanticFingerprint': digest(semantic),
               'requestFingerprint': digest(requests)}
    results = []
    for request, cid in zip(requests, ids):
        result = {'id': 'claim-' + cid[:24], 'request': request, 'obligations': [],
                  'evidence': {'atomRefs': [], 'scopeRefs': [], 'controlFragmentRefs': []},
                  'limits': ['evaluation_only_no_canonical_authority', 'same_document_evidence_not_independent_corroboration',
                             'no_whole_document_financial_completeness', 'no_currency_or_contract_correctness_proof']}
        obligation(result, 'source_structure_semantic_replay', 'pass' if bound else 'fail',
                   'exact_recomputation_against_retained_inventory' if bound else 'upstream_record_not_replay_admitted')
        if not bound:
            results.append(finish(result, 'invalid_evidence', 'upstream_integrity_failure', 'The supplied evidence cannot be used to assess this claim.'))
        elif not valid_request(request):
            results.append(finish(result, 'invalid_request', 'unsupported_or_malformed_contract', 'This claim request was not evaluated.'))
        else:
            results.append(_verify(semantic, request, result))
    out = {'schema': SCHEMA, 'authority': 'evaluation_only_no_canonical_authority', 'binding': binding,
           'evidenceAdmitted': bound, 'claims': results,
           'calibration': 'rule_and_obligation_based_not_probability_or_model_confidence'}
    out['resultFingerprint'] = digest(out)
    return out


def _verify(semantic, request, result):
    scopes = {s['id']: s for s in semantic['scopes']}
    atoms = {a['id']: a for a in semantic['atoms']}
    kind = request['kind']
    if kind == 'printed_total':
        matches = [s for s in scopes.values() if s['totalRowRef'] == request['totalRowRef'] and s['role'] == request['role']]
        if len(matches) != 1:
            withheld = next((s for s in semantic['withheldStructuralScopes'] if s['totalRowRef'] == request['totalRowRef']), None)
            result['evidence']['withheldStructuralScope'] = withheld
            obligation(result, 'complete_printed_measure_membership', 'not_established', 'no_unique_complete_semantic_scope')
            return finish(result, 'incomplete_evidence', 'printed_population_not_admitted', 'There is no complete admitted member set for this requested printed measure.')
        scope = matches[0]
        _scope_evidence(result, [scope], atoms)
        obligation(result, 'complete_printed_measure_membership', 'pass', 'exact_complete_total_members')
        union = aggregate(semantic, [scope['id']])
        if union['status'] != 'printed_contribution_union':
            obligation(result, 'additive_resolved_measure', 'not_established', union['reason'])
            status = 'unresolved_interpretation' if any(x in scope['reasons'] for x in ['non_additive_or_unit_unspecified','member_header_meaning_mismatch']) else 'incomplete_evidence'
            return finish(result, status, 'measure_not_safely_additive', 'This column does not support the requested additive total check.')
        obligation(result, 'additive_resolved_measure', 'pass', 'one_measure_exact_values')
        raw = scope['printedControl']['rawText']
        count = scope['role'].endswith('_count')
        value = decimal_text(raw)
        expected = int(value) if count and value is not None and value >= 0 and value == value.to_integral_value() else None if count else amount_minor(raw)
        result['evidence']['controlFragmentRefs'] = scope['printedControl']['fragmentRefs']
        result['evidence']['rawPrintedControl'] = raw
        if expected is None or not scope['printedControl']['fragmentRefs']:
            obligation(result, 'explicit_resolved_same_measure_control', 'not_established', 'missing_or_ambiguous_control')
            return finish(result, 'incomplete_evidence', 'control_not_available', 'The complete observed members lack a usable printed control for this check.')
        obligation(result, 'explicit_resolved_same_measure_control', 'pass', 'control_cell_on_admitting_total_in_same_column')
        observed = union['valueCount' if count else 'amountMinor']
        result['calculation'] = {'operator': 'sum_unique_signed_members', 'unit': 'printed_count' if count else 'printed_money_minor_unit_currency_unverified',
                                 'computedValue': observed, 'claimedValue': expected, 'residualComputedMinusClaimed': observed - expected,
                                 'roundingOrToleranceApplied': False}
        return _comparison(result, observed == expected, 'The admitted signed members equal this printed total.',
                           'The admitted signed members disagree with this printed total; the source values were preserved.')

    if kind in ('printed_union', 'printed_relation', 'economic_relation'):
        refs = request['scopeRefs']
        if any(ref not in scopes for ref in refs):
            obligation(result, 'requested_scopes_admitted', 'not_established', 'missing_scope')
            return finish(result, 'incomplete_evidence', 'missing_scope', 'At least one requested scope is not admitted.')
        selected = [scopes[ref] for ref in refs]
        _scope_evidence(result, selected, atoms)
        obligation(result, 'requested_scopes_admitted', 'pass', 'all_complete_printed_scopes')
        if kind == 'printed_union':
            union = aggregate(semantic, refs)
            if union['status'] != 'printed_contribution_union':
                obligation(result, 'one_additive_measure_common_scope', 'not_established', union['reason'])
                return finish(result, 'unresolved_interpretation', union['reason'], 'These representations cannot support the requested combined value.')
            obligation(result, 'one_additive_measure_common_scope', 'pass', 'source_atom_union_under_admitted_parent')
            value = union.get('amountMinor', union.get('valueCount'))
            result['calculation'] = {'operator': 'deduplicated_printed_union', 'computedValue': value,
                                     'claimedValue': request['claimedValue'], 'residualComputedMinusClaimed': value-request['claimedValue'],
                                     'duplicateReferencesRemoved': union['duplicateReferencesRemoved'],
                                     'roundingOrToleranceApplied': False}
            return _comparison(result, value == request['claimedValue'], 'The claimed printed union value counts each source contribution once.',
                               'The claimed printed union value disagrees with the deduplicated source contributions.')
        relation = relate(*selected, list(scopes.values()))
        result['evidence']['observedContributionRelation'] = relation
        if kind == 'economic_relation':
            obligation(result, 'economic_member_identity_link', 'not_established', 'printed_membership_and_amount_agreement_are_not_identity_evidence')
            return finish(result, 'unresolved_interpretation', 'cross_summary_economic_relation_unknown',
                          'The requested economic relationship is not established, even if printed values match.')
        observed = relation['relation']
        # Exact equality/subset/overlap claims are decidable from source sets even
        # when semantic architecture correctly labels the economic relation unknown.
        if observed == 'unknown' and request['relation'] == 'separate_contributions_in_common_printed_scope':
            return finish(result, 'unresolved_interpretation', 'common_printed_parent_not_established', 'No common admitted printed parent establishes this separation.')
        obligation(result, 'exact_printed_contribution_relation', 'pass' if observed == request['relation'] else 'fail', 'source_atoms_and_measure_roles_only')
        return finish(result, 'supported' if observed == request['relation'] else 'contradicted', 'printed_relation_matches' if observed == request['relation'] else 'printed_relation_differs',
                      'The exact printed contribution relation matches the claim.' if observed == request['relation'] else 'The exact printed contribution relation differs from the claim; no economic identity conclusion follows.')

    if kind == 'financial_completeness':
        if request['scopeRef'] not in scopes:
            return finish(result, 'incomplete_evidence', 'scope_not_admitted', 'This scope is not admitted.')
        _scope_evidence(result, [scopes[request['scopeRef']]], atoms)
        obligation(result, 'economic_population_and_document_coverage', 'not_established', 'printed_scope_completeness_is_not_economic_completeness')
        return finish(result, 'unresolved_interpretation', 'financial_completeness_not_proven', 'A complete printed scope does not prove a complete financial population.')

    atom = atoms.get(request['atomRef'])
    if atom is None:
        return finish(result, 'incomplete_evidence', 'atom_not_admitted', 'The requested source value is not admitted.')
    result['evidence']['atomRefs'] = [atom['id']]
    result['evidence']['sourceAtoms'] = [atom]
    if atom['status'] != 'printed_meaning_supported':
        return finish(result, 'unresolved_interpretation', 'atom_meaning_unresolved', 'The source value has no admitted financial meaning for this claim.')
    if kind == 'printed_role':
        obligation(result, 'source_backed_column_role', 'pass' if request['role'] == atom['role'] else 'fail', 'admitted_semantic_role_not_unprinted_subtype')
        return finish(result, 'supported' if request['role'] == atom['role'] else 'contradicted', 'printed_role_matches' if request['role'] == atom['role'] else 'printed_role_differs',
                      'The source-backed printed role matches the claim.' if request['role'] == atom['role'] else 'The asserted printed role is not the role established by the source; this does not prove absence of an underlying component.')
    if atom['role'] != 'fee_charge' or 'description' not in atom:
        return finish(result, 'unresolved_interpretation', 'not_a_fee_detail_basis', 'This observation is not an admitted fee-detail basis.')
    basis = atom['basisPhrase']
    result['evidence']['basisPhrase'] = basis
    if kind == 'basis_phrase':
        if basis['status'] != 'explicit_printed_basis':
            obligation(result, 'supported_explicit_basis_phrase', 'not_established', basis['status'])
            return finish(result, 'incomplete_evidence', 'fee_basis_phrase_not_supported', 'No supported explicit fee-basis phrase is available; missing meaning was not inferred.')
        obligation(result, 'supported_explicit_basis_phrase', 'pass', 'source_span_and_literal_values_admitted')
        return finish(result, 'supported', 'printed_basis_observed_not_pricing_verified', 'The literal fee-basis phrase and its values are source-supported; this does not verify the charge calculation.')
    # Fee pricing requires more than an arithmetic match. Keep all missing
    # dimensions visible, including explicit-but-unit-unknown Volume/Rate cells.
    related = [a for a in atoms.values() if a['rowRef'] == atom['rowRef'] and a['role'] in ('fee_basis_or_volume', 'printed_rate')]
    result['evidence']['relatedBasisAndRateAtoms'] = related
    basis_available = basis['status'] == 'explicit_printed_basis'
    role_available = {a['role'] for a in related if a['status'] == 'printed_meaning_supported'}
    has_basis = basis_available or 'fee_basis_or_volume' in role_available
    has_rate = 'rate' in basis.get('values', {}) or 'printed_rate' in role_available
    has_inputs = has_basis and has_rate
    obligation(result, 'supported_basis', 'pass' if has_basis else 'not_established', 'literal_phrase_or_explicit_volume_column' if has_basis else 'missing_or_unsupported_basis')
    obligation(result, 'supported_rate', 'pass' if has_rate else 'not_established', 'literal_rate_or_explicit_rate_column' if has_rate else 'rate_not_observed')
    for name in ['rate_units_and_conversion', 'charge_sign_convention', 'rounding_and_per_item_or_aggregate_policy', 'contract_or_pricing_rule']:
        obligation(result, name, 'not_established', 'not_proven_by_current_semantic_evidence')
    if basis_available and 'rate' in basis['values']:
        values = basis['values'];base = values.get('amount', values.get('count'))
        if base is not None:
            with localcontext() as context:
                context.prec = max(28, len(Decimal(base).as_tuple().digits) + len(Decimal(values['rate']).as_tuple().digits) + 2)
                product = Decimal(base) * Decimal(values['rate'])
            magnitude = abs(Decimal(atom['amountMinor']) / 100)
            result['conditionalDiagnostic'] = {'assumption': 'literal_numbers_multiplied_as_printed_without_rate_conversion_or_rounding',
                                               'product': str(product), 'printedChargeMagnitude': str(magnitude),
                                               'exactMagnitudeAgreement': product == magnitude,
                                               'provesFinancialCalculation': False}
    return finish(result, 'unresolved_interpretation' if has_inputs else 'incomplete_evidence',
                  'pricing_semantics_not_established' if has_inputs else 'fee_basis_or_rate_coverage_gap',
                  'The printed fee calculation is not verified; missing basis or pricing rules remain explicit.')


def _scope_evidence(result, selected, atoms):
    result['evidence']['scopeRefs'] = [s['id'] for s in selected]
    refs = sorted(set(a for s in selected for a in s['atomRefs']))
    result['evidence']['atomRefs'] = refs
    result['evidence']['sourceAtoms'] = [atoms[a] for a in refs]
    result['evidence']['admittingTotalRefs'] = sorted({s['totalRowRef'] for s in selected})


def _comparison(result, equal, supported_text, contradicted_text):
    obligation(result, 'exact_scoped_arithmetic', 'pass' if equal else 'fail', 'no_tolerance_no_member_or_sign_repair')
    return finish(result, 'supported' if equal else 'contradicted', 'exact_agreement' if equal else 'signed_value_disagreement', supported_text if equal else contradicted_text)


def validate_saved(packet, structural, inventory, semantic, requests, saved):
    try:
        return digest(saved) == digest(verify_claims(packet, structural, inventory, semantic, requests))
    except (ValueError, TypeError, KeyError, ArithmeticError):
        return False
