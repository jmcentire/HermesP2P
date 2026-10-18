// Separately tests cache admission under pressure. Cryptography is exercised in crypto-integration.test.js.
import { expect, it, vi } from 'vitest';
vi.mock('../static/js/envelope.js',()=>({validEnvelope:()=>true}));
vi.mock('../static/js/network-panel.js',()=>({addTrafficEntry:vi.fn()}));
vi.mock('../static/js/discovery.js',()=>({isProtocolMessage:()=>({isProtocol:false}),handlePeerExchangeRequest:vi.fn(),handlePeerExchangeResponse:vi.fn(),createPeerExchangeResponse:vi.fn(),KnownPeersCache:class{add(){}}}));
it('transport cache pressure never blackouts all later messages or local sends',async()=>{
 vi.useFakeTimers();globalThis.window={location:{origin:'http://localhost',protocol:'http:',host:'localhost'}};
 let socket;globalThis.WebSocket=class{constructor(){socket=this;this.send=vi.fn();}close(){}};
 const {initializeNetwork,broadcastMessage}=await import('../static/js/network.js');
 const received=vi.fn();initializeNetwork(received,()=>{},()=>({}));socket.onopen();
 for(let i=0;i<10002;i++)socket.onmessage({data:JSON.stringify({id:String(i),type:'public',to:'other',from:{name:'untrusted',proofKey:'key'},message:'test',timestamp:Date.now(),ttl:86400})});
 expect(received).toHaveBeenCalledTimes(10002);
 expect(()=>broadcastMessage(JSON.stringify({id:'local',type:'public',from:{proofKey:'key'},timestamp:Date.now(),ttl:86400}))).not.toThrow();
 vi.useRealTimers();
});
