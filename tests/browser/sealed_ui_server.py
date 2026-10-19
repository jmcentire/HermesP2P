"""Owned loopback-only product tampering acceptance controller."""
import logging
from flask import abort,jsonify,request,send_from_directory
import ui_server as ui
app=ui.app
probes=[]
receipts={'A':[],'B':[]}
extra_hashes={name:ui.hashlib.sha256((ui.ROOT/name).read_bytes()).hexdigest()
              for name in ('sealed_ui_server.py','sealed_ui_observer.js')}
app.after_request_funcs[None].remove(ui.instrument_client)
@app.after_request
def instrument_sealed(response):
    if response.status_code==200 and request.path=='/client':
        html=response.get_data(as_text=True)
        original='<script type="module" src="/static/js/client.js"></script>'
        if html.count(original)!=1:abort(500)
        response.set_data(html.replace(original,'<script type="module" src="/__sealed__/observer.js"></script>'))
    response.headers['Cache-Control']='no-store'
    return response
@app.get('/__sealed__/observer.js')
def sealed_observer():return send_from_directory(ui.ROOT,'sealed_ui_observer.js',max_age=0)
def require_ready(value):
    ui.authenticate(value)
    if value['role']!='A' or ui.forwarding or set(ui.reports)!={'A','B'}:abort(409)
    if any(ui.time.monotonic()-ui.reported_at.get(role,0)>5 for role in ('A','B')):abort(409)
    if any(r['open']!=1 or r['sentWhileForwarding'] or r['linkLost'] for r in ui.reports.values()):abort(409)
@app.post('/__sealed__/ready')
def sealed_ready():
    with ui.lock:
        require_ready(request.get_json(silent=True));return jsonify(ok=True)
@app.post('/__sealed__/probe')
def sealed_probe():
    value=request.get_json(silent=True)
    with ui.lock:
        require_ready(value)
        if set(value)!={'role','run','owner','expectedConnections','probe','outerValid'}:abort(400)
        if value['role']!='A' or ui.forwarding:abort(409)
        if value['probe'] not in ('private-control','private-ciphertext','private-nonce','direct-control','direct-ciphertext','direct-nonce') or value['outerValid'] is not True:abort(400)
        if value['probe'] in probes:abort(409)
        probes.append(value['probe']);return jsonify(ok=True)
@app.post('/__sealed__/receipt')
def sealed_receipt():
    value=request.get_json(silent=True)
    with ui.lock:
        ui.authenticate(value)
        if set(value)!={'role','run','owner','expectedConnections','probe'} or value['probe'] not in ('private-control','private-ciphertext','private-nonce','direct-control','direct-ciphertext','direct-nonce'):abort(400)
        if ui.forwarding:abort(409)
        if value['probe'] not in receipts[value['role']]:receipts[value['role']].append(value['probe'])
        return jsonify(ok=True)
@app.get('/__sealed__/status')
def sealed_status():
    with ui.lock:
        value=ui.status().get_json();value['probes']=list(probes);value['receipts']={role:list(values) for role,values in receipts.items()};value['fixtureHashes'].update(extra_hashes);return jsonify(value)
if __name__=='__main__':
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    ui.main.relay_to_others=ui.test_relay
    try:app.run(host='127.0.0.1',port=8787,threaded=True,debug=False,use_reloader=False)
    finally:ui.main.relay_to_others=ui.original_relay
