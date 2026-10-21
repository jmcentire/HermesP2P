import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import base64js from 'base64-js';
vi.mock('../static/js/network-panel.js', () => ({ addTrafficEntry: vi.fn() }));
let network, payload, valid, received, sockets;
const enc = x => base64js.fromByteArray(x);
const identity = nacl.sign.keyPair();
function message(overrides = {}) {
  const value = {version:2,id:'test-id',type:'public',timestamp:Date.now(),ttl:86400,
    to:'General',from:{name:enc(identity.publicKey),proofKey:enc(identity.publicKey)},message:'hello',...overrides};
  value.signature=enc(nacl.sign.detached(new TextEncoder().encode(payload(value)),identity.secretKey));
  return value;
}
beforeAll(async () => {
  globalThis.window={nacl, location:{origin:'http://localhost',protocol:'http:',host:'localhost'}};
  globalThis.base64js=base64js;
  ({signingPayload:payload,validEnvelope:valid}=await import('../static/js/envelope.js'));
  network=await import('../static/js/network.js');
});
beforeEach(() => {
  vi.useFakeTimers(); sockets=[]; received=vi.fn();
  globalThis.WebSocket=class { constructor(url){this.url=url;sockets.push(this);this.protocol='hp2p.v2';this.send=vi.fn();} close(){} };
  network.initializeNetwork(received,vi.fn(),()=>({nodes:[]})); sockets[0].onopen();
});
afterEach(()=>vi.useRealTimers());
function deliver(value){sockets[0].onmessage({data:JSON.stringify(value)});}
describe('authenticated receive boundary',()=>{
  it('accepts a signed envelope only once',()=>{const m=message();deliver(m);deliver(m);expect(received).toHaveBeenCalledTimes(1);});
  it.each(['id','to','timestamp','ttl','type','message'])('rejects changed signed %s',field=>{
    const m=message();m[field]=typeof m[field]==='number'?m[field]+1:m[field]+'changed';deliver(m);expect(received).not.toHaveBeenCalled();
  });
  it('does not let invalid frames poison a later valid ID',()=>{const m=message();deliver({...m,signature:'bad'});deliver(m);expect(received).toHaveBeenCalledTimes(1);});
  it('rejects unsigned, v1, and identity-spoofed direct envelopes',()=>{
    const m=message();delete m.signature;deliver(m);deliver({...message(),version:1});
    const d=message({type:'direct',ttl:300,from:{name:'other',pubKey:enc(nacl.sign.keyPair().publicKey)}});deliver(d);
    expect(received).not.toHaveBeenCalled();
  });
  it('retains replay protection for the full authenticated lifetime',()=>{
    const m=message();deliver(m);vi.advanceTimersByTime(180000);deliver(m);expect(received).toHaveBeenCalledTimes(1);
  });
  it('rejects future, excessive, missing and expired lifetimes',()=>{
    for(const changes of [{timestamp:Date.now()+31000},{ttl:86401},{ttl:0},{ttl:undefined},{timestamp:Date.now()-86400000}]){
      const m=message(changes);expect(valid(m)).toBe(false);deliver(m);
    }
    expect(received).not.toHaveBeenCalled();
  });
  it('rejects oversized and malformed frames',()=>{sockets[0].onmessage({data:'x'.repeat(65537)});deliver([]);deliver(null);expect(received).not.toHaveBeenCalled();});
});

describe('protocol upgrade boundary and offline send feedback',()=>{
  it('does not admit an old relay, retry it, or claim a successful send',()=>{
    const statuses=vi.fn();network.initializeNetwork(received,statuses,()=>({nodes:[]}));
    const old=sockets.at(-1);old.protocol='';old.close=vi.fn();old.onopen();
    expect(network.getConnectedPeerCount()).toBe(0);
    expect(statuses).toHaveBeenCalledWith(expect.any(String),'upgrade');
    expect(old.close).toHaveBeenCalledWith(1000,'Protocol upgrade required');
    const count=sockets.length;vi.advanceTimersByTime(31000);expect(sockets).toHaveLength(count);
    expect(network.broadcastMessage(JSON.stringify(message()))).toBe(false);
  });
  it('retains relay sends without RTC and returns a meaningful send result',()=>{
    expect(network.broadcastMessage(JSON.stringify(message()))).toBe(true);
    expect(sockets[0].send).toHaveBeenCalled();
  });
  it('stops reconnecting when the server explicitly requires an upgrade',()=>{
    sockets[0].onclose({code:1008,reason:'Upgrade required'});
    const count=sockets.length;vi.advanceTimersByTime(31000);
    expect(sockets).toHaveLength(count);expect(network.getConnectedPeerCount()).toBe(0);
  });
});
