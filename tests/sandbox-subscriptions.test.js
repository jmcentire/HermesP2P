'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { generateIdentity } = require('../sandbox/signatures');
const { WEEK, monthStart, utcMonth, negotiationWindow, publisherMessage, readPublisherMessage, MonthlySymmetricChannel } = require('../sandbox/subscriptions');
test('publisher-only channels require configured publisher and bind channel and month', () => {
  const publisher = generateIdentity(), attacker = generateIdentity();
  const body = { channel: 'news', epoch: '2026-11', id: 'post', text: 'sandbox broadcast' };
  const policy = { channel: 'news', publisher: publisher.publicKey, epoch: '2026-11' };
  const envelope = publisherMessage(body, publisher);
  assert.equal(readPublisherMessage(envelope, policy), body.text);
  assert.throws(() => readPublisherMessage(publisherMessage(body, attacker), policy), /publisher/);
  assert.throws(() => readPublisherMessage(envelope, { ...policy, channel: 'other' }), /scope/);
  assert.throws(() => readPublisherMessage(envelope, { ...policy, epoch: '2026-12' }), /scope/);
  envelope.body.text = 'tampered'; assert.throws(() => readPublisherMessage(envelope, policy), /signature/);
});
test('monthly symmetric keys rotate, authenticate metadata and fail without the current key', () => {
  const channel = new MonthlySymmetricChannel('private'), oldKey = randomBytes(32).toString('base64'), newKey = randomBytes(32).toString('base64');
  channel.addEpoch('2026-10', oldKey);
  const old = channel.seal('old month', 'old', monthStart('2026-10'));
  assert.equal(channel.open(old), 'old month');
  assert.throws(() => channel.seal('new month', 'new', monthStart('2026-11')), /current/);
  assert.throws(() => channel.addEpoch('2026-11', oldKey), /rotate/);
  channel.addEpoch('2026-11', newKey);
  const newer = channel.seal('new month', 'new', monthStart('2026-11'));
  assert.equal(channel.open(newer), 'new month');
  for (const change of [{ id: 'other' }, { channel: 'other' }, { epoch: '2026-10' }, { tag: randomBytes(16).toString('base64') }]) assert.throws(() => channel.open({ ...newer, ...change }));
  assert.throws(() => channel.addEpoch('2026-12', 'bad'));
  const revoked = new MonthlySymmetricChannel('private'); revoked.addEpoch('2026-10', oldKey);
  assert.throws(() => revoked.open(newer), /unavailable/);
  assert.equal(revoked.open(old), 'old month'); // Rotation cannot retroactively revoke known keys.
  assert.equal(channel.open(newer), channel.open(newer)); // AEAD alone does not prevent replay.
});
test('UTC negotiation window includes exactly seven days either side of month boundary', () => {
  for (const epoch of ['2026-11', '2027-01', '2028-03']) {
    const boundary = monthStart(epoch);
    assert.equal(negotiationWindow(epoch, boundary - WEEK), true);
    assert.equal(negotiationWindow(epoch, boundary + WEEK), true);
    assert.equal(negotiationWindow(epoch, boundary - WEEK - 1), false);
    assert.equal(negotiationWindow(epoch, boundary + WEEK + 1), false);
    assert.equal(utcMonth(boundary), epoch);
  }
  for (const epoch of ['2026-00', '2026-13', '2026-1', 'invalid']) assert.throws(() => monthStart(epoch));
});
test('composed publisher subscription requires both monthly key and configured publisher signature', () => {
  const publisher = generateIdentity(), subscriber = new MonthlySymmetricChannel('paid-news');
  const sender = new MonthlySymmetricChannel('paid-news'), key = randomBytes(32).toString('base64');
  sender.addEpoch('2026-11', key); subscriber.addEpoch('2026-11', key);
  const envelope = sender.sealPublisherMessage('members broadcast', 'post', publisher, monthStart('2026-11'));
  assert.equal(subscriber.openPublisherMessage(envelope, publisher.publicKey), 'members broadcast');
  const outsider = new MonthlySymmetricChannel('paid-news');
  assert.throws(() => outsider.openPublisherMessage(envelope, publisher.publicKey), /unavailable/);
});
test('a subscriber with the monthly key cannot forge or impersonate the configured publisher', () => {
  const publisher = generateIdentity(), attacker = generateIdentity(), channel = new MonthlySymmetricChannel('paid-news');
  channel.addEpoch('2026-11', randomBytes(32).toString('base64'));
  const now = monthStart('2026-11');
  const impersonated = channel.sealPublisherMessage('fake', 'fake', attacker, now);
  assert.throws(() => channel.openPublisherMessage(impersonated, publisher.publicKey), /publisher/);
  const original = channel.sealPublisherMessage('original', 'original', publisher, now);
  const signed = JSON.parse(channel.open(original)); signed.body.text = 'forged';
  const forged = channel.seal(JSON.stringify(signed), 'original', now);
  assert.throws(() => channel.openPublisherMessage(forged, publisher.publicKey), /signature/);
});
test('composed subscription rejects rewrapping across month, channel or message ID', () => {
  const publisher = generateIdentity(), source = new MonthlySymmetricChannel('paid-news');
  source.addEpoch('2026-11', randomBytes(32).toString('base64'));
  source.addEpoch('2026-12', randomBytes(32).toString('base64'));
  const original = source.sealPublisherMessage('bound message', 'post', publisher, monthStart('2026-11'));
  const inner = source.open(original);
  const nextMonth = source.seal(inner, 'post', monthStart('2026-12'));
  assert.throws(() => source.openPublisherMessage(nextMonth, publisher.publicKey), /scope/);
  const differentId = source.seal(inner, 'different', monthStart('2026-11'));
  assert.throws(() => source.openPublisherMessage(differentId, publisher.publicKey), /id mismatch/);
  const other = new MonthlySymmetricChannel('other-news'); other.addEpoch('2026-11', randomBytes(32).toString('base64'));
  const otherChannel = other.seal(inner, 'post', monthStart('2026-11'));
  assert.throws(() => other.openPublisherMessage(otherChannel, publisher.publicKey), /scope/);
});
test('composed subscription rotates at UTC month boundary without revoking known historical keys', () => {
  const publisher = generateIdentity(), sender = new MonthlySymmetricChannel('paid-news');
  const oldSubscriber = new MonthlySymmetricChannel('paid-news'), oldKey = randomBytes(32).toString('base64');
  sender.addEpoch('2026-11', oldKey); oldSubscriber.addEpoch('2026-11', oldKey);
  const old = sender.sealPublisherMessage('November', 'nov', publisher, monthStart('2026-11'));
  assert.throws(() => sender.addEpoch('2026-12', oldKey), /rotate/);
  assert.throws(() => sender.sealPublisherMessage('December', 'dec', publisher, monthStart('2026-12')), /current/);
  sender.addEpoch('2026-12', randomBytes(32).toString('base64'));
  const newer = sender.sealPublisherMessage('December', 'dec', publisher, monthStart('2026-12'));
  assert.equal(sender.openPublisherMessage(newer, publisher.publicKey), 'December');
  assert.throws(() => oldSubscriber.openPublisherMessage(newer, publisher.publicKey), /unavailable/);
  assert.equal(oldSubscriber.openPublisherMessage(old, publisher.publicKey), 'November');
});
