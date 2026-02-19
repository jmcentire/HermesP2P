# HermesP2P

Decentralized, ephemeral peer-to-peer messaging. No servers, no persistence, no compromise.

HermesP2P is a transient communication network with a cryptographically secure messaging overlay. Every node contributes to the network's resilience — no centralized servers store or relay your messages.

**Website:** [hp2p.net](https://hp2p.net)

**Book:** [*Privacy*](https://a.co/d/05PSJFBK) — the theoretical foundation behind HermesP2P's design decisions around ephemeral communication, key sovereignty, and decentralized trust.

## Key Features

- **Decentralized Network**: HermesP2P leverages a peer-to-peer architecture where every node contributes to the network's resilience and scalability.
- **Transient Messaging**: Messages are ephemeral and not stored on any centralized system, ensuring privacy and reducing overhead.
- **Cryptographic Security**: All communications are secured using PGP-style encryption, with users maintaining their own key pairs.
- **Public and Private Channels**: Support for open public discussions and encrypted private messages between individuals or groups.
- **Self-Managed Configuration**: Users control their peer lists, channels, and key management via a simple configuration system.
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
   - Messages are signed and encrypted using PGP-style public/private key pairs.
   - Only authorized recipients can read private messages.

5. **Ephemeral Design**:
   - Messages are transient and not persisted by nodes, ensuring privacy and reducing attack surfaces.

## Getting Started

### Prerequisites
- A modern browser with WebAssembly support (e.g., Chrome, Firefox).
- A host node URL to bootstrap your initial connection.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/jmcentire/HermesP2P.git
   ```
2. Install dependencies:
   ```bash
   cd hermesp2p
   npm install
   ```

3. Start the application:
   ```bash
   npm run start
   ```

4. Visit the provided URL in your browser to begin.

### Usage
- **Login**: Upload your configuration file or generate a new key pair.
- **Send Messages**: Compose public or private messages and broadcast them across the network.
- **Manage Peers**: Monitor your peer connections and refresh your network periodically.

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

---

For any questions or feedback, please contact us at [contact@hp2p.net](mailto:contact@hp2p.net).