"""Smoke-test the built production image on loopback, using only dummy frames.

Run after publishing container port 8080 to 127.0.0.1:18787. This deliberately
refuses production targets; it is not a production traffic generator.
"""
import json
import sys
import time
from urllib.parse import urlparse
from urllib.request import urlopen

from simple_websocket import Client, ConnectionClosed


base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18787'
parsed = urlparse(base)
assert parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')
assert not parsed.username and not parsed.password and parsed.path in ('', '/')


def get(path):
    with urlopen(base + path, timeout=10) as response:
        return response.headers, response.read()


def until(ws, predicate, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        data = ws.receive(timeout=max(.01, deadline - time.monotonic()))
        if data is not None and predicate(data):
            return data
    raise AssertionError('Expected WebSocket event did not arrive')


headers, health = get('/healthz')
health = json.loads(health)
assert health['protocol'] == 2 and health['status'] == 'ok'
headers, page = get('/client')
assert headers['Cache-Control'] == 'no-store'
assert "script-src 'self'" in headers['Content-Security-Policy']
assert b'cdn.jsdelivr' not in page and b'cdn.replit' not in page
assert b'identityBackup' in page and b'backupIdentityBtn' in page
headers, js = get('/static/js/network.js')
assert 'no-store' in headers['Cache-Control'] and b"new WebSocket(url, 'hp2p.v2')" in js

url = base.replace('http://', 'ws://', 1) + '/ws'
sockets = []
try:
    a, b = [Client(url, subprotocols=['hp2p.v2']) for _ in range(2)]
    sockets.extend([a, b])
    assert a.subprotocol == b.subprotocol == 'hp2p.v2'
    for ws in (a, b):
        until(ws, lambda data: isinstance(data, str) and json.loads(data).get('type') == 'mesh_welcome')
    frame = b'LOCAL-ONLY dummy relay smoke check ' + str(time.monotonic_ns()).encode()
    a.send(frame)
    assert until(b, lambda data: isinstance(data, bytes)) == frame
    a.send(frame)
    deadline = time.monotonic() + .3
    while time.monotonic() < deadline:
        assert b.receive(timeout=.05) != frame, 'Duplicate frame was delivered'
    old = Client(url)
    sockets.append(old)
    notice = json.loads(old.receive(timeout=3))
    assert notice['type'] == 'upgrade_required' and notice['protocol'] == 2
    try:
        old.receive(timeout=3)
        raise AssertionError('Old client was not closed')
    except ConnectionClosed as exc:
        assert exc.reason == 1008
    b.close()
    sockets.remove(b)
    b = Client(url, subprotocols=['hp2p.v2'])
    sockets.append(b)
    until(b, lambda data: isinstance(data, str) and json.loads(data).get('type') == 'mesh_welcome')
    a.send(frame + b' reconnected')
    assert until(b, lambda data: isinstance(data, bytes)) == frame + b' reconnected'
finally:
    for ws in sockets:
        try:
            ws.close()
        except ConnectionClosed:
            pass

print(json.dumps({'result': 'passed', 'release': health['release'],
                  'checks': ['CSP', 'uncached client/assets', 'v2 negotiation',
                             'binary relay', 'duplicate suppression',
                             'old-client rejection', 'reconnect']}))
