/**
 * Peer Discovery Module
 *
 * Bootstrap nodes, peer exchange protocol, self-healing when peers drop
 * below MIN_PEERS, and periodic rotation to prevent clique formation.
 */

export const MIN_PEERS = 3;
export const MAX_PEERS = 5;
export const KNOWN_PEERS_MAX = 50;
export const ROTATION_INTERVAL = 300000; // 5 minutes
export const DISCOVERY_INTERVAL = 30000; // 30 seconds

/**
 * Bounded LRU cache of known peer URLs.
 */
export class KnownPeersCache {
  constructor(maxSize = 50) {
    this.maxSize = (typeof maxSize === 'number' && maxSize > 0) ? maxSize : 50;
    this._map = new Map();
  }

  /** @param {string} url @param {{lastLatency?: number|null}} metadata */
  add(url, metadata = {}) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('url must be a non-empty string');
    }

    if (this._map.has(url)) {
      const existing = this._map.get(url);
      existing.lastSeen = Date.now();
      if (metadata.lastLatency !== undefined) {
        existing.lastLatency = metadata.lastLatency ?? null;
      }
      return;
    }

    // Evict oldest if at capacity
    if (this._map.size >= this.maxSize) {
      let oldestUrl = null;
      let oldestLastSeen = Infinity;
      for (const [key, entry] of this._map) {
        if (entry.lastSeen < oldestLastSeen) {
          oldestLastSeen = entry.lastSeen;
          oldestUrl = key;
        }
      }
      if (oldestUrl !== null) {
        this._map.delete(oldestUrl);
      }
    }

    this._map.set(url, {
      url,
      lastSeen: Date.now(),
      lastLatency: metadata.lastLatency !== undefined ? (metadata.lastLatency ?? null) : null,
    });
  }

  /** @param {string} url @returns {{url: string, lastSeen: number, lastLatency: number|null}|undefined} */
  get(url) {
    return this._map.get(url);
  }

  /** @returns {Array<{url: string, lastSeen: number, lastLatency: number|null}>} */
  getAll() {
    return Array.from(this._map.values());
  }

  /** @param {string} url */
  remove(url) {
    this._map.delete(url);
  }

  /** @returns {number} */
  size() {
    return this._map.size;
  }
}

/**
 * Returns bootstrap WebSocket URLs from the page origin.
 * @param {string} [origin] - Override origin (defaults to window.location.origin).
 * @returns {string[]}
 */
export function getBootstrapNodes(origin) {
  let effectiveOrigin = origin;
  if (effectiveOrigin === undefined || effectiveOrigin === null) {
    if (window && window.location) {
      effectiveOrigin = window.location.origin;
    } else {
      throw new TypeError('Cannot determine origin: no origin parameter and window.location is unavailable');
    }
  }

  let wsUrl;
  if (effectiveOrigin.startsWith('https://')) {
    wsUrl = 'wss://' + effectiveOrigin.slice('https://'.length) + '/ws';
  } else if (effectiveOrigin.startsWith('http://')) {
    wsUrl = 'ws://' + effectiveOrigin.slice('http://'.length) + '/ws';
  } else {
    wsUrl = 'wss://' + effectiveOrigin + '/ws';
  }

  return [wsUrl];
}

/**
 * Creates a peer exchange request message.
 * @param {string} pubKey - Sender's base64-encoded public key.
 * @returns {{type: string, from: {pubKey: string}, timestamp: number}}
 */
export function createPeerExchangeRequest(pubKey) {
  return {
    type: 'peer_exchange_request',
    from: { pubKey },
    timestamp: Date.now(),
  };
}

/**
 * Creates a peer exchange response message.
 * @param {string[]} peerUrls - Up to 5 connected peer URLs.
 * @param {string} pubKey - Sender's base64-encoded public key.
 * @returns {{type: string, peers: string[], from: {pubKey: string}, timestamp: number}}
 */
export function createPeerExchangeResponse(peerUrls, pubKey) {
  return {
    type: 'peer_exchange_response',
    peers: peerUrls,
    from: { pubKey },
    timestamp: Date.now(),
  };
}

/**
 * Handles an incoming peer exchange request.
 * Returns up to 5 connected peer URLs excluding the requester.
 * @param {Object} message - The peer exchange request message.
 * @param {string[]} connectedPeerUrls - Currently connected peer URLs.
 * @param {string} requesterUrl - URL of the requesting peer.
 * @returns {string[]}
 */
export function handlePeerExchangeRequest(message, connectedPeerUrls, requesterUrl) {
  if (!message || typeof message !== 'object' || !message.type) {
    throw new Error('Invalid message: must be a non-null object with a type field');
  }
  if (!Array.isArray(connectedPeerUrls)) {
    throw new Error('connectedPeerUrls must be an array');
  }
  return connectedPeerUrls.filter(url => url !== requesterUrl).slice(0, 5);
}

/**
 * Handles an incoming peer exchange response by adding peers to the cache.
 * @param {Object} message - The peer exchange response with a peers array.
 * @param {KnownPeersCache} cache - The known peers cache.
 */
