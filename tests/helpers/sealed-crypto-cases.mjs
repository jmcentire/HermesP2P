// Shared dummy-data probes; no production source replacement or transport.
import nacl from 'tweetnacl';
import base64js from 'base64-js';
const encode=bytes=>base64js.fromByteArray(bytes);
const change=(value,fn)=>encode(fn(base64js.toByteArray(value)));
const flip=index=>bytes=>{const copy=bytes.slice();copy[index<0?copy.length+index:index]^=1;return copy;};
export const alterations=[
 ['ciphertext tag bit','encrypted',value=>change(value,flip(0))],
 ['ciphertext body bit','encrypted',value=>change(value,flip(16))],
 ['truncated ciphertext','encrypted',value=>change(value,bytes=>bytes.slice(0,-1))],
 ['empty ciphertext','encrypted',()=> ''],
 ['nonce first bit','nonce',value=>change(value,flip(0))],
 ['nonce last bit','nonce',value=>change(value,flip(-1))],
 ['short nonce','nonce',value=>change(value,bytes=>bytes.slice(0,-1))],
 ['long nonce','nonce',value=>change(value,bytes=>new Uint8Array([...bytes,0]))],
 ['empty nonce','nonce',()=> ''],
];
export function makeSealedFixture(api,kind){
 const plaintext='Dummy authenticated text — integrity probe';
 const identity=nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(66));
 const key=encode(new Uint8Array(32).fill(81));
 if(kind==='private'){
  const [encrypted,nonce]=api.encryptChannelMessage(plaintext,key);
  return {plaintext,payload:{encrypted,nonce},decrypt:(module,p)=>module.decryptChannelMessage(p.encrypted,p.nonce,key)};
 }
 if(kind!=='direct')throw new Error('Unknown test kind');
 const [encrypted,nonce,ephemeralPubKey]=api.encryptDirectMessage(plaintext,encode(identity.publicKey));
 return {plaintext,payload:{encrypted,nonce,ephemeralPubKey},decrypt:(module,p)=>module.decryptDirectMessage(p.encrypted,p.nonce,p.ephemeralPubKey,encode(identity.secretKey))};
}
