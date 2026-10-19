"""Test-only instrumentation helpers. Importing never launches a browser/server."""
from pathlib import Path
import re
from flask import abort, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
TITLE = 'HP2P ISOLATED DIAGNOSTIC — click Native trickle loopback'
RULES = (
    ('Dropping ICE candidate with hostname address (no AsyncResolverFactory)', 'resolver_factory_missing'),
    ('Asynchronously resolving ICE candidate hostname ', 'resolver_started'),
    ('Failed to resolve ICE candidate hostname ', 'resolver_error'),
    (' could not be resolved', 'resolver_no_address'),
    ('Resolved ICE candidate hostname ', 'resolver_succeeded'),
    ('No LocalNetworkAccessPermissionFactory', 'permission_factory_missing'),
    ('No need to request permission for candidate: ', 'permission_bypassed'),
    ('Asynchronously requesting LNA permission.', 'permission_requested'),
    ('LNA Permission denied for ', 'permission_denied'),
    ('Unexpected LocalNetworkAccessPermission return', 'permission_callback_unexpected'),
)


def category(line):
    """Return a fixed category, never raw text or an extracted identifier."""
    if len(line) > 4096 or b']' not in line:
        return None
    prefix, body = line.split(b']', 1)
    if not re.search(rb'[:/]p2p_transport_channel\.cc(?:\(\d+\)|:\d+)$', prefix):
        return None
    text = body.decode('utf-8', errors='replace')
    for fragment, event in RULES:
        if fragment in text:
            return event
    return None


def observations(snapshots, click_received):
    """Missing click telemetry cannot negate independent execution evidence."""
    connected = {s['pc'] for s in snapshots
                 if s.get('connection') == 'connected' and s.get('ice') in ('connected', 'completed')
                 and s.get('remoteStats', 0) > 0 and s.get('pairs', 0) > 0}
    return {
        'execution': 'observed' if click_received or snapshots else 'unobserved',
        'clickReceipt': 'received' if click_received else 'unavailable',
        'connectivity': 'both_peers_connected' if {1, 2} <= connected else 'unverified',
        'applicationDelivery': 'unverified',
    }


def cleanup_reason(*, stop_requested, chrome_exited, elapsed, since_click):
    if stop_requested:
        return 'operator_stop_request'
    if chrome_exited:
        return 'owned_browser_exited'
    if since_click is not None and since_click > 28:
        return 'post_click_deadline'
    if elapsed > 600:
        return 'waiting_deadline'
    return None


def install_fixture_hooks(app, on_event):
    """Install on the loopback candidate fixture only; retain its original CSP."""
    @app.get('/__isolated__/ready.js')
    def isolated_asset():
        response = send_from_directory(ROOT, 'isolated_ready.js')
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.post('/__isolated__/event')
    def isolated_event():
        data = request.get_json(silent=True)
        if data not in ({'event': 'page_ready'}, {'event': 'test_clicked'}):
            abort(400)
        if on_event(data['event']) is False:
            abort(409)
        return jsonify(ok=True)

    @app.after_request
    def isolated_label(response):
        if request.path == '/__diag__/connectivity.html' and response.status_code == 200:
            response.direct_passthrough = False
            html = response.get_data(as_text=True).replace('HP2P local connectivity fixture', TITLE)
            html = html.replace('<body>', '<body style="border:8px solid #16703b;padding:16px"><p><strong>Temporary isolated Chrome profile. Click Native trickle loopback once. If a permission prompt appears, do not grant it; report it.</strong></p>')
            html = html.replace('<button id="native">', '<button id="native" disabled>')
            html = html.replace('</body>', '<script type="module" src="/__isolated__/ready.js"></script></body>')
            response.set_data(html)
        return response
