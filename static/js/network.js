// === js/network.js ===
console.log("Network module loaded");

import { verifySignature } from './crypto.js';
import { unpadMessage } from './padding.js';
import { isExpired, getRebroadcastProbability } from './ttl.js';
import { isProtocolMessage, handlePeerExchangeRequest, handlePeerExchangeResponse,
         createPeerExchangeResponse, KnownPeersCache } from './discovery.js';

// Callbacks to be set by initializeNetwork
let handleIncomingMsgCallback = (url, msg) => console.warn("Network: Incoming message handler not set", url, msg);
let updateStatusCallback = (msg, type) => console.warn("Network: Status update handler not set", msg, type);
let getConfigurationCallback = () => { console.warn("Network: Config getter not set"); return null; };

// --- Constants ---
const MAX_PEERS = 5;
const PEER_RECONNECT_DELAY = 5000; // ms
const PEER_MANAGEMENT_INTERVAL = 30 * 1000; // ms
const SEEN_MSG_TTL = 2 * 60 * 1000; // 2 minutes in ms
const SEEN_MSG_CLEANUP_INTERVAL = 30 * 1000; // ms

// --- State ---
let peers = new Map(); // { url: { ws, status, reconnectTimer, connectedAt } }
let seenMessageIDs = new Map(); // { messageId: timestamp }
let peerManagementTimer = null;
let cleanupTimer = null;
const knownPeersCache = new KnownPeersCache(50);

// --- Peer Accessors (new exports for discovery) ---

/** Returns the number of currently connected (open) peers. */
export function getConnectedPeerCount() {
    let count = 0;
    peers.forEach(p => { if (p.status === 'open') count++; });
    return count;
}

/** Returns an array of URLs of currently connected peers. */
export function getConnectedPeerUrls() {
    const urls = [];
    peers.forEach((p, url) => { if (p.status === 'open') urls.push(url); });
    return urls;
}

/** Returns connected peer info with connectedAt timestamps for rotation. */
export function getConnectedPeerInfo() {
    const info = [];
    peers.forEach((p, url) => {
        if (p.status === 'open') {
            info.push({ url, connectedAt: p.connectedAt || 0 });
        }
    });
    return info;
}

// --- Internal Functions ---

function updateOverallStatus() {
    let openCount = 0;
    let connectingCount = 0;
    let errorCount = 0;
    peers.forEach(p => {
        if (p.status === 'open') openCount++;
        else if (p.status === 'connecting') connectingCount++;
        else if (p.status === 'error') errorCount++;
    });
    let statusMsg = 'Nodes: ' + openCount + ' connected / ' + peers.size + ' tracked';
    if (connectingCount > 0) statusMsg += ' (' + connectingCount + ' connecting...)';
    if (errorCount > 0) statusMsg += ' (' + errorCount + ' errors)';

    let statusType = 'info';
    if (openCount > 0 && errorCount === 0) statusType = 'success';
    else if (openCount === 0 && errorCount > 0) statusType = 'danger';
    else if (errorCount > 0 || openCount === 0) statusType = 'warning';

    updateStatusCallback(statusMsg, statusType);
}

export function connectToNode(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('ws')) {
        console.warn("Network: connectToNode called with invalid URL:", url);
        return;
    }
    const existingPeer = peers.get(url);
    if (existingPeer && existingPeer.status !== 'disconnected' && existingPeer.status !== 'error') {
        return;
    }
    console.log("Network: Attempting to connect to " + url + "...");
    updateStatusCallback('Connecting to ' + url + '...', 'info');

    try {
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer'; // Receive binary frames as ArrayBuffer
        if (existingPeer?.reconnectTimer) clearTimeout(existingPeer.reconnectTimer);
        peers.set(url, { ws: ws, status: 'connecting', reconnectTimer: null, connectedAt: null });

        ws.onopen = () => handleOpen(url);
        ws.onmessage = (event) => handleMessage(url, event);
        ws.onerror = (errorEvent) => handleError(url, errorEvent);
        ws.onclose = (event) => handleClose(url, event);

    } catch (e) {
        console.error("Network: Error creating WebSocket for " + url + ":", e);
         peers.set(url, { ws: null, status: 'error', reconnectTimer: null, connectedAt: null });
         updateStatusCallback('Failed connection attempt to ' + url + '.', 'danger');
         scheduleReconnect(url);
         updateOverallStatus();
    }
}

