# Task: HermesP2P Protocol Alignment — Phase 1

Implement five protocol features from the HermesP2P specification (chapters 8-9 of "Privacy: Architecture of Forgetting") to align the existing proof-of-concept P2P chat application with the full protocol design.

## Context

HermesP2P is a decentralized, ephemeral, peer-to-peer messaging platform built with:
- **Backend:** Flask (Python) serving static files and WebSocket relay (`main.py`)
- **Frontend:** Vanilla JavaScript ES6 modules in `static/js/`
- **Crypto:** TweetNaCl.js (`window.nacl`) for Ed25519 signing, XSalsa20-Poly1305 secretbox/box encryption
- **Encoding:** `base64-js` library (`window.base64js`) for base64 encode/decode
- **Network:** WebSocket-based gossip protocol with peer tracking and message deduplication

### Existing Module Summary

**`static/js/crypto.js`** — Exports: `generateUsername()`, `generateKeypair()`, `generateChannelKey()`, `signMessage(message, privateKey)`, `encryptChannelMessage(plaintext, channelKey)`, `encryptDirectMessage(plaintext, recipientPubKey)`. Uses `window.nacl` (TweetNaCl) and `base64js` globals. Helper functions `base64Encode(uint8Array)` and `base64Decode(base64String)` are module-scoped (not exported).

**`static/js/network.js`** — Exports: `getOriginWsUrl()`, `initializeNetwork(messageHandler, statusHandler, configGetter)`, `broadcastMessage(messageObject)`, `rebroadcastMessage(messageObject, originUrl)`. Constants: `MAX_PEERS=5`, `PEER_RECONNECT_DELAY=5000`, `PEER_MANAGEMENT_INTERVAL=30000`, `SEEN_MSG_TTL=120000`. Internal state: `peers` Map, `seenMessageIDs` Map. Handles WebSocket lifecycle, deduplication, and periodic peer management.

**`static/js/messages.js`** — Exports: `displayMessages(name)`, `enableMessageInput(configuration)`, `disableMessageInput()`, `handleMessageSubmit(e, configuration)`, `updateChannelName(oldName, newName)`. Internal: `appendMessage(sender, content, type)`, `packageMessage(content, type, to, configuration)`. Message packaging flow: content -> encrypt (for private/DM) -> sign -> create package object with `{type, timestamp, to, from: {name, pubKey}, signature, message}`.

**`static/js/config.js`** — Exports: `getConfiguration()`, `setupEventListeners(configuration)`, `populateSidebar(config)`, `addChannel()`, `editChannel()`, `removeChannel()`, `addFriend()`, `editFriend()`, `removeFriend()`, `handleSaveExit()`, `setEditingItem()`, `getEditingItem()`, `clearEditingItem()`. Uses `sessionStorage` for persistence. Config shape: `{ user: { name, pubKey, privKey }, channels: [{ name, key? }], friends: [{ name, pubKey }] }`.

**`static/js/client.js`** — Entry point that imports from all other modules and initializes the application.

**`static/js/ui.js`** — Bootstrap modal show/hide helpers.

## Features to Implement

### 1. Signature Verification

**Requirement:** Every incoming message must have its Ed25519 signature verified using `nacl.sign.detached.verify()` before processing. Invalid signatures must be silently dropped (no error displayed to user, console.warn only).

**Location:** Add `verifySignature(message, signature, publicKey)` to `static/js/crypto.js`. Call it in the incoming message handler (currently in `network.js` `handleMessage` -> callback to `messages.js`).

**Specification:**
- Input: message content (string), base64-encoded signature, base64-encoded Ed25519 public key
- Decode signature and public key from base64, encode message to Uint8Array
- Call `nacl.sign.detached.verify(messageUint8, signatureUint8, pubKeyUint8)`
- Return boolean
- On verify failure: `console.warn('Signature verification failed for message:', messageId)` and drop message
- Integration: verify AFTER deduplication check, BEFORE any decryption or display

### 2. Fixed-Size Message Padding

**Requirement:** All outgoing messages must be padded to fixed frame sizes to prevent traffic analysis. Incoming messages must be unpadded before processing.

**Location:** New module `static/js/padding.js`

