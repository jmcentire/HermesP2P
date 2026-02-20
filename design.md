# Design: HermesP2P

*Version 1 — Auto-maintained by pact*

## Decomposition

- [X] **Root** (`root`)
  # Task: HermesP2P Protocol Alignment — Phase 1

Implement five protocol features from the HermesP2P specification (chapters 8-9 of "Privacy: Architecture of Forgetting") to align the existing proof-of
  Tests: 118/119 passed, 1 failed
  - [+] **Signature Verification (crypto.js update)** (`crypto_verify`)
    Add signature verification to existing `static/js/crypto.js` and export base64 helpers.

Changes to `static/js/crypto.js`:
1. Export the existing `base64Encode` and `base64Decode` helper functions (currently module-scoped, not exported). Add `export` keyword to their declarations.
2. Add new exported function `verifySignature(message, signature, publicKey)`:
   - `message`: string (the message content that was signed)
   - `signature`: base64-encoded string
   - `publicKey`: base64-encoded Ed25519 public key string
   - Decode signature via `base64Decode(signature)` -> Uint8Array
   - Decode publicKey via `base64Decode(publicKey)` -> Uint8Array
   - Encode message via `new TextEncoder().encode(message)` -> Uint8Array
   - Call `nacl.sign.detached.verify(messageUint8, signatureUint8, pubKeyUint8)`
   - Return boolean result
   - Wrap in try/catch: on any error, return false (malformed inputs)

Note on channel messages: Channel messages have `from.pubKey` removed for pseudonymity. This means `verifySignature` CANNOT be called on channel messages (no public key available). The integration layer (handled in integration component) must skip signature verification for channel messages. This is an acceptable Phase 1 trade-off — channel messages rely on channel encryption for authenticity.

Constraints:
- Minimal changes to existing file — only add the new function and export the two helpers
- Do NOT modify existing function signatures
- Use `window.nacl` global (TweetNaCl)
- NEVER log private keys or message content
- JSDoc on the new function

Tests: `tests/crypto.test.js`
- Setup: stub `window.nacl` using `tweetnacl` npm package, stub `window.base64js` using `base64-js`
- verifySignature: valid signature returns true
- verifySignature: tampered message returns false
- verifySignature: wrong public key returns false
- verifySignature: malformed base64 returns false (no throw)
- verifySignature: empty inputs return false
- base64Encode/base64Decode round-trip
- Integration: sign with signMessage(), verify with verifySignature() -> true
    Tests: 33/33 passed
  - [+] **Peer Discovery** (`discovery_module`)
    Create new module `static/js/discovery.js` implementing peer discovery via bootstrap nodes, peer exchange protocol, self-healing, and peer rotation.

Exports:
- Constants: `MIN_PEERS=3`, `KNOWN_PEERS_MAX=50`, `ROTATION_INTERVAL=300000`, `DISCOVERY_INTERVAL=30000`
- `KnownPeersCache` class (stateful lifecycle justifies class):
  - Constructor takes `maxSize=50`
  - `add(url, metadata)`: Adds/updates entry `{url, lastSeen, lastLatency}`. If at max, evicts least-recently-seen entry.
  - `get(url)`: Returns entry or undefined
  - `getAll()`: Returns array of all entries
  - `remove(url)`: Deletes entry
  - `size()`: Returns count
- `getBootstrapNodes()`: Returns hardcoded array of bootstrap URLs (just origin server URL for Phase 1, e.g., derived from `window.location`)
- `createPeerExchangeRequest(pubKey)`: Creates `{type: 'peer_exchange_request', from: {pubKey}, timestamp}` object
- `createPeerExchangeResponse(peerUrls, pubKey)`: Creates `{type: 'peer_exchange_response', peers: [...], from: {pubKey}, timestamp}` object
- `handlePeerExchangeRequest(message, connectedPeerUrls, requesterUrl)`: Returns a peer_exchange_response with up to 5 URLs excluding requester
- `handlePeerExchangeResponse(message, cache)`: Adds received peer URLs to the KnownPeersCache
- `selectPeerForRotation(connectedPeers)`: Returns the URL of the longest-connected peer (expects entries with connection timestamps)
- `selectPeerForConnection(cache, connectedUrls)`: Returns a random URL from cache that isn't already connected, or null
- `initializeDiscovery(networkApi)`: Starts periodic timers. `networkApi` is an object with `{getConnectedPeerCount, getConnectedPeerUrls, connectToPeer, disconnectPeer, sendToPeer, broadcastRaw}`. Sets up DISCOVERY_INTERVAL health check and ROTATION_INTERVAL peer rotation. Returns cleanup function to clear timers.
- `isProtocolMessage(data)`: Checks if a raw WebSocket message is a peer exchange protocol message. Tries JSON.parse, checks if `type` starts with `peer_exchange_`. Returns `{isProtocol: boolean, parsed: object|null}`.

