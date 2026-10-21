import json
import threading
import main

class Peer:
    def __init__(self):
        self.subprotocol = 'hp2p.v2'
        self.sent = []
        self.closed = False
    def send(self, data): self.sent.append(data)
    def close(self, reason=None, message=None):
        # Closing may block or invoke socket callbacks; never hold registry lock.
        self.closed_with_registry_lock = main.peers_lock.locked()
        self.close_reason = reason
        self.closed = True


def run_connection(peer):
    # Flask-Sock's decorator returns None; test its registered handler directly.
    main.app.view_functions['ws_handler'].__wrapped__(peer)


def setup_function():
    main.peers.clear()
    main.recent_frames.clear()


def attach(peer, identifier, last_activity=0.0):
    main.peers[peer] = {'id': identifier, 'send_lock': threading.Lock(),
                        'last_activity': last_activity}


def test_identity_upload_disabled_and_debug_off():
    client = main.app.test_client()
    response = client.post('/validate-config', data=b'private-test-material')
    assert response.status_code == 410
    assert b'private-test-material' not in response.data
    assert response.headers['Cache-Control'] == 'no-store'
    assert not main.app.debug


def test_duplicate_relay_and_bounds():
    a, b = Peer(), Peer()
    attach(a, 'a'*32); attach(b, 'b'*32)
    main.relay_to_others(a, b'dummy-frame')
    main.relay_to_others(a, b'dummy-frame')
    main.relay_to_others(a, b'x'*65537)
    assert b.sent == [b'dummy-frame']
    assert a.sent == []
    assert set(main.peers[a]) == {'id', 'send_lock', 'last_activity'}


def test_hub_assigns_signal_sender_and_routes_only_to_target():
    a, b, c = Peer(), Peer(), Peer()
    for peer, name in [(a,'a'), (b,'b'), (c,'c')]: attach(peer,name*32)
    main.relay_signal(a, {'to':'b'*32,'from':'forged','signal':{'type':'offer','sdp':'test'}})
    assert json.loads(b.sent[0])['from'] == 'a'*32
    assert not c.sent
    main.relay_signal(a, {'to':'b'*32,'signal':{'type':'offer','sdp':[]}})
    main.relay_signal(a, {'to':'b'*32,'signal':{'type':'offer','sdp':'x'*32769}})
    assert len(b.sent) == 1


def test_roster_contains_only_ephemeral_ids():
    a,b=Peer(),Peer();attach(a,'a'*32);attach(b,'b'*32)
    main.broadcast_roster()
    assert json.loads(a.sent[0]) == {'type':'mesh_roster','peers':['a'*32,'b'*32]}


def test_replay_capacity_evicts_oldest_without_blackout():
    a,b=Peer(),Peer();attach(a,'a'*32);attach(b,'b'*32)
    for i in range(main.MAX_REPLAY_ENTRIES): main.recent_frames[i] = float('inf')
    main.relay_to_others(a,b'new frame')
    assert b.sent == [b'new frame']
    assert len(main.recent_frames) == main.MAX_REPLAY_ENTRIES


def test_full_idle_hub_admits_newcomer_and_closes_oldest_outside_lock(monkeypatch):
    idle = [Peer() for _ in range(main.MAX_PEERS)]
    for index, peer in enumerate(idle):
        attach(peer, f'{index:032x}', last_activity=float(index))
    observed = {}

    class Newcomer(Peer):
        def receive(self, timeout):
            observed['peers'] = dict(main.peers)
            observed['closed'] = idle[0].closed
            raise ConnectionError('test connection finished')

    monkeypatch.setattr(main.time, 'monotonic', lambda: 100.0)
    newcomer = Newcomer()
    run_connection(newcomer)
    assert len(observed['peers']) == main.MAX_PEERS
    assert newcomer in observed['peers']
    assert idle[0] not in observed['peers']
    assert observed['closed']
    assert not idle[0].closed_with_registry_lock
    assert idle[0].close_reason == 1013
    assert not newcomer.closed
    assert all(not peer.closed for peer in idle[1:])
    assert observed['peers'][newcomer]['last_activity'] == 100.0
    welcome = json.loads(newcomer.sent[0])
    assert welcome['type'] == 'mesh_welcome'
    assert len(welcome['peers']) == main.MAX_PEERS - 1
    assert '0' * 32 not in welcome['peers']


