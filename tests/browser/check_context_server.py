"""Controller negative controls; run directly in its own process."""
import copy
import unittest
import context_server as harness

INITIAL = copy.deepcopy(harness.state)


class ContextControllerChecks(unittest.TestCase):
    def setUp(self):
        harness.state.clear()
        harness.state.update(copy.deepcopy(INITIAL))
        harness.owners.clear()
        harness.blocked_senders.clear()
        harness.started = None
        self.client = harness.app.test_client()

    def post(self, path, data, origin='http://localhost:8787'):
        return self.client.post('/__test__/' + path, json=data,
                                base_url='http://localhost:8787', headers={'Origin': origin})

    def test_import_does_not_patch_production_relay(self):
        self.assertIs(harness.main.relay_to_others, harness.original_relay)

    def test_one_shot_role_and_stale_run_rejected(self):
        joined = self.post('join', {'role': 'A'}).get_json()
        self.assertEqual(self.post('join', {'role': 'A'}).status_code, 409)
        report = dict(role='A', run='stale', owner=joined['owner'], ready=False,
                      first=0, second=0, down=False, removed=False, rejoined=False)
        self.assertEqual(self.post('report', report).status_code, 409)
        harness.state['phase'] = 'done'
        self.assertEqual(self.post('join', {'role': 'B'}).status_code, 409)

    def test_cross_origin_and_nonlocal_request_rejected(self):
        self.assertEqual(self.post('join', {'role': 'A'}, 'https://example.com').status_code, 403)
        response = self.client.get('/__test__/status', base_url='http://localhost:8787',
                                   environ_overrides={'REMOTE_ADDR': '192.0.2.1'})
        self.assertEqual(response.status_code, 403)

    def test_incomplete_duplicate_and_disconnect_evidence_cannot_pass(self):
        row = dict(ready=True, first=2, second=0, down=False, removed=False, rejoined=False)
        harness.state['reports'] = {'A': dict(row), 'B': dict(row)}
        harness.advance(0)
        harness.advance(1)
        self.assertEqual(harness.state['phase'], 'first')
        self.assertFalse(harness.state['forwarding'])
        harness.state['blocked'] = 2
        harness.state['blockedPeers'] = 1
        harness.advance(2)
        self.assertEqual(harness.state['phase'], 'first')
        harness.state['blockedPeers'] = 2
        harness.state['reports']['B']['first'] = 3
        harness.advance(3)
        self.assertEqual(harness.state['phase'], 'first')
        harness.state['reports']['B']['first'] = 2
        harness.advance(4)
        self.assertEqual(harness.state['phase'], 'disconnect')
        harness.state['reports']['A']['down'] = True
        harness.state['reports']['B']['ready'] = False
        harness.advance(5)
        self.assertEqual(harness.state['phase'], 'disconnect')
        harness.state['reports']['B']['removed'] = True
        harness.advance(6)
        self.assertEqual(harness.state['phase'], 'reconnect')
        harness.state['reports']['A']['rejoined'] = True
        harness.state['reports']['B']['ready'] = True
        harness.advance(7)
        self.assertEqual(harness.state['phase'], 'second')
        harness.state['reports']['A']['second'] = 2
        harness.advance(8)
        self.assertEqual(harness.state['phase'], 'second')
        harness.state['reports']['B']['second'] = 2
        harness.advance(9)
        self.assertEqual(harness.state['phase'], 'done')

    def test_probe_requires_exact_payload_and_live_sender(self):
        harness.state['forwarding'] = False
        live, absent = object(), object()
        harness.main.peers[live] = {}
        try:
            harness.test_relay(live, 'not the probe')
            harness.test_relay(absent, '{"type":"test_relay_probe"}')
            self.assertEqual(harness.state['blockedPeers'], 0)
            harness.test_relay(live, '{"type":"test_relay_probe"}')
            harness.test_relay(live, '{"type":"test_relay_probe"}')
            self.assertEqual(harness.state['blockedPeers'], 1)
        finally:
            harness.main.peers.pop(live, None)

    def test_other_role_owner_rejected(self):
        a = self.post('join', {'role': 'A'}).get_json()
        self.post('join', {'role': 'B'})
        report = dict(role='B', run=a['run'], owner=a['owner'], ready=False,
                      first=0, second=0, down=False, removed=False, rejoined=False)
        self.assertEqual(self.post('report', report).status_code, 409)

    def test_deadline_fails(self):
        harness.started = 1
        harness.state['phase'] = 'connecting'
        harness.advance(92)
        self.assertEqual(harness.state['phase'], 'failed')


if __name__ == '__main__':
    unittest.main()
