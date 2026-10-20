/**
 * Experimental, hub-signalled WebRTC transport. Ephemeral routing IDs are not
 * identities. The hub sees signalling and peers may learn one another's IPs.
 * No STUN/TURN is configured: direct connectivity across NAT is not guaranteed.
 * Keep the hub relay as a delivery path and deduplicate application messages.
 */
export const MESH_MAX_FRAME_BYTES = 65536;
const MAX_ROSTER = 64;
const MAX_ICE = 64;
const MAX_PENDING = 128;
const MAX_SDP_BYTES = 32768;
const MAX_BUFFERED_BYTES = 262144;
const ID = /^[a-f0-9]{32}$/;
const encoder = new TextEncoder();

function exactKeys(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === keys.length
        && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function validRoster(peers) {
    return Array.isArray(peers) && peers.length <= MAX_ROSTER
        && peers.every(peer => typeof peer === 'string' && ID.test(peer));
}

function frameSize(frame) {
    if (typeof frame === 'string') {
        if (frame.length > MESH_MAX_FRAME_BYTES) return Infinity;
        return encoder.encode(frame).byteLength;
    }
    if (frame instanceof ArrayBuffer || ArrayBuffer.isView(frame)) return frame.byteLength;
    return Infinity;
}

/** Validate and copy only protocol fields; never pass arbitrary objects to RTC. */
export function parseMeshSignal(signal) {
    if (exactKeys(signal, ['type', 'sdp'])
        && (signal.type === 'offer' || signal.type === 'answer')
        && typeof signal.sdp === 'string' && signal.sdp.length > 0 && signal.sdp.length <= MAX_SDP_BYTES
        && encoder.encode(signal.sdp).byteLength <= MAX_SDP_BYTES) {
        return { type: signal.type, sdp: signal.sdp };
    }
    if (!exactKeys(signal, ['type', 'candidate']) || signal.type !== 'ice') return null;
    const c = signal.candidate;
    if (!exactKeys(c, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])
        || typeof c.candidate !== 'string' || c.candidate.length === 0 || c.candidate.length > 2048
        || encoder.encode(c.candidate).byteLength > 2048
        || !(c.sdpMid === null || (typeof c.sdpMid === 'string' && c.sdpMid.length <= 256))
        || !(c.sdpMLineIndex === null || (Number.isInteger(c.sdpMLineIndex)
            && c.sdpMLineIndex >= 0 && c.sdpMLineIndex <= 65535))
        || !(c.usernameFragment === null || (typeof c.usernameFragment === 'string'
            && c.usernameFragment.length <= 256))
        || (c.sdpMid === null && c.sdpMLineIndex === null)) return null;
    return { type: 'ice', candidate: { ...c } };
}

export class MeshTransport {
    constructor({ RTCPeerConnection = globalThis.RTCPeerConnection,
        sendSignal, onFrame, onStatus = () => {}, maxPeers = 4,
        negotiationTimeoutMs = 15000 } = {}) {
        if (typeof sendSignal !== 'function' || typeof onFrame !== 'function'
            || typeof onStatus !== 'function' || !Number.isInteger(maxPeers)
            || maxPeers < 1 || maxPeers > 8 || !Number.isInteger(negotiationTimeoutMs)
            || negotiationTimeoutMs < 100 || negotiationTimeoutMs > 60000) {
            throw new TypeError('Invalid mesh configuration');
        }
        this.RTC = RTCPeerConnection;
        this.sendSignal = sendSignal;
        this.onFrame = onFrame;
        this.onStatus = onStatus;
        this.maxPeers = maxPeers;
        this.timeoutMs = negotiationTimeoutMs;
        this.peerId = null;
        this.roster = new Set();
        this.peers = new Map();
    }

    setIdentity(peerId, peers = []) {
        if (typeof peerId !== 'string' || !ID.test(peerId) || !validRoster(peers)) return false;
        if (peerId !== this.peerId) this.disconnect();
        this.peerId = peerId;
        return this.updatePeers(peers);
    }

    updatePeers(peers) {
        if (!this.peerId || !validRoster(peers)) return false;
        this.roster = new Set(peers.filter(peer => peer !== this.peerId));
        for (const [id, entry] of this.peers) {
            if (!this.roster.has(id)) this._close(id, entry, 'roster-removed');
        }
        if (typeof this.RTC !== 'function') return true;
        for (const id of [...this.roster].sort()) {
            if (this.peerId < id && !this.peers.has(id) && this.peers.size < this.maxPeers) {
                const entry = this._create(id, true);
                if (entry) this._enqueue(id, entry, async () => {
                    const offer = await entry.pc.createOffer();
                    if (!this._current(id, entry)) return;
                    await entry.pc.setLocalDescription(offer);
                    if (!this._current(id, entry)) return;
                    entry.offered = true;
                    await this._signal(id, entry, { type: 'offer', sdp: entry.pc.localDescription.sdp });
                });
            }
        }
        return true;
    }