def test_new_application_activity_preserves_peer_over_older_idle_connection(monkeypatch):
    members = [Peer() for _ in range(main.MAX_PEERS)]
    for index, peer in enumerate(members):
        attach(peer, f'{index:032x}', last_activity=float(index))
    monkeypatch.setattr(main.time, 'monotonic', lambda: 100.0)
    main.relay_to_others(members[0], b'new application frame')
    observed = {}

    class Newcomer(Peer):
        def receive(self, timeout):
            observed['peers'] = dict(main.peers)
            raise ConnectionError('test connection finished')

    run_connection(Newcomer())
    assert members[0] in observed['peers']
    assert members[1] not in observed['peers']
    assert not members[0].closed
    assert members[1].closed


def test_duplicate_and_control_traffic_do_not_refresh_application_activity(monkeypatch):
    a, b = Peer(), Peer()
    attach(a, 'a' * 32)
    attach(b, 'b' * 32)
    monkeypatch.setattr(main.time, 'monotonic', lambda: 100.0)
    main.relay_to_others(a, b'application frame')
    monkeypatch.setattr(main.time, 'monotonic', lambda: 101.0)
    main.relay_to_others(a, b'application frame')
    main.relay_signal(a, {'to': 'b' * 32, 'signal': {'type': 'offer', 'sdp': 'test'}})
    main.broadcast_roster()
    main.send_peer(a, main.build_peer_exchange_response(2))
    assert main.peers[a]['last_activity'] == 100.0
    assert main.peers[b]['last_activity'] == 0.0


def test_evicted_sender_cannot_relay_or_change_replay_cache():
    evicted, recipient = Peer(), Peer()
    attach(recipient, 'b' * 32)
    main.relay_to_others(evicted, b'late frame')
    main.relay_signal(evicted, {'to': 'b' * 32, 'signal': {'type': 'offer', 'sdp': 'test'}})
    assert recipient.sent == []
    assert main.recent_frames == {}


def test_evicted_connection_stops_after_receive():
    received = []

    class Evicted(Peer):
        def receive(self, timeout):
            received.append(True)
            with main.peers_lock:
                main.peers.pop(self)
            return b'late frame'

    sender, recipient = Evicted(), Peer()
    attach(recipient, 'b' * 32)
    run_connection(sender)
    assert len(received) == 1
    assert b'late frame' not in recipient.sent
    assert main.recent_frames == {}


def test_failed_eviction_close_does_not_reject_newcomer():
    class BrokenPeer(Peer):
        def close(self, reason=None, message=None):
            self.closed_with_registry_lock = main.peers_lock.locked()
            self.close_reason = reason
            raise ConnectionError('already disconnected')

    broken = BrokenPeer()
    attach(broken, 'a' * 32, last_activity=-1.0)
    for index in range(main.MAX_PEERS - 1):
        attach(Peer(), f'{index:032x}', last_activity=0.0)
    observed = {}

    class Newcomer(Peer):
        def receive(self, timeout):
            observed['peers'] = dict(main.peers)
            raise ConnectionError('test connection finished')

    newcomer = Newcomer()
    run_connection(newcomer)
    assert newcomer in observed['peers']
    assert broken not in observed['peers']
    assert len(observed['peers']) == main.MAX_PEERS
    assert not broken.closed_with_registry_lock
    assert broken.close_reason == 1013
    assert json.loads(newcomer.sent[0])['type'] == 'mesh_welcome'


def test_old_client_never_enters_v2_roster_or_relay():
    modern = Peer(); attach(modern, 'a' * 32)
    for protocol in (None, '', 'hp2p.v1'):
        old = Peer(); old.subprotocol = protocol
        run_connection(old)
        assert old not in main.peers
        assert old.closed and old.close_reason == 1008
        assert json.loads(old.sent[0])['type'] == 'upgrade_required'
    assert modern.sent == []


def test_health_and_self_hosted_client_security_headers():
    client = main.app.test_client()
    assert client.get('/healthz').json['protocol'] == 2
    page = client.get('/client')
    assert page.status_code == 200
    assert page.headers['Cache-Control'] == 'no-store'
    assert "script-src 'self'" in page.headers['Content-Security-Policy']
    assert b'cdn.jsdelivr' not in page.data and b'cdn.replit' not in page.data
    assert b'backupIdentityBtn' in page.data