Peer exchange messages are a SEPARATE protocol layer — NOT padded, TTL-stamped, or signed. They are sent/received as plain JSON text frames, intercepted before unpadding.

Constraints:
- ES6 module, named exports, JSDoc
- KnownPeersCache is a class (acceptable per SOPs for stateful lifecycle)
- No crypto operations on peer exchange messages
- Bootstrap URLs hardcoded (no config field)

Tests: `tests/discovery.test.js`
- KnownPeersCache: add, get, getAll, remove, size, LRU eviction at max capacity
- createPeerExchangeRequest/Response: correct shape and fields
- handlePeerExchangeRequest: returns max 5 peers, excludes requester
- handlePeerExchangeResponse: adds URLs to cache
- selectPeerForRotation: picks longest-connected
- selectPeerForConnection: picks from cache excluding connected, returns null when none available
- isProtocolMessage: identifies peer_exchange types, rejects non-protocol JSON, handles non-JSON binary data gracefully
- initializeDiscovery: starts and stops timers (use vi.useFakeTimers)
    Tests: 82/82 passed
  - [+] **Pipeline Integration** (`integration`)
    Wire all new modules into the existing codebase by modifying `network.js`, `messages.js`, and `client.js` to implement the full send and receive pipelines.

### Changes to `static/js/messages.js`:
1. Add imports: `import { stampTTL } from './ttl.js'`, `import { generatePseudonym, shortenPseudonym } from './pseudonyms.js'`, `import { padMessage } from './padding.js'`
2. Make `packageMessage()` async.
3. In `packageMessage()`:
   - After building the message object, call `stampTTL(messagePackage, type)` to add TTL field
   - For channel messages (`type === 'private'`): call `await generatePseudonym(configuration.user.privKey, channelId)` and use `shortenPseudonym(pseudonym)` as `from.name`. Remove `from.pubKey` from the package.
   - For DMs (`type === 'direct'`): keep existing `from.name` and `from.pubKey`
   - For public messages: keep existing behavior
4. After signing and JSON serialization, call `padMessage(new TextEncoder().encode(jsonString))` to get padded Uint8Array
5. Make `handleMessageSubmit()` async (already confirmed acceptable). Update to `await packageMessage(...)`.
6. Catch padding errors (message too long) and display warning to user via `appendMessage('System', 'Message too long (max 64KB)', 'error')` or similar UI feedback.

### Changes to `static/js/network.js`:
1. Add imports: `import { unpadMessage } from './padding.js'`, `import { isExpired, getRebroadcastProbability } from './ttl.js'`, `import { verifySignature } from './crypto.js'`, `import { isProtocolMessage } from './discovery.js'`
2. Add new exports: `getConnectedPeerCount()` returns `peers.size`, `getConnectedPeerUrls()` returns `Array.from(peers.keys())`
3. Modify the WebSocket `onmessage` handler (receive path):
   a. First: check if message is a protocol message via `isProtocolMessage(data)`. If yes, route to discovery handler and return early.
   b. For user messages: `unpadMessage()` on the binary frame -> `new TextDecoder().decode(unpadded)` -> `JSON.parse()`
   c. TTL check: `if (isExpired(message)) { console.warn('Expired message:', messageId); return; }`
   d. Deduplication check (existing)
   e. Signature verification: If `message.from.pubKey` exists, call `verifySignature(message.message, message.signature, message.from.pubKey)`. If false, `console.warn('Signature verification failed for message:', messageId); return;`. If no pubKey (channel messages), skip verification.
   f. Pass to existing message handler callback
