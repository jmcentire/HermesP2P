/**
 * Tests for discovery.js gap fixes:
 *   Gap 3: peer_exchange_request sent during self-heal (below MIN_PEERS)
 *   Gap 4: Rotation uses real connectedAt via getConnectedPeerInfo
 *   Gap 5: Rotation gated on MAX_PEERS capacity
 *
 * Also includes comprehensive coverage of KnownPeersCache, helper functions,
 * protocol message handling, and bootstrap node resolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeDiscovery,
  KnownPeersCache,
  selectPeerForRotation,
  selectPeerForConnection,
  createPeerExchangeRequest,
  createPeerExchangeResponse,
  handlePeerExchangeRequest,
  handlePeerExchangeResponse,
  getBootstrapNodes,
  isProtocolMessage,
  MIN_PEERS,
  MAX_PEERS,
  KNOWN_PEERS_MAX,
  DISCOVERY_INTERVAL,
  ROTATION_INTERVAL,
} from '../static/js/discovery.js';

/** Creates a fully-mocked networkApi satisfying initializeDiscovery requirements. */
function createMockNetworkApi(overrides = {}) {
  return {
    getConnectedPeerCount: vi.fn(() => 0),
    getConnectedPeerUrls: vi.fn(() => []),
    getConnectedPeerInfo: vi.fn(() => []),
    connectToPeer: vi.fn(),
    disconnectPeer: vi.fn(),
    sendToPeer: vi.fn(),
    broadcastRaw: vi.fn(),
    ...overrides,
  };
}

// ─── Constants ──────────────────────────────────────────────────────

describe('discovery constants', () => {
  it('MAX_PEERS is exported and equals 5', () => {
    expect(MAX_PEERS).toBe(5);
  });

  it('MIN_PEERS equals 3', () => {
    expect(MIN_PEERS).toBe(3);
  });

  it('MIN_PEERS < MAX_PEERS', () => {
    expect(MIN_PEERS).toBeLessThan(MAX_PEERS);
  });

  it('KNOWN_PEERS_MAX equals 50', () => {
    expect(KNOWN_PEERS_MAX).toBe(50);
  });

  it('DISCOVERY_INTERVAL equals 30 seconds', () => {
    expect(DISCOVERY_INTERVAL).toBe(30000);
  });

  it('ROTATION_INTERVAL equals 5 minutes', () => {
    expect(ROTATION_INTERVAL).toBe(300000);
  });
});

// ─── Gap 3: peer exchange on self-heal ──────────────────────────────

