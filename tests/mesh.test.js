// Mocked transport contract tests: these do NOT prove browser interoperability,
// NAT traversal, anonymity, or end-to-end delivery over the public Internet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeshTransport, parseMeshSignal } from '../static/js/mesh.js';

const A = '1'.repeat(32), B = '2'.repeat(32), C = '3'.repeat(32);
const offer = { type: 'offer', sdp: 'v=0\r\nmock offer' };
const answer = { type: 'answer', sdp: 'v=0\r\nmock answer' };
const ice = { type: 'ice', candidate: {
    candidate: 'candidate:mock', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null,
} };
class Channel {
    constructor(label = 'hp2p-mesh-v1') {
        this.label = label;
        this.readyState = 'connecting';
        this.bufferedAmount = 0;
        this.send = vi.fn();
        this.close = vi.fn(() => { this.readyState = 'closed'; });
    }
    open() { this.readyState = 'open'; this.onopen?.(); }
}
class RTC {
    static instances = [];
    constructor(config) {
        this.config = config;
        RTC.instances.push(this);
        this.createOffer = vi.fn(async () => offer);
        this.createAnswer = vi.fn(async () => answer);
        this.setLocalDescription = vi.fn(async value => { this.localDescription = value; });
        this.setRemoteDescription = vi.fn(async value => { this.remoteDescription = value; });
        this.addIceCandidate = vi.fn(async () => {});
        this.createDataChannel = vi.fn(label => (this.channel = new Channel(label)));
        this.close = vi.fn();
    }
}
const created = [];
function mesh(options = {}) {
    const transport = new MeshTransport({ RTCPeerConnection: RTC, sendSignal: vi.fn(),
        onFrame: vi.fn(), onStatus: vi.fn(), ...options });
    created.push(transport);
    return transport;
}
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
beforeEach(() => { vi.useFakeTimers(); RTC.instances = []; });
afterEach(() => { created.splice(0).forEach(item => item.disconnect()); vi.useRealTimers(); });