function handleOpen(url) {
    console.log("Network: WebSocket connection opened: " + url);
    const peer = peers.get(url);
    if (peer) {
        peer.status = 'open';
        peer.connectedAt = Date.now();
        if (peer.reconnectTimer) { clearTimeout(peer.reconnectTimer); peer.reconnectTimer = null; }
        updateStatusCallback('Connected to node: ' + url, 'success');
    }
    // Add to known peers cache
    knownPeersCache.add(url);
    updateOverallStatus();
}

function handleMessage(url, event) {
    const rawData = event.data;

    // --- Text frame: check for protocol messages (peer exchange) ---
    if (typeof rawData === 'string') {
        const protoResult = isProtocolMessage(rawData);
        if (protoResult.isProtocol) {
            handleProtocolMsg(url, protoResult.parsed);
            return;
        }
        // Legacy text message (non-padded) — try to process as JSON
        handleLegacyTextMessage(url, rawData);
        return;
    }

    // --- Binary frame: padded user message ---
    if (rawData instanceof ArrayBuffer) {
        handleBinaryFrame(url, rawData);
        return;
    }

    console.warn("Network: Unknown frame type from " + url);
}

/** Handle peer exchange protocol messages. */
function handleProtocolMsg(url, parsed) {
    const config = getConfigurationCallback();
    if (parsed.type === 'peer_exchange_request') {
        const peerUrls = handlePeerExchangeRequest(parsed, getConnectedPeerUrls(), url);
        const response = createPeerExchangeResponse(peerUrls, config?.user?.pubKey || '');
        sendRawText(url, JSON.stringify(response));
    } else if (parsed.type === 'peer_exchange_response') {
        handlePeerExchangeResponse(parsed, knownPeersCache);
    }
}

/** Handle padded binary frames through the full receive pipeline. */
function handleBinaryFrame(url, rawArrayBuffer) {
    try {
        // Unpad
        const paddedBytes = new Uint8Array(rawArrayBuffer);
        const unpadded = unpadMessage(paddedBytes);

        // Deserialize
        const jsonStr = new TextDecoder().decode(unpadded);
        const messagePackage = JSON.parse(jsonStr);

        if (!messagePackage || typeof messagePackage !== 'object' || !messagePackage.id || !messagePackage.timestamp) {
            console.warn("Network: Malformed message structure from " + url);
            return;
        }

        // TTL check (cheapest check first)
        if (isExpired(messagePackage)) {
            console.warn("Network: Expired message dropped:", messagePackage.id);
            return;
        }

        // Deduplication
        if (seenMessageIDs.has(messagePackage.id)) {
            return;
        }
        seenMessageIDs.set(messagePackage.id, Date.now());

        // Signature verification (only if pubKey present — channel messages skip this)
        if (messagePackage.from?.pubKey) {
            if (!messagePackage.signature) {
                console.warn("Network: Message has pubKey but no signature:", messagePackage.id);
                return;
            }
            const messageContent = typeof messagePackage.message === 'string'
                ? messagePackage.message
                : JSON.stringify(messagePackage.message);
            if (!verifySignature(messageContent, messagePackage.signature, messagePackage.from.pubKey)) {
                console.warn("Network: Signature verification failed for message:", messagePackage.id);
                return;
            }
        }

        // Pass to upper layer
        handleIncomingMsgCallback(url, messagePackage);

        // Rebroadcast with TTL-decayed probability, forwarding original raw binary
        const prob = getRebroadcastProbability(messagePackage);
        if (Math.random() < prob) {
            rebroadcastRaw(rawArrayBuffer, url);
        }
    } catch (e) {
        console.error("Network: Error processing binary frame from " + url + ":", e);
    }
}