describe('initializeDiscovery — Gap 3: peer exchange on self-heal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends peer_exchange_request when peers < MIN_PEERS', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 1),
      getConnectedPeerUrls: vi.fn(() => ['ws://peer1:80/ws']),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(api.broadcastRaw.mock.calls[0][0]);
    expect(sent.type).toBe('peer_exchange_request');
    expect(sent).toHaveProperty('from');
    expect(sent).toHaveProperty('timestamp');
    expect(typeof sent.timestamp).toBe('number');

    cleanup();
  });

  it('sends peer_exchange_request when peers == 0', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 0),
      getConnectedPeerUrls: vi.fn(() => []),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(api.broadcastRaw.mock.calls[0][0]);
    expect(sent.type).toBe('peer_exchange_request');

    cleanup();
  });

  it('sends peer_exchange_request when peers == MIN_PEERS - 1', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => MIN_PEERS - 1),
      getConnectedPeerUrls: vi.fn(() => ['ws://a:80/ws', 'ws://b:80/ws']),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('does NOT send peer_exchange_request when peers == MIN_PEERS', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => MIN_PEERS),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT send peer_exchange_request when peers > MIN_PEERS', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => MIN_PEERS + 2),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).not.toHaveBeenCalled();

    cleanup();
  });

  it('includes getPubKey result in peer_exchange_request when available', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 0),
      getConnectedPeerUrls: vi.fn(() => []),
      getPubKey: vi.fn(() => 'my-pub-key-base64'),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    const sent = JSON.parse(api.broadcastRaw.mock.calls[0][0]);
    expect(sent.from.pubKey).toBe('my-pub-key-base64');

    cleanup();
  });

  it('uses empty pubKey when getPubKey is not provided', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 0),
      getConnectedPeerUrls: vi.fn(() => []),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    const sent = JSON.parse(api.broadcastRaw.mock.calls[0][0]);
    expect(sent.from.pubKey).toBe('');

    cleanup();
  });

  it('uses empty pubKey when getPubKey is not a function', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 0),
      getConnectedPeerUrls: vi.fn(() => []),
      getPubKey: 'not-a-function',
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    const sent = JSON.parse(api.broadcastRaw.mock.calls[0][0]);
    expect(sent.from.pubKey).toBe('');

    cleanup();
  });

  it('sends peer_exchange_request on every discovery tick while below MIN_PEERS', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 2),
      getConnectedPeerUrls: vi.fn(() => ['ws://a:80/ws', 'ws://b:80/ws']),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(DISCOVERY_INTERVAL * 3);

    expect(api.broadcastRaw).toHaveBeenCalledTimes(3);
    // All should be peer_exchange_request
    for (const call of api.broadcastRaw.mock.calls) {
      const msg = JSON.parse(call[0]);
      expect(msg.type).toBe('peer_exchange_request');
    }

    cleanup();
  });

  it('self-heal also attempts connection from cache', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 1),
      getConnectedPeerUrls: vi.fn(() => ['ws://connected:80/ws']),
    });
    const cleanup = initializeDiscovery(api);

    // Since cache is empty and no bootstrap, connectToPeer should NOT be called
    // (only broadcastRaw for peer exchange)
    vi.advanceTimersByTime(DISCOVERY_INTERVAL);

    expect(api.broadcastRaw).toHaveBeenCalledTimes(1); // peer exchange
    expect(api.connectToPeer).not.toHaveBeenCalled(); // no candidates

    cleanup();
  });
});

// ─── Gap 4: rotation uses real connectedAt ──────────────────────────

describe('initializeDiscovery — Gap 4: rotation uses real connectedAt', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls getConnectedPeerInfo for rotation', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => [
        { url: 'ws://a:80/ws', connectedAt: 1000 },
        { url: 'ws://b:80/ws', connectedAt: 500 },
        { url: 'ws://c:80/ws', connectedAt: 2000 },
        { url: 'ws://d:80/ws', connectedAt: 1500 },
        { url: 'ws://e:80/ws', connectedAt: 3000 },
      ]),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.getConnectedPeerInfo).toHaveBeenCalled();

    cleanup();
  });

  it('disconnects the longest-connected peer (lowest connectedAt)', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => [
        { url: 'ws://a:80/ws', connectedAt: 1000 },
        { url: 'ws://b:80/ws', connectedAt: 500 },  // oldest
        { url: 'ws://c:80/ws', connectedAt: 2000 },
        { url: 'ws://d:80/ws', connectedAt: 1500 },
        { url: 'ws://e:80/ws', connectedAt: 3000 },
      ]),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).toHaveBeenCalledWith('ws://b:80/ws');

    cleanup();
  });

  it('disconnects the truly oldest peer with large timestamp differences', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => [
        { url: 'ws://x:80/ws', connectedAt: 99999 },
        { url: 'ws://y:80/ws', connectedAt: 10 },     // oldest
        { url: 'ws://z:80/ws', connectedAt: 50000 },
        { url: 'ws://w:80/ws', connectedAt: 88888 },
        { url: 'ws://v:80/ws', connectedAt: 77777 },
      ]),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).toHaveBeenCalledWith('ws://y:80/ws');

    cleanup();
  });

  it('disconnects first peer when all have same connectedAt', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => [
        { url: 'ws://a:80/ws', connectedAt: 100 },
        { url: 'ws://b:80/ws', connectedAt: 100 },
        { url: 'ws://c:80/ws', connectedAt: 100 },
        { url: 'ws://d:80/ws', connectedAt: 100 },
        { url: 'ws://e:80/ws', connectedAt: 100 },
      ]),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    // selectPeerForRotation returns the first when all equal
    expect(api.disconnectPeer).toHaveBeenCalledWith('ws://a:80/ws');

    cleanup();
  });
});

