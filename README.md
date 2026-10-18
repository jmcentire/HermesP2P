# HermesP2P

An experimental text-messaging client working toward ephemeral, anonymous peer-to-peer communication.

The browser connects to known WebSocket hubs for signalling and relay delivery, and attempts bounded direct WebRTC data channels. The relay remains active even when direct links work. This is an **experimental partial mesh**, with no configured STUN/TURN service. Only local hub delivery has been demonstrated; direct peer delivery and wide-area interoperability remain unverified. Privacy and anonymity are design goals, not guarantees of the prototype.

[Website](https://hp2p.net) · [Text client](https://hp2p.net/client) · [*Privacy*](https://a.co/d/05PSJFBK)

## What is implemented

- Browser-generated Ed25519 identities, downloadable JSON configuration, channels, contacts, and aliases.
- Public text channels, symmetric-key private channels using NaCl secretbox (XSalsa20-Poly1305), and direct messages using NaCl box with X25519.
- WebSocket connections to hubs, hub-signalled WebRTC data channels where browser/network conditions permit, message padding, forwarding controls, and temporary duplicate tracking.
- A Flask relay with an in-memory connection set. There is no application message-history database.

Protocol v2 rejects old envelopes: clients must be upgraded together. Public pseudonyms are per-channel signing keys; they authenticate key control, not a person. Private and direct envelopes hide local names and bind their random outer proof key inside authenticated ciphertext. Browser per-conversation replay tracking is limited to this tab lifetime and bounded capacity; under pressure, eviction permits old messages to recur. Public channel keys are stable across sessions, so posts within a channel remain linkable.

A local data structure or test is not evidence of a deployed distributed protocol. In particular, mocked WebRTC negotiation tests do not prove connectivity across real NATs, and a signature alone does not establish an anonymous, replay-resistant identity protocol.

## Privacy and security boundaries

**The hub is part of the current data path.** Losing it interrupts clients that rely on it. It can observe client addresses, connection times, traffic sizes, and message envelopes. Public-channel content is readable. Direct peers may learn each other’s network addresses. Relay copies continue even when direct data channels are open. Padding and pseudonyms do not eliminate traffic correlation or linkability.

**Ephemeral does not mean zero state.** Connections, peer candidates, duplicate suppression, browser message history, and configuration require state. The browser stores configuration in `sessionStorage`; the exported JSON contains unencrypted private keys. Recipients, browsers, infrastructure, or compromised devices may retain data independently of the relay. A future cache must disclose retention and be an explicit optional service.

**The current DM scheme does not provide full forward secrecy.** A fresh sender key per message does not protect recorded messages from later compromise of the recipient's long-term decryption key. Key verification, device compromise, revocation, metadata leakage, and browser code delivery remain relevant threats.

Direct messages are signed and are not deniable: a recipient can disclose the signed plaintext to others. The hub retains recent frame hashes for up to 30 seconds, with earlier eviction under load. A single hub has no Sybil resistance; connection turnover and spam can deny service even with bounded buffers.

This is research software. It is not a reviewed anonymity system or a production financial service.

## Run the text client locally

Requires Python 3.11+ and a modern browser.

```bash
git clone https://github.com/jmcentire/HermesP2P.git
cd HermesP2P
python3 -m venv .venv
. .venv/bin/activate
pip install flask flask-sock jsonschema
python main.py
```

Open `http://localhost:5000`, then select **Open text client**. The client creates an identity if the tab has no saved configuration. Use **Save & Exit** to download configuration for safekeeping; protect the file as you would a private key. Public channels are public, even when accessed over HTTPS.

Use **Import identity locally** in the client to restore a saved file; validation happens in the browser. Imported files cannot silently select new bootstrap destinations. Save & Exit clears this tab's stored configuration after downloading it. Do not send private identity files to a remote validation service.

## Development and validation

```bash
npm ci
npm test
python -m pip install pytest
python -m pytest tests/test_relay.py
```

Use the executable test suites to check implementation behavior. The existing JSON contract suites and design documents also describe intended behavior; they are not, by themselves, passing execution evidence. Check actual test output and the review report for coverage and known gaps.

See [validation evidence and limits](docs/validation.md), [protocol contracts](docs/protocol-contracts.md), and [Constrain/PACT rerun instructions](contracts/privacy_sandbox/README.md).

Relevant boundaries:

| Files | Responsibility |
| --- | --- |
| `main.py` | HTTP pages and WebSocket hub relay |
| `static/js/network.js`, `discovery.js`, `mesh.js` | Hub connections, discovery scaffolding, and experimental direct WebRTC transport |
| `static/js/messages.js`, `crypto.js` | Message handling and cryptographic operations |
| `static/js/config.js` | Browser identity, contacts, channels, and configuration export |
| `templates/index.html`, `docs/index.html` | Hosted and static public website |
| `public/llms*.txt` | Public machine-readable capability summaries |
| `contracts/`, `tests/` | Protocol contracts and validation artifacts |

## Protocol direction

The intended transport is a lightweight, unstructured ad hoc mesh. The prototype joins through a known hub and attempts direct peer links; resilient cross-hub discovery and broad NAT traversal remain future work. Retain bounded local peer and recent-message state rather than a global routing directory. Novelty, trust weighting, probabilistic forwarding, and peer churn need adversarial evaluation; they are not established security properties.

Optional cloud caching and rebroadcast must be separate from the default ephemeral transport, with explicit retention and failure behavior. Rich images and video are future work, not current client capabilities.

### Subscription channels — planned

Support both signed publisher-only broadcasts and shared symmetric-key channels. The proposed subscription protocol rotates decryption keys monthly, with payment and key negotiation through a backchannel during the week before and the week after the month boundary. Only verified settled subscription payments may release the relevant key or paid entitlement; a signed payment promise is insufficient. Define the exact time boundary, key versions, publisher authority, renewal/revocation rules, and late/offline behavior in testable contracts before deployment. Rotation cannot make a previously disclosed key or plaintext disappear.

### Hermes credits — dummy sandbox only

The proposed ordinary acquisition fee is about 5%, optionally adjusted by volume. The $100 → 47-token example is a design fixture, not a quoted exchange rate: exchange units, fee arithmetic, and rounding still need an explicit pricing rule.

System-signed issuance establishes provenance; user-signed transfers or IOUs refer to it. Invalid claims must be rejected. If only 47 tokens were issued, a claim to send 50 cannot redeem more than 47. That ceiling alone does not determine which competing recipient has a valid claim.

A stateless transport cannot substitute for monetary accounting. The proposed settlement boundary is explicit: pending promises are not paid balances, creator revenue, or subscription entitlements. Only verified settled funds may support payouts or subscription-key release. Accounting must reject duplicate redemption and distinguish signatures from settlement. Provenance can expose transaction relationships, so linkability remains a separate privacy concern. Service redemption and eventual economical blockchain settlement remain design choices.

No real funds, wallet operations, live issuance, financial accounts, or settlement are enabled by this work. Charging a fee and relinquishing control does not establish immunity from legal or compliance obligations.

### Advertising rewards — planned

The goal is to give advertisers more control over being seen and better confirmation of audience participation, while paying the participating person rather than directing all value to the platform. Advertising effectiveness remains unproven.

The proposed purchase fee is 20%. Only credits separately issued and signed for the advertising domain may fund this rewards mechanism, which is closed only while the authority is reached through the advertiser-operated adapter. Ordinary credits cannot be converted merely by relabeling a payload. Advertisers collect and verify the required backchannel proofs against funded offers; accepted proofs support redemption within those funding limits.

A video-view receipt establishes only what its proof verifies, **not human attention**. Proof forgery, replay, duplicate redemption, bots, Sybil identities, and collusion still need adversarial tests. Stronger identity or device checks can reduce privacy. The bounded, funded mechanism limits financial exposure; it does not demonstrate that fraud or abuse has been eliminated.

### Creator support — subscriptions and superlike donations, planned

Subscriptions and superlikes reward creators, like subscriptions and donations on other channels. A superlike is an optional contribution, not a payment the creator is entitled to expect in advance. A pending promise is not paid revenue: an unfunded or failed superlike degrades to an ordinary like. No advance or payout is made against it.

Only verified settled funds may be paid out or release a subscription key. Controlling both the sender and the creator account cannot generate new value through self-tipping; the same settled-value limit applies.

The dummy reference and its tests should establish signature-domain and currency-type separation, supply conservation, proof-bound and duplicate redemption controls, expiry, safe failure/retry/idempotency, and transaction-linkability limits. Test that pending or failed payments never cause key release or payout, and that self-tipping cannot increase redeemable value. These are sandbox validation targets, not claims that live payments, audience rewards, subscriptions, or donations are available in the browser client.

## Website and deployment

`templates/index.html` is served by Flask. `docs/index.html` is the static website version and links to the hosted client. Both preserve the existing logo assets and distinguish current behavior from future capabilities.

`Dockerfile` and `fly.toml` describe the existing host configuration. The relay's peer set is process-local: independent replicas do not automatically exchange messages. Inspect the target and deployment configuration before publishing. A website update does not authorize deploying a live monetary backend.

## Contributing

Open an issue or pull request with a reproducible scenario, the intended property, and tests for failure behavior. Keep private research histories, identity files, credentials, and real transaction data out of the repository.

See [LICENSE](LICENSE) for terms. Questions: [contact@hp2p.net](mailto:contact@hp2p.net).
