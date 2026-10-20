"""Read-only candidate diagnostics; exact .local names remain transient in memory."""
import hashlib
import json
import logging
import re
import subprocess
import sys
import threading
from pathlib import Path
from flask import abort, jsonify, request, send_from_directory
import context_server as context

app = context.app
ROOT = Path(__file__).resolve().parent
lock = threading.Lock()
resolutions = []
snapshots = []
seen_names = set()
RESOLVER = '''import socket,json,sys
name=sys.stdin.read().strip()
try:
 rows=socket.getaddrinfo(name,None,socket.AF_UNSPEC,socket.SOCK_DGRAM)
 print(json.dumps({'resolved':True,'families':sorted(set('IPv4' if r[0]==socket.AF_INET else 'IPv6' for r in rows))}))
except socket.gaierror:
 print(json.dumps({'resolved':False,'families':[]}))
'''


@app.after_request
def instrument(response):
    if response.status_code == 200 and request.path in ('/__test__/contexts.html', '/__diag__/connectivity.html'):
        response.direct_passthrough = False
        html=response.get_data(as_text=True)
        source='contexts.js?v=3' if request.path.startswith('/__test__/') else 'connectivity.js?v=3'
        if source not in html: abort(500)
        response.set_data(html.replace('./'+source, '/__diag__/observer.js?v=1').replace('src="'+source, 'src="/__diag__/observer.js?v=1'))
    return response


@app.get('/__diag__/<path:name>')
def diagnostic_asset(name):
    if name not in ('connectivity.html','connectivity.js','observer.js'):abort(404)
    response=send_from_directory(ROOT, 'candidate_observer.js' if name=='observer.js' else name)
    response.headers['Cache-Control']='no-store'
    return response


@app.post('/__diag__/resolve')
def resolve():
    data=request.get_json(silent=True)
    if not isinstance(data,dict) or set(data)!={'name','browser','pc'}:abort(400)
    name=data['name']
    if not isinstance(name,str) or not re.fullmatch(r'[a-fA-F0-9-]{16,64}\.local',name):abort(400)
    if data['browser'] not in ('chrome','safari') or type(data['pc']) is not int or not 1<=data['pc']<=8:abort(400)
    fingerprint=hashlib.sha256(name.encode()).digest()
    with lock:
        if fingerprint in seen_names:return jsonify(duplicate=True)
        if len(seen_names)>=16:abort(429)
        seen_names.add(fingerprint)
    try:
        proc=subprocess.run([sys.executable,'-c',RESOLVER],input=name,text=True,capture_output=True,timeout=8)
        value=json.loads(proc.stdout) if proc.returncode==0 else {'resolved':False,'families':[],'error':'resolver-process'}
    except subprocess.TimeoutExpired:value={'resolved':False,'families':[],'error':'timeout'}
    except (OSError, json.JSONDecodeError):value={'resolved':False,'families':[],'error':'resolver-process'}
    value.update(browser=data['browser'],pc=data['pc'])
    with lock:resolutions.append(value)
    return jsonify(value)


@app.post('/__diag__/snapshot')
def snapshot():
    data=request.get_json(silent=True)
    # Payload contains only authored numeric/boolean counters and fixed labels.
    # Enforce a flat scalar schema to avoid accidental raw candidate/SDP logging.
    keys={'browser','pc','at','ice','connection','policy','generated','applied','rejected','endEvents','localSdp','remoteSdp','localStats','remoteStats','pairs','remoteApi','localApi','midMatch','ufragMatch','allDelivered','localHostUdp','localHostTcp','otherLocal'}
    if not isinstance(data,dict) or set(data)!=keys:abort(400)
    labels={'browser':('chrome','safari'),'ice':('new','checking','connected','completed','failed','disconnected','closed','other'),'connection':('new','connecting','connected','failed','disconnected','closed','other'),'policy':('all','relay','other')}
    for k,v in data.items():
        if k in labels:
            if v not in labels[k]:abort(400)
        elif k in ('midMatch', 'ufragMatch'):
            if type(v) is not bool:abort(400)
        elif k == 'allDelivered':
            if type(v) is not bool and not (type(v) is int and v == -1):abort(400)
        elif type(v) is not int or not -1<=v<=4096:abort(400)
    if data['pc'] not in range(1,9) or data['at'] not in (2,8,12):abort(400)
    with lock:
        if len(snapshots)>=64:abort(429)
        snapshots.append(data)
    return jsonify(ok=True)


@app.get('/__diag__/status')
def diagnostic_status():
    with lock:return jsonify(resolutions=resolutions,snapshots=snapshots)


if __name__=='__main__':
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    context.main.relay_to_others=context.test_relay
    try:app.run(host='127.0.0.1',port=8787,threaded=True,debug=False,use_reloader=False)
    finally:context.main.relay_to_others=context.original_relay
