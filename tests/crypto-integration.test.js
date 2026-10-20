import { beforeAll, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import base64js from 'base64-js';
vi.mock('../static/js/network.js',()=>({broadcastMessage:vi.fn()}));
vi.mock('../static/js/network-panel.js',()=>({addTrafficEntry:vi.fn()}));
let cryptoModule, messages, envelope, padding, importer;
const enc = b => base64js.fromByteArray(b);
const identity = () => {const k=nacl.sign.keyPair();return {name:'Test user',pubKey:enc(k.publicKey),privKey:enc(k.secretKey)}};
let alice,bob,config;
beforeAll(async()=>{
 globalThis.window={nacl};globalThis.base64js=base64js;
 cryptoModule=await import('../static/js/crypto.js');messages=await import('../static/js/messages.js');
 envelope=await import('../static/js/envelope.js');padding=await import('../static/js/padding.js');
 importer=await import('../static/js/config-import.js');
 alice=identity();bob=identity();config={user:alice,channels:[{name:'PrivateA',key:enc(nacl.randomBytes(32))},{name:'General'}],friends:[{name:'Recipient',pubKey:bob.pubKey}]};
});
const unpack=frame=>JSON.parse(new TextDecoder().decode(padding.unpadMessage(frame)));
it('real crypto hides sender and local recipient names, verifies both signatures and decrypts only for the recipient',async()=>{
 const m=unpack(await messages.packageMessage('dummy secret','direct','Recipient',config));
 expect(envelope.validEnvelope(m)).toBe(true);expect(m.from.pubKey).toBeUndefined();expect(m.to).toBe('sealed');
 const wire=JSON.stringify(m);expect(wire).not.toContain(alice.pubKey);expect(wire).not.toContain('Recipient');expect(wire).not.toContain('dummy secret');
 const cipher=JSON.parse(m.message);
 const inner=JSON.parse(cryptoModule.decryptDirectMessage(cipher.encrypted,cipher.nonce,cipher.ephemeralPubKey,bob.privKey));
 expect(inner.text).toBe('dummy secret');expect(inner.recipient).toBe(bob.pubKey);
 expect(cryptoModule.verifySignature(messages.directSigningPayload(inner),inner.signature,alice.pubKey)).toBe(true);
 expect(cryptoModule.decryptDirectMessage(cipher.encrypted,cipher.nonce,cipher.ephemeralPubKey,alice.privKey)).toBeNull();
 expect(cryptoModule.verifySignature(envelope.signingPayload(m),m.signature,alice.pubKey)).toBe(false);
});
it('private channel payload matches shared key despite different local names and binds envelope replay fields',async()=>{
 const a=unpack(await messages.packageMessage('shared text','private','PrivateA',config));
 const renamed={...config,channels:[{name:'PrivateB',key:config.channels[0].key}]};
 const b=unpack(await messages.packageMessage('shared text','private','PrivateB',renamed));
 expect(a.from.name).toBe(b.from.name);expect(a.to).toBe('sealed');expect(a.from.proofKey).not.toBe(b.from.proofKey);
 const c=JSON.parse(a.message),inner=JSON.parse(cryptoModule.decryptChannelMessage(c.encrypted,c.nonce,renamed.channels[0].key));
 expect(inner).toMatchObject({id:a.id,timestamp:a.timestamp,ttl:a.ttl,proofKey:a.from.proofKey,text:'shared text'});
 expect(cryptoModule.verifySignature(messages.privateSigningPayload(inner),inner.signature,inner.sender)).toBe(true);
 expect(cryptoModule.decryptChannelMessage(c.encrypted,c.nonce,enc(nacl.randomBytes(32)))).toBeNull();
});
it('IDs contain 128 random bits without session counters',async()=>{
 const ids=[];for(let i=0;i<10;i++)ids.push(unpack(await messages.packageMessage('hi','public','General',config)).id);
 expect(new Set(ids).size).toBe(10);ids.forEach(id=>expect(id).toMatch(/^msg_[a-f0-9]{32}$/));
});
it('rejects weak recipient curve points and missing signatures',()=>{
 const weak=new Uint8Array(32);weak[0]=1;
 expect(()=>cryptoModule.encryptDirectMessage('secret',enc(weak))).toThrow();
 expect(()=>cryptoModule.encryptDirectMessage('secret',enc(new Uint8Array(32)))).toThrow();
 expect(()=>cryptoModule.signMessage('hello','')).toThrow();
});
it('local identity import validates key consistency and excludes arbitrary bootstrap targets',()=>{
 expect(importer.validateLocalConfig(config,nacl,base64js).user.pubKey).toBe(alice.pubKey);
 expect(()=>importer.validateLocalConfig({...config,user:{...alice,pubKey:bob.pubKey}},nacl,base64js)).toThrow();
 expect(()=>importer.validateLocalConfig({...config,nodes:['wss://untrusted.example']},nacl,base64js)).toThrow();
 expect(()=>importer.validateLocalConfig({...config,friends:[{name:'Bad',pubKey:bob.pubKey+'!'}]},nacl,base64js)).toThrow();
});

it('re-signed captured sealed frames cannot change proof keys or replay accepted messages',async()=>{
 globalThis.document={querySelector:()=>null};
 for(const type of ['direct','private']) {
  const recipient=type==='direct'?{...config,user:bob,friends:[{name:'Alice friend',pubKey:alice.pubKey}]}:{...config,user:bob};
  const original=unpack(await messages.packageMessage('once only',type,type==='direct'?'Recipient':'PrivateA',config));
  const attacker=nacl.sign.keyPair();const tampered=structuredClone(original);
  tampered.from.proofKey=enc(attacker.publicKey);
  tampered.signature=enc(nacl.sign.detached(new TextEncoder().encode(envelope.signingPayload(tampered)),attacker.secretKey));
  expect(envelope.validEnvelope(tampered)).toBe(true); // Outer self-signing alone is not authentication.
  expect(messages.handleIncomingNetworkMessage('relay',tampered,recipient)).not.toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',original,recipient)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',original,recipient)).not.toBe(true);
 }
});
it('public and private signing domains stay distinct even when public name equals the private key',async()=>{
 const sharedScope=config.channels[0].key;
 const publicSigner=await cryptoModule.deriveChannelSigner(alice.privKey,sharedScope,'public');
 const privateSigner=await cryptoModule.deriveChannelSigner(alice.privKey,sharedScope,'private');
 expect(publicSigner.pubKey).not.toBe(privateSigner.pubKey);
 expect(await cryptoModule.deriveChannelSigner(alice.privKey,sharedScope,'private')).toEqual(privateSigner);
 const publicFrame=unpack(await messages.packageMessage('public','public',sharedScope,config));
 const privateFrame=unpack(await messages.packageMessage('private','private','PrivateA',config));
 const cipher=JSON.parse(privateFrame.message);
 const inner=JSON.parse(cryptoModule.decryptChannelMessage(cipher.encrypted,cipher.nonce,sharedScope));
 expect(publicFrame.from.proofKey).toBe(publicSigner.pubKey);expect(inner.sender).toBe(privateSigner.pubKey);
 expect(publicFrame.from.proofKey).not.toBe(inner.sender);
 await expect(cryptoModule.deriveChannelSigner(alice.privKey,sharedScope)).rejects.toThrow('scope');
});
it('successful outgoing frames suppress own echoes while a separate recipient accepts them once',async()=>{
 globalThis.document={querySelector:()=>null};
 const receiver={...config,user:bob,friends:[{name:'Alice friend',pubKey:alice.pubKey}]};
 for(const [type,target] of [['public','General'],['private','PrivateA'],['direct','Recipient']]) {
  const frame=unpack(await messages.packageMessage('echo check',type,target,config));
  expect(envelope.validEnvelope(frame)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',frame,config)).not.toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',frame,receiver)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',frame,receiver)).not.toBe(true);
 }
});
it('full replay cache admits new traffic and evicts earliest expiry, with bounded replay under pressure',async()=>{
 globalThis.document={querySelector:()=>null};
 const now=Date.now(), clock=vi.spyOn(Date,'now').mockReturnValue(now);
 try {
  const room='Cache pressure', sender={...config,channels:[{name:room}]}, receiver={...sender,user:bob};
  const first=unpack(await messages.packageMessage('long-lived first','public',room,sender));
  const early=unpack(await messages.packageMessage('earliest expiry second','public',room,sender));
  early.ttl=60;
  const signer=await cryptoModule.deriveChannelSigner(alice.privKey,room,'public');
  early.signature=cryptoModule.signMessage(envelope.signingPayload(early),signer.privKey);
  expect(envelope.validEnvelope(first)).toBe(true);expect(envelope.validEnvelope(early)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',first,receiver)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',early,receiver)).toBe(true);
  // Cache-unit pressure fixtures bypass the upstream envelope verifier, which
  // is exercised with real signatures for first/early/newcomer boundaries.
  for(let i=0;i<1998;i++) {
   expect(messages.handleIncomingNetworkMessage('relay',{...first,id:`pressure_${i}`},receiver)).toBe(true);
  }
  const newcomer=unpack(await messages.packageMessage('still live','public',room,sender));
  expect(envelope.validEnvelope(newcomer)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',newcomer,receiver)).toBe(true);
  expect(messages.handleIncomingNetworkMessage('relay',newcomer,receiver)).toBe(false);
  expect(messages.handleIncomingNetworkMessage('relay',first,receiver)).toBe(false);
  expect(messages.handleIncomingNetworkMessage('relay',early,receiver)).toBe(true);
 } finally {clock.mockRestore();}
});
it('public aliases are bound to the verified scoped key, and scope keys differ',async()=>{
 const first=unpack(await messages.packageMessage('one','public','General',config));
 const second=unpack(await messages.packageMessage('two','public','Other room',config));
 expect(first.from.proofKey).not.toBe(second.from.proofKey);expect(first.from.name).toBe(first.from.proofKey);
 const attacker=nacl.sign.keyPair();const forged={...first,from:{...first.from,proofKey:enc(attacker.publicKey)}};
 forged.signature=enc(nacl.sign.detached(new TextEncoder().encode(envelope.signingPayload(forged)),attacker.secretKey));
 expect(envelope.validEnvelope(forged)).toBe(false);
});
it('cross-kind display-name collisions are rejected on import and public receive',async()=>{
 const collision={...config,friends:[{name:'General',pubKey:bob.pubKey}]};
 expect(()=>importer.validateLocalConfig(collision,nacl,base64js)).toThrow();
 globalThis.document={querySelector:()=>null};
 const frame=unpack(await messages.packageMessage('must not appear as DM','public','General',config));
 expect(messages.handleIncomingNetworkMessage('relay',frame,collision)).toBe(false);
});

it('manual channel entry rejects alternate Base64 spellings of the same key', async()=>{
 const {addChannel}=await import('../static/js/config.js');
 globalThis.alert=vi.fn();
 const noncanonical='A'.repeat(42)+'B=';
 expect(base64js.toByteArray(noncanonical).length).toBe(32);
 expect(base64js.fromByteArray(base64js.toByteArray(noncanonical))).not.toBe(noncanonical);
 expect(addChannel('Test canonical',noncanonical,config,null)).toBe(false);
 expect(globalThis.alert).toHaveBeenCalled();
});
