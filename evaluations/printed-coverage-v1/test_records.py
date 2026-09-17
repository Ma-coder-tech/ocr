import unittest
from coverage import source_inventory
from structure import assemble, digest
from records import json_value, validate_record
from test_coverage import chain

class SavedRecords(unittest.TestCase):
 def test_json_roundtrip_replays_exactly(self):
  p=chain();ref=source_inventory(p);saved=json_value(assemble(p,ref))
  self.assertTrue(validate_record(p,saved,ref))
 def test_rehashed_membership_edit_rejected(self):
  p=chain();ref=source_inventory(p);saved=json_value(assemble(p,ref))
  saved['tables'][-1]['totals'][0]['memberRowRefs']=[];saved['resultFingerprint']=digest(saved)
  self.assertFalse(validate_record(p,saved,ref))
 def test_ledger_omission_rejected(self):
  p=chain();ref=source_inventory(p);saved=json_value(assemble(p,ref));saved['coverageLedger'].pop()
  self.assertFalse(validate_record(p,saved,ref))
 def test_altered_input_rejected(self):
  p=chain();ref=source_inventory(p);saved=json_value(assemble(p,ref));p['pages'][0]['fragments'].pop()
  self.assertFalse(validate_record(p,saved,ref))