    async receiveSignal(from, value) {
        const signal = parseMeshSignal(value);
        if (!signal) { this.onStatus('signal-rejected-invalid'); return false; }
        if (!this.peerId || !this.roster.has(from) || typeof this.RTC !== 'function') {
            this.onStatus(`signal-rejected-${signal.type}-unavailable-peer`);
            return false;
        }
        let entry = this.peers.get(from);
        if (!entry) {
            // A candidate is never allowed to allocate a connection.
            if (signal.type !== 'offer' || from >= this.peerId || this.peers.size >= this.maxPeers) {
                this.onStatus(`signal-rejected-${signal.type}-no-connection`);
                return false;
            }
            entry = this._create(from, false);
            if (!entry) return false;
        }
        if ((signal.type === 'offer' && (entry.initiator || entry.descriptionReceived))
            || (signal.type === 'answer' && (!entry.initiator || entry.descriptionReceived))
            || (signal.type === 'ice' && entry.receivedIce >= MAX_ICE)) {
            this._diagnostic(entry, `signal-rejected-${signal.type}-state-or-limit`);
            return false;
        }
        this._diagnostic(entry, `signal-received-${signal.type}`);
        if (signal.type !== 'ice') entry.descriptionReceived = true;
        else entry.receivedIce++;
        return this._enqueue(from, entry, async () => {
            if (signal.type === 'ice') {
                if (entry.pc.remoteDescription) {
                    await entry.pc.addIceCandidate(signal.candidate);
                    if (this._current(from, entry)) this._diagnostic(entry, 'signal-applied-ice');
                }
                else entry.ice.push(signal.candidate);
                return;
            }
            if (signal.type === 'answer' && !entry.offered) throw new Error('Unexpected answer');
            await entry.pc.setRemoteDescription(signal);
            if (!this._current(from, entry)) return;
            this._diagnostic(entry, `signal-applied-${signal.type}`);
            for (const candidate of entry.ice.splice(0)) {
                await entry.pc.addIceCandidate(candidate);
                if (!this._current(from, entry)) return;
                this._diagnostic(entry, 'signal-applied-ice');
            }
            if (signal.type === 'offer') {
                const answer = await entry.pc.createAnswer();
                if (!this._current(from, entry)) return;
                await entry.pc.setLocalDescription(answer);
                if (!this._current(from, entry)) return;
                await this._signal(from, entry, { type: 'answer', sdp: entry.pc.localDescription.sdp });
            }
        });
    }

    /** Returns successful direct sends; zero also covers unsupported RTC. */
    broadcast(frame) {
        const size = frameSize(frame);
        if (size > MESH_MAX_FRAME_BYTES) return 0;
        let sent = 0;
        for (const [id, entry] of this.peers) {
            const channel = entry.channel;
            if (!channel || channel.readyState !== 'open'
                || channel.bufferedAmount + size > MAX_BUFFERED_BYTES) continue;
            try { channel.send(frame); sent++; }
            catch { this._close(id, entry, 'send-failed'); }
        }
        return sent;
    }

    disconnect() {
        for (const [id, entry] of this.peers) this._close(id, entry, 'disconnected');
        this.roster.clear();
        this.peerId = null;
    }

    _current(id, entry) { return this.peers.get(id) === entry; }

    _create(id, initiator) {
        let pc;
        try { pc = new this.RTC({ iceServers: [] }); }
        catch { this.onStatus('unavailable'); return null; }
        const entry = { pc, initiator, channel: null, ice: [], receivedIce: 0,
            sentIce: 0, pending: 0, descriptionReceived: false, offered: false,
            chain: Promise.resolve(), timer: null, diagnostics: new Set() };
        this.peers.set(id, entry);
        this._diagnostic(entry, initiator ? 'negotiation-initiator' : 'negotiation-receiver');
        entry.timer = setTimeout(() => {
            if (!this._current(id, entry)) return;
            // Request the browser snapshot before close, but never delay cleanup.
            this._reportTimeoutStats(entry);
            this._close(id, entry, 'negotiation-timeout');
        }, this.timeoutMs);
        pc.onconnectionstatechange = () => {
            if (!this._current(id, entry)) return;
            if (['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                this._diagnostic(entry, `rtc-${pc.connectionState}`);
            }
            if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
                this._close(id, entry, 'connection-ended');
            }
        };
        pc.oniceconnectionstatechange = () => {
            if (this._current(id, entry) && ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                this._diagnostic(entry, `ice-${pc.iceConnectionState}`);
            }
        };
        pc.onicecandidate = event => {
            if (!this._current(id, entry)) return;
            if (!event.candidate) {
                this._diagnostic(entry, entry.sentIce ? 'ice-gathering-complete' : 'ice-gathering-complete-no-candidates');
                return;
            }
            if (entry.sentIce >= MAX_ICE) return;
            const c = event.candidate;
            const signal = parseMeshSignal({ type: 'ice', candidate: {
                candidate: c.candidate, sdpMid: c.sdpMid ?? null,
                sdpMLineIndex: c.sdpMLineIndex ?? null, usernameFragment: c.usernameFragment ?? null,
            } });
            if (signal) {
                entry.sentIce++;
                // Keep descriptions before ICE, including synchronous test adapters.
                this._enqueue(id, entry, () => this._signal(id, entry, signal));
            } else this._diagnostic(entry, 'local-ice-candidate-rejected');
        };
        pc.ondatachannel = event => {
            if (!this._current(id, entry) || entry.initiator || entry.channel
                || event.channel.label !== 'hp2p-mesh-v1') {
                event.channel.close();
                this._diagnostic(entry, 'datachannel-rejected');
                return;
            }
            this._diagnostic(entry, 'datachannel-received');
            this._attachChannel(id, entry, event.channel);
        };
        if (initiator) {
            try { this._attachChannel(id, entry, pc.createDataChannel('hp2p-mesh-v1', { ordered: true })); }
            catch { this._close(id, entry, 'channel-failed'); return null; }
        }
        return entry;
    }

