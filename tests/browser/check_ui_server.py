"""Product observer negative controls. No browser, sockets, or real credentials."""
import time
import unittest
from unittest.mock import patch
import ui_server as harness


KEYS = ('open publicRx privateRx directRx invalidRx outbound sentWhileForwarding '
        'linkLost publicShown privateShown directShown replyShown tamperedShown').split()


class ProductControllerChecks(unittest.TestCase):
    def setUp(self):
        harness.owners.clear()
        harness.reports.clear()
        harness.reported_at.clear()
        harness.main.peers.clear()
        harness.forwarding = True
        harness.blocked = 0
        self.client = harness.app.test_client()

    def post(self, name, data, origin='http://localhost:8787'):
        return self.client.post('/__ui__/' + name, json=data,
                                base_url='http://localhost:8787', headers={'Origin': origin})

    def ready_pair(self):
        owners = {}
        for role in 'AB':
            owners[role] = self.post('join', {'role': role}).get_json()
            metrics = dict.fromkeys(KEYS, 0)
            metrics['open'] = 1
            self.assertEqual(self.post('report', {**owners[role], 'metrics': metrics}).status_code, 200)
        harness.main.peers.update({object(): {}, object(): {}})
        return owners

    def test_import_does_not_patch_production_relay(self):
        self.assertIs(harness.main.relay_to_others, harness.original_relay)

    def test_one_shot_and_malformed_roles(self):
        self.assertEqual(self.post('join', {'role': 'A'}).status_code, 200)
        self.assertEqual(self.post('join', {'role': 'A'}).status_code, 409)
        for role in ['C', [], {}, None]:
            self.assertEqual(self.post('join', {'role': role}).status_code, 400)

    def test_origin_host_and_remote_guards(self):
        self.assertEqual(self.post('join', {'role': 'A'}, 'https://example.com').status_code, 403)
        self.assertEqual(self.client.get('/__ui__/status', base_url='http://example.com').status_code, 403)
        self.assertEqual(self.client.get('/__ui__/status', base_url='http://localhost:8787',
                                         environ_overrides={'REMOTE_ADDR': '192.0.2.1'}).status_code, 403)
        # The /client after-response hook must preserve denial, not turn it into a 500.
        self.assertEqual(self.client.get('/client', base_url='http://example.com').status_code, 403)

    def test_stale_and_wrong_role_credentials_rejected(self):
        owners = self.ready_pair()
        for changes in [{'run': 'old'}, {'role': 'B'}, {'role': []}, {'owner': 'wrong'}]:
            self.assertEqual(self.post('disable', {**owners['A'], **changes}).status_code, 409)
        self.assertTrue(harness.forwarding)

    def test_metric_schema_rejects_boolean_extra_and_unbounded_data(self):
        owner = self.post('join', {'role': 'A'}).get_json()
        for changes in [{'open': True}, {'open': -1}, {'outbound': 10001}, {'payload': 'private text'}]:
            self.assertEqual(self.post('report', {**owner, 'metrics': {**dict.fromkeys(KEYS, 0), **changes}}).status_code, 400)
        self.assertFalse(harness.reports)

    def test_disable_requires_both_live_links_and_hub_connections(self):
        owners = self.ready_pair()
        harness.reports['B']['open'] = 0
        self.assertEqual(self.post('disable', owners['A']).status_code, 409)
        harness.reports['B']['open'] = 1
        harness.main.peers.popitem()
        self.assertEqual(self.post('disable', owners['A']).status_code, 409)
        self.assertTrue(harness.forwarding)

    def test_stale_or_failed_evidence_cannot_disable(self):
        owners = self.ready_pair()
        harness.reported_at['B'] = time.monotonic() - 6
        self.assertEqual(self.post('disable', owners['A']).status_code, 409)
        harness.reported_at['B'] = time.monotonic()
        for key in ['sentWhileForwarding', 'linkLost']:
            harness.reports['B'][key] = 1
            self.assertEqual(self.post('disable', owners['A']).status_code, 409)
            harness.reports['B'][key] = 0
        self.assertTrue(harness.forwarding)

    def test_disabled_relay_drops_frames_and_cannot_accept_new_roles(self):
        owners = self.ready_pair()
        self.assertEqual(self.post('disable', owners['B']).status_code, 409)
        self.assertEqual(self.post('disable', owners['A']).status_code, 200)
        with patch.object(harness, 'original_relay') as relay:
            harness.test_relay(object(), b'dummy')
            relay.assert_not_called()
        self.assertEqual(harness.blocked, 1)
        self.assertEqual(self.post('join', {'role': 'A'}).status_code, 409)

    def test_status_pins_sources_without_exposing_owner_credentials(self):
        owner = self.post('join', {'role': 'A'}).get_json()
        response = self.client.get('/__ui__/status', base_url='http://localhost:8787')
        value = response.get_json()
        self.assertIn('static/vendor/nacl-fast.min.js', value['sourceHashes'])
        self.assertIn('product/observe.js', value['fixtureHashes'])
        self.assertNotIn(owner['owner'], response.get_data(as_text=True))
        self.assertNotIn('PASS', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