/** Handle legacy (non-padded) text messages for backward compatibility. */
function handleLegacyTextMessage(url, rawData) {
    let messagePackage;
    try {
        messagePackage = JSON.parse(rawData);
        if (!messagePackage || typeof messagePackage !== 'object' || !messagePackage.id || !messagePackage.timestamp) {
           console.warn("Network: Received malformed message from " + url);
           return;
        }
    } catch (e) {
        console.error("Network: Failed to parse incoming JSON from " + url + ":", e);
        return;
    }

    // TTL check
    if (messagePackage.ttl && isExpired(messagePackage)) {
        console.warn("Network: Expired message dropped:", messagePackage.id);
        return;
    }

    // Deduplication
    if (seenMessageIDs.has(messagePackage.id)) {
        return;
    }
    seenMessageIDs.set(messagePackage.id, Date.now());

    // Signature verification
    if (messagePackage.from?.pubKey && messagePackage.signature) {
        const messageContent = typeof messagePackage.message === 'string'
            ? messagePackage.message
            : JSON.stringify(messagePackage.message);
        if (!verifySignature(messageContent, messagePackage.signature, messagePackage.from.pubKey)) {
            console.warn("Network: Signature verification failed for message:", messagePackage.id);
            return;
        }
    }

    handleIncomingMsgCallback(url, messagePackage);
    rebroadcastMessage(messagePackage, url);
}

function handleError(url, errorEvent) {
    console.error("Network: WebSocket error on " + url + ":", errorEvent);
    const peer = peers.get(url);
    if (peer) {
        peer.status = 'error';
        if (peer.ws) {
            peer.ws.onopen = null; peer.ws.onmessage = null; peer.ws.onerror = null; peer.ws.onclose = null;
            try { peer.ws.close(); } catch (e) {/* Ignore */}
        }
        peer.ws = null;
    }
    updateStatusCallback('Error with node: ' + url, 'danger');
    scheduleReconnect(url);
    updateOverallStatus();
}

function handleClose(url, event) {
    const code = event?.code;
    const reason = event?.reason;
    console.log("Network: WebSocket connection closed: " + url + " (Code: " + code + ", Reason: " + (reason || 'N/A') + ")");
    const peer = peers.get(url);
    if (peer && peer.status !== 'error') {
        peer.status = 'disconnected';
    } else if (!peer) {
        return;
    }
    if (peer) peer.ws = null;

    if (code !== 1000 && code !== 1001) {
        updateStatusCallback('Disconnected from node: ' + url, 'warning');
        scheduleReconnect(url);
    } else {
        updateStatusCallback('Connection closed to node: ' + url, 'info');
    }
    updateOverallStatus();
}

function scheduleReconnect(url) {
    const peer = peers.get(url);
    if (peer && !peer.reconnectTimer) {
        console.log("Network: Scheduling reconnect for " + url + " in " + (PEER_RECONNECT_DELAY / 1000) + "s...");
        peer.reconnectTimer = setTimeout(() => {
             if (peers.has(url)) {
                 peers.get(url).reconnectTimer = null;
                 console.log("Network: Attempting scheduled reconnect to " + url + "...");
                 connectToNode(url);
             }
         }, PEER_RECONNECT_DELAY);
    }
}

/** Send a raw string (text frame) to a specific peer. */
function sendRawText(peerUrl, text) {
    const peer = peers.get(peerUrl);
    if (peer && peer.status === 'open' && peer.ws) {
        try { peer.ws.send(text); } catch (e) {
            console.error("Network: Error sending to " + peerUrl + ":", e);
        }
    }
}

/** Send any frame (string or binary) to a specific peer. */
function sendFrame(peerUrl, frame) {
    const peer = peers.get(peerUrl);
    if (peer && peer.status === 'open' && peer.ws) {
        try { peer.ws.send(frame); } catch (e) {
            console.error("Network: Error sending to " + peerUrl + ":", e);
            handleError(peerUrl, e);
        }
    }
}

// --- Periodic Tasks ---

function managePeers() {
    const config = getConfigurationCallback();
    const nodes = config?.nodes || [];
    const originNodeUrl = getOriginWsUrl();

    const targetNodes = new Set();
    if(originNodeUrl) targetNodes.add(originNodeUrl);
    nodes.forEach(url => { if(url) targetNodes.add(url); });

    targetNodes.forEach(url => {
        const peer = peers.get(url);
        if (!peer || peer.status === 'disconnected' || peer.status === 'error') {
            if (!peer?.reconnectTimer) {
                connectToNode(url);
            }
        }
    });
    updateOverallStatus();
}

function cleanupSeenMessages() {
    const now = Date.now();
    for (const [id, timestamp] of seenMessageIDs.entries()) {
        if (now - timestamp > SEEN_MSG_TTL) {
            seenMessageIDs.delete(id);
        }
    }
}

