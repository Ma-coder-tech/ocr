"""Disconnected financial semantics over replay-admitted printed memberships.

No RateReveal runtime imports. No source-name, merchant or amount dispatch.
Economic identity is deliberately distinct from printed contribution identity.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

STRUCTURE = Path(__file__).resolve().parents[1] / 'printed-coverage-v1'
sys.path.insert(0, str(STRUCTURE))
from records import json_value
from structure import assemble


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def normalized(value):
    return re.sub(r'\s+', ' ', value or '').strip().lower()


def decimal_text(raw):
    """No missing decimals, signs or digits repaired; spacing inside digits is ambiguous."""
    raw = raw.strip()
    if re.search(r'\d\s+\d', raw):
        return None
    s = re.sub(r'\s+', '', raw)
    if not re.fullmatch(r'-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\(\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\)|\.\d+', s):
        return None
    s = s.replace('$', '').replace(',', '')
    if s.startswith('('):
        s = '-' + s[1:-1]
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def amount_minor(raw):
    value = decimal_text(raw)
    if value is None or value * 100 != (value * 100).to_integral_value():
        return None
    return int(value * 100)


def role_for(table, column, closing_label):
    label = normalized(column['printedLabel'])
    path = [normalized(p) for p in column.get('headerPath', [])]
    if table['kind'] == 'fees':
        if label == 'volume':
            return 'fee_basis_or_volume'
        if label == 'rate':
            return 'printed_rate'
        if label in ('amount', 'total') and ('fee' in normalized(table['title'] + ' ' + closing_label)):
            return 'fee_charge'
    if table['kind'] == 'funding':
        return {'submitted amount': 'submitted_amount', 'third party transactions': 'third_party_amount',
                'adjustments/ chargebacks': 'combined_adjustments_chargebacks',
                'adjustments/chargebacks': 'combined_adjustments_chargebacks',
                'adjustments amount': 'adjustment_amount_unspecified_subtype',
                'chargebacks amount': 'chargeback_amount_unspecified_subtype',
                'fees charged': 'fee_charge', 'funded amount': 'funded_amount'}.get(label, 'context' if column['role'] == 'text' else 'unresolved_measure')
    if table['kind'] == 'batch':
        if label == 'average ticket':
            return 'average_ticket'
        parents = {'total gross sales you submitted': 'gross_sales', 'refunds': 'refunds',
                   'total amount you submitted': 'submitted'}
        if len(path) == 2 and path[0] in parents and path[1] in ('amount', 'items'):
            return parents[path[0]] + ('_amount' if path[1] == 'amount' else '_count')
    return 'context' if column['role'] in ('text', 'unlabelled_text') else 'unresolved_measure'


# These are complete explicit suffix grammars, not free-floating number matches.
N = r'(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+'
BASIS_PATTERNS = [
    ('count_at_rate', re.compile(r'(?P<count>\d+)\s+(?:TRANSACTIONS?|TRANS)\s+AT\s+(?P<rate>' + N + r')\s*$', re.I)),
    ('rate_times_amount', re.compile(r'(?P<rate>' + N + r')\s+TIMES\s+(?P<amount>\$(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*$', re.I)),
    ('amount_at_rate', re.compile(r'(?P<amount>\$(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s+AT\s+(?P<rate>' + N + r')\s*$', re.I)),
    ('count_totaling_amount', re.compile(r'(?P<count>\d+)\s+(?:TRANSACTIONS?|TRANS)\s+TOTALING\s+(?P<amount>\$(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*$', re.I)),
]


def basis_proposal(cell):
    raw = cell['rawText']
    matches = [(kind, match) for kind, pattern in BASIS_PATTERNS if (match := pattern.search(raw))
               and (match.start() == 0 or raw[match.start()-1].isspace())]
    if len(matches) != 1:
        return {'status': 'unresolved' if re.search(r'\b(?:AT|TIMES|TOTALING|TRANS(?:ACTIONS?)?)\b|\$', raw, re.I) else 'not_explicit',
                'reason': 'no_unique_supported_basis_phrase', 'fragmentRefs': cell['fragmentRefs']}
    kind, match = matches[0]
    # Another pricing phrase in the prefix may change the meaning of the suffix.
    if re.search(r'\b(?:TIMES|TOTALING|AT)\s+[\d.$]', raw[:match.start()], re.I) or re.search(r'[\d.,]\s+$', raw[:match.start()]):
        return {'status': 'unresolved', 'reason': 'multiple_pricing_phrases', 'fragmentRefs': cell['fragmentRefs']}
    values = {key: str(decimal_text(value)) for key, value in match.groupdict().items() if value is not None}
    return {'status': 'explicit_printed_basis', 'grammar': kind, 'values': values,
            'fragmentRefs': cell['fragmentRefs'], 'span': [match.start(), match.end()],
            'rawPhrase': match.group(), 'rateUnit': 'unspecified_no_percent_conversion',
            'economicMemberIdentity': 'unknown', 'calculationVerified': False}


def meaning_limits(role):
    if role == 'combined_adjustments_chargebacks':
        return ['must_remain_combined_including_zero', 'no_component_allocation', 'no_principal_or_lifecycle_claim']
    if role in ('adjustment_amount_unspecified_subtype', 'chargeback_amount_unspecified_subtype'):
        return ['explicit_component_column_only', 'no_principal_or_lifecycle_claim', 'no_allocation_of_other_combined_records']
    return []


def analyze(packet, structural_record, independent_inventory):
    if independent_inventory is None or digest(structural_record) != digest(json_value(assemble(packet, independent_inventory))):
        raise ValueError('Structural evidence failed independent exact replay')
    rows = {r['id']: (t, r) for t in structural_record['tables'] for r in t['rows']}
    atoms, scopes, withheld = {}, [], []
    source = packet['sourceSha256']
    for table in structural_record['tables']:
        for total in table['totals']:
            if total['printedMembershipStatus'] != 'complete':
                withheld.append({'totalRowRef': total['totalRowRef'], 'reason': 'printed_membership_not_complete',
                                 'structuralReasons': total['coverageReasons']})
                continue
            members = total['memberRowRefs']
            if not members or len(members) != len(set(members)) or any(rows[r][1]['status'] != 'accepted' for r in members):
                raise ValueError('Invalid complete membership')
            closing = rows[total['totalRowRef']][1]
            close_label = closing.get('label', '')
            for ci, col in enumerate(table['columns']):
                role = role_for(table, col, close_label)
                if role == 'context':
                    continue
                refs, issues = [], []
                for member in members:
                    origin, row = rows[member]
                    cell, origin_col = row['cells'][ci], origin['columns'][ci]
                    if role_for(origin, origin_col, close_label) != role:
                        issues.append('member_header_meaning_mismatch')
                        continue
                    if not cell['rawText']:
                        if role not in ('fee_basis_or_volume', 'printed_rate'):
                            issues.append('missing_member_value')
                        continue
                    aid = 'a-' + digest([source, cell['fragmentRefs'], role])[:24]
                    value = decimal_text(cell['rawText'])
                    is_amount = role.endswith('_amount') or role in ('fee_charge', 'average_ticket', 'combined_adjustments_chargebacks', 'adjustment_amount_unspecified_subtype', 'chargeback_amount_unspecified_subtype')
                    minor = amount_minor(cell['rawText']) if is_amount else None
                    unresolved = value is None or is_amount and minor is None or role == 'unresolved_measure'
                    if role.endswith('_count') and value is not None and (value != value.to_integral_value() or value < 0):
                        unresolved = True
                    unit = 'statement_money_currency_unverified' if is_amount else 'printed_count' if role.endswith('_count') else 'basis_unit_unspecified' if role == 'fee_basis_or_volume' else 'rate_unit_unspecified'
                    atom = {'id': aid, 'rowRef': member, 'tableRef': origin['id'], 'role': role,
                            'rawText': cell['rawText'], 'value': str(value) if value is not None and not unresolved else None,
                            'amountMinor': minor if not unresolved else None, 'unit': unit,
                            'status': 'unresolved' if unresolved else 'printed_meaning_supported',
                            'provenance': {'sourceSha256': source, 'page': row['page'], 'fragmentRefs': cell['fragmentRefs'],
                                           'columnHeaderRefs': origin_col['headerRefs'], 'headerPath': origin_col.get('headerPath', [origin_col['printedLabel']]),
                                           'scopeTitleRefs': origin['titleRefs'], 'admittingTotalRefs': []},
                            'limits': meaning_limits(role)}
                    if role == 'fee_charge' and origin['kind'] == 'fees':
                        description = row['cells'][2 if len(row['cells']) == 6 else 0]
                        atom['basisPhrase'] = basis_proposal(description)
                        atom['description'] = {'rawText': description['rawText'], 'fragmentRefs': description['fragmentRefs']}
                        atom['categoryMeaning'] = 'printed_fee_charge_not_principal_or_activity_count'
                    if aid not in atoms:
                        atoms[aid] = atom
                    atoms[aid]['provenance']['admittingTotalRefs'].append(total['totalRowRef'])
                    refs.append(aid)
                    if unresolved:
                        issues.append('unresolved_member_value_or_measure')
                if not refs:
                    continue
                total_cell = closing['cells'][ci]
                additive = role not in ('average_ticket', 'printed_rate', 'fee_basis_or_volume', 'unresolved_measure')
                if not additive:
                    issues.append('non_additive_or_unit_unspecified')
                scope_id = 's-' + digest([source, total['totalRowRef'], role, ci])[:24]
                scopes.append({'id': scope_id, 'role': role, 'totalRowRef': total['totalRowRef'],
                               'printedTitle': table['title'], 'printedTotalLabel': close_label,
                               'memberRowRefs': list(members), 'atomRefs': refs, 'childTotalRefs': total['childTotalRefs'],
                               'printedMembership': 'complete', 'economicActivityMembership': 'unknown',
                               'printedAggregationStatus': 'eligible' if not issues else 'withheld',
                               'reasons': sorted(set(issues)), 'limits': meaning_limits(role),
                               'printedControl': {'rawText': total_cell['rawText'], 'fragmentRefs': total_cell['fragmentRefs'],
                                                  'amountMinor': amount_minor(total_cell['rawText']) if additive and not role.endswith('_count') else None},
                               'controlVerification': 'deferred_not_used_for_membership_or_identity'})
    result = {'schema': 'financial-population-semantic-scope-v1', 'authority': 'evaluation_only_no_canonical_authority',
              'sourceSha256': source, 'structuralRecordFingerprint': digest(structural_record),
              'independentInventoryFingerprint': digest(independent_inventory),
              'atoms': list(atoms.values()), 'scopes': scopes, 'withheldStructuralScopes': withheld,
              'unadmittedDetailRowRefs': sorted(r['id'] for t in structural_record['tables'] for r in t['rows'] if r['kind'] == 'detail' and r['id'] not in {member for scope in scopes for member in scope['memberRowRefs']}),
              'unassignedFragmentCount': sum(x['classification'] == 'unassigned' for x in structural_record['coverageLedger']),
              'boundaries': ['no_whole_statement_financial_completeness', 'economic_identity_not_inferred_from_amounts',
                             'no_currency_identity_proof', 'no_canonical_mutation', 'no_new_authority', 'no_ai']}
    result['relationships'] = [relate(a, b, scopes) for a, b in itertools.combinations(scopes, 2)]
    result['resultFingerprint'] = digest(result)
    return result


def relate(a, b, scopes):
    aa, bb = set(a['atomRefs']), set(b['atomRefs'])
    shared_rows = set(a['memberRowRefs']) & set(b['memberRowRefs'])
    common = [s['id'] for s in scopes if s['role'] == a['role'] == b['role'] and aa | bb <= set(s['atomRefs'])]
    if a['role'] != b['role']:
        relation = 'different_measures_shared_rows' if shared_rows else 'unknown'
    elif aa == bb:
        relation = 'same_printed_contributions'
    elif aa < bb:
        relation = 'left_contribution_subset'
    elif bb < aa:
        relation = 'right_contribution_subset'
    elif aa & bb:
        relation = 'overlapping_printed_contributions'
    elif common:
        relation = 'separate_contributions_in_common_printed_scope'
    else:
        relation = 'unknown'
    return {'left': a['id'], 'right': b['id'], 'relation': relation, 'sharedAtomRefs': sorted(aa & bb),
            'commonAdmittedScopeRefs': common, 'economicActivityRelation': 'unknown',
            'canAddHeadlineTotals': False,
            'reason': 'source_members_and_explicit_measure_only; amounts_and_labels_do_not_prove_activity_identity'}


def aggregate(result, scope_refs):
    """Printed contribution union only. A public caller must validate saved records first."""
    by_id = {s['id']: s for s in result['scopes']}
    if not scope_refs or any(ref not in by_id for ref in scope_refs):
        return {'status': 'withheld', 'reason': 'missing_scope'}
    selected = [by_id[ref] for ref in dict.fromkeys(scope_refs)]
    if len({s['role'] for s in selected}) != 1:
        return {'status': 'withheld', 'reason': 'different_measures_cannot_be_added'}
    if any(s['printedAggregationStatus'] != 'eligible' for s in selected):
        return {'status': 'withheld', 'reason': 'unresolved_or_non_additive_scope'}
    atoms = {a['id']: a for a in result['atoms']}
    union = set().union(*(set(s['atomRefs']) for s in selected))
    roots = [s for s in result['scopes'] if s['role'] == selected[0]['role'] and union <= set(s['atomRefs']) and s['printedAggregationStatus'] == 'eligible']
    if not roots:
        return {'status': 'withheld', 'reason': 'no_common_admitted_scope_economic_overlap_unknown'}
    # Do not silently collapse a repeated printed value in a different source row.
    # Source atom identity deduplicates only identical evidence occurrences.
    is_count = selected[0]['role'].endswith('_count')
    amount = sum(int(Decimal(atoms[a]['value'])) if is_count else atoms[a]['amountMinor'] for a in union)
    return {'status': 'printed_contribution_union', 'role': selected[0]['role'],
            'atomRefs': sorted(union), 'valueCount' if is_count else 'amountMinor': amount,
            'duplicateReferencesRemoved': sum(len(by_id[ref]['atomRefs']) for ref in scope_refs) - len(union),
            'commonAdmittedScopeRefs': [s['id'] for s in roots], 'economicUniqueness': 'not_proven',
            'canonicalUse': 'prohibited', 'controlVerification': 'deferred'}


def validate_semantic_record(packet, structural_record, independent_inventory, saved):
    try:
        return digest(saved) == digest(analyze(packet, structural_record, independent_inventory))
    except (ValueError, KeyError, TypeError):
        return False


def aggregate_saved(packet, structural_record, independent_inventory, saved, scope_refs):
    if not validate_semantic_record(packet, structural_record, independent_inventory, saved):
        raise ValueError('Semantic evidence failed exact replay')
    return aggregate(saved, scope_refs)
