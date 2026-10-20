"""Bounded setup-only diagnostic of four actual product clients. No app data sent."""
import logging
from flask import abort, jsonify, request, send_from_directory
import ui_server as ui

ui.pair = 'ABCD'
ui.expected_roles = set(ui.pair)
app = ui.app
traces = []
fixture_hashes = {name: ui.hashlib.sha256((ui.ROOT/name).read_bytes()).hexdigest()
                  for name in ('four_peer_server.py','four_peer_observer.js')}

@app.after_request
def instrument_four(response):
    # Flask invokes after_request handlers in reverse registration order.
    if response.status_code == 200 and request.path == '/client':
        html = response.get_data(as_text=True)
        original = '<script type="module" src="/static/js/client.js"></script>'
        if html.count(original) != 1: abort(500)
        response.set_data(html.replace(original, '<script type="module" src="/__four__/observer.js"></script>'))
        # The UI instrumentation hook is intentionally bypassed for this response.
    response.headers['Cache-Control'] = 'no-store'
    return response

# Replace UI's after-response hook with one that accepts the explicit diagnostic loader.
app.after_request_funcs[None].remove(ui.instrument_client)

@app.get('/__four__/observer.js')
def observer():
    return send_from_directory(ui.ROOT, 'four_peer_observer.js', max_age=0)

@app.post('/__four__/snapshot')
def snapshot():
    value = request.get_json(silent=True)
    with ui.lock:
        ui.authenticate(value)
        row = value.get('trace')
        keys = {'pc','at','connection','ice','generated','applied','rejected','localSdp','remoteSdp','remoteStats','pairs','channelsOpen'}
        if not isinstance(row,dict) or set(row) != keys: abort(400)
        labels = {'connection':('new','connecting','connected','disconnected','failed','closed','other'), 'ice':('new','checking','connected','completed','disconnected','failed','closed','other')}
        for key, item in row.items():
            if key in labels:
                if item not in labels[key]: abort(400)
            elif type(item) is not int or not -1 <= item <= 4096: abort(400)
        if row['pc'] not in range(1,9) or row['at'] not in (2,12): abort(400)
        if len(traces) >= 64: abort(429)
        traces.append({'role': value['role'], **row})
        return jsonify(ok=True)

@app.get('/__four__/status')
def four_status():
    with ui.lock:
        base = ui.status().get_json()
        base['traces'] = traces
        base['fixtureHashes'].update(fixture_hashes)
        return jsonify(base)

if __name__ == '__main__':
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    ui.main.relay_to_others = ui.test_relay
    try: app.run(host='127.0.0.1',port=8787,threaded=True,debug=False,use_reloader=False)
    finally: ui.main.relay_to_others = ui.original_relay