describe('bounded experimental mesh', () => {
    it('only the lower routing ID initiates and no external ICE service is used', async () => {
        const low = mesh(), high = mesh();
        expect(low.setIdentity(A, [A, B])).toBe(true);
        high.setIdentity(B, [A]);
        await flush();
        expect(RTC.instances).toHaveLength(1);
        expect(RTC.instances[0].config).toEqual({ iceServers: [] });
        expect(low.sendSignal).toHaveBeenCalledWith({ type: 'mesh_signal', to: B, signal: offer });
        expect(high.sendSignal).not.toHaveBeenCalled();
        expect(await low.receiveSignal(B, offer)).toBe(false);
    });

    it('negotiates offer/answer and passes direct frames through the callback', async () => {
        const sender = mesh(), receiver = mesh();
        sender.setIdentity(A, [B]);
        receiver.setIdentity(B, [A]);
        await flush();
        expect(await receiver.receiveSignal(A, offer)).toBe(true);
        expect(receiver.sendSignal).toHaveBeenCalledWith({ type: 'mesh_signal', to: A, signal: answer });
        expect(await sender.receiveSignal(B, answer)).toBe(true);
        const channel = new Channel();
        RTC.instances[1].ondatachannel({ channel });
        channel.open();
        channel.onmessage({ data: 'payload' });
        expect(receiver.onFrame).toHaveBeenCalledWith('payload', A);
        RTC.instances[0].channel.open();
        expect(sender.broadcast('payload')).toBe(1);
        expect(RTC.instances[0].channel.send).toHaveBeenCalledWith('payload');
        expect(await receiver.receiveSignal(A, offer)).toBe(false);
        expect(await sender.receiveSignal(B, answer)).toBe(false);
    });

    it('rejects unknown senders, malformed or oversized signals without allocation', async () => {
        const target = mesh();
        target.setIdentity(B, [A]);
        for (const value of [null, [], {}, { ...offer, sdp: '' }, { ...offer, key: 'identity' },
            { ...offer, sdp: 'x'.repeat(32769) }, { ...ice, candidate: {} },
            { ...ice, candidate: { ...ice.candidate, sdpMLineIndex: -1 } },
            { ...ice, candidate: { ...ice.candidate, candidate: 'x'.repeat(2049) } }]) {
            expect(await target.receiveSignal(A, value)).toBe(false);
        }
        expect(await target.receiveSignal(C, offer)).toBe(false);
        expect(await target.receiveSignal(A, ice)).toBe(false);
        expect(RTC.instances).toHaveLength(0);
    });

    it('bounds rosters and connections and rejects invalid IDs atomically', async () => {
        const target = mesh({ maxPeers: 2 });
        target.setIdentity(A, [B, C, '4'.repeat(32)]);
        await flush();
        expect(target.peers.size).toBe(2);
        expect(target.updatePeers(Array(65).fill(B))).toBe(false);
        expect(target.setIdentity('publisher-key', [])).toBe(false);
        expect(target.updatePeers(['invalid'])).toBe(false);
        expect(target.peerId).toBe(A);
        expect(target.peers.size).toBe(2);
        expect(target.updatePeers([])).toBe(true);
        expect(target.peers.size).toBe(0);
        expect(RTC.instances[0].close).toHaveBeenCalledOnce();
    });

    it('queues bounded ICE until the answer and rejects candidate flooding', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        for (let i = 0; i < 64; i++) expect(await target.receiveSignal(B, ice)).toBe(true);
        expect(await target.receiveSignal(B, ice)).toBe(false);
        expect(RTC.instances[0].addIceCandidate).not.toHaveBeenCalled();
        await target.receiveSignal(B, answer);
        expect(RTC.instances[0].addIceCandidate).toHaveBeenCalledTimes(64);
    });

    it('puts local description before ICE even with synchronous candidate callbacks', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        const pc = RTC.instances[0];
        pc.setLocalDescription.mockImplementation(async value => {
            pc.localDescription = value;
            pc.onicecandidate({ candidate: ice.candidate });
        });
        await flush();
        expect(target.sendSignal.mock.calls.map(call => call[0].signal.type)).toEqual(['offer', 'ice']);
    });

    it('expires stalled negotiations and ignores late signals', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        vi.advanceTimersByTime(15000);
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('negotiation-timeout');
        expect(await target.receiveSignal(B, answer)).toBe(false);
        expect(RTC.instances[0].close).toHaveBeenCalledOnce();
    });

    it('open channels survive negotiation timeout; lost channels close the peer', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        RTC.instances[0].channel.open();
        vi.advanceTimersByTime(15000);
        expect(target.peers.size).toBe(1);
        RTC.instances[0].channel.onclose();
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('channel-closed');
    });

    it('disconnect and identity reset cancel pending asynchronous negotiation', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        let resolveOffer;
        RTC.instances[0].createOffer.mockReturnValue(new Promise(resolve => { resolveOffer = resolve; }));
        await flush();
        target.setIdentity(C, []);
        resolveOffer(offer);
        await flush();
        expect(target.peerId).toBe(C);
        expect(target.sendSignal).not.toHaveBeenCalled();
        expect(RTC.instances[0].setLocalDescription).not.toHaveBeenCalled();
        target.disconnect();
        expect(target.peerId).toBeNull();
        expect(target.roster.size).toBe(0);
    });

    it('enforces bytes for UTF-8 and binary, rejects unsupported frames and bounds buffering', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        const channel = RTC.instances[0].channel;
        expect(target.broadcast('not open')).toBe(0);
        channel.open();
        expect(target.broadcast(new ArrayBuffer(65536))).toBe(1);
        expect(target.broadcast(new Uint8Array(65536))).toBe(1);
        expect(target.broadcast('é'.repeat(32768))).toBe(1);
        for (const value of ['é'.repeat(32769), new ArrayBuffer(65537), {}, null]) {
            expect(target.broadcast(value)).toBe(0);
        }
        channel.bufferedAmount = 262144;
        expect(target.broadcast('x')).toBe(0);
        channel.onmessage({ data: new ArrayBuffer(65537) });
        expect(target.onFrame).not.toHaveBeenCalled();
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('invalid-frame');
    });

    it('rejects extra data channels and handles unavailable RTC or failed signalling', async () => {
        const unavailable = mesh({ RTCPeerConnection: null });
        unavailable.setIdentity(A, [B]);
        expect(unavailable.broadcast('x')).toBe(0);
        const target = mesh({ sendSignal: () => false });
        target.setIdentity(A, [B]);
        const unexpected = new Channel();
        RTC.instances[0].ondatachannel({ channel: unexpected });
        expect(unexpected.close).toHaveBeenCalledOnce();
        await flush();
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('negotiation-failed');
    });

    it('contains RTC negotiation and direct send errors with observable failure status', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        RTC.instances[0].createOffer.mockRejectedValue(new Error('mock failure'));
        await flush();
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('negotiation-failed');
        target.updatePeers([B]);
        await flush();
        RTC.instances[1].channel.open();
        RTC.instances[1].channel.send.mockImplementation(() => { throw new Error('mock send error'); });
        expect(target.broadcast('x')).toBe(0);
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('send-failed');
    });

    it('copies validated ICE and does not permit extra candidate fields', () => {
        const parsed = parseMeshSignal(ice);
        expect(parsed).toEqual(ice);
        expect(parsed.candidate).not.toBe(ice.candidate);
        expect(parseMeshSignal({ ...ice, candidate: { ...ice.candidate, identity: 'secret' } })).toBeNull();
    });

    it('contains asynchronous signalling rejection', async () => {
        const target = mesh({ sendSignal: vi.fn().mockRejectedValue(new Error('offline')) });
        target.setIdentity(A, [B]);
        await flush();
        expect(target.peers.size).toBe(0);
        expect(target.onStatus).toHaveBeenCalledWith('negotiation-failed');
    });

    it('drops callbacks retained from an old identity and closes unexpected receiver channels', async () => {
        const target = mesh();
        target.setIdentity(B, [A]);
        await target.receiveSignal(A, offer);
        const pc = RTC.instances[0];
        const unwanted = new Channel('another-protocol');
        pc.ondatachannel({ channel: unwanted });
        expect(unwanted.close).toHaveBeenCalledOnce();
        const accepted = new Channel();
        pc.ondatachannel({ channel: accepted });
        const message = accepted.onmessage;
        const lateChannel = pc.ondatachannel;
        target.setIdentity(C, []);
        message({ data: 'old identity' });
        const late = new Channel();
        lateChannel({ channel: late });
        expect(target.onFrame).not.toHaveBeenCalled();
        expect(late.close).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds queued work while a remote description is stalled', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        let resolveDescription;
        RTC.instances[0].setRemoteDescription.mockReturnValue(new Promise(resolve => { resolveDescription = resolve; }));
        const pending = [target.receiveSignal(B, answer)];
        for (let i = 0; i < 64; i++) pending.push(target.receiveSignal(B, ice));
        expect(await target.receiveSignal(B, ice)).toBe(false);
        const entry = target.peers.get(B);
        expect(entry.pending).toBeLessThanOrEqual(65);
        target.disconnect();
        resolveDescription();
        expect((await Promise.all(pending)).every(value => value === false)).toBe(true);
        expect(RTC.instances[0].addIceCandidate).not.toHaveBeenCalled();
    });

    it('reports negotiation stages with a bounded metadata-free vocabulary', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        const pc = RTC.instances[0];
        pc.onicecandidate({ candidate: ice.candidate });
        pc.onicecandidate({ candidate: ice.candidate });
        pc.onicecandidate({ candidate: null });
        await flush();
        await target.receiveSignal(B, answer);
        await target.receiveSignal(B, ice);
        await target.receiveSignal(B, ice);
        pc.iceConnectionState = 'checking';
        pc.oniceconnectionstatechange();
        pc.iceConnectionState = 'connected';
        pc.oniceconnectionstatechange();
        pc.connectionState = 'connected';
        pc.onconnectionstatechange();
        pc.channel.open();
        const statuses = target.onStatus.mock.calls.map(([status]) => status);
        expect(statuses).toEqual(expect.arrayContaining([
            'negotiation-initiator', 'signal-sent-offer', 'signal-sent-ice',
            'ice-gathering-complete', 'signal-received-answer', 'signal-applied-answer',
            'signal-received-ice', 'signal-applied-ice', 'ice-checking', 'ice-connected',
            'rtc-connected', 'connected',
        ]));
        expect(statuses.filter(status => status === 'signal-sent-ice')).toHaveLength(1);
        expect(statuses.filter(status => status === 'signal-received-ice')).toHaveLength(1);
        for (const secret of [A, B, offer.sdp, answer.sdp, ice.candidate.candidate]) {
            expect(JSON.stringify(statuses)).not.toContain(secret);
        }
    });

    it('distinguishes zero ICE candidates and rejects untrusted diagnostic contents', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        const pc = RTC.instances[0];
        pc.onicecandidate({ candidate: null });
        pc.onicecandidate({ candidate: { candidate: 'private-ip-marker' } });
        pc.iceConnectionState = 'private-ip-marker';
        pc.oniceconnectionstatechange();
        pc.connectionState = 'private-ip-marker';
        pc.onconnectionstatechange();
        expect(await target.receiveSignal(B, { type: 'private-ip-marker' })).toBe(false);
        expect(await target.receiveSignal(C, answer)).toBe(false);
        const statuses = target.onStatus.mock.calls.map(([status]) => status);
        expect(statuses).toContain('ice-gathering-complete-no-candidates');
        expect(statuses).toContain('local-ice-candidate-rejected');
        expect(statuses).toContain('signal-rejected-invalid');
        expect(statuses).toContain('signal-rejected-answer-unavailable-peer');
        expect(JSON.stringify(statuses)).not.toContain('private-ip-marker');
    });

    it('requests stats only at timeout and emits aggregate counts without identifiers or addresses', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        const pc = RTC.instances[0];
        const report = new Map([
            ['secret-local-id', { type: 'local-candidate', address: '192.0.2.1', port: 1234 }],
            ['secret-remote-id', { type: 'remote-candidate', address: '198.51.100.2', protocol: 'secret-protocol' }],
            ['secret-pair-id', { type: 'candidate-pair', state: 'waiting', localCandidateId: 'secret-local-id' }],
            ['secret-other-pair', { type: 'candidate-pair', state: 'untrusted-secret-state' }],
            ['ignored-secret-transport', { type: 'transport', sdp: 'private-sdp' }],
        ]);
        pc.getStats = vi.fn(async () => report);
        vi.advanceTimersByTime(14999);
        expect(pc.getStats).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(pc.getStats).toHaveBeenCalledOnce();
        expect(pc.close).toHaveBeenCalledOnce();
        expect(target.peers.size).toBe(0);
        await flush();
        const statuses = target.onStatus.mock.calls.map(([status]) => status);
        expect(statuses).toContain('ice-timeout-stats local=1 remote=1 pairs=2 frozen=0 waiting=1 in-progress=0 failed=0 succeeded=0 other=1');
        for (const secret of ['secret', '192.0.2.1', '198.51.100.2', 'private-sdp', A, B]) {
            expect(JSON.stringify(statuses)).not.toContain(secret);
        }
    });

    it.each(['unsupported', 'throws', 'rejects', 'stalls'])(
        'always closes timed-out connections when stats %s', async mode => {
            const target = mesh();
            target.setIdentity(A, [B]);
            await flush();
            const pc = RTC.instances[0];
            if (mode === 'throws') pc.getStats = () => { throw new Error('private error'); };
            if (mode === 'rejects') pc.getStats = async () => { throw new Error('private error'); };
            let resolve;
            if (mode === 'stalls') pc.getStats = () => new Promise(done => { resolve = done; });
            vi.advanceTimersByTime(15000);
            expect(pc.close).toHaveBeenCalledOnce();
            expect(target.peers.size).toBe(0);
            await flush();
            expect(JSON.stringify(target.onStatus.mock.calls)).not.toContain('private error');
            if (mode === 'stalls') {
                expect(target.onStatus).not.toHaveBeenCalledWith('ice-timeout-stats-unavailable');
                resolve(new Map());
                await flush();
            } else expect(target.onStatus).toHaveBeenCalledWith('ice-timeout-stats-unavailable');
        });

    it('does not request stats for successful connections or explicit disconnect', async () => {
        const target = mesh();
        target.setIdentity(A, [B]);
        await flush();
        const pc = RTC.instances[0];
        pc.getStats = vi.fn(async () => new Map());
        pc.channel.open();
        vi.advanceTimersByTime(15000);
        target.disconnect();
        expect(pc.getStats).not.toHaveBeenCalled();
    });
});
