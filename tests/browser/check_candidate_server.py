"""Candidate probe boundaries; subprocess is mocked, no network probes occur."""
import json
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import candidate_server as harness


class CandidateControllerChecks(unittest.TestCase):
    def setUp(self):
        harness.resolutions.clear()
        harness.snapshots.clear()
        harness.seen_names.clear()
        self.client = harness.app.test_client()

    def post(self, path, value, origin='http://localhost:8787'):
        return self.client.post('/__diag__/' + path, json=value,
                                base_url='http://localhost:8787', headers={'Origin': origin})

    def test_import_does_not_patch_relay(self):
        self.assertIs(harness.context.main.relay_to_others, harness.context.original_relay)

    def test_names_are_restricted_and_origin_checked(self):
        with patch.object(harness.subprocess, 'run') as resolver:
            for name in ['example.com', '192.0.2.1', 'host.local', 'a'*65+'.local', '$(whoami).local', []]:
                self.assertEqual(self.post('resolve', {'name': name, 'browser': 'chrome', 'pc': 1}).status_code, 400)
            self.assertEqual(self.post('resolve', {}, 'https://example.com').status_code, 403)
            resolver.assert_not_called()

    def test_exact_name_is_stdin_only_and_result_has_no_name_or_address(self):
        name = 'a'*32+'.local'
        with patch.object(harness.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='{"resolved":true,"families":["IPv4"]}')) as resolver:
            data = {'name': name, 'browser': 'chrome', 'pc': 1}
            self.assertEqual(self.post('resolve', data).get_json()['resolved'], True)
            self.assertEqual(resolver.call_args.kwargs['input'], name)
            self.assertNotIn(name, str(resolver.call_args.args))
            self.assertEqual(resolver.call_args.kwargs['timeout'], 8)
            self.assertEqual(self.post('resolve', data).get_json(), {'duplicate': True})
            self.assertEqual(resolver.call_count, 1)
        serialized = json.dumps(harness.resolutions)
        self.assertNotIn(name, serialized)
        self.assertNotIn('address', serialized)

    def test_resolver_timeout_is_bounded_and_count_capped(self):
        with patch.object(harness.subprocess, 'run', side_effect=subprocess.TimeoutExpired('probe', 8)) as resolver:
            for i in range(16):
                value = self.post('resolve', {'name': f'{i:032x}.local', 'browser': 'safari', 'pc': 1}).get_json()
                self.assertEqual(value['error'], 'timeout')
            self.assertEqual(self.post('resolve', {'name': f'{16:032x}.local', 'browser': 'safari', 'pc': 1}).status_code, 429)
            self.assertEqual(resolver.call_count, 16)

    def test_snapshot_schema_rejects_raw_data_and_bad_scalar_types(self):
        value = dict.fromkeys('generated applied rejected endEvents localSdp remoteSdp localStats remoteStats pairs remoteApi localApi localHostUdp localHostTcp otherLocal'.split(), 0)
        value.update(browser='chrome', pc=1, at=2, ice='new', connection='new', policy='all', midMatch=True, ufragMatch=True, allDelivered=-1)
        self.assertEqual(self.post('snapshot', value).status_code, 200)
        for changes in [{'sdp': 'private'}, {'generated': True}, {'midMatch': 1}, {'pc': 0}, {'at': 3}, {'allDelivered': 1}, {'browser': 'arbitrary'}]:
            self.assertEqual(self.post('snapshot', {**value, **changes}).status_code, 400)
        for _ in range(63):
            self.assertEqual(self.post('snapshot', value).status_code, 200)
        self.assertEqual(self.post('snapshot', value).status_code, 429)


if __name__ == '__main__':
    unittest.main()
