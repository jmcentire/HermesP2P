from flask import Flask, render_template, send_from_directory, request, jsonify, Response, make_response
from flask_sock import Sock
import json
import threading
import time
import hashlib
import secrets
import os

app = Flask(__name__)
app.debug = False
app.config['MAX_CONTENT_LENGTH'] = 65536
app.config['SOCK_SERVER_OPTIONS'] = {'max_message_size': 65536, 'ping_interval': 25, 'subprotocols': ['hp2p.v2']}
sock = Sock(app)

# Directory containing agent-readiness assets (robots.txt, sitemap.xml,
# llms*.txt, .well-known/*). Kept separate from Flask's /static mount so these
# files are served at the URL root with correct content types.
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

# Bounded, process-local transport state. Never retain client addresses or keys.
MAX_PEERS = 64
MAX_FRAME_BYTES = 65536
MAX_REPLAY_ENTRIES = 10000
peers_lock = threading.Lock()
peers = {}
recent_frames = {}
last_replay_cleanup = 0.0


def send_peer(ws, data):
    with peers_lock:
        peer = peers.get(ws)
    if not peer:
        return
    try:
        with peer['send_lock']:
            ws.send(data)
    except Exception:
        with peers_lock:
            if peers.get(ws) is peer:
                peers.pop(ws, None)


def close_peer(ws):
    """Best-effort close, always outside the shared registry lock."""
    try:
        ws.close(reason=1013)  # Temporary capacity pressure; client may retry.
    except Exception:
        pass


def relay_to_others(sender_ws, data):
    """Bounded duplicate suppression; this is not financial replay protection."""
    raw = data.encode('utf-8') if isinstance(data, str) else data
    if not isinstance(raw, bytes) or len(raw) > MAX_FRAME_BYTES:
        return
    global last_replay_cleanup
    now = time.monotonic()
    digest = hashlib.sha256(raw).digest()
    with peers_lock:
        sender = peers.get(sender_ws)
        if sender is None:
            return  # An evicted connection cannot continue relaying queued frames.
        if now - last_replay_cleanup >= 5:
            for key, deadline in list(recent_frames.items()):
                if deadline <= now:
                    del recent_frames[key]
            last_replay_cleanup = now
        if digest in recent_frames:
            return
        if len(recent_frames) >= MAX_REPLAY_ENTRIES:
            recent_frames.pop(next(iter(recent_frames)))
        recent_frames[digest] = now + 30
        sender['last_activity'] = now
        targets = [ws for ws in peers if ws is not sender_ws]
    for ws in targets:
        send_peer(ws, data)


def build_peer_exchange_response(peer_count):
    return json.dumps({'type': 'peer_exchange_response', 'peers': [],
                       'peerCount': peer_count, 'timestamp': int(time.time() * 1000)})


def broadcast_roster():
    with peers_lock:
        targets = list(peers)
        ids = [peer['id'] for peer in peers.values()]
    for ws in targets:
        send_peer(ws, json.dumps({'type': 'mesh_roster', 'peers': ids}))


def relay_signal(sender_ws, message):
    """Route introductions, substituting the sender ID assigned by this hub."""
    signal = message.get('signal')
    if not isinstance(signal, dict) or signal.get('type') not in ('offer', 'answer', 'ice'):
        return
    if len(json.dumps(signal)) > 32768:
        return
    if signal['type'] in ('offer', 'answer') and not isinstance(signal.get('sdp'), str):
        return
    if signal['type'] == 'ice' and not isinstance(signal.get('candidate'), dict):
        return
    with peers_lock:
        sender = peers.get(sender_ws)
        recipient = next((ws for ws, peer in peers.items()
                          if peer['id'] == message.get('to') and ws is not sender_ws), None)
    if sender and recipient:
        send_peer(recipient, json.dumps({'type': 'mesh_signal', 'from': sender['id'], 'signal': signal}))


