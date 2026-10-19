"""Disposable localhost product-UI acceptance server. Run directly only."""
import hashlib
import logging
import secrets
import sys
import subprocess
import threading
import time
from pathlib import Path
from flask import abort, jsonify, request, send_from_directory
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent.parent))
import main

app = main.app
lock = threading.RLock()
run = secrets.token_hex(16)
pair = sys.argv[1] if __name__ == '__main__' and len(sys.argv) > 1 else 'AB'
if pair not in ('AB','AC','AD'): raise ValueError('Choose AB, AC or AD')
expected_roles = set(pair)
owners = {}
reports = {}
reported_at = {}
forwarding = True
blocked = 0
original_relay = main.relay_to_others
commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT.parent.parent,text=True).strip()
paths = ['main.py','templates/client.html','static/vendor/nacl-fast.min.js','static/vendor/base64js.min.js'] + [str(p.relative_to(ROOT.parent.parent)) for p in (ROOT.parent.parent/'static/js').glob('*.js')]
sources = {}
for name in paths:
    actual = (ROOT.parent.parent/name).read_bytes()
    expected = subprocess.check_output(['git','show',commit+':'+name],cwd=ROOT.parent.parent)
    if actual != expected:
        raise RuntimeError('Product source differs from the pinned commit: '+name)
    sources[name] = hashlib.sha256(actual).hexdigest()
fixture_hashes = {
    str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
    for path in [Path(__file__), *sorted((ROOT / 'product').glob('*'))] if path.is_file()
}

def test_relay(sender, frame):
    global blocked
    with lock:
        if not forwarding:
            blocked = min(10000, blocked + 1)
            return
    original_relay(sender, frame)


@app.before_request
def local_only():
    if request.remote_addr not in ('127.0.0.1', '::1') or request.host != 'localhost:8787':
        abort(403)
    if request.method == 'POST' and request.headers.get('Origin') != 'http://localhost:8787':
        abort(403)


@app.after_request
def instrument_client(response):
    if response.status_code == 200 and request.path == '/client':
        html = response.get_data(as_text=True)
        original = '<script type="module" src="/static/js/client.js"></script>'
        if html.count(original) != 1:
            abort(500)
        response.set_data(html.replace(original, '<script type="module" src="/__ui__/observe.js?v=4"></script>'))
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/__ui__/<path:name>')
def fixture(name):
    if name not in ('setup.html', 'setup.js', 'observe.js'):
        abort(404)
    return send_from_directory(ROOT / 'product', name)


@app.post('/__ui__/join')
def join():
    value = request.get_json(silent=True)
    if not isinstance(value, dict) or set(value) != {'role'} or not isinstance(value['role'], str) or value['role'] not in expected_roles:
        abort(400)
    with lock:
        if value['role'] in owners or not forwarding:
            abort(409)
        owners[value['role']] = secrets.token_hex(16)
        return jsonify(run=run, owner=owners[value['role']], role=value['role'], expectedConnections=len(expected_roles)-1)


def authenticate(value):
    if not isinstance(value, dict) or value.get('run') != run or not isinstance(value.get('role'), str) or value['role'] not in owners or value.get('owner') != owners[value['role']]:
        abort(409)


@app.post('/__ui__/report')
def report():
    value = request.get_json(silent=True)
    with lock:
        authenticate(value)
        metrics = value.get('metrics')
        keys = {'open', 'publicRx', 'privateRx', 'directRx', 'invalidRx', 'outbound',
                'sentWhileForwarding', 'linkLost', 'publicShown', 'privateShown', 'directShown', 'replyShown', 'tamperedShown'}
        if not isinstance(metrics, dict) or set(metrics) != keys or any(type(v) is not int or not 0 <= v <= 10000 for v in metrics.values()):
            abort(400)
        reports[value['role']] = metrics
        reported_at[value['role']] = time.monotonic()
        return jsonify(forwarding=forwarding, blocked=blocked, participants=len(reports))


@app.post('/__ui__/disable')
def disable():
    global forwarding
    value = request.get_json(silent=True)
    with lock:
        authenticate(value)
        if value['role'] != 'A' or set(reports) != expected_roles or any(r['open'] != len(expected_roles)-1 for r in reports.values()):
            abort(409)
        if any(time.monotonic() - reported_at.get(role, 0) > 5 for role in expected_roles):
            abort(409)
        if any(r['sentWhileForwarding'] or r['linkLost'] for r in reports.values()):
            abort(409)
        with main.peers_lock:
            if len(main.peers) != len(expected_roles):
                abort(409)
        forwarding = False
        return jsonify(forwarding=False)


@app.get('/__ui__/status')
def status():
    with lock:
        return jsonify(pair=pair, forwarding=forwarding, blocked=blocked, reports=reports,
                       sourceHashes=sources, sourceCommit=commit, fixtureHashes=fixture_hashes)


if __name__ == '__main__':
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    main.relay_to_others = test_relay
    try:
        app.run(host='127.0.0.1', port=8787, threaded=True, debug=False, use_reloader=False)
    finally:
        main.relay_to_others = original_relay
