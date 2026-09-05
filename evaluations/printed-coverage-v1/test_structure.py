"""Independent structural/mutation tests. No RateReveal runtime or fixture imports."""
import copy,unittest
from structure import assemble,validate_saved,digest

def f(text,x,y,w=35,font='body',id=None):
 return {'id':id or f'{text}-{x}-{y}','text':text,'x':x,'y':y,'width':w,'height':8,'baseline':y+8,'font':font,'dir':'ltr'}
def page(n,fs):return {'page':n,'width':600,'height':800,'fragments':[{**x,'id':f'p{n}-'+x['id']} for x in fs]}
def packet(pages):return {'schema':'positioned-native-evidence-v1','sourceSha256':'a'*64,'extractor':{'name':'test-native'},'pages':pages}
def fee(n=1,heading='ACCOUNT FEES',total=True,details=None):
 fs=[f(heading,35,120,130,'header'),f('Type',445,120,20,'header'),f('Amount',560,120,35,'header')]
 fs+=details or [f('EXAMPLE FEE',75,140,110),f('.0020 TIMES $1200.00',200,140,130),f('Fees',445,140,20),f('-$2.40',563,140,30)]
 if total:fs +=[f('TOTAL '+heading,75,160,145,'header'),f('-$2.40',563,160,30,'header')]
 return page(n,fs)
def funding(n,total=False):
 labels=[('Date','Submitted',75),('Batch','Number',145),('Submitted','Amount',225),('Third Party','Transactions',295),('Adjustments/','Chargebacks',365),('Fees','Charged',440),('Funded','Amount',555)]
 fs=[f(a,x,130,40,'header') for a,b,x in labels]+[f(b,x,139,40,'header') for a,b,x in labels]
 fs +=[f(s,x,160,30) for s,x in [('01/03',50),('123456',140),('$100.00',235),('0.00',310),('0.00',385),('-$2.00',457),('$98.00',555)]]
 if total:fs +=[f('Total',50,180,30)]+[f(s,x,180,30) for s,x in [('$200.00',235),('0.00',310),('0.00',385),('-$4.00',457),('$196.00',555)]]
 return page(n,fs)

