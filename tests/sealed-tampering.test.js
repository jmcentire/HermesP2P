import { beforeAll, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import base64js from 'base64-js';
import { alterations, makeSealedFixture } from './helpers/sealed-crypto-cases.mjs';
vi.mock('../static/js/network.js',()=>({broadcastMessage:vi.fn()}));
vi.mock('../static/js/network-panel.js',()=>({addTrafficEntry:vi.fn()}));
let api,messages,envelope;
const enc=bytes=>base64js.fromByteArray(bytes);
const identity=seed=>{const pair=nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(seed));return {name:'Dummy',pubKey:enc(pair.publicKey),privKey:enc(pair.secretKey)};};
beforeAll(async()=>{
 globalThis.window={nacl};globalThis.base64js=base64js;
 globalThis.document={querySelector:()=>null}; // No DOM rendering; receive-module admission only.
 api=await import('../static/js/crypto.js');
 messages=await import('../static/js/messages.js');envelope=await import('../static/js/envelope.js');
});
for(const kind of ['private','direct'])describe(`${kind} authenticated decryption`,()=>{
 let fixture;
 beforeAll(()=>{fixture=makeSealedFixture(api,kind);});
 it('decrypts the unchanged positive control',()=>expect(fixture.decrypt(api,fixture.payload)).toBe(fixture.plaintext));
 it.each(alterations)('rejects %s without releasing plaintext',(name,field,alter)=>{
  const payload={...fixture.payload,[field]:alter(fixture.payload[field])};
  expect(payload[field]).not.toBe(fixture.payload[field]);
  expect(fixture.decrypt(api,payload)).toBeNull();
  expect(fixture.decrypt(api,fixture.payload)).toBe(fixture.plaintext);
 });
});

// Retain a known disposable proof key so altered ciphertext can have a VALID
// outer signature. Otherwise a passing negative might test only envelope integrity.
async function signedFixture(kind){
 const alice=identity(65),bob=identity(66),proof=identity(67),key=enc(new Uint8Array(32).fill(81));
 const frame={version:2,id:'tamper_'+crypto.randomUUID(),type:kind,timestamp:Date.now(),ttl:300,to:'sealed',from:{name:'Anonymous',proofKey:proof.pubKey}};
 const signer=kind==='private'?await api.deriveChannelSigner(alice.privKey,key,'private'):alice;
 const inner={id:frame.id,timestamp:frame.timestamp,ttl:frame.ttl,proofKey:proof.pubKey,sender:signer.pubKey,text:'dummy receive probe'};
 if(kind==='direct')inner.recipient=bob.pubKey;
 inner.signature=api.signMessage((kind==='private'?messages.privateSigningPayload:messages.directSigningPayload)(inner),signer.privKey);
 let payload;
 if(kind==='private'){
  const [encrypted,nonce]=api.encryptChannelMessage(JSON.stringify(inner),key);payload={encrypted,nonce};
 }else{
  const [encrypted,nonce,ephemeralPubKey]=api.encryptDirectMessage(JSON.stringify(inner),bob.pubKey);payload={encrypted,nonce,ephemeralPubKey};
 }
 const signed=p=>{const value={...frame,message:JSON.stringify(p)};value.signature=api.signMessage(envelope.signingPayload(value),proof.privKey);return value;};
 return {payload,signed,receiver:{user:bob,channels:[{name:'Receiver room',key}],friends:[{name:'Dummy Alice',pubKey:alice.pubKey}]}};
}
for(const kind of ['private','direct'])for(const field of ['encrypted','nonce'])it(`${kind} receive rejects altered ${field} despite valid outer signature, then accepts original once`,async()=>{
 const {payload,signed,receiver}=await signedFixture(kind);
 const alter=alterations.find(row=>row[1]===field)[2];
 const bad=signed({...payload,[field]:alter(payload[field])}),good=signed(payload);
 expect(envelope.validEnvelope(bad)).toBe(true);expect(envelope.validEnvelope(good)).toBe(true);
 expect(messages.handleIncomingNetworkMessage('dummy',bad,receiver)).not.toBe(true);
 // Same id and timestamp: rejection must not consume the legitimate message.
 expect(messages.handleIncomingNetworkMessage('dummy',good,receiver)).toBe(true);
 expect(messages.handleIncomingNetworkMessage('dummy',good,receiver)).not.toBe(true);
});
