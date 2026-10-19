import unittest
import four_peer_server as h

class FourPeerChecks(unittest.TestCase):
    def setUp(self):
        h.ui.owners.clear(); h.traces.clear(); h.ui.forwarding=True
        self.client=h.app.test_client()
    def post(self,path,value):
        return self.client.post(path,json=value,base_url='http://localhost:8787',headers={'Origin':'http://localhost:8787'})
    def test_loader_and_four_role_join(self):
        page=self.client.get('/client',base_url='http://localhost:8787')
        self.assertEqual(page.status_code,200)
        self.assertIn(b'/__four__/observer.js',page.data)
        self.assertNotIn(b'src="/static/js/client.js"',page.data)
        for role in 'ABCD':
            self.assertEqual(self.post('/__ui__/join',{'role':role}).get_json()['expectedConnections'],3)
    def test_authenticated_bounded_scalar_trace(self):
        owner=self.post('/__ui__/join',{'role':'A'}).get_json()
        row=dict(pc=1,at=12,connection='connected',ice='connected',generated=1,applied=1,rejected=0,localSdp=1,remoteSdp=1,remoteStats=1,pairs=1,channelsOpen=1)
        self.assertEqual(self.post('/__four__/snapshot',{**owner,'trace':row}).status_code,200)
        for change in [{'pc':True},{'at':30},{'pc':9},{'SDP':'secret'},{'connection':'raw value'}]:
            self.assertEqual(self.post('/__four__/snapshot',{**owner,'trace':{**row,**change}}).status_code,400)
        self.assertEqual(self.post('/__four__/snapshot',{**owner,'owner':'wrong','trace':row}).status_code,409)
        self.assertEqual(len(h.traces),1)
        h.traces.extend([{}]*63)
        self.assertEqual(self.post('/__four__/snapshot',{**owner,'trace':row}).status_code,429)
    def test_guards_and_no_credential_status(self):
        owner=self.post('/__ui__/join',{'role':'A'}).get_json()
        self.assertEqual(self.client.get('/__four__/status',base_url='http://example.com').status_code,403)
        result=self.client.get('/__four__/status',base_url='http://localhost:8787')
        self.assertNotIn(owner['owner'],result.get_data(as_text=True))
        self.assertIs(h.ui.main.relay_to_others,h.ui.original_relay)

if __name__=='__main__':unittest.main()
