# HermesP2P

Decentralized, ephemeral peer-to-peer messaging. No servers, no persistence, no compromise.

HermesP2P is a transient communication network with a cryptographically secure messaging overlay. Every node contributes to the network's resilience — no centralized servers store or relay your messages.

**Website:** [hp2p.net](https://hp2p.net)

**Book:** [*Privacy*](https://a.co/d/05PSJFBK) — the theoretical foundation behind HermesP2P's design decisions around ephemeral communication, key sovereignty, and decentralized trust.

## Key Features

- **Decentralized Network**: Peer-to-peer architecture where every node contributes to the network's resilience and scalability.
- **Transient Messaging**: Messages are ephemeral and not stored on any centralized system, ensuring privacy and reducing overhead.
- **Cryptographic Security**: Ed25519 signatures, X25519 key exchange with XSalsa20-Poly1305 authenticated encryption (NaCl/TweetNaCl), and per-channel HKDF pseudonyms.
- **Public and Private Channels**: Open public channels plus symmetric-key encrypted private channels (NaCl secretbox).
- **End-to-End Encrypted DMs**: Direct messages use ephemeral X25519 keypairs for perfect forward secrecy.
- **Self-Managed Configuration**: Users control their channels, friends, and key management via a downloadable JSON configuration file.
- **Live Network Panel**: Real-time feed of mesh traffic with direction indicators and sender aliasing.
- **Dynamic Peer Management**: The network adapts to maximize peer diversity and minimize redundancy for optimal performance.

## How It Works

1. **Join the Network**:
   - Visit a host node to bootstrap your connection.
   - Load or generate your configuration file containing your keys, subscribed channels, and friends' public keys.

2. **Peer Discovery**:
   - Connect with other nodes in the network and share peer information to build a diverse and resilient connection graph.

3. **Message Propagation**:
   - Messages are broadcasted through the network with a Time-to-Live (TTL) hop count to control redundancy and ensure efficient delivery.

4. **Cryptographic Security**:
   - Messages are signed with Ed25519 and encrypted with NaCl (X25519 + XSalsa20-Poly1305).
   - Channel messages use symmetric secretbox encryption; DMs use ephemeral public-key box encryption.
   - Only authorized recipients can read private messages.

5. **Ephemeral Design**:
   - Messages are transient and not persisted by nodes, ensuring privacy and reducing attack surfaces.

## Getting Started

### Prerequisites
- Python 3.11+
- A modern browser (Chrome, Firefox, Safari, Edge)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/jmcentire/HermesP2P.git
   cd HermesP2P
   ```
2. Install dependencies:
   ```bash
   pip install flask flask-sock jsonschema
   ```

3. Start the server:
   ```bash
   python main.py
   ```

4. Visit `http://localhost:5000` in your browser.

### Deployment
HermesP2P is deployed on [fly.io](https://fly.io) at [hp2p.net](https://hp2p.net). The included `Dockerfile` and `fly.toml` handle production deployment. The relay requires a single machine instance since peer state is held in memory.

### Usage
- **Join**: Upload an existing configuration file or generate a fresh identity automatically.
- **Send Messages**: Select a channel or friend from the sidebar and type your message.
- **Network Panel**: Open the NETWORK panel at the bottom to see real mesh traffic with direction indicators. Click the pencil icon next to a sender name to set a preferred alias.
- **Manage Configuration**: Add/edit/remove channels and friends. Copy your public key from the profile section to share with others.
- **Save & Exit**: Download your configuration file to preserve your identity, channels, friends, and aliases for next time.

## Project Goals

HermesP2P aims to:
- Provide a secure, decentralized messaging platform free from centralized control.
- Enable users to take full ownership of their communication data and privacy.
- Create a scalable and efficient P2P network with minimal entry barriers.

## Roadmap

- **Phase 1**: Implement basic public/private messaging and peer-to-peer networking.
- **Phase 2**: Enhance the cryptographic layer and introduce spam prevention mechanisms.
- **Phase 3**: Add features like message receipts, advanced peer diversity algorithms, and integration with decentralized storage.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and development process.

## License

This project is licensed under the HermesP2P License. See [LICENSE](LICENSE) for details.

---

### Why "HermesP2P"?

Named after Hermes, the Greek god of communication and messages, HermesP2P embodies the principles of speed, security, and seamless connection in a decentralized network.

## Privacy Stack

HermesP2P is one layer of a larger privacy architecture. Each component addresses a different failure mode.

| Component | What It Does | Link |
|-----------|-------------|------|
| **Signet** | Cryptographic vault. Three-tier data model, ZK proofs, Ed25519 root of trust. | [signet.tools](https://signet.tools) |
| **Agent-Safe (SPL)** | Authorization policy in the token. Local eval in ~2 us. No policy server. | [jmcentire.github.io/agent-safe](https://jmcentire.github.io/agent-safe/) |
| **Tessera** | Self-validating documents. Hash chain, Ed25519 signatures, embedded validators. | [jmcentire.github.io/tessera](https://jmcentire.github.io/tessera/) |
| **BlindDB** | Storage the operator can't read. Client-side encryption, opaque record IDs. | [jmcentire.github.io/BlindDB](https://jmcentire.github.io/BlindDB/) |
| **HermesP2P** | Ephemeral P2P messaging. No servers, no metadata, no persistence. | *(this project)* |

---

For any questions or feedback, please contact us at [contact@hp2p.net](mailto:contact@hp2p.net).