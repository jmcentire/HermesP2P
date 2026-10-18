import { MeshTransport } from '../../static/js/mesh.js';

// This fixture is served separately from Flask and excluded from Docker images.
const HUB_URL = 'ws://localhost:8787/ws';
const output = document.querySelector('#results');
const buttons = ['native', 'nontrickle', 'mesh'].map(id => document.getElementById(id));
const stop = document.querySelector('#stop');
let activeRun = null;

function known(value, options) { return options.includes(value) ? value : 'other'; }

function beginRun(label) {
    if (activeRun) return null;
    const timers = new Set();
    const disposers = new Set();
    let lines = 0;
    output.textContent = '';
    buttons.forEach(button => { button.disabled = true; });
    stop.disabled = false;
    const run = {
        active: true,
        log(message) {
            if (run.active && lines++ < 200) output.textContent += message + '\n';
        },
        dispose(callback) { disposers.add(callback); return () => disposers.delete(callback); },
        schedule(callback, delay) {
            const timer = setTimeout(() => {
                timers.delete(timer);
                if (run.active) Promise.resolve().then(callback).catch(() => {
                    run.log('operation failed; no raw error retained');
                    run.finish('failed');
                });
            }, delay);
            timers.add(timer);
        },
        finish(reason) {
            if (!run.active) return;
            run.log('cleanup: ' + reason);
            run.active = false;
            timers.forEach(timer => clearTimeout(timer));
            disposers.forEach(dispose => { try { dispose(); } catch { /* best effort */ } });
            disposers.clear();
            activeRun = null;
            buttons.forEach(button => { button.disabled = false; });
            stop.disabled = true;
        },
    };
    activeRun = run;
    run.log(label + ' secure-context=' + window.isSecureContext);
    run.schedule(() => run.finish('22-second absolute deadline'), 22000);
    return run;
}

// Bound slow browser APIs; stop/pagehide also cancels outstanding waits.
function bounded(run, promise, milliseconds) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let removeDisposer = () => {};
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            removeDisposer();
            callback(value);
        };
        const timer = setTimeout(() => finish(reject, new Error('deadline')), milliseconds);
        removeDisposer = run.dispose(() => finish(reject, new Error('stopped')));
        Promise.resolve(promise).then(value => finish(resolve, value), () => finish(reject, new Error('unavailable')));
    });
}

async function environment(run) {
    for (const name of ['local-network-access', 'local-network']) {
        try {
            const permission = await bounded(run, navigator.permissions.query({ name }), 1000);
            run.log(name + '=' + known(permission.state, ['granted', 'denied', 'prompt']));
        } catch { run.log(name + '=query-unavailable'); }
        if (!run.active) return;
    }
}

function descriptionFlags(description) {
    const sdp = description?.sdp || '';
    return {
        application: /^m=application (?!0 )/m.test(sdp),
        iceUfrag: /^a=ice-ufrag:/m.test(sdp),
        icePassword: /^a=ice-pwd:/m.test(sdp),
        fingerprint: /^a=fingerprint:/m.test(sdp),
        mid: /^a=mid:/m.test(sdp),
        candidates: /^a=candidate:/m.test(sdp),
    };
}