// ─── Gap 5: rotation gated on MAX_PEERS ─────────────────────────────

describe('initializeDiscovery — Gap 5: rotation gated on MAX_PEERS', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does NOT rotate with 0 peers', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => []),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT rotate with 1 peer', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => [
        { url: 'ws://a:80/ws', connectedAt: 100 },
      ]),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT rotate with MIN_PEERS peers', () => {
    const peers = Array.from({ length: MIN_PEERS }, (_, i) => ({
      url: `ws://p${i}:80/ws`,
      connectedAt: i * 100,
    }));
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => peers),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).not.toHaveBeenCalled();

    cleanup();
  });

  it('does NOT rotate with MAX_PEERS - 1 peers', () => {
    const peers = Array.from({ length: MAX_PEERS - 1 }, (_, i) => ({
      url: `ws://p${i}:80/ws`,
      connectedAt: i * 100,
    }));
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => peers),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).not.toHaveBeenCalled();

    cleanup();
  });

  it('DOES rotate when at exactly MAX_PEERS', () => {
    const peers = Array.from({ length: MAX_PEERS }, (_, i) => ({
      url: `ws://p${i}:80/ws`,
      connectedAt: (i + 1) * 100,
    }));
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => peers),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).toHaveBeenCalledTimes(1);
    // Should disconnect the peer with lowest connectedAt (100)
    expect(api.disconnectPeer).toHaveBeenCalledWith('ws://p0:80/ws');

    cleanup();
  });

  it('DOES rotate when above MAX_PEERS', () => {
    const peers = Array.from({ length: MAX_PEERS + 1 }, (_, i) => ({
      url: `ws://p${i}:80/ws`,
      connectedAt: (i + 1) * 100,
    }));
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => peers),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL);

    expect(api.disconnectPeer).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('rotation repeats every ROTATION_INTERVAL when at capacity', () => {
    const peers = Array.from({ length: MAX_PEERS }, (_, i) => ({
      url: `ws://p${i}:80/ws`,
      connectedAt: (i + 1) * 100,
    }));
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => peers),
    });
    const cleanup = initializeDiscovery(api);

    vi.advanceTimersByTime(ROTATION_INTERVAL * 3);

    expect(api.disconnectPeer).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it('rotation stops when dropping below MAX_PEERS', () => {
    let peerCount = MAX_PEERS;
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() => {
        return Array.from({ length: peerCount }, (_, i) => ({
          url: `ws://p${i}:80/ws`,
          connectedAt: (i + 1) * 100,
        }));
      }),
    });
    const cleanup = initializeDiscovery(api);

    // First rotation: at MAX_PEERS, should rotate
    vi.advanceTimersByTime(ROTATION_INTERVAL);
    expect(api.disconnectPeer).toHaveBeenCalledTimes(1);

    // Drop below MAX_PEERS
    peerCount = MAX_PEERS - 1;
    vi.advanceTimersByTime(ROTATION_INTERVAL);
    expect(api.disconnectPeer).toHaveBeenCalledTimes(1); // no additional call

    cleanup();
  });
});

// ─── API validation ─────────────────────────────────────────────────

