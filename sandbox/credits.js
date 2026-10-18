'use strict';

const { assert, fields, id, integer, publicKey, verify, digest, freeze } = require('./signatures');
const KINDS = Object.freeze(['ordinary', 'advertising']);
const FEE_BASIS_POINTS = Object.freeze({ ordinary: 500, advertising: 2000 });
const domain = (kind, action) => {
  assert(KINDS.includes(kind), 'invalid currency kind');
  assert(['issue', 'transfer', 'redeem', 'offer', 'claim'].includes(action), 'invalid action');
  return `hp2p.sandbox.${kind}.${action}.v1`;
};
function sum(values) {
  return values.reduce((total, value) => { integer(value, 1); integer(total + value); return total + value; }, 0);
}
function expiry(value, now) { integer(value, 1); assert(value > now, 'expired'); }
function list(value) { assert(Array.isArray(value) && value.length > 0 && value.length <= 64, 'invalid list'); }

/** A SINGLE synchronous, trusted in-memory authority, for DUMMY units only. */
class DummyCreditAuthority {
  #issuer; #lastNow = -1; #unspent = new Map(); #operations = new Map(); #claims = new Map();
  #issued = { ordinary: 0, advertising: 0 }; #redeemed = { ordinary: 0, advertising: 0 };
  constructor(issuer) { publicKey(issuer); this.#issuer = issuer; }
  #observeTime(now) {
    integer(now); assert(now >= this.#lastNow, 'authority clock rollback');
    this.#lastNow = now;
  }
  #operationKey(envelope, action) {
    id(envelope.body.id);
    return JSON.stringify([domain(envelope.body.kind, action), envelope.signer, envelope.body.id]);
  }
  #retry(operationKey, fingerprint) {
    const prior = this.#operations.get(operationKey);
    if (prior) { assert(prior.fingerprint === fingerprint, 'conflicting operation id'); return prior.receipt; }
  }
  #inputs(refs, owner, kind, now) {
    list(refs); assert(new Set(refs).size === refs.length, 'duplicate input');
    return refs.map(ref => {
      assert(typeof ref === 'string', 'invalid provenance');
      const input = this.#unspent.get(ref);
      assert(input, 'unknown or spent provenance');
      assert(input.owner === owner && input.kind === kind, 'wrong owner or currency');
      expiry(input.expiresAt, now);
      return input;
    });
  }
  #commit(body, fingerprint, operationKey, consumed, outputs, redeemed = 0) {
    const provenance = digest({ operation: body.id, fingerprint });
    const created = outputs.map((output, index) => freeze({ ...output, kind: body.kind, ref: `${body.id}:${index}:${provenance}` }));
    const receipt = freeze({ id: body.id, kind: body.kind, outputs: created, redeemed });
    // Every validation and arithmetic check precedes this synchronous mutation.
    consumed.forEach(input => this.#unspent.delete(input.ref));
    created.forEach(output => this.#unspent.set(output.ref, output));
    this.#operations.set(operationKey, { fingerprint, receipt });
    return receipt;
  }
  issue(envelope, now) {
    this.#observeTime(now);
    const body = verify(domain(envelope.body?.kind, 'issue'), envelope);
    fields(body, ['id', 'kind', 'owner', 'amount', 'expiresAt']);
    assert(envelope.signer === this.#issuer, 'issuer signature required');
    publicKey(body.owner); integer(body.amount, 1);
    const operationKey = this.#operationKey(envelope, 'issue');
    const fingerprint = digest(envelope), retry = this.#retry(operationKey, fingerprint);
    if (retry) return retry;
    expiry(body.expiresAt, now);
    integer(this.#issued[body.kind] + body.amount);
    const receipt = this.#commit(body, fingerprint, operationKey, [], [{ owner: body.owner, amount: body.amount, expiresAt: body.expiresAt }]);
    this.#issued[body.kind] += body.amount;
    return receipt;
  }
  transfer(envelope, now) {
    this.#observeTime(now);
    const body = verify(domain(envelope.body?.kind, 'transfer'), envelope);
    fields(body, ['id', 'kind', 'inputs', 'outputs']);
    const operationKey = this.#operationKey(envelope, 'transfer');
    const fingerprint = digest(envelope), retry = this.#retry(operationKey, fingerprint);
    if (retry) return retry;
    const inputs = this.#inputs(body.inputs, envelope.signer, body.kind, now);
    const expiresAt = Math.min(...inputs.map(input => input.expiresAt));
    list(body.outputs);
    const outputs = body.outputs.map(output => {
      fields(output, ['owner', 'amount']); publicKey(output.owner); integer(output.amount, 1);
      return { ...output, expiresAt };
    });
    assert(sum(inputs.map(input => input.amount)) === sum(outputs.map(output => output.amount)), 'supply must be conserved');
    return this.#commit(body, fingerprint, operationKey, inputs, outputs);
  }
  redeem(envelope, now) {
    this.#observeTime(now);
    const body = verify(domain(envelope.body?.kind, 'redeem'), envelope);
    fields(body, ['id', 'kind', 'inputs', 'service']); id(body.service);
    const operationKey = this.#operationKey(envelope, 'redeem');
    const fingerprint = digest(envelope), retry = this.#retry(operationKey, fingerprint);
    if (retry) return retry;
    const inputs = this.#inputs(body.inputs, envelope.signer, body.kind, now);
    const amount = sum(inputs.map(input => input.amount));
    integer(this.#redeemed[body.kind] + amount);
    const receipt = this.#commit(body, fingerprint, operationKey, inputs, [], amount);
    this.#redeemed[body.kind] += amount;
    return receipt;
  }
  reward(offerEnvelope, claimEnvelope, now) {
    this.#observeTime(now);
    const offer = verify(domain('advertising', 'offer'), offerEnvelope);
    const claim = verify(domain('advertising', 'claim'), claimEnvelope);
    fields(offer, ['id', 'kind', 'inputs', 'recipient', 'amount', 'expiresAt', 'requirementsHash', 'challenge']);
    fields(claim, ['id', 'offerHash', 'challenge', 'evidenceHash']);
    assert(offer.kind === 'advertising', 'only advertising credits reward');
    publicKey(offer.recipient); integer(offer.amount, 1); id(offer.challenge); id(claim.id);
    for (const hash of [offer.requirementsHash, claim.offerHash, claim.evidenceHash]) assert(typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'invalid digest');
    assert(claimEnvelope.signer === offer.recipient, 'recipient signature required');
    assert(claim.offerHash === digest(offerEnvelope) && claim.challenge === offer.challenge, 'claim not bound to offer');
    const operationKey = this.#operationKey(offerEnvelope, 'offer');
    const claimKey = JSON.stringify([claimEnvelope.signer, claim.id]);
    const fingerprint = digest({ offerEnvelope, claimEnvelope }), retry = this.#retry(operationKey, fingerprint);
    if (retry) return retry;
    assert(!this.#claims.has(claimKey), 'claim replay');
    expiry(offer.expiresAt, now);
    const inputs = this.#inputs(offer.inputs, offerEnvelope.signer, 'advertising', now);
    const total = sum(inputs.map(input => input.amount));
    assert(offer.amount <= total, 'insufficient advertising credits');
    const expiresAt = Math.min(...inputs.map(input => input.expiresAt));
    const outputs = [{ owner: offer.recipient, amount: offer.amount, expiresAt }];
    if (total > offer.amount) outputs.push({ owner: offerEnvelope.signer, amount: total - offer.amount, expiresAt });
    const receipt = this.#commit(offer, fingerprint, operationKey, inputs, outputs);
    this.#claims.set(claimKey, fingerprint);
    return receipt;
  }
  snapshot() {
    const unspent = [...this.#unspent.values()];
    return freeze({ issued: { ...this.#issued }, redeemed: { ...this.#redeemed }, unspent,
      outstanding: Object.fromEntries(KINDS.map(kind => [kind, sum(unspent.filter(u => u.kind === kind).map(u => u.amount))])) });
  }
}
module.exports = { DummyCreditAuthority, domain, FEE_BASIS_POINTS };