**Specification:**
- Frame sizes: `[1024, 4096, 16384, 65536]` bytes (1KB, 4KB, 16KB, 64KB)
- `padMessage(messageBytes)`:
  - `messageBytes` is a Uint8Array (the serialized message after encryption/signing)
  - Determine smallest frame size that fits `messageBytes.length + 2` (2-byte length suffix)
  - If message exceeds 65534 bytes (64KB - 2), throw an error
  - Create a new Uint8Array of the chosen frame size
  - Copy messageBytes into position 0
  - Fill remaining bytes (between end of message and last 2 bytes) with `crypto.getRandomValues()` random data
  - Write original message length as big-endian uint16 in last 2 bytes
  - Return the padded Uint8Array
- `unpadMessage(paddedBytes)`:
  - `paddedBytes` is a Uint8Array
  - Read big-endian uint16 from last 2 bytes to get original length
  - Return `paddedBytes.slice(0, originalLength)`
- `FRAME_SIZES` exported constant array
- Integration point: pad AFTER signing, unpad BEFORE signature verification on receive side

### 3. TTL Enforcement

**Requirement:** Every message carries a TTL (time-to-live) value. Expired messages are discarded before any cryptographic verification to save CPU. Rebroadcast probability decays with remaining TTL.

**Location:** New module `static/js/ttl.js`

**Specification:**
- Default TTLs by message type:
  - `direct`: 300 seconds (5 minutes)
  - `private`: 3600 seconds (1 hour)
  - `public`: 86400 seconds (24 hours)
- `getDefaultTTL(messageType)` — returns default TTL in seconds for the given type
- `isExpired(message)`:
  - `message` must have `timestamp` (ISO string or epoch ms) and `ttl` (seconds)
  - Calculate age: `(Date.now() - parseTimestamp(message.timestamp)) / 1000`
  - Return `true` if age >= ttl
- `getRemainingTTL(message)`:
  - Returns remaining TTL in seconds (clamped to 0)
- `getRebroadcastProbability(message)`:
  - Base probability: 0.6 (from current `REBROADCAST_PROB_INITIAL` in network.js)
  - Decay: `baseProbability * (remainingTTL / totalTTL)`
  - Returns probability between 0.0 and 0.6
- `stampTTL(messagePackage, messageType)`:
  - Adds `ttl` field to message package based on type
  - Returns the modified package
- Integration:
  - On receive: check TTL expiry FIRST (before dedup, before sig verify) — this is the cheapest check
  - On send: stamp TTL based on message type in `packageMessage()`
  - On rebroadcast: use `getRebroadcastProbability()` instead of fixed constant in `network.js`

### 4. Channel-Keyed Pseudonyms

**Requirement:** Each user has a deterministic but unlinkable pseudonym per channel, derived from their private key and the channel identifier. This prevents cross-channel identity correlation.

**Location:** New module `static/js/pseudonyms.js`

**Specification:**
- Derivation: `HMAC-SHA256(HKDF(privateKey, "hermes-pseudonym"), channelId)`
- Use Web Crypto API (available in all modern browsers):
  1. Import raw private key bytes (first 32 bytes of Ed25519 secret key) as HKDF key material
  2. Derive key using HKDF with salt="" (empty), info="hermes-pseudonym", hash=SHA-256, length=256 bits
  3. Import derived key as HMAC-SHA256 key
  4. Sign the channel_id string (UTF-8 encoded) with HMAC-SHA256
  5. Encode result as base64 — this is the pseudonym
- `generatePseudonym(privateKeyBase64, channelId)`:
  - Async function (Web Crypto is async)
  - `privateKeyBase64`: the user's full Ed25519 private key (base64)
  - `channelId`: string (channel name)
  - Returns: base64-encoded pseudonym string
  - Must be deterministic: same (privateKey, channelId) always produces same pseudonym
- `shortenPseudonym(pseudonymBase64, length=8)`:
  - Returns first `length` characters of the base64 pseudonym for display
- Properties:
  - Same user in channel "General" and channel "TechTalk" gets different pseudonyms
  - Same user re-joining "General" gets the SAME pseudonym (deterministic)
  - Cannot reverse pseudonym to recover private key
- Integration:
  - In `packageMessage()`: for channel messages, use pseudonym instead of `configuration.user.name` in `from.name`
  - For DMs: continue using the regular username (DMs are already identity-linked)
  - The `from.pubKey` field should be REMOVED from channel messages (pseudonyms replace identity)
  - Note: This is a significant change — channel messages become pseudonymous

### 5. Peer Discovery

**Requirement:** Nodes must be able to discover new peers through bootstrap nodes and peer exchange, maintaining a healthy mesh topology.

