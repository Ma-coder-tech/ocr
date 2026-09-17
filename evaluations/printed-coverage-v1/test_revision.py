"""Regression coverage added after review; requires a fresh holdout freeze."""
import copy
import unittest
from structure import assemble
from test_structure import f, page, packet

def dated_fee(n, grand=False):
 xs=[40,105,195,325,415,540]
 fs=[f(label,x,120,35,'header') for label,x in zip(['Date','Type','Description','Volume','Rate','Total'],xs)]
 fs += [f(label,x,140,35) for label,x in zip(['01/01','CF','A FEE','100.00','.01','1.00'],xs)]
 fs += [f('Sub Totals',40,160,75),f('1.00',540,160,35)]
 if grand:fs += [f('Total',40,180,35),f('2.00',540,180,35)]
 return page(n,fs)

def batch(n):
 xs=[40,115,190,240,310,365,440,485,560]
 fs=[f('Total Gross Sales You Submitted',220,120,120,'header'),f('Refunds',390,120,30,'header'),f('Total Amount You Submitted',480,120,110,'header')]
 fs += [f('Average',180,120,35,'header'),f('Ticket',180,130,35,'header')]
 fs += [f(label,x,140,25,'header') for label,x in zip(['Batch','Submit Date','Items','Amount','Items','Amount','Items','Amount'],[40,115,240,310,365,440,485,560])]
 fs += [f(label,x,160,25) for label,x in zip(['123','01/01','1.00','1','1.00','0','0.00','1','1.00'],xs)]
 return page(n,fs)

class ReviewRegressions(unittest.TestCase):
 def test_changed_parent_headers_reject_continuation(self):
  p=packet([batch(1),batch(2)])
  self.assertEqual(assemble(p)['continuations'][0]['status'],'accepted')
  for frag in p['pages'][1]['fragments']:
   if frag['text']=='Refunds':frag['text']='Total Gross Sales You Submitted'
   elif frag['text']=='Total Gross Sales You Submitted':frag['text']='Refunds'
  link=assemble(p)['continuations'][0]
  self.assertEqual(link['status'],'rejected');self.assertIn('different_parent_header_paths',link['reasons'])
 def test_closed_subtotal_members_do_not_enter_next_run(self):
  out=assemble(packet([dated_fee(1),dated_fee(2)]));last=out['tables'][-1]
  self.assertEqual(last['totals'][0]['status'],'accepted_printed_run')
  self.assertEqual(last['totals'][0]['memberRowRefs'],[r['id'] for r in last['rows'] if r['kind']=='detail'])
 def test_closed_subtotals_survive_for_grand_total_without_overlap(self):
  out=assemble(packet([dated_fee(1),dated_fee(2,True)]));total=out['tables'][-1]['totals'][-1]
  self.assertEqual(total['status'],'accepted_printed_run');self.assertEqual(len(total['childTotalRefs']),2)
  self.assertEqual(len(total['memberRowRefs']),2);self.assertEqual(len(set(total['memberRowRefs'])),2)
 def test_mixed_grand_total_scope_withheld(self):
  p=packet([dated_fee(1),dated_fee(2,True)])
  p['pages'][1]['fragments']=[f for f in p['pages'][1]['fragments'] if f['y']!=160]
  total=assemble(p)['tables'][-1]['totals'][-1]
  self.assertEqual(total['status'],'unresolved');self.assertIn('mixed_child_totals_and_open_run_scope_unresolved',total['reasons'])
