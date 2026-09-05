"""Post-freeze adversarial review. Records failures without retuning the engine."""
import json
from pathlib import Path
from structure import assemble
from test_structure import f, page, packet as test_packet

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'artifacts/printed-membership-v1'
failures = []

# A repeated Items/Amount grid must not retain continuity when its parent
# gross/refund roles change. Derive geometry from source; change labels only.
packet = json.loads((ART / 'holdout-sealed/holdout-1-native.json').read_text())
packet['pages'] = [p for p in packet['pages'] if p['page'] in (146, 147)]
for fragment in packet['pages'][1]['fragments']:
    if fragment['text'] == 'Refunds': fragment['text'] = 'Total Gross Sales You Submitted'
    elif fragment['text'] == 'Total Gross Sales You Submitted': fragment['text'] = 'Refunds'
out = assemble(packet)
link = next(c for c in out['continuations'] if c['sourcePages'] == [146, 147])
failures.append({'id': 'changed_parent_header_roles', 'expected': 'reject_or_unresolved',
                 'actual': link['status'], 'passed': link['status'] != 'accepted',
                 'explanation': 'A continuation must compare parent header paths as well as leaf labels.'})

def dated_fee(n):
    xs = [40, 105, 195, 325, 415, 540]
    fs = [f(label, x, 120, 35, 'header') for label,x in zip(['Date','Type','Description','Volume','Rate','Total'],xs)]
    fs += [f(label, x, 140, 35) for label,x in zip(['01/01','CF','A FEE','100.00','.01','1.00'],xs)]
    fs += [f('Sub Totals',40,160,75), f('1.00',540,160,35)]
    return page(n,fs)
out = assemble(test_packet([dated_fee(1), dated_fee(2)]))
last = out['tables'][-1]; total = last['totals'][0]
current = [r['id'] for r in last['rows'] if r['kind']=='detail']
failures.append({'id': 'closed_subtotal_carryover', 'expected': 'only_new_run_members',
                 'actualStatus': total['status'], 'actualMemberCount': len(total['memberRowRefs']),
                 'expectedMemberCount': len(current), 'passed': total['status'] != 'accepted_printed_run' or set(total['memberRowRefs']) == set(current),
                 'explanation': 'Continuation must carry only the open printed run, preserving closed subtotal nodes separately.'})
(ART / 'review-probes.json').write_text(json.dumps(failures, indent=2) + '\n')
print(json.dumps(failures, indent=2))
