const { secretbox, box, sign, randomBytes } = window.nacl;
const ll = window.nacl.lowlevel;

export function base64Encode(uint8Array) {
    return base64js.fromByteArray(uint8Array);
}

export function base64Decode(base64String) {
    return base64js.toByteArray(base64String);
}


export function generateUsername() {
    const adjectives = ['Swift', 'Bright', 'Silent', 'Noble', 'Mystic', 'Cosmic'];
    const nouns = ['Phoenix', 'Dragon', 'Falcon', 'Knight', 'Voyager', 'Wanderer'];
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${randomNum}`;
}

export function generateKeypair() {
    const keypair = sign.keyPair();
    return {
        pubKey: base64Encode(keypair.publicKey),
        privKey: base64Encode(keypair.secretKey)
    };
}

export function generateChannelKey() {
    return base64Encode(randomBytes(secretbox.keyLength));
}

export function signMessage(message, privateKey) {
    if (!message || !privateKey) {
        console.error('Message or private key is missing');
        return '';
    }
    const messageUint8 = new TextEncoder().encode(message);
    return base64Encode(sign.detached(messageUint8, base64Decode(privateKey)));
}

export function encryptChannelMessage(plaintext, channelKey) {
    const nonce = randomBytes(secretbox.nonceLength);
    const messageUint8 = new TextEncoder().encode(plaintext);
    const keyUint8 = base64Decode(channelKey);

    const encrypted = secretbox(messageUint8, nonce, keyUint8);

    return [base64Encode(encrypted), base64Encode(nonce)];
}

/**
 * Verify an Ed25519 detached signature against a message and public key.
 * Fail-closed: any exception returns false.
 */
export function verifySignature(message, signature, publicKey) {
    try {
        if (typeof message !== 'string' || typeof signature !== 'string' || typeof publicKey !== 'string') {
            return false;
        }
        if (!message || !signature || !publicKey) return false;

        const signatureBytes = base64Decode(signature);
        const publicKeyBytes = base64Decode(publicKey);
        const messageBytes = new TextEncoder().encode(message);

        if (signatureBytes.length !== 64) return false;
        if (publicKeyBytes.length !== 32) return false;

        return sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
        return false;
    }
}

// --- Ed25519 <-> X25519 key conversion ---

/**
 * Modular inverse in GF(2^255-19) via Fermat's little theorem: a^(p-2) mod p.
 * Uses the standard addition chain for p-2 = 2^255 - 21.
 */
function inv25519(o, a) {
    const c = ll.gf();
    for (let i = 0; i < 16; i++) c[i] = a[i];
    for (let i = 253; i >= 0; i--) {
        ll.S(c, c);
        if (i !== 2 && i !== 4) ll.M(c, c, a);
    }
    for (let i = 0; i < 16; i++) o[i] = c[i];
}

/**
 * Convert Ed25519 public key (Edwards form) to X25519 public key (Montgomery form).
 * Formula: u = (1 + y) / (1 - y) mod p
 */
function ed25519PubKeyToX25519(edPubKey) {
    const edPk = new Uint8Array(edPubKey);
    edPk[31] &= 0x7f; // clear sign bit to get y coordinate

    const y = ll.gf();
    ll.unpack25519(y, edPk);

    const one = ll.gf([1]);
    const num = ll.gf();
    const den = ll.gf();
    const denInv = ll.gf();
    const u = ll.gf();

    ll.A(num, one, y);        // num = 1 + y
    ll.Z(den, one, y);        // den = 1 - y
    inv25519(denInv, den);    // denInv = 1 / den
    ll.M(u, num, denInv);     // u = num * denInv

    const result = new Uint8Array(32);
    ll.pack25519(result, u);
    return result;
}

/**
 * Convert Ed25519 secret key (64 bytes: seed||pubKey) to X25519 secret key (32 bytes).
 * Hashes the 32-byte seed with SHA-512 and clamps the first 32 bytes.
 */
function ed25519PrivKeyToX25519(edSecretKey) {
    const seed = edSecretKey.slice(0, 32);
    const hash = new Uint8Array(64);
    ll.crypto_hash(hash, seed, 32);
    hash[0] &= 248;
    hash[31] &= 127;
    hash[31] |= 64;
    return hash.slice(0, 32);
}

// --- Channel encryption/decryption ---

export function decryptChannelMessage(encryptedBase64, nonceBase64, channelKeyBase64) {
    try {
        const encrypted = base64Decode(encryptedBase64);
        const nonce = base64Decode(nonceBase64);
        const key = base64Decode(channelKeyBase64);
        const decrypted = secretbox.open(encrypted, nonce, key);
        if (!decrypted) return null;
        return new TextDecoder().decode(decrypted);
    } catch {
        return null;
    }
}

// --- Direct message encryption/decryption ---

export function encryptDirectMessage(plaintext, recipientPubKey) {
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    const messageUint8 = new TextEncoder().encode(plaintext);

    // Convert Ed25519 recipient pubkey to X25519 for box encryption
    const x25519PubKey = ed25519PubKeyToX25519(base64Decode(recipientPubKey));

    const encrypted = box(
        messageUint8,
        nonce,
        x25519PubKey,
        ephemeralKeyPair.secretKey
    );

    return [base64Encode(encrypted), base64Encode(nonce), base64Encode(ephemeralKeyPair.publicKey)];
}

export function decryptDirectMessage(encryptedBase64, nonceBase64, ephemeralPubKeyBase64, recipientPrivKeyBase64) {
    try {
        const encrypted = base64Decode(encryptedBase64);
        const nonce = base64Decode(nonceBase64);
        const ephemeralPubKey = base64Decode(ephemeralPubKeyBase64);
        const recipientEdPrivKey = base64Decode(recipientPrivKeyBase64);

        // Convert Ed25519 private key to X25519 for box decryption
        const x25519SecKey = ed25519PrivKeyToX25519(recipientEdPrivKey);

        const decrypted = box.open(encrypted, nonce, ephemeralPubKey, x25519SecKey);
        if (!decrypted) return null;
        return new TextDecoder().decode(decrypted);
    } catch {
        return null;
    }
}