class PrintedStructureTests(unittest.TestCase):
 def test_basis_stays_in_description(self):
  o=assemble(packet([fee()]));r=o['tables'][0]['rows'][0]
  self.assertIn('$1200.00',r['cells'][0]['rawText']);self.assertEqual(r['cells'][2]['rawText'],'-$2.40')
  self.assertEqual(o['tables'][0]['totals'][0]['memberRowRefs'],[r['id']])
 def test_reversible_fragment_assignment(self):
  p=packet([fee()]);o=assemble(p);fs={f['id']:f for f in p['pages'][0]['fragments']}
  for r in o['tables'][0]['rows']:
   self.assertEqual(sorted(r['fragmentRefs']),sorted(x for c in r['cells'] for x in c['fragmentRefs']))
   for c in r['cells']:
    self.assertEqual(c['rawText'],' '.join(fs[x]['text'] for x in c['fragmentRefs']))
 def test_no_input_mutation_and_replay(self):
  p=packet([fee()]);before=copy.deepcopy(p);o=assemble(p)
  self.assertEqual(p,before);self.assertTrue(validate_saved(p,o))
 def test_rehashed_result_tampering_rejected(self):
  p=packet([fee()]);o=assemble(p);o['tables'][0]['totals'][0]['memberRowRefs']=[];o['resultFingerprint']=digest(o)
  self.assertFalse(validate_saved(p,o))
 def test_native_fragment_mutation_invalidates_saved(self):
  p=packet([fee()]);o=assemble(p);p['pages'][0]['fragments'][-1]['text']='-$9.99'
  self.assertFalse(validate_saved(p,o))
 def test_missing_amount_not_accepted(self):
  p=packet([fee()]);p['pages'][0]['fragments']=[f for f in p['pages'][0]['fragments'] if not (f['y']==140 and f['x']>550)]
  o=assemble(p);self.assertTrue(all(t['status']=='unresolved' for t in o['tables'][0]['totals']))
 def test_missing_header_no_invented_grid(self):
  p=packet([fee()]);p['pages'][0]['fragments']=[f for f in p['pages'][0]['fragments'] if f['text']!='Amount']
  self.assertEqual(assemble(p)['tables'],[])
 def test_duplicate_fragment_identity_rejected(self):
  p=packet([fee()]);p['pages'][0]['fragments'].append(copy.deepcopy(p['pages'][0]['fragments'][0]))
  with self.assertRaises(ValueError):assemble(p)
 def test_geometrically_overlaid_duplicate_ambiguous(self):
  p=packet([fee()]);x=copy.deepcopy(p['pages'][0]['fragments'][3]);x['id']+='copy';p['pages'][0]['fragments'].append(x)
  self.assertEqual(assemble(p)['tables'][0]['totals'][0]['status'],'unresolved')
 def test_adjacent_funding_header_continuation(self):
  o=assemble(packet([funding(1),funding(2,True)]));self.assertEqual(o['continuations'][0]['status'],'accepted')
  t=o['tables'][1]['totals'][0];self.assertEqual(len(t['memberRowRefs']),2);self.assertEqual(t['status'],'accepted_printed_run')
 def test_missing_middle_page_breaks_scope(self):
  o=assemble(packet([funding(1),funding(3,True)]));self.assertEqual(o['continuations'][0]['status'],'rejected');self.assertEqual(o['tables'][-1]['totals'][0]['status'],'unresolved')
 def test_closed_tables_never_join(self):
  o=assemble(packet([funding(1,True),funding(2,True)]));self.assertEqual(o['continuations'][0]['status'],'rejected');self.assertEqual(len(o['tables'][-1]['totals'][0]['memberRowRefs']),1)
 def test_different_fee_scopes_never_join(self):
  o=assemble(packet([fee(1,'TRANSACTION FEES',False),fee(2,'ACCOUNT FEES')]));self.assertEqual(o['continuations'][0]['status'],'rejected');self.assertEqual(len(o['tables'][-1]['totals'][0]['memberRowRefs']),1)
 def test_shifted_columns_reject_continuation(self):
  p=packet([funding(1),funding(2,True)])
  for x in p['pages'][1]['fragments']:x['x']-=25
  o=assemble(p);self.assertEqual(o['continuations'][0]['status'],'rejected')
 def test_headerless_continuation_unresolved(self):
  nxt=fee(2);nxt['fragments']=[x for x in nxt['fragments'] if x['y']!=120];nxt['fragments'].insert(0,{**f('FEES',35,100,60,'header'), 'id':'page2-fees'})
  o=assemble(packet([fee(1,total=False),nxt]));self.assertEqual(o['continuations'][0]['status'],'unresolved');self.assertTrue(all(t['status']=='unresolved' for t in o['tables'][-1]['totals']))
 def test_sum_agreement_not_used_for_members(self):
  a=packet([fee()]);b=copy.deepcopy(a);b['pages'][0]['fragments'][-1]['text']='-$999.99'
  aa=assemble(a)['tables'][0]['totals'][0];bb=assemble(b)['tables'][0]['totals'][0]
  self.assertEqual(aa['memberRowRefs'],bb['memberRowRefs']);self.assertEqual(bb['financialCompleteness'],'not_proven')
 def test_unresolved_wrap_blocks_total(self):
  p=packet([fee()]);p['pages'][0]['fragments'].append({**f('UNATTACHED CONTINUATION',75,151,170), 'id':'wrap'})
  self.assertEqual(assemble(p)['tables'][0]['totals'][0]['status'],'unresolved')
 def test_unique_split_label_attaches(self):
  p=packet([fee(details=[f('WRAPPED LABEL',75,139,110),f('Fees',445,149,20),f('-$2.40',563,149,30)])])
  o=assemble(p);row=next(r for r in o['tables'][0]['rows'] if r['kind']=='detail');self.assertEqual(row['cells'][0]['rawText'],'WRAPPED LABEL');self.assertEqual(row['status'],'accepted')
 def test_arbitrary_ids_and_values_do_not_dispatch(self):
  p=packet([fee()]);p['sourceSha256']='b'*64
  for i,f in enumerate(p['pages'][0]['fragments']):f['id']=str(i);f['text']=f['text'].replace('EXAMPLE','UNSEEN').replace('1200.00','9999.00')
  self.assertEqual(assemble(p)['tables'][0]['totals'][0]['status'],'accepted_printed_run')
 def test_source_hash_and_bad_geometry_rejected(self):
  for key,value in [('x',float('nan')),('height',0)]:
   p=packet([fee()]);p['pages'][0]['fragments'][0][key]=value
   with self.assertRaises(ValueError):assemble(p)

if __name__=='__main__':unittest.main()
