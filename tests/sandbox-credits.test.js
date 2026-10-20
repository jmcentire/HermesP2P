'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DummyCreditAuthority, domain, FEE_BASIS_POINTS } = require('../sandbox/credits');
const { generateIdentity, sign, digest } = require('../sandbox/signatures');
const NOW = 1700000000000, EXPIRY = NOW + 10000;
function setup() {
  const issuer = generateIdentity(), alice = generateIdentity(), bob = generateIdentity();
  const ledger = new DummyCreditAuthority(issuer.publicKey);
  function mint(kind = 'ordinary', amount = 47, id = 'mint', owner = alice) {
    const envelope = sign(domain(kind, 'issue'), { id, kind, owner: owner.publicKey, amount, expiresAt: EXPIRY }, issuer);
    return { envelope, receipt: ledger.issue(envelope, NOW) };
  }
  return { issuer, alice, bob, ledger, mint };
}
function transfer(id, ref, amount, from, to, kind = 'ordinary') {
  return sign(domain(kind, 'transfer'), { id, kind, inputs: [ref], outputs: [{ owner: to.publicKey, amount }] }, from);
}
function conservation(ledger) {
  const s = ledger.snapshot();
  for (const kind of ['ordinary', 'advertising']) assert.equal(s.issued[kind], s.outstanding[kind] + s.redeemed[kind]);
}
test('only issuer-signed dummy issuance is honored; 47 issued cannot become a 50-unit claim', () => {
  const { ledger, alice, bob, mint } = setup();
  const { envelope, receipt } = mint();
  assert.throws(() => ledger.issue(sign(domain('ordinary', 'issue'), { ...envelope.body, id: 'fake' }, alice), NOW), /issuer/);
  assert.throws(() => ledger.transfer(transfer('excess', receipt.outputs[0].ref, 50, alice, bob), NOW), /conserved/);
  assert.equal(ledger.snapshot().outstanding.ordinary, 47);
  assert.deepEqual(FEE_BASIS_POINTS, { ordinary: 500, advertising: 2000 });
  conservation(ledger);
});
test('signed provenance, owner, currency and signature domain are enforced', () => {
  const { ledger, alice, bob, mint } = setup();
  const { receipt } = mint(); const ref = receipt.outputs[0].ref;
  assert.throws(() => ledger.transfer(transfer('wrong-owner', ref, 47, bob, bob), NOW), /owner/);
  assert.throws(() => ledger.transfer(transfer('wrong-kind', ref, 47, alice, bob, 'advertising'), NOW), /currency/);
  assert.throws(() => ledger.transfer(transfer('wrong-ref', ref.replace(/.$/, 'x'), 47, alice, bob), NOW), /provenance/);
  const good = transfer('good', ref, 47, alice, bob);
  assert.throws(() => ledger.transfer(sign(domain('advertising', 'transfer'), good.body, alice), NOW), /signature/);
  good.body.outputs[0].amount = 50;
  assert.throws(() => ledger.transfer(good, NOW), /signature/);
  conservation(ledger);
});
test('atomic retries survive expiry; changed operation id content is rejected', () => {
  const { ledger, alice, bob, mint } = setup(); const { envelope, receipt } = mint();
  const op = transfer('move', receipt.outputs[0].ref, 47, alice, bob), moved = ledger.transfer(op, NOW);
  assert.throws(() => ledger.transfer(transfer('move', receipt.outputs[0].ref, 46, alice, bob), NOW), /conflicting/);
  assert.throws(() => ledger.transfer(transfer('fork', receipt.outputs[0].ref, 47, alice, bob), NOW), /spent/);
  assert.strictEqual(ledger.issue(envelope, EXPIRY + 1), receipt);
  assert.strictEqual(ledger.transfer(op, EXPIRY + 1), moved);
  assert.equal(ledger.snapshot().outstanding.ordinary, 47); conservation(ledger);
});
test('valid split and merge preserve provenance and rejected operations do not reserve IDs', () => {
  const { ledger, alice, bob, mint } = setup(); const { receipt } = mint();
  const ref = receipt.outputs[0].ref;
  assert.throws(() => ledger.transfer(transfer('reusable', ref, 48, alice, bob), NOW));
  const body = { id: 'reusable', kind: 'ordinary', inputs: [ref], outputs: [{ owner: bob.publicKey, amount: 20 }, { owner: bob.publicKey, amount: 27 }] };
  const split = ledger.transfer(sign(domain('ordinary', 'transfer'), body, alice), NOW);
  assert.notEqual(split.outputs[0].ref, split.outputs[1].ref);
  assert.throws(() => { split.outputs[0].amount = 100; }, TypeError);
  const merged = ledger.transfer(sign(domain('ordinary', 'transfer'), { id: 'merge', kind: 'ordinary', inputs: split.outputs.map(o => o.ref), outputs: [{ owner: alice.publicKey, amount: 47 }] }, bob), NOW);
  assert.equal(merged.outputs[0].amount, 47); conservation(ledger);
});
test('issuance and output-total overflow fail atomically', () => {
  const { ledger, alice, bob, mint } = setup();
  const { receipt } = mint('ordinary', Number.MAX_SAFE_INTEGER);
  assert.throws(() => mint('ordinary', 1, 'overflow'));
  const body = { id: 'overflow', kind: 'ordinary', inputs: [receipt.outputs[0].ref], outputs: [{ owner: bob.publicKey, amount: Number.MAX_SAFE_INTEGER }, { owner: bob.publicKey, amount: 1 }] };
  assert.throws(() => ledger.transfer(sign(domain('ordinary', 'transfer'), body, alice), NOW), /integer/);
  assert.equal(ledger.snapshot().outstanding.ordinary, Number.MAX_SAFE_INTEGER); conservation(ledger);
});
test('expiry cannot be extended by transferring and boundary is exclusive', () => {
  const { ledger, alice, bob, mint } = setup(); const { receipt } = mint();
  const moved = ledger.transfer(transfer('move', receipt.outputs[0].ref, 47, alice, bob), EXPIRY - 1);
  assert.equal(moved.outputs[0].expiresAt, EXPIRY);
  assert.throws(() => ledger.transfer(transfer('late', moved.outputs[0].ref, 47, bob, alice), EXPIRY), /expired/);
  conservation(ledger);
});
test('duplicate inputs, unsafe units and malformed keys fail closed without consuming balance', () => {
  const { ledger, issuer, alice, bob, mint } = setup(); const { receipt } = mint(); const ref = receipt.outputs[0].ref;
  for (const amount of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, -1, NaN, Infinity, '47']) {
    assert.throws(() => ledger.transfer(transfer('bad', ref, amount, alice, bob), NOW));
  }
  const base = { id: 'bad', kind: 'ordinary', inputs: [ref, ref], outputs: [{ owner: bob.publicKey, amount: 94 }] };
  assert.throws(() => ledger.transfer(sign(domain('ordinary', 'transfer'), base, alice), NOW), /duplicate/);
  assert.throws(() => ledger.transfer(sign(domain('ordinary', 'transfer'), { ...base, inputs: [ref], outputs: [{ owner: 'bad', amount: 47 }] }, alice), NOW));
  assert.throws(() => ledger.issue(sign(domain('ordinary', 'issue'), { id: 'bad-key', kind: 'ordinary', owner: 'bad', amount: 1, expiresAt: EXPIRY }, issuer), NOW));
  assert.throws(() => ledger.transfer(sign(domain('ordinary', 'transfer'), { ...base, unexpected: true }, alice), NOW), /fields/);
  assert.equal(ledger.snapshot().outstanding.ordinary, 47); conservation(ledger);
});
test('two competing spends serialize at the single authority; duplicate redemption and lost reply retry are safe', async () => {
  const { ledger, alice, bob, mint } = setup(); const { receipt } = mint();
  const ops = ['first', 'second'].map(id => transfer(id, receipt.outputs[0].ref, 47, alice, bob));
  const outcomes = await Promise.allSettled(ops.map(op => Promise.resolve().then(() => ledger.transfer(op, NOW))));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  const moved = outcomes.find(o => o.status === 'fulfilled').value;
  const op = sign(domain('ordinary', 'redeem'), { id: 'redeem', kind: 'ordinary', inputs: [moved.outputs[0].ref], service: 'dummy-storage' }, bob);
  const redemption = ledger.redeem(op, NOW); assert.equal(redemption.redeemed, 47);
  assert.strictEqual(ledger.redeem(op, NOW), redemption);
  assert.throws(() => ledger.redeem(sign(domain('ordinary', 'redeem'), { ...op.body, id: 'duplicate' }, bob), NOW), /spent/);
  assert.equal(ledger.snapshot().outstanding.ordinary, 0); conservation(ledger);
});
function rewardPair(alice, bob, ref, overrides = {}, claimOverrides = {}) {
  const offer = sign(domain('advertising', 'offer'), {
    id: 'offer', kind: 'advertising', inputs: [ref], recipient: bob.publicKey, amount: 7,
    expiresAt: EXPIRY - 1, requirementsHash: digest('watch dummy video'), challenge: 'one-use-challenge', ...overrides
  }, alice);
  const claim = sign(domain('advertising', 'claim'), {
    id: 'claim', offerHash: digest(offer), challenge: offer.body.challenge, evidenceHash: digest('synthetic evidence, NOT attention'), ...claimOverrides
  }, bob);
  return { offer, claim };
}
test('advertising rewards conserve designated supply and bind signed offer, recipient, challenge and evidence', () => {
  const { ledger, alice, bob, mint } = setup(); const { receipt } = mint('advertising', 20);
  const { offer, claim } = rewardPair(alice, bob, receipt.outputs[0].ref);
  const rewarded = ledger.reward(offer, claim, NOW);
  assert.deepEqual(rewarded.outputs.map(o => o.amount), [7, 13]);
  assert.throws(() => ledger.reward(offer, sign(domain('advertising', 'claim'), { ...claim.body, evidenceHash: digest('changed') }, bob), NOW), /conflicting/);
  const next = rewardPair(alice, bob, rewarded.outputs[1].ref, { id: 'next-offer' });
  assert.throws(() => ledger.reward(next.offer, next.claim, NOW), /claim replay/);
  assert.strictEqual(ledger.reward(offer, claim, EXPIRY + 1), rewarded);
  conservation(ledger);
});
test('ordinary credits, expired offers and transplanted or forged claims cannot fund rewards', () => {
  const { ledger, alice, bob, mint } = setup(); const { receipt } = mint();
  let pair = rewardPair(alice, bob, receipt.outputs[0].ref);
  assert.throws(() => ledger.reward(pair.offer, pair.claim, NOW), /currency/);
  const ad = mint('advertising', 20, 'ad');
  pair = rewardPair(alice, bob, ad.receipt.outputs[0].ref);
  assert.throws(() => ledger.reward(pair.offer, sign(domain('advertising', 'claim'), pair.claim.body, alice), NOW), /recipient/);
  assert.throws(() => ledger.reward(pair.offer, sign(domain('advertising', 'claim'), { ...pair.claim.body, challenge: 'other' }, bob), NOW), /bound/);
  assert.throws(() => ledger.reward(pair.offer, sign(domain('advertising', 'claim'), { ...pair.claim.body, offerHash: digest('other') }, bob), NOW), /bound/);
  const excess = rewardPair(alice, bob, ad.receipt.outputs[0].ref, { amount: 21 });
  assert.throws(() => ledger.reward(excess.offer, excess.claim, NOW), /insufficient/);
  assert.throws(() => ledger.reward(pair.offer, pair.claim, EXPIRY), /expired/);
  conservation(ledger);
});
test('authority rejects clock rollback after rejected expiry without changing monetary state', () => {
  const { ledger, issuer, alice, bob, mint } = setup(); const { receipt } = mint();
  const move = transfer('expired', receipt.outputs[0].ref, 47, alice, bob);
  const before = ledger.snapshot();
  assert.throws(() => ledger.transfer(move, EXPIRY), /expired/);
  assert.throws(() => ledger.transfer(move, NOW), /clock rollback/);
  const issue = sign(domain('ordinary', 'issue'), { id: 'late', kind: 'ordinary', owner: alice.publicKey, amount: 1, expiresAt: EXPIRY + 100 }, issuer);
  assert.throws(() => ledger.issue(issue, NOW), /clock rollback/);
  const redeem = sign(domain('ordinary', 'redeem'), { id: 'late', kind: 'ordinary', inputs: [receipt.outputs[0].ref], service: 'dummy' }, alice);
  assert.throws(() => ledger.redeem(redeem, NOW), /clock rollback/);
  const pair = rewardPair(alice, bob, receipt.outputs[0].ref);
  assert.throws(() => ledger.reward(pair.offer, pair.claim, NOW), /clock rollback/);
  assert.deepEqual(ledger.snapshot(), before);
});
test('operation IDs are scoped by currency, action and signer; provenance remains distinct', () => {
  const { ledger, alice, bob, mint } = setup();
  const a = mint('ordinary', 47, 'op-1', alice), b = mint('ordinary', 20, 'op-2', bob);
  const aa = ledger.transfer(transfer('op-1', a.receipt.outputs[0].ref, 47, alice, alice), NOW);
  const bb = ledger.transfer(transfer('op-1', b.receipt.outputs[0].ref, 20, bob, bob), NOW);
  assert.notEqual(aa.outputs[0].ref, bb.outputs[0].ref);
  assert.throws(() => ledger.transfer(transfer('op-1', aa.outputs[0].ref, 47, alice, bob), NOW), /conflicting/);
  const ad = mint('advertising', 7, 'op-1', alice);
  ledger.transfer(transfer('op-1', ad.receipt.outputs[0].ref, 7, alice, bob, 'advertising'), NOW);
  const redeem = sign(domain('ordinary', 'redeem'), { id: 'op-1', kind: 'ordinary', inputs: [aa.outputs[0].ref], service: 'dummy' }, alice);
  assert.equal(ledger.redeem(redeem, NOW).redeemed, 47);
  conservation(ledger);
});
test('distinct recipients may reuse claim IDs without blocking each other', () => {
  const { ledger, alice, bob, mint } = setup(); const carol = generateIdentity();
  const a = mint('advertising', 20, 'a'), b = mint('advertising', 20, 'b');
  const first = rewardPair(alice, bob, a.receipt.outputs[0].ref);
  const second = rewardPair(alice, carol, b.receipt.outputs[0].ref, { id: 'other-offer' });
  ledger.reward(first.offer, first.claim, NOW);
  ledger.reward(second.offer, second.claim, NOW);
  conservation(ledger);
});
test('seeded adversarial transfer/redeem/replay simulation preserves both supplies at every step', () => {
  const { ledger, alice, bob, mint } = setup();
  const actors = [alice, bob]; mint('ordinary', 47); mint('advertising', 80, 'ad');
  let seed = 0x5eed, rejected = 0, accepted = 0;
  function random(n) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }
  for (let i = 0; i < 600; i++) {
    const snapshot = ledger.snapshot(), candidates = snapshot.unspent;
    if (!candidates.length) break;
    const input = candidates[random(candidates.length)];
    const owner = actors.find(a => a.publicKey === input.owner), target = actors[random(2)];
    const mode = random(8), amount = input.amount + (mode === 0 ? 1 : 0);
    const op = transfer(`sim-${i}`, input.ref, amount, mode === 1 ? actors.find(a => a !== owner) : owner, target, input.kind);
    try {
      if (mode === 2 && i > 580) ledger.redeem(sign(domain(input.kind, 'redeem'), { id: `redeem-${i}`, kind: input.kind, inputs: [input.ref], service: 'dummy' }, owner), NOW);
      else { ledger.transfer(op, NOW); ledger.transfer(op, NOW); }
      accepted++;
    } catch { rejected++; assert.deepEqual(ledger.snapshot(), snapshot); }
    conservation(ledger);
  }
  assert.ok(accepted > 50 && rejected > 50);
});
test('independent authorities demonstrate the explicit restart/double-spend limitation', () => {
  const { issuer, ledger, alice, bob, mint } = setup(); const { envelope, receipt } = mint();
  const restarted = new DummyCreditAuthority(issuer.publicKey);
  restarted.issue(envelope, NOW);
  ledger.transfer(transfer('one', receipt.outputs[0].ref, 47, alice, bob), NOW);
  restarted.transfer(transfer('two', receipt.outputs[0].ref, 47, alice, bob), NOW);
  assert.equal(ledger.snapshot().outstanding.ordinary + restarted.snapshot().outstanding.ordinary, 94);
  // This intentionally exposes the failure; production needs durable shared finality.
});