describe('initializeDiscovery — API validation', () => {
  it('requires getConnectedPeerInfo in networkApi', () => {
    const api = createMockNetworkApi();
    delete api.getConnectedPeerInfo;
    expect(() => initializeDiscovery(api)).toThrow(/getConnectedPeerInfo/);
  });

  it('throws for null networkApi', () => {
    expect(() => initializeDiscovery(null)).toThrow();
  });

  it('throws for undefined networkApi', () => {
    expect(() => initializeDiscovery(undefined)).toThrow();
  });

  it('throws for non-object networkApi', () => {
    expect(() => initializeDiscovery('not-an-object')).toThrow();
  });

  it('throws for each missing required method', () => {
    const required = ['getConnectedPeerCount', 'getConnectedPeerUrls', 'getConnectedPeerInfo',
                       'connectToPeer', 'disconnectPeer', 'sendToPeer', 'broadcastRaw'];
    for (const method of required) {
      const api = createMockNetworkApi();
      delete api[method];
      expect(() => initializeDiscovery(api)).toThrow(method);
    }
  });

  it('throws when a required method is not a function', () => {
    const api = createMockNetworkApi();
    api.getConnectedPeerInfo = 'not-a-function';
    expect(() => initializeDiscovery(api)).toThrow(/getConnectedPeerInfo/);
  });

  it('accepts extra optional methods without error', () => {
    const api = createMockNetworkApi({
      getPubKey: vi.fn(() => 'key'),
      extraMethod: vi.fn(),
    });
    expect(() => initializeDiscovery(api)).not.toThrow();
    initializeDiscovery(api)(); // cleanup
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────

describe('initializeDiscovery — cleanup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cleanup stops discovery timer', () => {
    const api = createMockNetworkApi({
      getConnectedPeerCount: vi.fn(() => 0),
      getConnectedPeerUrls: vi.fn(() => []),
    });
    const cleanup = initializeDiscovery(api);

    cleanup();
    vi.advanceTimersByTime(DISCOVERY_INTERVAL * 5);

    expect(api.broadcastRaw).not.toHaveBeenCalled();
  });

  it('cleanup stops rotation timer', () => {
    const api = createMockNetworkApi({
      getConnectedPeerInfo: vi.fn(() =>
        Array.from({ length: MAX_PEERS }, (_, i) => ({
          url: `ws://p${i}:80/ws`, connectedAt: i * 100,
        }))
      ),
    });
    const cleanup = initializeDiscovery(api);

    cleanup();
    vi.advanceTimersByTime(ROTATION_INTERVAL * 5);

    expect(api.disconnectPeer).not.toHaveBeenCalled();
  });

  it('double cleanup is idempotent', () => {
    const api = createMockNetworkApi();
    const cleanup = initializeDiscovery(api);
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });

  it('returns a function', () => {
    const api = createMockNetworkApi();
    const cleanup = initializeDiscovery(api);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});

// ─── KnownPeersCache ────────────────────────────────────────────────

describe('KnownPeersCache', () => {
  it('adds and retrieves peers', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://test:80/ws');
    expect(cache.size()).toBe(1);
    const entry = cache.get('ws://test:80/ws');
    expect(entry).toBeDefined();
    expect(entry.url).toBe('ws://test:80/ws');
    expect(typeof entry.lastSeen).toBe('number');
    expect(entry.lastLatency).toBeNull();
  });

  it('evicts oldest when at capacity', () => {
    const cache = new KnownPeersCache(2);
    cache.add('ws://a:80/ws');
    cache.add('ws://b:80/ws');
    cache.add('ws://c:80/ws');
    expect(cache.size()).toBe(2);
    expect(cache.get('ws://a:80/ws')).toBeUndefined();
    expect(cache.get('ws://b:80/ws')).toBeDefined();
    expect(cache.get('ws://c:80/ws')).toBeDefined();
  });

  it('updates lastSeen on re-add without increasing size', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    expect(cache.size()).toBe(1);
    cache.add('ws://a:80/ws');
    expect(cache.size()).toBe(1);
  });

  it('updates lastLatency on re-add', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws', { lastLatency: 50 });
    expect(cache.get('ws://a:80/ws').lastLatency).toBe(50);
    cache.add('ws://a:80/ws', { lastLatency: 120 });
    expect(cache.get('ws://a:80/ws').lastLatency).toBe(120);
  });

  it('removes peers', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.remove('ws://a:80/ws');
    expect(cache.size()).toBe(0);
    expect(cache.get('ws://a:80/ws')).toBeUndefined();
  });

  it('remove is no-op for non-existent peer', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.remove('ws://nonexistent:80/ws');
    expect(cache.size()).toBe(1);
  });

  it('getAll returns all entries as array', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.add('ws://b:80/ws');
    const all = cache.getAll();
    expect(all.length).toBe(2);
    expect(all.map(e => e.url).sort()).toEqual(['ws://a:80/ws', 'ws://b:80/ws']);
  });

  it('getAll returns empty array for empty cache', () => {
    const cache = new KnownPeersCache(5);
    expect(cache.getAll()).toEqual([]);
  });

  it('rejects empty string url', () => {
    const cache = new KnownPeersCache(5);
    expect(() => cache.add('')).toThrow();
  });

  it('rejects non-string url', () => {
    const cache = new KnownPeersCache(5);
    expect(() => cache.add(123)).toThrow();
    expect(() => cache.add(null)).toThrow();
    expect(() => cache.add(undefined)).toThrow();
  });

  it('defaults maxSize to 50 for invalid values', () => {
    const cache = new KnownPeersCache(-1);
    for (let i = 0; i < 55; i++) cache.add(`ws://p${i}:80/ws`);
    expect(cache.size()).toBe(50);
  });

  it('defaults maxSize to 50 for non-number', () => {
    const cache = new KnownPeersCache('abc');
    for (let i = 0; i < 55; i++) cache.add(`ws://p${i}:80/ws`);
    expect(cache.size()).toBe(50);
  });

  it('defaults maxSize to 50 for zero', () => {
    const cache = new KnownPeersCache(0);
    for (let i = 0; i < 55; i++) cache.add(`ws://p${i}:80/ws`);
    expect(cache.size()).toBe(50);
  });

  it('respects custom maxSize', () => {
    const cache = new KnownPeersCache(3);
    for (let i = 0; i < 10; i++) cache.add(`ws://p${i}:80/ws`);
    expect(cache.size()).toBe(3);
  });

  it('initializes lastLatency to null by default', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    expect(cache.get('ws://a:80/ws').lastLatency).toBeNull();
  });

  it('sets lastLatency from metadata', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws', { lastLatency: 42 });
    expect(cache.get('ws://a:80/ws').lastLatency).toBe(42);
  });

  it('handles null lastLatency in metadata', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws', { lastLatency: null });
    expect(cache.get('ws://a:80/ws').lastLatency).toBeNull();
  });
});

