'use strict';

// Reference-only cryptography. No networking, persistence, wallets or real funds.
const crypto = require('node:crypto');

function assert(ok, message) { if (!ok) throw new Error(message); }
function fields(value, expected) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, 'expected plain object');
  assert(Object.keys(value).sort().join(',') === [...expected].sort().join(','), 'unexpected fields');
}
function id(value) { assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value), 'invalid identifier'); }
function integer(value, minimum = 0) { assert(Number.isSafeInteger(value) && value >= minimum, 'invalid integer'); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { integer(value); return String(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert(value && Object.getPrototypeOf(value) === Object.prototype, 'invalid signed value');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function bytes(value, length) {
  assert(typeof value === 'string', 'invalid base64');
  const result = Buffer.from(value, 'base64');
  assert(result.toString('base64') === value && result.length === length, 'invalid base64 length');
  return result;
}
function publicKey(value) {
  const der = bytes(value, 44);
  const key = crypto.createPublicKey({ key: der, type: 'spki', format: 'der' });
  assert(key.asymmetricKeyType === 'ed25519' && key.export({ type: 'spki', format: 'der' }).equals(der), 'invalid Ed25519 key');
  return key;
}
function generateIdentity() {
  const { publicKey: key, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKey: key.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey };
}
function signedBytes(domain, body) {
  assert(typeof domain === 'string' && /^hp2p\.sandbox\.[a-z.-]+\.v1$/.test(domain), 'invalid signature domain');
  return Buffer.from(canonical({ domain, body }));
}
function sign(domain, body, identity) {
  publicKey(identity.publicKey);
  assert(identity.privateKey?.asymmetricKeyType === 'ed25519', 'invalid signing key');
  const snapshot = JSON.parse(canonical(body));
  return { body: snapshot, signer: identity.publicKey, signature: crypto.sign(null, signedBytes(domain, snapshot), identity.privateKey).toString('base64') };
}
function verify(domain, envelope) {
  fields(envelope, ['body', 'signer', 'signature']);
  assert(crypto.verify(null, signedBytes(domain, envelope.body), publicKey(envelope.signer), bytes(envelope.signature, 64)), 'invalid signature');
  return envelope.body;
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
module.exports = { assert, fields, id, integer, canonical, bytes, publicKey, generateIdentity, sign, verify, digest, freeze };
