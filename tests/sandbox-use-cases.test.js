'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateIdentity, sign, digest } = require('../sandbox/signatures');
const { DummyCreditAuthority, domain } = require('../sandbox/credits');
const { DummyUseCases, CAMPAIGN_DOMAIN, superlikeService, subscriptionService, advertisingRequirement } = require('../sandbox/use-cases');
const NOW = 1793491200000, EXPIRY = NOW + 10000;
function fixture() {
  const issuer = generateIdentity(), advertiser = generateIdentity(), recipient = generateIdentity(), creator = generateIdentity();
  const ledger = new DummyCreditAuthority(issuer.publicKey), uses = new DummyUseCases(ledger);
  function mint(owner, amount = 7, kind = 'ordinary', id = 'mint') {
    return ledger.issue(sign(domain(kind, 'issue'), { id, kind, owner: owner.publicKey, amount, expiresAt: EXPIRY }, issuer), NOW).outputs[0];
  }
  return { ledger, uses, issuer, advertiser, recipient, creator, mint };
}
function payment(owner, ref, service, id = 'payment', kind = 'ordinary') {
  return sign(domain(kind, 'redeem'), { id, kind, inputs: [ref], service }, owner);
}
function subscribe(uses, creator, capacity = 1, price = 7) {
  const product = { id: 'creator-news', epoch: '2026-11', creator: creator.publicKey, price, capacity, token: 'dummy:november-membership' };
  return { ...product, service: uses.registerSubscription(product) };
}
function campaign(uses, advertiser, budget = 10, id = 'campaign') {
  const actionHash = digest('agreed video action and evidence claim; not human attention');
  const signed = sign(CAMPAIGN_DOMAIN, { id, budget, actionHash, expiresAt: EXPIRY }, advertiser);
  return { ref: uses.registerCampaign(signed), actionHash, signed };
}
function proof(advertiser, recipient, input, campaignInfo, suffix = '') {
  const offer = sign(domain('advertising', 'offer'), {
    id: 'offer' + suffix, kind: 'advertising', inputs: [input.ref], recipient: recipient.publicKey,
    amount: 7, expiresAt: EXPIRY, challenge: 'challenge' + suffix,
    requirementsHash: advertisingRequirement(campaignInfo.ref, campaignInfo.actionHash, recipient.publicKey)
  }, advertiser);
  const claim = sign(domain('advertising', 'claim'), { id: 'claim' + suffix, offerHash: digest(offer),
    challenge: offer.body.challenge, evidenceHash: digest('signed agreed action/evidence claim') }, recipient);
  return { offer, claim };
}
test('signed promises create no balance; settlement alone creates spendable recipient outputs', () => {
  const { ledger, uses, advertiser, recipient, mint } = fixture();
  const input = mint(advertiser, 47);
  const transfer = sign(domain('ordinary', 'transfer'), { id: 'promise', kind: 'ordinary', inputs: [input.ref], outputs: [{ owner: recipient.publicKey, amount: 47 }] }, advertiser);
  const before = ledger.snapshot(), pending = uses.receivePromise(transfer);
  assert.equal(pending.status, 'pending'); assert.deepEqual(ledger.snapshot(), before);
  const settled = uses.settlePromise(pending.promiseId, NOW);
  assert.equal(settled.status, 'settled'); assert.equal(settled.receipt.outputs[0].owner, recipient.publicKey);
  assert.equal(ledger.snapshot().issued.ordinary, 47); assert.equal(ledger.snapshot().outstanding.ordinary, 47);
  assert.equal(uses.receivePromise(transfer).status, 'settled');
});
test('unfunded promises and wrong creator targets degrade superlikes to ordinary likes without paid entitlement', () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const pending = uses.receivePromise(sign(domain('ordinary', 'transfer'), { id: 'unfunded', kind: 'ordinary', inputs: ['invented-provenance'], outputs: [{ owner: recipient.publicKey, amount: 50 }] }, advertiser));
  assert.throws(() => uses.settlePromise(pending.promiseId, NOW), /provenance/);
  const service = superlikeService('post', creator.publicKey);
  const fallback = uses.redeemSuperlike('post', creator.publicKey, payment(recipient, 'invented-provenance', service), NOW);
  assert.deepEqual(fallback, { reaction: 'like', funding: 'unverified', entitlement: null, rankingWeight: 1 });
  const input = mint(recipient);
  const valid = payment(recipient, input.ref, service);
  assert.equal(uses.redeemSuperlike('post', advertiser.publicKey, valid, NOW).reaction, 'like');
  assert.equal(ledger.snapshot().outstanding.ordinary, 7);
  const settled = uses.redeemSuperlike('post', creator.publicKey, valid, NOW);
  assert.equal(settled.reaction, 'superlike'); assert.equal(settled.funding, 'settled');
  assert.equal(settled.entitlement, null); assert.equal(settled.rankingWeight, fallback.rankingWeight);
});
test('self-tipping and repeated superlikes cannot create new issued value or payout', () => {
  const { ledger, uses, recipient, mint } = fixture(); const input = mint(recipient, 47);
  const service = superlikeService('own-post', recipient.publicKey), op = payment(recipient, input.ref, service);
  assert.equal(uses.redeemSuperlike('own-post', recipient.publicKey, op, NOW).funding, 'settled');
  assert.equal(uses.redeemSuperlike('own-post', recipient.publicKey, op, NOW).funding, 'settled');
  assert.equal(uses.redeemSuperlike('own-post', recipient.publicKey, payment(recipient, input.ref, service, 'double'), NOW).reaction, 'like');
  const state = ledger.snapshot(); assert.equal(state.issued.ordinary, 47);
  assert.equal(state.outstanding.ordinary, 0); assert.equal(state.redeemed.ordinary, 47);
});
test('advertiser collects bound evidence without crediting, then redeems exactly once from funded ad units', () => {
  const { ledger, uses, advertiser, recipient, mint } = fixture();
  const input = mint(advertiser, 20, 'advertising'), info = campaign(uses, advertiser);
  const { offer, claim } = proof(advertiser, recipient, input, info), before = ledger.snapshot();
  const collected = uses.collectAdvertisingProof(info.ref, offer, claim);
  assert.equal(collected.status, 'collected'); assert.deepEqual(ledger.snapshot(), before);
  assert.deepEqual(uses.collectAdvertisingProof(info.ref, offer, claim), collected);
  const receipt = uses.redeemAdvertisingProof(collected.proofId, NOW);
  assert.deepEqual(receipt.outputs.map(o => o.amount), [7, 13]);
  assert.strictEqual(uses.redeemAdvertisingProof(collected.proofId, NOW), receipt);
  assert.deepEqual(uses.campaignStatus(info.ref), { budget: 10, paid: 7, remaining: 3 });
  assert.equal(ledger.snapshot().issued.advertising, ledger.snapshot().outstanding.advertising);
});
test('advertising collection rejects campaign/action/recipient substitution and cannot use ordinary funding', () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const ordinary = mint(advertiser), info = campaign(uses, advertiser), other = campaign(uses, advertiser, 10, 'other');
  const { offer, claim } = proof(advertiser, recipient, ordinary, info);
  assert.throws(() => uses.collectAdvertisingProof(other.ref, offer, claim), /campaign/);
  const falseAction = { ...info, actionHash: digest('different action') }, mismatch = proof(advertiser, recipient, ordinary, falseAction);
  assert.throws(() => uses.collectAdvertisingProof(info.ref, mismatch.offer, mismatch.claim), /action/);
  assert.throws(() => uses.collectAdvertisingProof(info.ref, offer, sign(domain('advertising', 'claim'), claim.body, creator)), /recipient/);
  const collected = uses.collectAdvertisingProof(info.ref, offer, claim);
  assert.throws(() => uses.redeemAdvertisingProof(collected.proofId, NOW), /currency/);
  assert.equal(uses.campaignStatus(info.ref).paid, 0); assert.equal(ledger.snapshot().outstanding.ordinary, 7);
});
test('rejected expired campaign proofs cannot be revived by rolling the application clock backward', () => {
  const { ledger, uses, advertiser, recipient, mint } = fixture();
  const input = mint(advertiser, 20, 'advertising'), info = campaign(uses, advertiser);
  const { offer, claim } = proof(advertiser, recipient, input, info);
  const collected = uses.collectAdvertisingProof(info.ref, offer, claim), before = ledger.snapshot();
  assert.throws(() => uses.redeemAdvertisingProof(collected.proofId, EXPIRY), /expired/);
  assert.throws(() => uses.redeemAdvertisingProof(collected.proofId, NOW), /clock rollback/);
  assert.deepEqual(ledger.snapshot(), before); assert.equal(uses.campaignStatus(info.ref).paid, 0);
});
test('campaign budget and recipient uniqueness hold across competing collected proofs', async () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const a = mint(advertiser, 20, 'advertising', 'a'), b = mint(advertiser, 20, 'advertising', 'b');
  const info = campaign(uses, advertiser, 10);
  const first = proof(advertiser, recipient, a, info, '1'), second = proof(advertiser, creator, b, info, '2');
  const ids = [first, second].map(p => uses.collectAdvertisingProof(info.ref, p.offer, p.claim).proofId);
  const results = await Promise.allSettled(ids.map(ref => Promise.resolve().then(() => uses.redeemAdvertisingProof(ref, NOW))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(uses.campaignStatus(info.ref).paid, 7);
  assert.equal(ledger.snapshot().outstanding.advertising, 40);
  const duplicate = proof(advertiser, recipient, b, info, '3');
  const duplicateId = uses.collectAdvertisingProof(info.ref, duplicate.offer, duplicate.claim).proofId;
  assert.throws(() => uses.redeemAdvertisingProof(duplicateId, NOW), /already rewarded/);
});
test('subscription releases no token until a pending payment becomes settled spendable credit', () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const input = mint(advertiser), product = subscribe(uses, creator);
  const pending = uses.receivePromise(sign(domain('ordinary', 'transfer'), { id: 'later', kind: 'ordinary', inputs: [input.ref], outputs: [{ owner: recipient.publicKey, amount: 7 }] }, advertiser));
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, pending.promiseId, product.service), NOW), /not settled/);
  assert.deepEqual(uses.subscriptionStatus(product.id, product.epoch), { issued: 0, remaining: 1 });
  const settled = uses.settlePromise(pending.promiseId, NOW);
  const paid = payment(recipient, settled.receipt.outputs[0].ref, product.service);
  const token = uses.releaseSubscription(product.id, product.epoch, paid, NOW);
  assert.equal(token.token, 'dummy:november-membership'); assert.equal(token.creator, creator.publicKey);
  assert.strictEqual(uses.releaseSubscription(product.id, product.epoch, paid, NOW), token);
  assert.deepEqual(uses.subscriptionStatus(product.id, product.epoch), { issued: 1, remaining: 0 });
  assert.equal(ledger.snapshot().redeemed.ordinary, 7);
});
test('subscription oversubscription races release only one token and debit only its verified funds', async () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const a = mint(advertiser, 7, 'ordinary', 'a'), b = mint(recipient, 7, 'ordinary', 'b'), product = subscribe(uses, creator);
  const ops = [payment(advertiser, a.ref, product.service), payment(recipient, b.ref, product.service)];
  const results = await Promise.allSettled(ops.map(op => Promise.resolve().then(() => uses.releaseSubscription(product.id, product.epoch, op, NOW))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(ledger.snapshot().redeemed.ordinary, 7); assert.equal(ledger.snapshot().outstanding.ordinary, 7);
  assert.deepEqual(uses.subscriptionStatus(product.id, product.epoch), { issued: 1, remaining: 0 });
});
test('subscription price, creator/month purpose, expiry and ordinary-currency checks fail before token release', () => {
  const { ledger, uses, advertiser, recipient, creator, mint } = fixture();
  const underpaid = mint(recipient, 6), ordinary = mint(recipient, 7, 'ordinary', 'full');
  const ad = mint(recipient, 7, 'advertising', 'ad'), product = subscribe(uses, creator);
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, underpaid.ref, product.service), NOW), /price/);
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, ordinary.ref, subscriptionService(product.id, '2026-12', creator.publicKey)), NOW), /purpose/);
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, ordinary.ref, subscriptionService(product.id, product.epoch, advertiser.publicKey)), NOW), /purpose/);
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, ad.ref, product.service, 'ad-pay', 'advertising'), NOW));
  const before = ledger.snapshot();
  assert.throws(() => uses.releaseSubscription(product.id, product.epoch, payment(recipient, ordinary.ref, product.service), EXPIRY), /expired/);
  assert.deepEqual(ledger.snapshot(), before);
  assert.deepEqual(uses.subscriptionStatus(product.id, product.epoch), { issued: 0, remaining: 1 });
});