// ─── selectPeerForRotation ──────────────────────────────────────────

describe('selectPeerForRotation', () => {
  it('selects peer with lowest connectedAt', () => {
    expect(selectPeerForRotation([
      { url: 'ws://a', connectedAt: 500 },
      { url: 'ws://b', connectedAt: 100 },
      { url: 'ws://c', connectedAt: 300 },
    ])).toBe('ws://b');
  });

  it('returns null for empty array', () => {
    expect(selectPeerForRotation([])).toBeNull();
  });

  it('returns null for null', () => {
    expect(selectPeerForRotation(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(selectPeerForRotation(undefined)).toBeNull();
  });

  it('returns the only peer for single element', () => {
    expect(selectPeerForRotation([{ url: 'ws://only', connectedAt: 42 }])).toBe('ws://only');
  });

  it('returns first peer when all have same connectedAt', () => {
    expect(selectPeerForRotation([
      { url: 'ws://first', connectedAt: 100 },
      { url: 'ws://second', connectedAt: 100 },
    ])).toBe('ws://first');
  });

  it('handles connectedAt of 0', () => {
    expect(selectPeerForRotation([
      { url: 'ws://a', connectedAt: 0 },
      { url: 'ws://b', connectedAt: 1000 },
    ])).toBe('ws://a');
  });
});

// ─── selectPeerForConnection ────────────────────────────────────────

describe('selectPeerForConnection', () => {
  it('returns null when all cached peers are connected', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.add('ws://b:80/ws');
    expect(selectPeerForConnection(cache, ['ws://a:80/ws', 'ws://b:80/ws'])).toBeNull();
  });

  it('returns an eligible peer not in connected list', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.add('ws://b:80/ws');
    cache.add('ws://c:80/ws');
    const result = selectPeerForConnection(cache, ['ws://a:80/ws']);
    expect(['ws://b:80/ws', 'ws://c:80/ws']).toContain(result);
  });

  it('returns null for empty cache', () => {
    const cache = new KnownPeersCache(5);
    expect(selectPeerForConnection(cache, [])).toBeNull();
  });

  it('returns the only eligible peer when just one', () => {
    const cache = new KnownPeersCache(5);
    cache.add('ws://a:80/ws');
    cache.add('ws://b:80/ws');
    const result = selectPeerForConnection(cache, ['ws://a:80/ws']);
    expect(result).toBe('ws://b:80/ws');
  });

  it('throws for null cache', () => {
    expect(() => selectPeerForConnection(null, [])).toThrow();
  });

  it('throws for plain object (not KnownPeersCache)', () => {
    expect(() => selectPeerForConnection({}, [])).toThrow();
  });

  it('returns null when connected list includes all cached peers', () => {
    const cache = new KnownPeersCache(3);
    cache.add('ws://x:80/ws');
    cache.add('ws://y:80/ws');
    expect(selectPeerForConnection(cache, ['ws://x:80/ws', 'ws://y:80/ws', 'ws://z:80/ws'])).toBeNull();
  });
});