    _attachChannel(id, entry, channel) {
        entry.channel = channel;
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
            if (!this._current(id, entry)) return;
            clearTimeout(entry.timer);
            this.onStatus('connected');
        };
        channel.onmessage = event => {
            if (!this._current(id, entry)) return;
            if (frameSize(event.data) > MESH_MAX_FRAME_BYTES) {
                this._close(id, entry, 'invalid-frame');
                return;
            }
            this.onFrame(event.data, id);
        };
        channel.onclose = () => this._close(id, entry, 'channel-closed');
        channel.onerror = () => this._close(id, entry, 'channel-failed');
    }

    async _signal(id, entry, signal) {
        if (!this._current(id, entry)) return;
        if (!parseMeshSignal(signal)) throw new Error('Invalid local signal');
        if (await this.sendSignal({ type: 'mesh_signal', to: id, signal }) === false) {
            throw new Error('Signalling unavailable');
        }
        if (this._current(id, entry)) this._diagnostic(entry, `signal-sent-${signal.type}`);
    }

    // Fixed vocabulary only, once per connection: no SDP, candidates, IDs, IPs,
    // payloads or raw browser exceptions are sent to the observer.
    _diagnostic(entry, status) {
        if (entry.diagnostics.has(status)) return;
        entry.diagnostics.add(status);
        this.onStatus(status);
    }

    async _reportTimeoutStats(entry) {
        try {
            if (typeof entry.pc.getStats !== 'function') {
                this._diagnostic(entry, 'ice-timeout-stats-unavailable');
                return;
            }
            const report = await entry.pc.getStats();
            const counts = { local: 0, remote: 0, pairs: 0, frozen: 0,
                waiting: 0, 'in-progress': 0, failed: 0, succeeded: 0, other: 0 };
            const increment = name => { counts[name] = Math.min(counts[name] + 1, 4096); };
            report.forEach(stat => {
                if (stat.type === 'local-candidate') increment('local');
                else if (stat.type === 'remote-candidate') increment('remote');
                else if (stat.type === 'candidate-pair') {
                    increment('pairs');
                    increment(['frozen', 'waiting', 'in-progress', 'failed', 'succeeded'].includes(stat.state)
                        ? stat.state : 'other');
                }
            });
            // Only fixed labels and capped numeric counts leave this function.
            // Never log RTCStatsReport itself: it contains addresses and IDs.
            this._diagnostic(entry, 'ice-timeout-stats ' + Object.entries(counts)
                .map(([name, count]) => `${name}=${count}`).join(' '));
        } catch {
            this._diagnostic(entry, 'ice-timeout-stats-unavailable');
        }
    }

    _enqueue(id, entry, operation) {
        if (entry.pending >= MAX_PENDING) return Promise.resolve(false);
        entry.pending++;
        const result = entry.chain.then(async () => {
            if (!this._current(id, entry)) return false;
            await operation();
            return this._current(id, entry);
        }).catch(() => {
            this._close(id, entry, 'negotiation-failed');
            return false;
        }).finally(() => { entry.pending--; });
        entry.chain = result;
        return result;
    }

    _close(id, entry, reason) {
        if (!this._current(id, entry)) return;
        this.peers.delete(id);
        clearTimeout(entry.timer);
        entry.ice.length = 0;
        entry.pc.onicecandidate = entry.pc.ondatachannel = entry.pc.onconnectionstatechange = entry.pc.oniceconnectionstatechange = null;
        if (entry.channel) {
            entry.channel.onopen = entry.channel.onmessage = entry.channel.onclose = entry.channel.onerror = null;
            entry.channel.close();
        }
        entry.pc.close();
        this.onStatus(reason);
    }
}