// --- Exported Functions ---

export function getOriginWsUrl() {
    if (!window || !window.location || !window.location.origin || window.location.origin === 'null') {
        console.error("Network: Cannot determine origin URL."); return null;
    }
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = '/ws';
    return wsProtocol + '//' + loc.host + wsPath;
}

export function initializeNetwork(messageHandler, statusHandler, configGetter) {
    console.log("Network: Initializing...");
    if (!messageHandler || !statusHandler || !configGetter) {
        throw new Error("Network: messageHandler, statusHandler, and configGetter callbacks are required.");
    }
    handleIncomingMsgCallback = messageHandler;
    updateStatusCallback = statusHandler;
    getConfigurationCallback = configGetter;

    // Clear previous state
    if (peerManagementTimer) clearInterval(peerManagementTimer);
    if (cleanupTimer) clearInterval(cleanupTimer);
    peers.forEach(peer => {
        if (peer.reconnectTimer) clearTimeout(peer.reconnectTimer);
        if (peer.ws) {
             peer.ws.onopen = null; peer.ws.onmessage = null; peer.ws.onerror = null; peer.ws.onclose = null;
             try { peer.ws.close(); } catch(e) {}
        }
    });
    peers.clear();
    seenMessageIDs.clear();

    // Get initial nodes (origin + config)
    const config = getConfigurationCallback();
    const originNodeUrl = getOriginWsUrl();
    const configNodes = config?.nodes || [];
    const nodesToConnect = [];
    const uniqueUrls = new Set();
    if (originNodeUrl) { nodesToConnect.push(originNodeUrl); uniqueUrls.add(originNodeUrl); }
    configNodes.forEach(url => { if (url && !uniqueUrls.has(url)) { nodesToConnect.push(url); uniqueUrls.add(url); } });

    console.log("Network: Attempting initial connections to:", nodesToConnect);
    updateStatusCallback('Initializing connections to ' + nodesToConnect.length + ' node(s)...', 'info');

    nodesToConnect.forEach(url => connectToNode(url));

    // Start periodic tasks
    peerManagementTimer = setInterval(managePeers, PEER_MANAGEMENT_INTERVAL);
    cleanupTimer = setInterval(cleanupSeenMessages, SEEN_MSG_CLEANUP_INTERVAL);

    console.log("Network: Initialization complete.");
}

/**
 * Broadcasts a frame (string or binary) to all connected peers.
 * Accepts JS objects (JSON-stringified), strings, Uint8Array, or ArrayBuffer.
 */
export function broadcastMessage(frame) {
    peers.forEach((peer, url) => {
        if (peer.status === 'open') {
            sendFrame(url, frame);
        }
    });
}

/** Rebroadcast original raw binary frame to all peers except the origin. */
function rebroadcastRaw(rawArrayBuffer, originUrl) {
    peers.forEach((peer, url) => {
        if (url !== originUrl && peer.status === 'open') {
            sendFrame(url, rawArrayBuffer);
        }
    });
}

/** Legacy rebroadcast for text messages. */
export function rebroadcastMessage(messageObject, originUrl) {
    const prob = (messageObject.ttl)
        ? getRebroadcastProbability(messageObject)
        : 0.6;
    if (Math.random() > prob) return;

    peers.forEach((peer, url) => {
        if (url !== originUrl && peer.status === 'open') {
            sendFrame(url, JSON.stringify(messageObject));
        }
    });
}

/** Disconnect a peer by URL (for rotation). */
export function disconnectPeer(url) {
    const peer = peers.get(url);
    if (peer && peer.ws) {
        peer.ws.onopen = null; peer.ws.onmessage = null; peer.ws.onerror = null; peer.ws.onclose = null;
        try { peer.ws.close(1000, 'rotation'); } catch(e) {}
        peer.ws = null;
        peer.status = 'disconnected';
    }
    updateOverallStatus();
}

/** Send raw text to a specific peer (for discovery protocol). */
export function sendToPeer(url, data) {
    sendRawText(url, data);
}

/** Broadcast raw text to all peers (for discovery protocol). */
export function broadcastRaw(data) {
    peers.forEach((peer, url) => {
        if (peer.status === 'open') {
            sendRawText(url, data);
        }
    });
}