// ─── createPeerExchangeRequest ──────────────────────────────────────

describe('createPeerExchangeRequest', () => {
  it('creates valid request structure', () => {
    const req = createPeerExchangeRequest('my-key');
    expect(req.type).toBe('peer_exchange_request');
    expect(req.from.pubKey).toBe('my-key');
    expect(typeof req.timestamp).toBe('number');
  });

  it('handles empty pubKey', () => {
    const req = createPeerExchangeRequest('');
    expect(req.from.pubKey).toBe('');
  });

  it('timestamp is close to Date.now()', () => {
    const before = Date.now();
    const req = createPeerExchangeRequest('key');
    const after = Date.now();
    expect(req.timestamp).toBeGreaterThanOrEqual(before);
    expect(req.timestamp).toBeLessThanOrEqual(after);
  });
});

// ─── createPeerExchangeResponse ─────────────────────────────────────

describe('createPeerExchangeResponse', () => {
  it('creates valid response structure', () => {
    const res = createPeerExchangeResponse(['ws://a', 'ws://b'], 'pub-key');
    expect(res.type).toBe('peer_exchange_response');
    expect(res.peers).toEqual(['ws://a', 'ws://b']);
    expect(res.from.pubKey).toBe('pub-key');
    expect(typeof res.timestamp).toBe('number');
  });

  it('handles empty peer list', () => {
    const res = createPeerExchangeResponse([], 'key');
    expect(res.peers).toEqual([]);
  });
});

// ─── handlePeerExchangeRequest ──────────────────────────────────────

describe('handlePeerExchangeRequest', () => {
  it('returns peers excluding requester', () => {
    const result = handlePeerExchangeRequest(
      { type: 'peer_exchange_request' },
      ['ws://a', 'ws://b', 'ws://c'],
      'ws://a',
    );
    expect(result).toEqual(['ws://b', 'ws://c']);
  });

  it('limits to 5 peers', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `ws://p${i}`);
    const result = handlePeerExchangeRequest({ type: 'req' }, urls, 'ws://other');
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty when only requester is connected', () => {
    const result = handlePeerExchangeRequest(
      { type: 'req' }, ['ws://a'], 'ws://a',
    );
    expect(result).toEqual([]);
  });

  it('returns all peers when requester is not in list', () => {
    const result = handlePeerExchangeRequest(
      { type: 'req' }, ['ws://a', 'ws://b'], 'ws://other',
    );
    expect(result).toEqual(['ws://a', 'ws://b']);
  });

  it('throws for null message', () => {
    expect(() => handlePeerExchangeRequest(null, [], 'ws://a')).toThrow();
  });

  it('throws for non-array connectedPeerUrls', () => {
    expect(() => handlePeerExchangeRequest({ type: 'req' }, 'not-array', 'ws://a')).toThrow();
  });
});

// ─── handlePeerExchangeResponse ─────────────────────────────────────

