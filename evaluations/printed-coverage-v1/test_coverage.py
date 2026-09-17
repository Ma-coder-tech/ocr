import copy
import unittest
from structure import assemble, validate_saved, digest
from coverage import source_inventory
from test_structure import f, fee, page, packet

def identity(p, total=2):
 n=p['page'];fs=[f('Merchant Number',20,50,100),f('UNSEEN123',150,50,80),f(f'Page {n} of {total}',450,50,110),
                 f('Statement Period',340,75,110),f('01/01/25 - 01/31/25',460,75,130)]
 p['fragments'] += [{**x,'id':f'identity-{n}-{i}'} for i,x in enumerate(fs)]
 return p

def chain():
 first=identity(fee(1,total=False));second=identity(fee(2))
 second['fragments']=[x for x in second['fragments'] if x['y']!=120]
 second['fragments'].append({**f('FEES',35,110,60,'header'),'id':'continuation-banner'})
 return packet([first,second])

def complete(out):return [x for t in out['tables'] for x in t['totals'] if x['printedMembershipStatus']=='complete']

class CoverageTests(unittest.TestCase):
 def test_complete_headerless_membership(self):
  p=chain();out=assemble(p,source_inventory(p));self.assertEqual(out['continuations'][0]['status'],'accepted')
  self.assertEqual(len(complete(out)),1);self.assertEqual(len(complete(out)[0]['memberRowRefs']),2)
  self.assertEqual(out['tables'][0]['coverage']['membershipStatus'],'partial')
 def test_every_source_fragment_has_one_ledger_entry(self):
  p=chain();p['pages'][0]['fragments'].append({**f('OUTSIDE SCOPE',20,95,100),'id':'unrelated'})
  out=assemble(p,source_inventory(p));ids=[x['fragmentRef'] for x in out['coverageLedger']]
  self.assertEqual(len(ids),len(set(ids)));self.assertEqual(set(ids),{x['id'] for pg in p['pages'] for x in pg['fragments']})
 def test_missing_independent_inventory_never_complete(self):
  self.assertEqual(complete(assemble(chain())),[])
 def test_missing_entire_row_detected_against_reference(self):
  p=chain();ref=source_inventory(p);p['pages'][0]['fragments']=[x for x in p['pages'][0]['fragments'] if x['y']!=140]
  out=assemble(p,ref);self.assertEqual(out['sourceInventoryStatus'],'mismatch');self.assertEqual(complete(out),[])
 def test_missing_whole_page_detected_against_reference(self):
  p=chain();ref=source_inventory(p);p['pages']=p['pages'][1:];self.assertEqual(complete(assemble(p,ref)),[])
 def test_changed_fragment_geometry_detected(self):
  p=chain();ref=source_inventory(p);p['pages'][0]['fragments'][0]['x']+=1
  self.assertEqual(complete(assemble(p,ref)),[])
 def test_changed_identity_refuses_join(self):
  p=chain()
  next(x for x in p['pages'][1]['fragments'] if x['text']=='UNSEEN123')['text']='OTHER123'
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_nonconsecutive_printed_pages_refuse_join(self):
  p=chain();next(x for x in p['pages'][1]['fragments'] if x['text']=='Page 2 of 2')['text']='Page 3 of 3'
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_nonadjacent_physical_pages_refuse_join(self):
  p=chain();p['pages'][1]['page']=3;self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_changed_closing_title_refuses_join(self):
  p=chain();next(x for x in p['pages'][1]['fragments'] if x['text']=='TOTAL ACCOUNT FEES')['text']='TOTAL OTHER FEES'
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_missing_named_end_remains_partial(self):
  p=chain();p['pages'][1]['fragments']=[x for x in p['pages'][1]['fragments'] if x['y']!=160]
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_shifted_amounts_refuse_join(self):
  p=chain()
  for x in p['pages'][1]['fragments']:
   if x['x']>550 and x['y']>=140:x['x']-=10
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_missing_type_refuses_join(self):
  p=chain();p['pages'][1]['fragments']=[x for x in p['pages'][1]['fragments'] if not(x['y']==140 and x['text']=='Fees')]
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_unrelated_heading_blocks_membership(self):
  p=chain();p['pages'][1]['fragments'].append({**f('OTHER FEES',75,130,100,'header'),'id':'other-heading'})
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_unexplained_prefix_blocks_join(self):
  p=chain();p['pages'][1]['fragments'].append({**f('UNEXPLAINED SECTION',20,96,160),'id':'unexplained-prefix'})
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_unknown_row_inside_run_blocks_complete(self):
  p=chain();p['pages'][0]['fragments'].append({**f('UNEXPLAINED NOTE',75,154,130),'id':'unexplained-note'})
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_financial_looking_footer_never_silently_excluded(self):
  p=chain();p['pages'][0]['fragments'].append({**f('EXTRA FEE $5.00',75,770,130),'id':'amount-in-footer'})
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_following_explicit_table_stays_separate(self):
  p=chain();extra=fee(2,'EQUIPMENT')
  for x in extra['fragments']:x['y']+=100;x['baseline']+=100;x['id']+='-equipment'
  p['pages'][1]['fragments']+=extra['fragments'];out=assemble(p,source_inventory(p))
  self.assertEqual(sorted(len(x['memberRowRefs']) for x in complete(out)),[1,2])
 def test_matching_arithmetic_does_not_select_members(self):
  p=chain();out=assemble(p,source_inventory(p));next(x for x in p['pages'][1]['fragments'] if x['y']==160 and x['x']>550)['text']='-$999.99'
  changed=assemble(p,source_inventory(p));self.assertEqual(complete(out)[0]['memberRowRefs'],complete(changed)[0]['memberRowRefs'])
 def test_rehashed_saved_coverage_tampering_rejected(self):
  p=chain();ref=source_inventory(p);out=assemble(p,ref);out['tables'][-1]['totals'][0]['memberRowRefs']=[];out['resultFingerprint']=digest(out)
  self.assertFalse(validate_saved(p,out,ref))
 def test_three_page_chain_cannot_hide_earlier_failed_join(self):
  p=chain();last=copy.deepcopy(p['pages'][1]);last['page']=3
  for x in last['fragments']:x['id']+='-p3';x['text']=x['text'].replace('Page 2 of 2','Page 3 of 3')
  p['pages'][1]['fragments']=[x for x in p['pages'][1]['fragments'] if x['y']!=160]
  p['pages'].append(last)
  for i,pg in enumerate(p['pages']):
   for x in pg['fragments']:
    if x['text'].startswith('Page '):x['text']=f'Page {i+1} of 3'
  next(x for x in p['pages'][0]['fragments'] if x['text']=='UNSEEN123')['text']='WRONG'
  out=assemble(p,source_inventory(p));self.assertEqual(complete(out),[])
  self.assertNotEqual(out['tables'][-1]['coverage']['membershipStatus'],'complete')
 def test_orphan_prior_rows_prevent_false_fresh_start(self):
  p=packet([identity(fee(1,total=False)),identity(fee(2))])
  p['pages'][0]['fragments']=[x for x in p['pages'][0]['fragments'] if x['y']!=120]
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
 def test_repeated_headers_do_not_override_changed_identity(self):
  p=packet([identity(fee(1,total=False)),identity(fee(2))])
  next(x for x in p['pages'][1]['fragments'] if x['text']=='UNSEEN123')['text']='OTHER123'
  self.assertEqual(complete(assemble(p,source_inventory(p))),[])