export function handlePeerExchangeResponse(message, cache) {
  if (!message || typeof message !== 'object' || !Array.isArray(message.peers)) {
    throw new Error('Invalid message: must be an object with a peers array');
  }
  if (!cache || !(cache instanceof KnownPeersCache)) {
    throw new Error('Invalid cache: must be a KnownPeersCache instance');
  }
  for (const url of message.peers) {
    cache.add(url, { lastLatency: null });
  }
}

/**
 * Selects the longest-connected peer for rotation.
 * @param {{url: string, connectedAt: number}[]} connectedPeers
 * @returns {string|null} URL of peer to rotate, or null if empty.
 */
export function selectPeerForRotation(connectedPeers) {
  if (!Array.isArray(connectedPeers) || connectedPeers.length === 0) return null;
  let oldest = connectedPeers[0];
  for (let i = 1; i < connectedPeers.length; i++) {
    if (connectedPeers[i].connectedAt < oldest.connectedAt) {
      oldest = connectedPeers[i];
    }
  }
  return oldest.url;
}

/**
 * Selects a random peer from cache that is not already connected.
 * @param {KnownPeersCache} cache
 * @param {string[]} connectedUrls
 * @returns {string|null}
 */
export function selectPeerForConnection(cache, connectedUrls) {
  if (!cache || !(cache instanceof KnownPeersCache)) {
    throw new Error('Invalid cache: must be a KnownPeersCache instance');
  }
  const allPeers = cache.getAll();
  const connectedSet = new Set(connectedUrls);
  const eligible = allPeers.filter(entry => !connectedSet.has(entry.url));
  if (eligible.length === 0) return null;
  const randomArray = new Uint32Array(1);
  crypto.getRandomValues(randomArray);
  return eligible[randomArray[0] % eligible.length].url;
}

/**
 * Checks if raw WebSocket data is a peer exchange protocol message.
 * @param {*} data - Raw WebSocket event data.
 * @returns {{isProtocol: boolean, parsed: Object|null}}
 */
export function isProtocolMessage(data) {
  if (typeof data !== 'string') return { isProtocol: false, parsed: null };
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && typeof parsed.type === 'string' && parsed.type.startsWith('peer_exchange_')) {
      return { isProtocol: true, parsed };
    }
    return { isProtocol: false, parsed: null };
  } catch {
    return { isProtocol: false, parsed: null };
  }
}

/**
 * Starts periodic peer discovery and rotation timers.
 * @param {Object} networkApi - Must have getConnectedPeerCount, getConnectedPeerUrls,
 *   connectToPeer, disconnectPeer, sendToPeer, broadcastRaw functions.
 * @returns {Function} Cleanup function to stop timers.
 */
export function initializeDiscovery(networkApi) {
  if (!networkApi || typeof networkApi !== 'object') {
    throw new TypeError('networkApi must provide required functions');
  }
  const required = ['getConnectedPeerCount', 'getConnectedPeerUrls', 'getConnectedPeerInfo',
                     'connectToPeer', 'disconnectPeer', 'sendToPeer', 'broadcastRaw'];
  for (const method of required) {
    if (typeof networkApi[method] !== 'function') {
      throw new TypeError(`networkApi must provide ${method} function`);
    }
  }

  const cache = new KnownPeersCache(KNOWN_PEERS_MAX);

  let bootstrapNodes = [];
  try {
    bootstrapNodes = getBootstrapNodes();
  } catch {
    // No window.location (test environment)
  }

  const discoveryTimerId = setInterval(() => {
    const peerCount = networkApi.getConnectedPeerCount();
    if (peerCount < MIN_PEERS) {
      const connectedUrls = networkApi.getConnectedPeerUrls();

      // Send peer exchange requests to learn about new peers
      const pubKey = typeof networkApi.getPubKey === 'function' ? networkApi.getPubKey() : '';
      const request = createPeerExchangeRequest(pubKey);
      networkApi.broadcastRaw(JSON.stringify(request));

      // Attempt connection from cache or bootstrap
      const candidate = selectPeerForConnection(cache, connectedUrls);
      if (candidate) {
        networkApi.connectToPeer(candidate);
      } else {
        for (const node of bootstrapNodes) {
          if (!connectedUrls.includes(node)) {
            networkApi.connectToPeer(node);
            break;
          }
        }
      }
    }
  }, DISCOVERY_INTERVAL);

  const rotationTimerId = setInterval(() => {
    const connectedPeers = networkApi.getConnectedPeerInfo();
    if (connectedPeers.length < MAX_PEERS) return; // Only rotate at capacity

    const peerToDisconnect = selectPeerForRotation(connectedPeers);
    if (peerToDisconnect) {
      networkApi.disconnectPeer(peerToDisconnect);
      const connectedUrls = connectedPeers.map(p => p.url);
      const candidate = selectPeerForConnection(cache, connectedUrls);
      if (candidate) {
        networkApi.connectToPeer(candidate);
      }
    }
  }, ROTATION_INTERVAL);

  let cleaned = false;
  return () => {
    if (!cleaned) {
      clearInterval(discoveryTimerId);
      clearInterval(rotationTimerId);
      cleaned = true;
    }
  };
}
