// A mutation control for the manual fresh-ID tamper probe. Never edits product files.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import nacl from 'tweetnacl';
import base64js from 'base64-js';

globalThis.window = { nacl };
globalThis.base64js = base64js;
const source = new URL('../../static/js/', import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'hp2p-signature-control-'));
try {
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  for (const name of ['crypto.js', 'ttl.js', 'envelope.js']) {
    await writeFile(join(directory, name), await readFile(new URL(name, source)));
  }
  const original = await import(pathToFileURL(join(directory, 'envelope.js')));
  const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(65));
  const publicKey = base64js.fromByteArray(pair.publicKey);
  const frame = { version: 2, id: 'dummy-original', type: 'public', timestamp: Date.now(),
    ttl: 86400, to: 'General', from: { name: publicKey, proofKey: publicKey }, message: 'accept-public-01' };
  frame.signature = base64js.fromByteArray(nacl.sign.detached(new TextEncoder().encode(original.signingPayload(frame)), pair.secretKey));
  const tampered = { ...frame, id: 'tampered-fresh-id', timestamp: Date.now(), message: 'accept-tampered-01' };
  assert.equal(original.validEnvelope(frame), true);
  assert.equal(original.validEnvelope(tampered), false);
  const originalSource = await readFile(new URL('envelope.js', source), 'utf8');
  const guard = 'return verifySignature(signingPayload(message), message.signature, key);';
  assert.equal(originalSource.split(guard).length, 2, 'exactly one signature guard must be mutated');
  await writeFile(join(directory, 'mutant.js'), originalSource.replace(guard, 'return true;'));
  const mutant = await import(pathToFileURL(join(directory, 'mutant.js')));
  assert.equal(mutant.validEnvelope(tampered), true, 'negative probe must detect removal of signature validation');
  console.log('Signature mutation control passed: real guard rejects; temporary mutant accepts.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
