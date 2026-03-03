from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_sock import Sock
import json
import threading
import time
from jsonschema import validate
import os

app = Flask(__name__)
app.debug = True
sock = Sock(app)

# Load the JSON schema
with open('hp2p-config-schema.json', 'r') as schema_file:
    config_schema = json.load(schema_file)

# --- WebSocket peer relay ---

peers_lock = threading.Lock()
peers = {}  # {ws: {"connected_at": float, "addr": str}}


def relay_to_others(sender_ws, data):
    """Relay a message (text or bytes) to all connected peers except sender."""
    with peers_lock:
        targets = [ws for ws in peers if ws is not sender_ws]
    for ws in targets:
        try:
            ws.send(data)
        except Exception:
            pass


def build_peer_exchange_response(peer_count):
    """Build a peer exchange response with the server's known peer URLs."""
    return json.dumps({
        "type": "peer_exchange_response",
        "peers": [],  # Server doesn't expose peer IPs; peers discover each other through relay
        "peerCount": peer_count,
        "timestamp": int(time.time() * 1000),
    })


@sock.route('/ws')
def ws_handler(ws):
    """WebSocket relay endpoint. Peers connect here to join the network."""
    with peers_lock:
        peers[ws] = {"connected_at": time.time(), "addr": request.remote_addr}
        peer_count = len(peers)

    try:
        while True:
            data = ws.receive(timeout=60)
            if data is None:
                # Keepalive timeout — send ping by continuing
                continue

            # Handle peer exchange requests server-side
            if isinstance(data, str):
                try:
                    parsed = json.loads(data)
                    if parsed.get("type") == "peer_exchange_request":
                        with peers_lock:
                            pc = len(peers)
                        ws.send(build_peer_exchange_response(pc))
                        continue
                except (json.JSONDecodeError, TypeError):
                    pass

            # Relay everything else to all other peers
            relay_to_others(ws, data)

    except Exception:
        pass
    finally:
        with peers_lock:
            peers.pop(ws, None)


# --- HTTP routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/validate-config', methods=['POST'])
def validate_config():
    if 'config' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['config']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.endswith('.json'):
        return jsonify({'error': 'File must be JSON format'}), 400

    try:
        # Read the file content as string first
        file_content = file.read().decode('utf-8')
        config_data = json.loads(file_content)
        validate(instance=config_data, schema=config_schema)
        return jsonify({'success': True, 'config': config_data})
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON format'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/client')
def client():
    return render_template('client.html')


@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
