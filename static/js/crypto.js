const { secretbox, box, sign, randomBytes } = window.nacl;

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

// Unused
function generateNonce() {
    return base64Encode(randomBytes(box.nonceLength));
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
 * @param {string} message - The message that was signed.
 * @param {string} signature - Base64-encoded Ed25519 detached signature.
 * @param {string} publicKey - Base64-encoded Ed25519 public key.
 * @returns {boolean}
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

export function encryptDirectMessage(plaintext, recipientPubKey) {
    const ephemeralKeyPair = box.keyPair();
    const nonce = randomBytes(box.nonceLength);
    const messageUint8 = new TextEncoder().encode(plaintext);

    const encrypted = box(
        messageUint8,
        nonce,
        base64Decode(recipientPubKey),
        ephemeralKeyPair.secretKey
    );

    return [base64Encode(encrypted), base64Encode(nonce), base64Encode(ephemeralKeyPair.publicKey)];
}