import json
from html.parser import HTMLParser
import unittest
import candidate_server as fixture
import isolated_diagnostic as diagnostic

events = []
diagnostic.install_fixture_hooks(fixture.app, lambda event: events.append(event))


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.scripts.append(dict(attrs))


class IsolatedDiagnosticChecks(unittest.TestCase):
    def setUp(self):
        events.clear()
        self.client = fixture.app.test_client()

    def test_readiness_is_external_under_unchanged_csp(self):
        plain = self.client.get('/__diag__/connectivity.js', base_url='http://localhost:8787')
        page = self.client.get('/__diag__/connectivity.html', base_url='http://localhost:8787')
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.headers['Content-Security-Policy'], plain.headers['Content-Security-Policy'])
        self.assertIn("script-src 'self';", page.headers['Content-Security-Policy'])
        scripts = Scripts()
        scripts.feed(page.get_data(as_text=True))
        self.assertEqual([s.get('src') for s in scripts.scripts],
                         ['/__diag__/observer.js?v=1', '/__isolated__/ready.js'])
        self.assertIn(b'<button id="native" disabled>', page.data)
        plain.close()
        page.close()
        for script in scripts.scripts:
            response = self.client.get(script['src'], base_url='http://localhost:8787')
            self.assertEqual(response.status_code, 200)
            self.assertIn(response.mimetype, ('text/javascript', 'application/javascript'))
            response.close()

    def test_origin_and_fixed_event_schema(self):
        for event in ('page_ready', 'test_clicked'):
            data = {'event': event}
            self.assertEqual(self.client.post('/__isolated__/event', json=data,
                base_url='http://localhost:8787', headers={'Origin': 'http://localhost:8787'}).status_code, 200)
        self.assertEqual(events, ['page_ready', 'test_clicked'])
        for data in ({'event': 'secret'}, {'event': 'page_ready', 'raw': 'secret'}, []):
            self.assertEqual(self.client.post('/__isolated__/event', json=data,
                base_url='http://localhost:8787', headers={'Origin': 'http://localhost:8787'}).status_code, 400)
        self.assertEqual(self.client.post('/__isolated__/event', json={'event': 'page_ready'},
            base_url='http://localhost:8787', headers={'Origin': 'http://elsewhere.invalid'}).status_code, 403)
        self.assertEqual(self.client.get('/__isolated__/ready.js', base_url='http://elsewhere.invalid').status_code, 403)

    def test_missing_callback_is_not_a_negative_execution_verdict(self):
        self.assertEqual(diagnostic.observations([], False)['execution'], 'unobserved')
        snapshots = [{'pc': pc, 'connection': 'connected', 'ice': 'connected', 'remoteStats': 1, 'pairs': 1} for pc in (1, 2)]
        result = diagnostic.observations(snapshots, False)
        self.assertEqual(result, {'execution': 'observed', 'clickReceipt': 'unavailable',
            'connectivity': 'both_peers_connected', 'applicationDelivery': 'unverified'})
        self.assertEqual(diagnostic.observations(snapshots[:1], False)['connectivity'], 'unverified')
        self.assertEqual(diagnostic.observations([], True)['connectivity'], 'unverified')

    def test_cleanup_trigger_is_not_inferred_from_test_success(self):
        args = {'stop_requested': False, 'chrome_exited': False, 'elapsed': 200, 'since_click': None}
        self.assertIsNone(diagnostic.cleanup_reason(**args))
        self.assertEqual(diagnostic.cleanup_reason(**{**args, 'stop_requested': True}), 'operator_stop_request')
        self.assertEqual(diagnostic.cleanup_reason(**{**args, 'chrome_exited': True}), 'owned_browser_exited')
        self.assertEqual(diagnostic.cleanup_reason(**{**args, 'since_click': 29}), 'post_click_deadline')
        self.assertEqual(diagnostic.cleanup_reason(**{**args, 'elapsed': 601}), 'waiting_deadline')

    def test_process_filter_drops_sensitive_values_and_unrelated_lines(self):
        prefix = b'[123:456:1019/120000.123:INFO:p2p_transport_channel.cc(1201)] '
        secret = ' private-host.local 192.0.2.99 ufrag-secret password-secret'
        values = []
        for fragment, event in diagnostic.RULES:
            value = diagnostic.category(prefix + (fragment + secret).encode())
            self.assertEqual(value, event)
            values.append({'event': value, 'elapsed': 1.0})
        for line in (b'raw secret', b'[x:other.cc(5)] Resolved ICE candidate hostname secret',
                     b'[x] p2p_transport_channel.cc(5) Resolved ICE candidate hostname secret', prefix + b'x' * 5000):
            self.assertIsNone(diagnostic.category(line))
        for value in ('private-host', '192.0.2', 'ufrag', 'password'):
            self.assertNotIn(value, json.dumps(values))


if __name__ == '__main__':
    unittest.main()
