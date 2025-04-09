// === js/network.js ===
console.log("Network module loaded");

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
const REBROADCAST_PROB_INITIAL = 0.6; // Example probability
const REBROADCAST_PROB_SEEN = 0.05;  // Example probability

// --- State ---
let peers = new Map(); // { url: { ws: WebSocket | null, status: string, reconnectTimer: number | null } }
let seenMessageIDs = new Map(); // { messageId: timestamp }
let peerManagementTimer = null;
let cleanupTimer = null;

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

function connectToNode(url) {
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
        if (existingPeer?.reconnectTimer) clearTimeout(existingPeer.reconnectTimer);
        peers.set(url, { ws: ws, status: 'connecting', reconnectTimer: null });

        ws.onopen = () => handleOpen(url);
        ws.onmessage = (event) => handleMessage(url, event);
        ws.onerror = (errorEvent) => handleError(url, errorEvent); // Pass the event
        ws.onclose = (event) => handleClose(url, event);

    } catch (e) {
        console.error("Network: Error creating WebSocket for " + url + ":", e);
         peers.set(url, { ws: null, status: 'error', reconnectTimer: null });
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
        if (peer.reconnectTimer) { clearTimeout(peer.reconnectTimer); peer.reconnectTimer = null; }
        updateStatusCallback('Connected to node: ' + url, 'success');
        // TODO: Send client info/capabilities/subscriptions?
    }
    updateOverallStatus();
}

function handleMessage(url, event) {
    const rawData = event.data;
    let messagePackage;
    try {
        messagePackage = JSON.parse(rawData);
        // Basic validation of incoming package structure
        if (!messagePackage || typeof messagePackage !== 'object' || !messagePackage.id || !messagePackage.from?.pubKey || !messagePackage.sig || !messagePackage.timestamp) {
           console.warn("Network: Received malformed message from " + url, messagePackage);
           return;
        }
    } catch (e) {
        console.error("Network: Failed to parse incoming JSON from " + url + ":", e);
        return;
    }

    // --- Deduplication ---
    const now = Date.now();
    if (seenMessageIDs.has(messagePackage.id)) {
        // TODO: Apply low probability rebroadcast?
        return; // Already seen
    }
    seenMessageIDs.set(messagePackage.id, now);

    // --- Pass to Upper Layer for Processing ---
    handleIncomingMsgCallback(url, messagePackage); // Let messages.js handle verification/decryption

    // --- Trigger Rebroadcasting ---
    rebroadcastMessage(messagePackage, url);
}

function handleError(url, errorEvent) {
    // Log the actual error if available (errorEvent might just be Event)
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
        return; // Peer removed deliberately
    }
    if (peer) peer.ws = null;

    // Avoid noisy status updates for clean closures triggered by user/app logic elsewhere potentially
    if (code !== 1000 && code !== 1001) { // 1000 = Normal, 1001 = Going Away
        updateStatusCallback('Disconnected from node: ' + url, 'warning');
        scheduleReconnect(url); // Only schedule reconnect on unclean closures
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

// Send JS object to a specific open peer
function sendMessage(peerUrl, messageObject) {
    const peer = peers.get(peerUrl);
    if (peer && peer.status === 'open' && peer.ws) {
        try {
            peer.ws.send(JSON.stringify(messageObject));
        } catch (e) {
            console.error("Network: Error sending message to " + peerUrl + ":", e);
            handleError(peerUrl, e);
        }
    }
}

// --- Periodic Tasks ---

function managePeers() {
    const config = getConfigurationCallback();
    const nodes = config?.nodes || [];
    const originNodeUrl = getOriginWsUrl();

    // TODO: Implement MAX_PEERS enforcement and stochastic sampling

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
    let removedCount = 0;
    for (const [id, timestamp] of seenMessageIDs.entries()) {
        if (now - timestamp > SEEN_MSG_TTL) {
            seenMessageIDs.delete(id);
            removedCount++;
        }
    }
    // if (removedCount > 0) { console.log(`Network: Cleaned up ${removedCount} old message IDs.`); }
}

// --- Exported Functions ---

export function getOriginWsUrl() {
    if (!window || !window.location || !window.location.origin || window.location.origin === 'null') {
        console.error("Network: Cannot determine origin URL."); return null;
    }
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = '/ws'; // ASSUMPTION
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

export function broadcastMessage(messageObject) {
    // console.log(`Network: Broadcasting message ${messageObject.id}`);
    let sentCount = 0;
    peers.forEach((peer, url) => {
        if (peer.status === 'open') {
            sendMessage(url, messageObject);
            sentCount++;
        }
    });
    // console.log(`Network: Broadcast attempt to ${sentCount} open peers.`);
}

export function rebroadcastMessage(messageObject, originUrl) {
    // TODO: Implement HermesP2P gossip logic
    if (Math.random() > REBROADCAST_PROB_INITIAL) return;

    // console.log(`Network: Rebroadcasting ${messageObject.id} (from ${originUrl})`);
    let rebroadcastCount = 0;
    peers.forEach((peer, url) => {
        if (url !== originUrl && peer.status === 'open') {
            sendMessage(url, messageObject);
            rebroadcastCount++;
        }
    });
    // console.log(`Network: Rebroadcast attempt to ${rebroadcastCount} other peers.`);
}