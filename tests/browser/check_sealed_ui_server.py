import unittest
import sealed_ui_server as h
class SealedControllerChecks(unittest.TestCase):
 def setUp(self):
  h.ui.owners.clear();h.probes.clear();h.ui.forwarding=True;h.ui.reports.clear();h.ui.reported_at.clear();h.receipts.update(A=[],B=[])
  self.client=h.app.test_client()
 def post(self,path,data):return self.client.post(path,json=data,base_url='http://localhost:8787',headers={'Origin':'http://localhost:8787'})
 def test_loader_and_origin(self):
  self.assertIn(b'/__sealed__/observer.js',self.client.get('/client',base_url='http://localhost:8787').data)
  self.assertEqual(self.client.get('/__sealed__/status',base_url='http://example.com').status_code,403)
 def test_probe_auth_schema_and_duplicate(self):
  owner=self.post('/__ui__/join',{'role':'A'}).get_json();value={**owner,'probe':'private-nonce','outerValid':True}
  self.assertEqual(self.post('/__sealed__/probe',value).status_code,409)
  other=self.post('/__ui__/join',{'role':'B'}).get_json()
  h.ui.forwarding=False
  for role in 'AB':h.ui.reports[role]={'open':1,'sentWhileForwarding':0,'linkLost':0};h.ui.reported_at[role]=h.ui.time.monotonic()
  self.assertEqual(self.post('/__sealed__/probe',{**other,'probe':'private-nonce','outerValid':True}).status_code,409)
  h.ui.reported_at['B']-=6
  self.assertEqual(self.post('/__sealed__/ready',owner).status_code,409)
  h.ui.reported_at['B']=h.ui.time.monotonic()
  self.assertEqual(self.post('/__sealed__/ready',owner).status_code,200)
  for change in [{'probe':'raw text'},{'outerValid':False},{'payload':'private text'}]:self.assertEqual(self.post('/__sealed__/probe',{**value,**change}).status_code,400)
  self.assertEqual(self.post('/__sealed__/probe',{**value,'owner':'wrong'}).status_code,409)
  self.assertEqual(self.post('/__sealed__/probe',value).status_code,200)
  self.assertEqual(self.post('/__sealed__/probe',value).status_code,409)
  self.assertEqual(h.probes,['private-nonce'])
 def test_receipts_are_authenticated_bounded_case_labels(self):
  owner=self.post('/__ui__/join',{'role':'B'}).get_json();value={**owner,'probe':'direct-ciphertext'}
  self.assertEqual(self.post('/__sealed__/receipt',value).status_code,409)
  h.ui.forwarding=False
  self.assertEqual(self.post('/__sealed__/receipt',{**value,'owner':'wrong'}).status_code,409)
  self.assertEqual(self.post('/__sealed__/receipt',{**value,'probe':'raw candidate'}).status_code,400)
  self.assertEqual(self.post('/__sealed__/receipt',value).status_code,200)
  self.assertEqual(self.post('/__sealed__/receipt',value).status_code,200)
  self.assertEqual(h.receipts['B'],['direct-ciphertext'])
 def test_status_has_hashes_no_owner_and_no_relay_patch_on_import(self):
  owner=self.post('/__ui__/join',{'role':'A'}).get_json();response=self.client.get('/__sealed__/status',base_url='http://localhost:8787')
  self.assertNotIn(owner['owner'],response.get_data(as_text=True))
  self.assertIn('sealed_ui_observer.js',response.get_json()['fixtureHashes'])
  self.assertIs(h.ui.main.relay_to_others,h.ui.original_relay)
if __name__=='__main__':unittest.main()