describe('handlePeerExchangeResponse', () => {
  it('adds peers to cache', () => {
    const cache = new KnownPeersCache(10);
    handlePeerExchangeResponse({ peers: ['ws://a', 'ws://b'] }, cache);
    expect(cache.size()).toBe(2);
  });

  it('does not duplicate existing peers', () => {
    const cache = new KnownPeersCache(10);
    cache.add('ws://a');
    handlePeerExchangeResponse({ peers: ['ws://a', 'ws://b'] }, cache);
    expect(cache.size()).toBe(2);
  });

  it('throws for null message', () => {
    const cache = new KnownPeersCache(10);
    expect(() => handlePeerExchangeResponse(null, cache)).toThrow();
  });

  it('throws for message without peers array', () => {
    const cache = new KnownPeersCache(10);
    expect(() => handlePeerExchangeResponse({ peers: 'not-array' }, cache)).toThrow();
  });

  it('throws for null cache', () => {
    expect(() => handlePeerExchangeResponse({ peers: [] }, null)).toThrow();
  });

  it('throws for plain object cache (not KnownPeersCache)', () => {
    expect(() => handlePeerExchangeResponse({ peers: [] }, {})).toThrow();
  });
});

// ─── isProtocolMessage ──────────────────────────────────────────────

describe('isProtocolMessage', () => {
  it('identifies peer_exchange_request as protocol', () => {
    const data = JSON.stringify({ type: 'peer_exchange_request', from: { pubKey: 'x' } });
    const result = isProtocolMessage(data);
    expect(result.isProtocol).toBe(true);
    expect(result.parsed.type).toBe('peer_exchange_request');
  });

  it('identifies peer_exchange_response as protocol', () => {
    const data = JSON.stringify({ type: 'peer_exchange_response', peers: [] });
    const result = isProtocolMessage(data);
    expect(result.isProtocol).toBe(true);
    expect(result.parsed.type).toBe('peer_exchange_response');
  });

  it('rejects non-peer_exchange types', () => {
    const data = JSON.stringify({ type: 'message', content: 'hello' });
    expect(isProtocolMessage(data).isProtocol).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isProtocolMessage(123).isProtocol).toBe(false);
    expect(isProtocolMessage(null).isProtocol).toBe(false);
    expect(isProtocolMessage(undefined).isProtocol).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(isProtocolMessage('not json {').isProtocol).toBe(false);
  });

  it('rejects arrays', () => {
    expect(isProtocolMessage('[1,2,3]').isProtocol).toBe(false);
  });

  it('rejects objects without type', () => {
    expect(isProtocolMessage('{"foo":"bar"}').isProtocol).toBe(false);
  });

  it('rejects objects with non-string type', () => {
    expect(isProtocolMessage('{"type":42}').isProtocol).toBe(false);
  });

  it('returns parsed object for protocol messages', () => {
    const original = { type: 'peer_exchange_request', from: { pubKey: 'abc' }, timestamp: 123 };
    const result = isProtocolMessage(JSON.stringify(original));
    expect(result.parsed).toEqual(original);
  });

  it('returns null parsed for non-protocol messages', () => {
    expect(isProtocolMessage('{"type":"regular"}').parsed).toBeNull();
  });
});

// ─── getBootstrapNodes ──────────────────────────────────────────────

describe('getBootstrapNodes', () => {
  it('converts https origin to wss', () => {
    expect(getBootstrapNodes('https://example.com')).toEqual(['wss://example.com/ws']);
  });

  it('converts http origin to ws', () => {
    expect(getBootstrapNodes('http://localhost:5000')).toEqual(['ws://localhost:5000/ws']);
  });

  it('defaults to wss for unknown scheme', () => {
    expect(getBootstrapNodes('example.com')).toEqual(['wss://example.com/ws']);
  });

  it('returns array with single bootstrap node', () => {
    const nodes = getBootstrapNodes('https://node.hermes.net');
    expect(nodes).toHaveLength(1);
  });

  it('preserves port in URL', () => {
    expect(getBootstrapNodes('http://localhost:3000')).toEqual(['ws://localhost:3000/ws']);
  });

  it('preserves subdomain', () => {
    expect(getBootstrapNodes('https://ws.example.com')).toEqual(['wss://ws.example.com/ws']);
  });
});
