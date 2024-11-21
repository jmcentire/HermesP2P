// Cryptographic operations module
const { secretbox, box, sign, randomBytes } = window.nacl;

// Base64 encode/decode helpers (will be used across modules)
export function base64Encode(uint8Array) {
    return base64js.fromByteArray(uint8Array);
}

export function base64Decode(base64String) {
    return base64js.toByteArray(base64String);
}

// Message signing
export function signMessage(message, privateKey) {
    const messageUint8 = new TextEncoder().encode(message);
    return base64Encode(sign.detached(messageUint8, base64Decode(privateKey)));
}

// Channel key generation
export function generateChannelKey() {
    return base64Encode(randomBytes(secretbox.keyLength));
}

// Ed25519 keypair generation
export function generateKeypair() {
    const keypair = sign.keyPair();
    return {
        pubKey: base64Encode(keypair.publicKey),
        privKey: base64Encode(keypair.secretKey)
    };
}

// Generate secure nonce
export function generateNonce() {
    return base64Encode(randomBytes(box.nonceLength));
}

// Username generation
export function generateUsername() {
    const adjectives = ['Swift', 'Bright', 'Silent', 'Noble', 'Mystic', 'Cosmic'];
    const nouns = ['Phoenix', 'Dragon', 'Falcon', 'Knight', 'Voyager', 'Wanderer'];
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${randomNum}`;
}

// Initialize new configuration
export function initializeNewConfig() {
    const keypair = generateKeypair();
    return {
        user: {
            name: generateUsername(),
            ...keypair
        },
        channels: [
            { name: "General" },
            { name: "TechTalk" }
        ],
        friends: []
    };
}
