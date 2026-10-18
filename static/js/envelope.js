// Versioned integrity envelope. Public scope keys authenticate pseudonyms; sealed payloads bind fresh outer proof keys internally.
import { verifySignature } from './crypto.js';
import { isExpired, getDefaultTTL } from './ttl.js';

export function signingPayload(message) {
    return JSON.stringify(['hp2p:message:v2', message.id, message.type,
        message.timestamp, message.ttl, message.to, message.from?.name,
        message.from?.pubKey || null, message.from?.proofKey || null, message.message]);
}

export function validEnvelope(message) {
    try {
        if (!message || Object.keys(message).sort().join(',') !== 'from,id,message,signature,timestamp,to,ttl,type,version' ||
            !message.from || Object.keys(message.from).sort().join(',') !== 'name,proofKey' || message.version !== 2 ||
            !['public', 'private', 'direct'].includes(message.type) ||
            typeof message.id !== 'string' || message.id.length > 128 || !message.id ||
            typeof message.to !== 'string' || message.to.length > 256 || !message.to ||
            typeof message.from?.name !== 'string' || message.from.name.length > 128 ||
            typeof message.message !== 'string' || message.message.length > 65534 ||
            !Number.isSafeInteger(message.timestamp) || message.timestamp > Date.now() + 30000 ||
            !Number.isInteger(message.ttl) || message.ttl <= 0 ||
            message.ttl > getDefaultTTL(message.type) || isExpired(message)) return false;
        if (message.type === 'public' && message.from.name !== message.from.proofKey) return false;
        if (message.type !== 'public' && (message.from.name !== 'Anonymous' || message.to !== 'sealed')) return false;
        const key = message.from.proofKey;
        if (message.from.pubKey) return false;
        return verifySignature(signingPayload(message), message.signature, key);
    } catch { return false; }
}
