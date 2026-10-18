'use strict';

// Dummy-only application adapters. No networking, real tokens, payments or media verifier.
const { assert, fields, id, integer, publicKey, canonical, verify, digest, freeze } = require('./signatures');
const { domain } = require('./credits');
const { monthStart } = require('./subscriptions');
const CAMPAIGN_DOMAIN = 'hp2p.sandbox.advertising.campaign.v1';
const MAX_RECORDS = 1024;
const copy = value => freeze(JSON.parse(canonical(value)));
function bounded(map) { assert(map.size < MAX_RECORDS, 'sandbox record limit'); }
function hash(value) { assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'invalid digest'); }
function superlikeService(target, creator) { id(target); publicKey(creator); return `superlike_${digest({ target, creator })}`; }
function subscriptionService(product, epoch, creator) { id(product); monthStart(epoch); publicKey(creator); return `subscription_${digest({ product, epoch, creator })}`; }
function subscriptionKey(product, epoch) { id(product); monthStart(epoch); return JSON.stringify([product, epoch]); }
function advertisingRequirement(campaign, actionHash, recipient) {
  return digest({ campaign, actionHash, recipient });
}

class DummyUseCases {
  #authority; #lastNow = -1; #promises = new Map(); #campaigns = new Map(); #campaignIds = new Map();
  #proofs = new Map(); #subscriptions = new Map(); #purchases = new Map();
  constructor(authority) { this.#authority = authority; }
  #observeTime(now) {
    integer(now); assert(now >= this.#lastNow, 'application clock rollback');
    this.#lastNow = now;
  }
  receivePromise(envelope) {
    const body = verify(domain(envelope.body?.kind, 'transfer'), envelope);
    fields(body, ['id', 'kind', 'inputs', 'outputs']); id(body.id);
    const promiseId = digest(envelope);
    if (!this.#promises.has(promiseId)) {
      bounded(this.#promises);
      this.#promises.set(promiseId, { envelope: copy(envelope), status: 'pending' });
    }
    return freeze({ promiseId, status: this.#promises.get(promiseId).status });
  }
  settlePromise(promiseId, now) {
    this.#observeTime(now);
    const pending = this.#promises.get(promiseId); assert(pending, 'unknown promise');
    // Signature collection alone never creates balance. Authority acceptance does.
    const receipt = this.#authority.transfer(pending.envelope, now);
    pending.status = 'settled';
    return freeze({ promiseId, status: 'settled', receipt });
  }
  redeemSuperlike(target, creator, envelope, now) {
    try {
      this.#observeTime(now);
      const service = superlikeService(target, creator);
      assert(envelope.body.kind === 'ordinary' && envelope.body.service === service, 'wrong superlike target or currency');
      this.#authority.redeem(envelope, now);
      return freeze({ reaction: 'superlike', funding: 'settled', creator, entitlement: null, rankingWeight: 1 });
    } catch {
      // An unsolicited, invalid or unfunded promise grants no paid benefit.
      return freeze({ reaction: 'like', funding: 'unverified', entitlement: null, rankingWeight: 1 });
    }
  }
  registerCampaign(envelope) {
    const body = verify(CAMPAIGN_DOMAIN, envelope);
    fields(body, ['id', 'budget', 'actionHash', 'expiresAt']); id(body.id); integer(body.budget, 1); integer(body.expiresAt, 1); hash(body.actionHash);
    const campaign = digest(envelope), scope = JSON.stringify([envelope.signer, body.id]);
    const existing = this.#campaignIds.get(scope);
    if (existing) { assert(existing === campaign, 'conflicting campaign id'); return campaign; }
    bounded(this.#campaigns);
    this.#campaigns.set(campaign, { envelope: copy(envelope), paid: 0, recipients: new Set() });
    this.#campaignIds.set(scope, campaign);
    return campaign;
  }
  collectAdvertisingProof(campaign, offerEnvelope, claimEnvelope) {
    const entry = this.#campaigns.get(campaign); assert(entry, 'unknown campaign');
    const offer = verify(domain('advertising', 'offer'), offerEnvelope);
    const claim = verify(domain('advertising', 'claim'), claimEnvelope);
    fields(offer, ['id', 'kind', 'inputs', 'recipient', 'amount', 'expiresAt', 'requirementsHash', 'challenge']);
    fields(claim, ['id', 'offerHash', 'challenge', 'evidenceHash']);
    id(offer.id); id(claim.id); integer(offer.amount, 1); hash(claim.evidenceHash);
    assert(offer.kind === 'advertising' && offerEnvelope.signer === entry.envelope.signer, 'wrong advertising campaign owner');
    assert(offer.requirementsHash === advertisingRequirement(campaign, entry.envelope.body.actionHash, offer.recipient), 'wrong campaign action or recipient');
    assert(claimEnvelope.signer === offer.recipient && claim.offerHash === digest(offerEnvelope) && claim.challenge === offer.challenge, 'claim not bound to offer recipient');
    const proofId = digest({ campaign, offerEnvelope, claimEnvelope });
    if (!this.#proofs.has(proofId)) {
      bounded(this.#proofs);
      this.#proofs.set(proofId, { campaign, offer: copy(offerEnvelope), claim: copy(claimEnvelope), receipt: null });
    }
    return freeze({ proofId, status: this.#proofs.get(proofId).receipt ? 'settled' : 'collected' });
  }
  redeemAdvertisingProof(proofId, now) {
    this.#observeTime(now);
    const proof = this.#proofs.get(proofId); assert(proof, 'unknown proof');
    const entry = this.#campaigns.get(proof.campaign);
    if (proof.receipt) {
      // Let the authority enforce its clock and exact-operation retry contract.
      return this.#authority.reward(proof.offer, proof.claim, now);
    }
    assert(now < entry.envelope.body.expiresAt, 'campaign expired');
    assert(!entry.recipients.has(proof.offer.body.recipient), 'campaign action already rewarded for recipient');
    integer(entry.paid + proof.offer.body.amount);
    assert(entry.paid + proof.offer.body.amount <= entry.envelope.body.budget, 'campaign budget exhausted');
    const receipt = this.#authority.reward(proof.offer, proof.claim, now);
    entry.paid += proof.offer.body.amount;
    entry.recipients.add(proof.offer.body.recipient);
    proof.receipt = receipt;
    return receipt;
  }
  campaignStatus(campaign) {
    const entry = this.#campaigns.get(campaign); assert(entry, 'unknown campaign');
    return freeze({ budget: entry.envelope.body.budget, paid: entry.paid, remaining: entry.envelope.body.budget - entry.paid });
  }
  registerSubscription(product) {
    fields(product, ['id', 'epoch', 'creator', 'price', 'capacity', 'token']);
    id(product.id); monthStart(product.epoch); integer(product.price, 1); integer(product.capacity, 1);
    assert(typeof product.token === 'string' && product.token.startsWith('dummy:') && product.token.length <= 256, 'dummy token required');
    const service = subscriptionService(product.id, product.epoch, product.creator), key = subscriptionKey(product.id, product.epoch), existing = this.#subscriptions.get(key);
    if (existing) { assert(canonical(existing.product) === canonical(product), 'conflicting subscription'); return service; }
    bounded(this.#subscriptions);
    this.#subscriptions.set(key, { product: copy(product), issued: 0 });
    return service;
  }
  releaseSubscription(productId, epoch, envelope, now) {
    this.#observeTime(now);
    const entry = this.#subscriptions.get(subscriptionKey(productId, epoch));
    assert(entry, 'unknown subscription');
    const service = subscriptionService(productId, epoch, entry.product.creator);
    const body = verify(domain('ordinary', 'redeem'), envelope);
    fields(body, ['id', 'kind', 'inputs', 'service']);
    assert(body.kind === 'ordinary' && body.service === service, 'wrong subscription payment purpose');
    const purchaseId = digest(envelope), existing = this.#purchases.get(purchaseId);
    if (existing) { this.#authority.redeem(envelope, now); return existing; }
    assert(entry.issued < entry.product.capacity, 'subscription capacity exhausted');
    bounded(this.#purchases);
    assert(Array.isArray(body.inputs) && body.inputs.length > 0 && new Set(body.inputs).size === body.inputs.length, 'invalid payment inputs');
    const unspent = new Map(this.#authority.snapshot().unspent.map(input => [input.ref, input]));
    let amount = 0;
    for (const ref of body.inputs) {
      const input = unspent.get(ref); assert(input, 'payment is not settled spendable credit');
      assert(input.kind === 'ordinary' && input.owner === envelope.signer, 'wrong payment currency or owner');
      amount += input.amount; integer(amount);
    }
    assert(amount === entry.product.price, 'exact settled subscription price required');
    // Synchronous authority acceptance and release form one in-memory transition.
    // A real external service would require durable settlement and an outbox.
    this.#authority.redeem(envelope, now);
    const result = freeze({ status: 'released', product: productId, epoch, creator: entry.product.creator, token: entry.product.token });
    entry.issued++;
    this.#purchases.set(purchaseId, result);
    return result;
  }
  subscriptionStatus(productId, epoch) {
    const entry = this.#subscriptions.get(subscriptionKey(productId, epoch)); assert(entry, 'unknown subscription');
    return freeze({ issued: entry.issued, remaining: entry.product.capacity - entry.issued });
  }
}
module.exports = { DummyUseCases, CAMPAIGN_DOMAIN, superlikeService, subscriptionService, advertisingRequirement };
