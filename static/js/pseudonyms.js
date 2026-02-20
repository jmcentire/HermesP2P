/**
 * Channel-Keyed Pseudonyms Module
 *
 * Deterministic per-channel pseudonym generation using HKDF + HMAC-SHA256
 * via Web Crypto API. Same (privateKey, channelId) always produces the
 * same pseudonym; different channels produce unlinkable pseudonyms.
 */

const INFO_STRING = 'hermes-pseudonym';
const SALT = new Uint8Array(0);
const IKM_LENGTH = 32;

/**
 * Generates a deterministic, channel-specific pseudonym from an Ed25519
 * private key and a channel identifier.
 * @param {string} privateKeyBase64 - Base64-encoded Ed25519 secret key (64 bytes decoded).
 * @param {string} channelId - Non-empty channel identifier string.
 * @returns {Promise<string>} A 44-character base64 pseudonym string.
 */
export async function generatePseudonym(privateKeyBase64, channelId) {
  if (typeof privateKeyBase64 !== 'string' || !privateKeyBase64) {
    throw new TypeError('missing_private_key: privateKeyBase64 is required and must be a non-empty string');
  }
  if (typeof channelId !== 'string' || !channelId) {
    throw new TypeError('missing_channel_id: channelId is required and must be a non-empty string');
  }

  const b64 = window.base64js || globalThis.base64js;
  if (!b64) {
    throw new Error('base64js_unavailable: window.base64js is required but not available');
  }
  if (!crypto.subtle) {
    throw new Error('webcrypto_unavailable: crypto.subtle is required but not available');
  }

  let keyBytes;
  try {
    keyBytes = b64.toByteArray(privateKeyBase64);
  } catch (e) {
    throw new Error('invalid_base64_private_key: Failed to decode privateKeyBase64: invalid base64');
  }

  if (keyBytes.length < IKM_LENGTH) {
    throw new RangeError('private_key_too_short: privateKeyBase64 must decode to at least 32 bytes');
  }

  const ikm = keyBytes.slice(0, IKM_LENGTH);
  const encoder = new TextEncoder();
  const infoBytes = encoder.encode(INFO_STRING);
  const channelBytes = encoder.encode(channelId);

  // Import IKM as HKDF key
  const hkdfKey = await crypto.subtle.importKey(
    'raw', ikm, { name: 'HKDF' }, false, ['deriveKey']
  );

  // Derive HMAC key via HKDF
  const hmacKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: infoBytes },
    hkdfKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );

  // Sign channelId with HMAC key
  const signature = await crypto.subtle.sign('HMAC', hmacKey, channelBytes);

  return b64.fromByteArray(new Uint8Array(signature));
}

/**
 * Returns the first `length` characters of a base64-encoded pseudonym.
 * @param {string} pseudonymBase64 - A base64 pseudonym string.
 * @param {number} [length=8] - Number of characters to return.
 * @returns {string} The shortened pseudonym for display.
 */
export function shortenPseudonym(pseudonymBase64, length = 8) {
  if (typeof pseudonymBase64 !== 'string') {
    throw new TypeError('invalid_pseudonym_type: pseudonymBase64 must be a string');
  }
  if (typeof length !== 'number' || !Number.isInteger(length)) {
    throw new TypeError('invalid_length_type: length must be an integer');
  }
  const clamped = Math.min(Math.max(0, length), pseudonymBase64.length);
  return pseudonymBase64.substring(0, clamped);
}
