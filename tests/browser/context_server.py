"""One-shot, loopback-only manual harness; run directly, never in production."""
import hashlib
import secrets
import sys
import threading
import time
from pathlib import Path
from flask import abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent.parent))
import main

EXPECTED_MESH = 'a247cadeab9c96e6e4bea3b7262b5cd6c5672025324959574edfff9a5ee0e451'
ACTUAL_MESH = hashlib.sha256((ROOT.parent.parent / 'static/js/mesh.js').read_bytes()).hexdigest()
if ACTUAL_MESH != EXPECTED_MESH:
    raise RuntimeError('Mesh source changed: review and update the expected hash')
app = main.app
lock = threading.RLock()
run_token = secrets.token_hex(16)
owners = {}
blocked_senders = set()
state = {'phase': 'waiting', 'forwarding': True, 'blocked': 0, 'blockedPeers': 0,
         'meshHash': ACTUAL_MESH, 'reports': {}}
started = None
original_relay = main.relay_to_others


def test_relay(sender, data):
    with lock:
        if not state['forwarding']:
            state['blocked'] = min(1000, state['blocked'] + 1)
            # Only exact dummy probes from distinct live hub connections count.
            if data == '{"type":"test_relay_probe"}':
                with main.peers_lock:
                    if sender in main.peers:
                        blocked_senders.add(sender)
                state['blockedPeers'] = min(64, len(blocked_senders))
            return
    original_relay(sender, data)


@app.before_request
def loopback_only():
    if request.remote_addr not in ('127.0.0.1', '::1') or request.host not in ('localhost:8787', '127.0.0.1:8787'):
        abort(403)
    if request.method == 'POST' and request.headers.get('Origin') != 'http://' + request.host:
        abort(403)


@app.route('/__test__/<path:name>')
def fixture(name):
    if name not in ('contexts.html', 'contexts.js'):
        abort(404)
    response = send_from_directory(ROOT, name)
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.post('/__test__/join')
def join():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) != {'role'} or data['role'] not in ('A', 'B'):
        abort(400)
    with lock:
        # Each role is claimed once per process, even after a failed attempt.
        if state['phase'] != 'waiting' or data['role'] in owners:
            abort(409)
        owner = secrets.token_hex(16)
        owners[data['role']] = owner
        return jsonify(run=run_token, owner=owner, meshHash=ACTUAL_MESH)


def advance(now):
    global started
    reports = state['reports']
    phase = state['phase']
    if phase in ('done', 'failed'):
        return
    if started is not None and now - started > 90:
        state['phase'] = 'failed'
        return
    if set(reports) != {'A', 'B'}:
        return
    a, b = reports['A'], reports['B']
    if phase == 'waiting':
        started = now
        state['phase'] = 'connecting'
    elif phase == 'connecting' and a['ready'] and b['ready']:
        state['forwarding'] = False
        state['phase'] = 'first'
    elif phase == 'first' and all(r['first'] == 2 for r in (a, b)) and state['blockedPeers'] == 2:
        state['phase'] = 'disconnect'
    elif phase == 'disconnect' and a['down'] and b['removed']:
        state['phase'] = 'reconnect'
    elif phase == 'reconnect' and a['rejoined'] and a['ready'] and b['ready']:
        state['phase'] = 'second'
    elif phase == 'second' and all(r['second'] == 2 for r in (a, b)):
        state['phase'] = 'done'


@app.post('/__test__/report')
def report():
    data = request.get_json(silent=True)
    keys = {'run', 'owner', 'role', 'ready', 'first', 'second', 'down', 'removed', 'rejoined'}
    if not isinstance(data, dict) or set(data) != keys or data['role'] not in ('A', 'B'):
        abort(400)
    if any(type(data[k]) is not bool for k in ('ready', 'down', 'removed', 'rejoined')):
        abort(400)
    if any(type(data[k]) is not int or not 0 <= data[k] <= 1000 for k in ('first', 'second')):
        abort(400)
    with lock:
        if data['run'] != run_token or data['owner'] != owners.get(data['role']):
            abort(409)
        state['reports'][data['role']] = {k: v for k, v in data.items() if k not in ('run', 'owner', 'role')}
        advance(time.monotonic())
        return jsonify(state)


@app.get('/__test__/status')
def status():
    with lock:
        return jsonify(state)


if __name__ == '__main__':
    # The sole supported launch binds only loopback and scopes the patch to this
    # disposable process. No production settings or source are modified.
    import logging
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    main.relay_to_others = test_relay
    try:
        app.run(host='127.0.0.1', port=8787, threaded=True, debug=False, use_reloader=False)
    finally:
        main.relay_to_others = original_relay