async function snapshot(run, label, pc) {
    if (!run.active || pc.connectionState === 'closed') return;
    try {
        const stats = await bounded(run, pc.getStats(), 1000);
        // A completed pre-close snapshot, unlike statistics requested then closed.
        if (!run.active || pc.connectionState === 'closed') return;
        const counts = { local: 0, remote: 0, pairs: 0, waiting: 0,
            'in-progress': 0, succeeded: 0, failed: 0, other: 0 };
        const increment = name => { counts[name] = Math.min(counts[name] + 1, 4096); };
        stats.forEach(stat => {
            if (stat.type === 'local-candidate') increment('local');
            else if (stat.type === 'remote-candidate') increment('remote');
            else if (stat.type === 'candidate-pair') {
                increment('pairs');
                increment(known(stat.state, ['waiting', 'in-progress', 'succeeded', 'failed']));
            }
        });
        run.log(label + ' ' + JSON.stringify({
            signalling: known(pc.signalingState, ['stable', 'have-local-offer', 'have-remote-offer', 'closed']),
            ice: known(pc.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed']),
            gathering: known(pc.iceGatheringState, ['new', 'gathering', 'complete']),
            connection: known(pc.connectionState, ['new', 'connecting', 'connected', 'failed', 'disconnected', 'closed']),
            sctp: Boolean(pc.sctp), localSdp: descriptionFlags(pc.localDescription),
            remoteSdp: descriptionFlags(pc.remoteDescription), ...counts,
        }));
    } catch { run.log(label + ' stats-unavailable'); }
}

function listen(run, target, event, callback) {
    const listener = value => { if (run.active) callback(value); };
    target.addEventListener(event, listener);
    run.dispose(() => target.removeEventListener(event, listener));
}

function track(run, label, pc) {
    listen(run, pc, 'iceconnectionstatechange', () => run.log(label + ' ice=' +
        known(pc.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed'])));
    listen(run, pc, 'connectionstatechange', () => run.log(label + ' rtc=' +
        known(pc.connectionState, ['new', 'connecting', 'connected', 'failed', 'disconnected', 'closed'])));
    listen(run, pc, 'icecandidateerror', event => run.log(label + ' candidate-error=' +
        (Number.isInteger(event.errorCode) ? event.errorCode : 'unknown')));
    listen(run, pc, 'icecandidate', event => {
        if (!event.candidate) { run.log(label + ' gathering-complete'); return; }
        const candidate = event.candidate;
        run.log(label + ' candidate ' + JSON.stringify({
            type: known(candidate.type, ['host', 'srflx', 'prflx', 'relay']),
            protocol: known(candidate.protocol, ['udp', 'tcp']),
            addressClass: candidate.address?.endsWith('.local') ? 'mdns' : 'other',
            midPresent: candidate.sdpMid !== null, indexPresent: candidate.sdpMLineIndex !== null,
        }));
    });
}

async function gathered(run, pc) {
    if (pc.iceGatheringState === 'complete') return;
    let listener;
    const ready = new Promise(resolve => {
        listener = () => { if (pc.iceGatheringState === 'complete') resolve(); };
        pc.addEventListener('icegatheringstatechange', listener);
    });
    try { await bounded(run, ready, 5000); }
    finally { pc.removeEventListener('icegatheringstatechange', listener); }
}

async function nativeLoopback(run, nontrickle) {
    await environment(run);
    if (!run.active) return;
    const a = new RTCPeerConnection({ iceServers: [] });
    run.dispose(() => a.close());
    const b = new RTCPeerConnection({ iceServers: [] });
    run.dispose(() => b.close());
    track(run, 'a', a);
    track(run, 'b', b);
    const config = a.getConfiguration();
    run.log('config ' + JSON.stringify({
        iceTransportPolicy: known(config.iceTransportPolicy, ['all', 'relay']),
        bundlePolicy: known(config.bundlePolicy, ['balanced', 'max-compat', 'max-bundle']),
        rtcpMuxPolicy: known(config.rtcpMuxPolicy, ['require', 'negotiate']), externalIceServers: 0,
    }));
    const pendingA = [], pendingB = [];
    if (!nontrickle) {
        const deliver = (pc, pending, candidate) => {
            if (!candidate || !run.active) return;
            if (!pc.remoteDescription) {
                if (pending.length >= 64) { run.finish('candidate limit'); return; }
                pending.push(candidate);
            } else pc.addIceCandidate(candidate).catch(() => run.finish('candidate application failed'));
        };
        listen(run, a, 'icecandidate', event => deliver(b, pendingB, event.candidate));
        listen(run, b, 'icecandidate', event => deliver(a, pendingA, event.candidate));
    }
    const channel = a.createDataChannel('local-connectivity-probe');
    run.dispose(() => channel.close());
    listen(run, channel, 'open', () => {
        run.log('native channel OPEN');
        channel.send('dummy native probe');
    });
    listen(run, b, 'datachannel', event => {
        run.dispose(() => event.channel.close());
        listen(run, event.channel, 'message', message => {
            if (message.data === 'dummy native probe') run.log('native dummy frame RECEIVED');
        });
    });
    await a.setLocalDescription(await a.createOffer());
    if (nontrickle) await gathered(run, a);
    if (!run.active) return;
    await b.setRemoteDescription(a.localDescription);
    for (const candidate of pendingB.splice(0)) await b.addIceCandidate(candidate);
    await b.setLocalDescription(await b.createAnswer());
    if (nontrickle) await gathered(run, b);
    if (!run.active) return;
    await a.setRemoteDescription(b.localDescription);
    for (const candidate of pendingA.splice(0)) await a.addIceCandidate(candidate);
    for (const delay of [2000, 8000]) run.schedule(() => Promise.all([
        snapshot(run, 'native a ' + delay, a), snapshot(run, 'native b ' + delay, b),
    ]), delay);
    run.schedule(() => run.finish('native run complete'), 12000);
}

function meshLoopback(run) {
    const clients = [];
    for (const label of ['a', 'b']) {
        const ws = new WebSocket(HUB_URL);
        const mesh = new MeshTransport({
            sendSignal: message => {
                if (ws.readyState !== WebSocket.OPEN) return false;
                ws.send(JSON.stringify(message));
                return true;
            },
            onStatus: status => {
                // Library diagnostics are fixed strings/counts, never raw RTC data.
                if (/^[a-z0-9= -]{1,200}$/.test(status)) run.log(label + ' ' + status);
            },
            onFrame: frame => { if (frame === 'dummy mesh probe') run.log(label + ' mesh dummy frame RECEIVED'); },
        });
        clients.push({ ws, mesh, label });
        run.dispose(() => { mesh.disconnect(); ws.close(); });
        listen(run, ws, 'error', () => run.finish('local hub unavailable'));
        listen(run, ws, 'close', () => { mesh.disconnect(); run.log(label + ' local hub closed'); });
        listen(run, ws, 'message', event => {
            if (typeof event.data !== 'string' || event.data.length > 65536) return;
            try {
                const value = JSON.parse(event.data);
                if (value.type === 'mesh_welcome') mesh.setIdentity(value.peerId, value.peers);
                else if (value.type === 'mesh_roster') mesh.updatePeers(value.peers);
                else if (value.type === 'mesh_signal') mesh.receiveSignal(value.from, value.signal)
                    .catch(() => run.finish('mesh signalling failed'));
            } catch { run.finish('invalid local hub response'); }
        });
    }
    for (const delay of [2000, 8000, 12000]) run.schedule(async () => {
        for (const { mesh, label } of clients) {
            await Promise.all([...mesh.peers.values()].map(({ pc }) => snapshot(run, 'mesh ' + label + ' ' + delay, pc)));
            if (run.active) run.log(label + ' direct sends=' + mesh.broadcast('dummy mesh probe'));
        }
    }, delay);
    run.schedule(() => run.finish('mesh run complete'), 18000);
}

function start(label, operation) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        output.textContent = 'Serve this fixture on localhost only.';
        return;
    }
    const run = beginRun(label);
    if (run) Promise.resolve().then(() => operation(run)).catch(() => run.finish('test operation failed'));
}

buttons[0].onclick = () => start('native trickle', run => nativeLoopback(run, false));
buttons[1].onclick = () => start('native complete-SDP', run => nativeLoopback(run, true));
buttons[2].onclick = () => start('mesh via fixed local hub', meshLoopback);
stop.onclick = () => activeRun?.finish('stopped');
window.addEventListener('pagehide', () => activeRun?.finish('page hidden'));
