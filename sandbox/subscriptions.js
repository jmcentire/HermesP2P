'use strict';

const crypto = require('node:crypto');
const { assert, fields, id, integer, bytes, publicKey, canonical, sign, verify } = require('./signatures');
const PUBLISHER_DOMAIN = 'hp2p.sandbox.subscription.publisher.v1';
const WEEK = 7 * 24 * 60 * 60 * 1000;
function monthStart(epoch) {
  assert(typeof epoch === 'string' && /^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$/.test(epoch), 'invalid UTC month');
  return Date.parse(`${epoch}-01T00:00:00.000Z`);
}
function utcMonth(now) { integer(now); const epoch = new Date(now).toISOString().slice(0, 7); monthStart(epoch); return epoch; }
function negotiationWindow(epoch, now) {
  integer(now); const boundary = monthStart(epoch);
  return now >= boundary - WEEK && now <= boundary + WEEK;
}
function payload(value) { assert(typeof value === 'string' && Buffer.byteLength(value) <= 65536, 'invalid text payload'); }
function publisherMessage(body, identity) {
  fields(body, ['channel', 'epoch', 'id', 'text']); id(body.channel); id(body.id); monthStart(body.epoch); payload(body.text);
  return sign(PUBLISHER_DOMAIN, body, identity);
}
function readPublisherMessage(envelope, { channel, publisher, epoch }) {
  id(channel); publicKey(publisher); monthStart(epoch);
  const body = verify(PUBLISHER_DOMAIN, envelope);
  fields(body, ['channel', 'epoch', 'id', 'text']); id(body.id); payload(body.text);
  assert(envelope.signer === publisher && body.channel === channel && body.epoch === epoch, 'wrong publisher or subscription scope');
  return body.text;
}

/** Group members can all forge group messages. This does not authenticate a publisher. */
class MonthlySymmetricChannel {
  #channel; #keys = new Map(); #usedKeys = new Set();
  constructor(channel) { id(channel); this.#channel = channel; }
  addEpoch(epoch, encodedKey) {
    monthStart(epoch); const key = bytes(encodedKey, 32);
    assert(!this.#keys.has(epoch), 'epoch already configured');
    assert(!this.#usedKeys.has(encodedKey), 'monthly keys must rotate');
    this.#keys.set(epoch, key); this.#usedKeys.add(encodedKey);
  }
  seal(text, messageId, now) {
    payload(text); id(messageId); const epoch = utcMonth(now), key = this.#keys.get(epoch);
    assert(key, 'current monthly key required');
    const header = { channel: this.#channel, epoch, id: messageId };
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(canonical(header)));
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return { ...header, nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }
  open(envelope) {
    fields(envelope, ['channel', 'epoch', 'id', 'nonce', 'ciphertext', 'tag']); id(envelope.id); monthStart(envelope.epoch);
    assert(envelope.channel === this.#channel, 'wrong channel');
    const key = this.#keys.get(envelope.epoch); assert(key, 'monthly key unavailable');
    assert(typeof envelope.ciphertext === 'string' && envelope.ciphertext.length <= 87384, 'invalid ciphertext');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    assert(ciphertext.toString('base64') === envelope.ciphertext && ciphertext.length <= 65536, 'invalid ciphertext encoding');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes(envelope.nonce, 12));
    decipher.setAAD(Buffer.from(canonical({ channel: envelope.channel, epoch: envelope.epoch, id: envelope.id })));
    decipher.setAuthTag(bytes(envelope.tag, 16));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
  // Sign the complete subscription scope, then encrypt with that month's group key.
  sealPublisherMessage(text, messageId, publisherIdentity, now) {
    const signed = publisherMessage({ channel: this.#channel, epoch: utcMonth(now), id: messageId, text }, publisherIdentity);
    return this.seal(canonical(signed), messageId, now);
  }
  openPublisherMessage(envelope, expectedPublisher) {
    const signed = JSON.parse(this.open(envelope));
    const text = readPublisherMessage(signed, { channel: this.#channel, epoch: envelope.epoch, publisher: expectedPublisher });
    assert(signed.body.id === envelope.id, 'publisher message id mismatch');
    return text;
  }
}
module.exports = { PUBLISHER_DOMAIN, WEEK, monthStart, utcMonth, negotiationWindow, publisherMessage, readPublisherMessage, MonthlySymmetricChannel };