4. Replace fixed rebroadcast probability with `getRebroadcastProbability(message)` for the rebroadcast decision.
5. Update `broadcastMessage()` to handle binary Uint8Array frames (padded messages) — send via WebSocket as binary.

### Changes to `static/js/client.js`:
1. Add import: `import { initializeDiscovery } from './discovery.js'`
2. After `initializeNetwork()`, call `initializeDiscovery()` with the required network API object `{getConnectedPeerCount, getConnectedPeerUrls, ...}` to start discovery timers.
3. Ensure `handleMessageSubmit` call sites use `await` (or handle the promise).

### Message flow verification:
Send: compose -> encrypt -> stampTTL -> pseudonym (channels) -> package -> sign -> serialize -> pad -> broadcast
Receive: receive -> classify (protocol shortcut) -> unpad -> deserialize -> TTL check -> dedup -> verify sig (if pubKey present) -> decrypt -> display

Constraints:
- Minimal, targeted changes to existing files — do NOT rewrite from scratch
- Preserve all existing function signatures; new params are optional with defaults
- Add new imports at top of files with existing imports
- Handle errors gracefully: padding errors show UI warning, TTL/sig failures are console.warn only
- Channel messages skip signature verification (no pubKey available) — this is an accepted Phase 1 trade-off

No separate test file for integration — correctness is verified by ensuring all other component tests pass and by manual verification that the module imports resolve. The individual module tests (padding, ttl, pseudonyms, discovery, crypto) serve as contract tests.
    Tests: 37/37 passed
  - [+] **Fixed-Size Message Padding** (`padding_module`)
    Create new module `static/js/padding.js` implementing fixed-frame-size padding to prevent traffic analysis.

Exports:
- `FRAME_SIZES` constant: `[1024, 4096, 16384, 65536]`
- `padMessage(messageBytes)`: Takes a Uint8Array, finds smallest frame size fitting `messageBytes.length + 2`, throws if > 65534 bytes. Creates frame-sized Uint8Array, copies message at position 0, fills gap with `crypto.getRandomValues()` random bytes, writes original length as big-endian uint16 in last 2 bytes. Returns padded Uint8Array.
- `unpadMessage(paddedBytes)`: Reads big-endian uint16 from last 2 bytes, returns `paddedBytes.slice(0, originalLength)`.

Constraints:
- Pure ES6 module, no dependencies on other project modules
- Uses `crypto.getRandomValues()` for random fill (not Math.random)
- Named exports only, JSDoc on all exported functions
- Keep under 300 lines

Tests: `tests/padding.test.js`
- Round-trip: pad then unpad returns original bytes
- Frame size selection: verify each threshold (e.g., 1 byte -> 1024, 1023 bytes -> 4096, etc.)
- Boundary: exactly 1022 bytes fits in 1024 frame (1022 + 2 = 1024)
- Oversized message (> 65534 bytes) throws error
- Last 2 bytes encode correct length
- Padding bytes between message end and length suffix are non-zero (random)
- Empty message (0 bytes) pads to 1024
    Tests: 38/38 passed
  - [+] **Channel-Keyed Pseudonyms** (`pseudonyms_module`)
    Create new module `static/js/pseudonyms.js` implementing deterministic per-channel pseudonyms using HKDF + HMAC-SHA256 via Web Crypto API.

Exports:
- `generatePseudonym(privateKeyBase64, channelId)`: Async function.
  1. Decode privateKeyBase64 using `window.base64js.toByteArray()`
  2. Take first 32 bytes of the Ed25519 secret key as raw key material
  3. Import as HKDF key via `crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveKey'])`
  4. Derive HMAC key: `crypto.subtle.deriveKey({name: 'HKDF', salt: new Uint8Array(0), info: new TextEncoder().encode('hermes-pseudonym'), hash: 'SHA-256'}, hkdfKey, {name: 'HMAC', hash: 'SHA-256', length: 256}, false, ['sign'])`
  5. Sign channelId (UTF-8 encoded) with HMAC-SHA256
  6. Return base64-encoded result using `window.base64js.fromByteArray()`
  - Must be deterministic: same inputs always produce same output