**Location:** New module `static/js/discovery.js`

**Specification:**
- Constants:
  - `MIN_PEERS = 3` — trigger discovery when connected peers drop below this
  - `MAX_PEERS = 5` — (already exists in network.js, reuse)
  - `KNOWN_PEERS_MAX = 50` — LRU cache of known peer URLs
  - `ROTATION_INTERVAL = 5 * 60 * 1000` — rotate one peer every 5 minutes
  - `DISCOVERY_INTERVAL = 30 * 1000` — check peer health every 30 seconds
- `KnownPeersCache`:
  - LRU cache of `{ url, lastSeen, lastLatency }` objects
  - Max 50 entries
  - `add(url, metadata)`, `get(url)`, `getAll()`, `remove(url)`, `size()`
- Bootstrap:
  - `getBootstrapNodes(config)` — returns array of bootstrap URLs from config
  - On startup, if connected peers < MIN_PEERS, connect to bootstrap nodes
- Peer Exchange Protocol:
  - New message types: `peer_exchange_request` and `peer_exchange_response`
  - `peer_exchange_request`: `{ type: "peer_exchange_request", from: { pubKey }, timestamp }`
  - `peer_exchange_response`: `{ type: "peer_exchange_response", peers: [url1, url2, ...], from: { pubKey }, timestamp }`
  - When receiving `peer_exchange_request`: respond with up to 5 known peer URLs (excluding requester)
  - When receiving `peer_exchange_response`: add new URLs to known peers cache, attempt connection if below MIN_PEERS
- Self-Healing:
  - Periodically check (every `DISCOVERY_INTERVAL`): if connected peers < MIN_PEERS, send `peer_exchange_request` to all connected peers and attempt connections from known peers cache
- Rotation:
  - Every `ROTATION_INTERVAL`: disconnect the longest-connected peer (if at MAX_PEERS) and connect to a random peer from the known peers cache
  - This ensures the mesh topology evolves and prevents clique formation
- Integration:
  - Hook into `network.js` `initializeNetwork()` to start discovery timers
  - Hook into `network.js` `handleMessage()` to intercept peer exchange messages before normal message processing
  - Add `getConnectedPeerCount()` and `getConnectedPeerUrls()` exports to `network.js`

## Message Flow (After Implementation)

### Send Path
```
compose plaintext
  -> encrypt (secretbox for channels, box for DMs)
  -> stamp TTL
  -> generate pseudonym (channels only)
  -> package message (type, timestamp, ttl, from, to, message)
  -> sign message content
  -> serialize to JSON bytes
  -> pad to frame size
  -> broadcast to peers
```

### Receive Path
```
receive padded frame
  -> unpad
  -> deserialize JSON
  -> check TTL expiry (discard if expired — cheapest check first)
  -> deduplication check
  -> verify signature (discard if invalid)
  -> decrypt (if encrypted)
  -> resolve pseudonym display name (if channel message)
  -> display in UI
```

## Files Modified

| File | Changes |
|------|---------|
| `static/js/crypto.js` | Add `verifySignature()` export, export `base64Encode` and `base64Decode` |
| `static/js/network.js` | Add TTL check + sig verify in receive path, use TTL-based rebroadcast probability, add peer count exports, hook discovery |
| `static/js/messages.js` | Stamp TTL in `packageMessage()`, use pseudonyms for channel messages, integrate padding |
| `static/js/padding.js` | **NEW** — `padMessage()`, `unpadMessage()`, `FRAME_SIZES` |
| `static/js/ttl.js` | **NEW** — `getDefaultTTL()`, `isExpired()`, `getRemainingTTL()`, `getRebroadcastProbability()`, `stampTTL()` |
| `static/js/pseudonyms.js` | **NEW** — `generatePseudonym()`, `shortenPseudonym()` |
| `static/js/discovery.js` | **NEW** — `KnownPeersCache`, peer exchange handlers, self-healing, rotation |

## Constraints

- No new npm dependencies (only vitest for testing, already installed)
- All production code is JavaScript ES6 modules (not TypeScript)
- Tests may use TypeScript or JavaScript
- Must work in modern browsers (Chrome 90+, Firefox 88+, Safari 14+)
- `window.nacl` and `window.base64js` are globals loaded via script tags in HTML
- Web Crypto API (`crypto.subtle`) is available in all target browsers
- Flask backend (`main.py`) should not need changes for Phase 1