@sock.route('/ws')
def ws_handler(ws):
    # Negotiate before admission: old tabs never join the v2 relay/roster.
    if ws.subprotocol != 'hp2p.v2':
        try:
            ws.send(json.dumps({'type': 'upgrade_required', 'protocol': 2,
                                'message': 'Save your identity, then reload /client.'}))
            ws.close(reason=1008, message='Upgrade required: save identity and reload /client')
        except Exception:
            pass
        return
    evicted = None
    peer = {'id': secrets.token_hex(16), 'send_lock': threading.Lock(),
            'last_activity': time.monotonic()}
    with peers_lock:
        if len(peers) >= MAX_PEERS:
            # New arrivals replace the least recently active application sender.
            # Ping, discovery and signalling traffic do not reserve a slot forever.
            # This is admission fairness, not a defence against active Sybil churn.
            evicted = min(peers, key=lambda other: peers[other]['last_activity'])
            peers.pop(evicted)
        peers[ws] = peer
        welcome = {'type': 'mesh_welcome', 'peerId': peers[ws]['id'],
                   'peers': [p['id'] for other, p in peers.items() if other is not ws]}
    if evicted is not None:
        close_peer(evicted)
    send_peer(ws, json.dumps(welcome))
    broadcast_roster()
    tokens, last = 30.0, time.monotonic()
    try:
        while True:
            with peers_lock:
                if peers.get(ws) is not peer:
                    break
            data = ws.receive(timeout=60)
            with peers_lock:
                if peers.get(ws) is not peer:
                    break
            if data is None:
                continue
            size = len(data.encode('utf-8')) if isinstance(data, str) else len(data)
            now = time.monotonic()
            tokens = min(30.0, tokens + (now - last) * 5)
            last = now
            if size > MAX_FRAME_BYTES or tokens < 1:
                ws.close()
                break
            tokens -= 1
            if isinstance(data, str):
                try:
                    parsed = json.loads(data)
                    if not isinstance(parsed, dict):
                        continue
                    if parsed.get('type') == 'peer_exchange_request':
                        with peers_lock:
                            count = len(peers)
                        send_peer(ws, build_peer_exchange_response(count))
                        continue
                    if parsed.get('type') == 'mesh_signal':
                        relay_signal(ws, parsed)
                        continue
                    if str(parsed.get('type', '')).startswith('mesh_'):
                        continue
                except (ValueError, TypeError):
                    continue
            relay_to_others(ws, data)
    except Exception:
        # Connection closure is expected; do not log messages, SDP or keys.
        pass
    finally:
        with peers_lock:
            if peers.get(ws) is peer:
                peers.pop(ws, None)
        broadcast_roster()


# --- HTTP routes ---

@app.route('/')
def index():
    """Homepage. Sets a Link header advertising the Markdown agent summary
    and the API catalog, per RFC 8288. If the client asks for Markdown via
    Accept, serve llms-full.txt instead (content negotiation for agents)."""
    accept = request.headers.get('Accept', '')
    if 'text/markdown' in accept:
        resp = _serve_public('llms-full.txt', 'text/markdown; charset=utf-8')
        resp.headers['Vary'] = 'Accept'
        resp.headers['Link'] = (
            '</llms.txt>; rel="alternate"; type="text/markdown", '
            '</.well-known/api-catalog>; rel="api-catalog"'
        )
        return resp

    resp = make_response(render_template('index.html'))
    resp.headers['Vary'] = 'Accept'
    resp.headers['Link'] = (
        '</llms.txt>; rel="alternate"; type="text/markdown", '
        '</.well-known/api-catalog>; rel="api-catalog"'
    )
    return resp


# --- Agent-readiness: static discovery files ---

def _serve_public(filename, mimetype):
    """Serve a file from PUBLIC_DIR with an explicit content type."""
    return send_from_directory(PUBLIC_DIR, filename, mimetype=mimetype)


@app.route('/robots.txt')
def robots_txt():
    return _serve_public('robots.txt', 'text/plain; charset=utf-8')


@app.route('/sitemap.xml')
def sitemap_xml():
    return _serve_public('sitemap.xml', 'application/xml; charset=utf-8')


@app.route('/llms.txt')
def llms_txt():
    return _serve_public('llms.txt', 'text/markdown; charset=utf-8')


@app.route('/llms-full.txt')
def llms_full_txt():
    return _serve_public('llms-full.txt', 'text/markdown; charset=utf-8')


@app.route('/.well-known/api-catalog')
def well_known_api_catalog():
    # RFC 9727 — application/linkset+json
    return _serve_public('.well-known/api-catalog', 'application/linkset+json')


@app.route('/.well-known/http-message-signatures-directory')
def well_known_http_message_signatures_directory():
    # Web Bot Auth directory (draft-ietf-httpbis-message-signatures). Empty key
    # set advertises discovery endpoint; signing keys can be added later.
    return _serve_public(
        '.well-known/http-message-signatures-directory',
        'application/json',
    )


@app.route('/.well-known/agent-skills/index.json')
def well_known_agent_skills_index():
    # Agent Skills index (agentskills.io v0.2.0). Empty skills array for now.
    return _serve_public(
        '.well-known/agent-skills/index.json',
        'application/json',
    )

@app.route('/validate-config', methods=['POST'])
def validate_config():
    # Identity files contain private keys. Never parse, echo or validate them server-side.
    return jsonify({'error': 'Import identity files locally in the client; server uploads are disabled.'}), 410


@app.get('/healthz')
def healthz():
    return jsonify(status='ok', protocol=2, release=os.environ.get('HP2P_RELEASE', 'development'))


@app.route('/client')
def client():
    return render_template('client.html')


@app.after_request
def after_request(response):
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if request.path in ('/client', '/validate-config'):
        response.headers['Cache-Control'] = 'no-store'
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