- `shortenPseudonym(pseudonymBase64, length=8)`: Returns first `length` characters of the base64 pseudonym string.

Performance note: `generatePseudonym` is async. Callers (packageMessage) must await it. For rapid sending, callers may cache results keyed on channelId (caching is caller's responsibility, not this module's).

Constraints:
- Uses `window.base64js` global for base64 encode/decode
- Uses `crypto.subtle` (Web Crypto API) — all async
- Named exports, JSDoc, no default exports
- No logging of private keys

Tests: `tests/pseudonyms.test.js`
- Setup: stub `window.base64js` using the `base64-js` npm package, `crypto.subtle` available natively in Node 18+
- Determinism: same (privateKey, channelId) produces same pseudonym across multiple calls
- Unlinkability: same privateKey with different channelIds produces different pseudonyms
- Different privateKeys with same channelId produce different pseudonyms
- shortenPseudonym returns correct substring
- shortenPseudonym with custom length parameter
    Tests: 37/37 passed
  - [+] **TTL Enforcement** (`ttl_module`)
    Create new module `static/js/ttl.js` implementing time-to-live stamping, expiry checking, and rebroadcast probability decay.

Exports:
- `getDefaultTTL(messageType)`: Returns default TTL in seconds — `direct`: 300, `private`: 3600, `public`: 86400.
- `isExpired(message)`: Message must have `timestamp` (ISO string or epoch ms) and `ttl` (seconds). Calculates age as `(Date.now() - parseTimestamp(message.timestamp)) / 1000`. Returns true if age >= ttl.
- `getRemainingTTL(message)`: Returns remaining seconds, clamped to 0.
- `getRebroadcastProbability(message)`: Base probability 0.6, decays as `0.6 * (remainingTTL / message.ttl)`. Returns value between 0.0 and 0.6.
- `stampTTL(messagePackage, messageType)`: Adds `ttl` field to the message package object based on type. Returns modified package.

The `ttl` field is the ORIGINAL total TTL. Expiry = `timestamp + ttl < now`. `getRebroadcastProbability` computes remaining from timestamp.

Internal helper: `parseTimestamp(ts)` handles both ISO strings and epoch ms.

Constraints:
- Pure ES6 module, no dependencies on other project modules
- Named exports, JSDoc comments
- Use `Date.now()` for current time

Tests: `tests/ttl.test.js`
- getDefaultTTL returns correct values for each type
- isExpired: fresh message not expired, old message expired, boundary case
- getRemainingTTL: positive remaining, zero when expired
- getRebroadcastProbability: full TTL remaining -> 0.6, half remaining -> 0.3, expired -> 0.0
- stampTTL adds correct ttl field
- parseTimestamp handles ISO string and epoch ms
    Tests: 69/69 passed

## Failure History

### root — contract_bug
The root and discovery_module contracts both specify that handlePeerExchangeRequest with a null message should use error_type 'early_return' with behavior 'Returns empty array []'. However, the root contract test suite defines the test 'handle_req_err_invalid' as expecting the function to throw for null input. The implementation correctly returns [] per the contract specification, but the test asserts throwing behavior. This is a mismatch between the contract test suite definition and the actual contract — the test expects a throw where the contract specifies a non-throwing early return.
**Resolution:** Update the root contract test suite (contract_test_suite.json) for the 'handle_req_err_invalid' test case to assert that handlePeerExchangeRequest(null, ...) returns an empty array [] rather than asserting it throws. The test should use something like `expect(handlePeerExchangeRequest(null, connectedUrls, requesterUrl)).toEqual([])` instead of `expect(() => handlePeerExchangeRequest(null, ...)).toThrow()`. Alternatively, if throwing is the desired behavior, update both the root and discovery_module contracts to change the error_type from 'early_return' to a thrown Error for the 'invalid_message' case.
*2026-02-19T16:54:45.501797*
