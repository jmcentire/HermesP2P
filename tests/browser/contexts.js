import { MeshTransport } from '/static/js/mesh.js?sha256=a247cadeab9c96e6e4bea3b7262b5cd6c5672025324959574edfff9a5ee0e451';
// One transport in this browsing context. The controller exists only in the test server.
const role = new URL(location.href).searchParams.get('role');
const text = (id, value) => { document.getElementById(id).textContent = value; };
let active = true, ws = null, mesh = null, timer, deadline, phase = 'waiting';
const handled = new Set();
const counts = { first: 0, second: 0 };
let down = false, removed = false, rejoined = false, eventCount = 0, oldPeer = null, credentials;
const ready = () => Boolean(mesh && [...mesh.peers.values()].some(e => e.channel?.readyState === 'open'));
function log(value) {
    if (eventCount++ >= 24) return;
    const p = document.createElement('p'); p.textContent = value; document.querySelector('#events').append(p);
}
function disconnect() {
    mesh?.disconnect(); mesh = null;
    if (ws) { ws.onmessage = ws.onclose = ws.onerror = null; ws.close(); ws = null; }
}
function finish(result) {
    if (!active) return;
    active = false; clearTimeout(timer); clearTimeout(deadline); disconnect();
    text('result', 'Result: ' + result + '; test sockets and timers cleaned');
    document.querySelector('#stop').disabled = true;
}
function connect() {
    if (!active || ws) return;
    const socket = new WebSocket('ws://' + location.host + '/ws'); ws = socket;
    const transport = new MeshTransport({
        sendSignal: signal => { if (socket.readyState !== WebSocket.OPEN) return false; socket.send(JSON.stringify(signal)); return true; },
        onStatus: status => {
            if (!active || transport !== mesh) return;
            if (status === 'connected') { text('link', 'Direct link: OPEN'); log('Direct data channel opened'); }
            // Roster removal is observed in the hub message handler below.
            if (['negotiation-timeout', 'negotiation-failed', 'channel-failed'].includes(status)) log(status);
        },
        onFrame: frame => {
            if (!active || transport !== mesh) return;
            const other = role === 'A' ? 'B' : 'A';
            for (const stage of ['first', 'second']) {
                if (frame !== `dummy-context-${stage}-${other}`) continue;
                counts[stage] = Math.min(1000, counts[stage] + 1);
                text(stage, `${stage === 'first' ? 'Before' : 'After'} reconnect: ${counts[stage]} direct duplicate frames`);
            }
        },
    }); mesh = transport;
    socket.onmessage = event => {
        if (!active || transport !== mesh) return;
        try {
            const value = JSON.parse(event.data);
            if (value.type === 'mesh_welcome') transport.setIdentity(value.peerId, value.peers);
            else if (value.type === 'mesh_roster') {
                transport.updatePeers(value.peers);
                if (role === 'B' && oldPeer && !transport.roster.has(oldPeer)) {
                    removed = true; text('disconnect', 'Disconnect observation: old routing ID absent from actual hub roster');
                }
            }
            else if (value.type === 'mesh_signal') void transport.receiveSignal(value.from, value.signal);
            else finish('FAILED: unexpected relay data');
        } catch { finish('FAILED: unexpected hub frame'); }
    };
    socket.onerror = () => finish('FAILED: hub error');
    socket.onclose = () => { if (active && socket === ws) finish('FAILED: unexpected hub closure'); };
}
async function poll() {
    if (!active) return;
    try {
        const response = await fetch('/__test__/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000), body: JSON.stringify({...credentials, role, ready: ready(), ...counts, down, removed, rejoined}) });
        if (!response.ok) throw new Error('control unavailable');
        const state = await response.json();
        if (!active) return;
        phase = state.phase;
        text('phase', 'Phase: ' + phase);
        text('relay', `Test hub forwarding: ${state.forwarding ? 'enabled' : 'DISABLED'}; blocked relay probes: ${state.blocked} from ${state.blockedPeers} peers`);
        if (phase === 'done') {
            const ownProof = counts.first === 2 && counts.second === 2
                && ['connecting', 'first', 'second'].every(p => handled.has(p))
                && !state.forwarding && state.blockedPeers === 2 && (role === 'A' ? down && rejoined : removed);
            finish(ownProof ? 'PASS: both peers received 2+2 direct frames across reconnect with relay forwarding disabled'
                : 'FAILED: incomplete local evidence'); return;
        }
        if (phase === 'failed') { finish('FAILED: pair deadline'); return; }
        if (!handled.has(phase)) {
            if (phase === 'connecting') { connect(); handled.add(phase); }
            if ((phase === 'first' || phase === 'second') && ready()) {
                if (mesh.roster.size !== 1) { finish('FAILED: expected exactly one remote test peer'); return; }
                const sent = mesh.broadcast(`dummy-context-${phase}-${role}`) + mesh.broadcast(`dummy-context-${phase}-${role}`);
                log(`${phase}: direct sends=${sent}`);
                if (sent !== 2) { finish('FAILED: direct send unavailable'); return; }
                if (phase === 'first') { oldPeer = [...mesh.roster][0]; ws.send(JSON.stringify({type: 'test_relay_probe'})); }
                handled.add(phase);
            }
            if (phase === 'disconnect') {
                if (role === 'A') { disconnect(); down = true; text('link', 'Direct link: intentionally closed'); text('disconnect', 'Disconnect observation: local peer closed'); }
                handled.add(phase);
            }
            if (phase === 'reconnect') { if (role === 'A') { connect(); rejoined = true; } handled.add(phase); }
        }
        timer = setTimeout(poll, 500);
    } catch { finish('FAILED: test controller unavailable'); }
}
document.querySelector('#stop').addEventListener('click', () => finish('STOPPED'));
window.addEventListener('pagehide', () => finish('PAGE CLOSED'), {once: true});
text('role', 'Test peer: ' + (['A', 'B'].includes(role) ? role : 'invalid'));
if (!['A', 'B'].includes(role)) finish('FAILED: role must be A or B');
else {
    deadline = setTimeout(() => finish('FAILED: 180-second absolute deadline'), 180000);
    try {
        const response = await fetch('/__test__/join', {method: 'POST', headers: {'Content-Type': 'application/json'},
            signal: AbortSignal.timeout(3000), body: JSON.stringify({role})});
        if (!response.ok) throw new Error('one-shot run unavailable');
        const joined = await response.json();
        if (joined.meshHash !== 'a247cadeab9c96e6e4bea3b7262b5cd6c5672025324959574edfff9a5ee0e451') throw new Error('source mismatch');
        credentials = {run: joined.run, owner: joined.owner};
        if (active) void poll();
    } catch { finish('FAILED: join rejected; restart dedicated test server for each new pair'); }
}
