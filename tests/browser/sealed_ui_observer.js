// Test-only crafted corruption probes through real RTC data channels. Product code is unchanged.
import { signMessage,encryptChannelMessage,encryptDirectMessage,deriveChannelSigner,decryptChannelMessage,decryptDirectMessage } from '/static/js/crypto.js';
import { signingPayload,validEnvelope } from '/static/js/envelope.js';
import { padMessage,unpadMessage } from '/static/js/padding.js';
const credentials=JSON.parse(sessionStorage.getItem('hp2pUiTest')||'null');
if(!credentials||!['A','B'].includes(credentials.role))throw new Error('Dummy pair required');
const nativeRTC=window.RTCPeerConnection,channels=new Set();
const receipts=new Set();
const watch=c=>{if(channels.has(c))return;channels.add(c);c.addEventListener('message',async event=>{
 try{const frame=JSON.parse(new TextDecoder().decode(unpadMessage(new Uint8Array(event.data))));
  const match=/^probe_(private-control|private-ciphertext|private-nonce|direct-control|direct-ciphertext|direct-nonce)_/.exec(frame.id);
  if(!match||!validEnvelope(frame)||receipts.has(match[1]))return;
  receipts.add(match[1]);
  const response=await fetch('/__sealed__/receipt',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(3000),body:JSON.stringify({...credentials,probe:match[1]})});
  if(!response.ok)throw new Error();
  document.querySelector('#sealedReceipts').textContent='Received valid outer probe cases: '+[...receipts].join(', ');
 }catch{document.querySelector('#sealedReceipts').textContent='Receipt observation error; do not accept this run';}
});};
window.RTCPeerConnection=class extends nativeRTC{
 constructor(...args){super(...args);this.addEventListener('datachannel',e=>watch(e.channel));}
 createDataChannel(...args){const c=super.createDataChannel(...args);watch(c);return c;}
};
await import('/__ui__/observe.js?v=4');
const messages=await import('/static/js/messages.js');
const box=document.createElement('aside');box.style.cssText='position:sticky;top:170px;background:#eef;border:2px solid #448;padding:8px;z-index:2001';
box.innerHTML='<strong>Sealed transport probe v2</strong><p>Crafted dummy frames use real crypto and valid outer signatures; no product send or receive code is replaced.</p><div id="sealedButtons"></div><p id="sealedAction">No probes sent</p><p id="sealedReceipts">No probe receipts</p>';
document.body.prepend(box);
const completed=new Set();let busy=false;
const allowed=['private-control','private-ciphertext','private-nonce','direct-control','direct-ciphertext','direct-nonce'];
const record=async value=>{
 const response=await fetch('/__sealed__/probe',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(3000),body:JSON.stringify({...credentials,...value})});
 if(!response.ok)throw new Error('Probe record rejected');
};
for(const name of allowed){
 const button=document.createElement('button');button.textContent='Send '+name+' probe DIRECT';button.disabled=credentials.role!=='A';document.querySelector('#sealedButtons').append(button);
 button.addEventListener('click',async()=>{
  if(busy||completed.has(name))return;busy=true;
  try{
   const ready=await fetch('/__sealed__/ready',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(3000),body:JSON.stringify(credentials)});
   if(!ready.ok)throw new Error('Fresh readiness rejected');
   const status=await fetch('/__ui__/status',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());
   const open=[...channels].filter(c=>c.readyState==='open');
   if(status.forwarding||open.length!==1||Object.keys(status.reports).length!==2||Object.values(status.reports).some(r=>r.open!==1||r.sentWhileForwarding||r.linkLost))throw new Error('Direct-only prerequisites unavailable');
   const config=JSON.parse(sessionStorage.getItem('hp2pConfig'));
   const control=name.endsWith('control');
   const kind=name.startsWith('private')?'private':'direct',field=name.endsWith('nonce')?'nonce':'encrypted';
   const alice=config.user,bobby=config.friends.find(f=>f.name==='Dummy Bobby'),key=config.channels.find(c=>c.name==='SenderRoom')?.key;
   if(alice.name!=='Dummy Alice'||!bobby||!key)throw new Error('Wrong dummy configuration');
   const proof=nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(90));
   const proofKey=base64js.fromByteArray(proof.publicKey),proofSecret=base64js.fromByteArray(proof.secretKey);
   const frame={version:2,id:'probe_'+name+'_'+crypto.randomUUID(),type:kind,timestamp:Date.now(),ttl:300,to:'sealed',from:{name:'Anonymous',proofKey}};
   const signer=kind==='private'?await deriveChannelSigner(alice.privKey,key,'private'):alice;
   const inner={id:frame.id,timestamp:frame.timestamp,ttl:frame.ttl,proofKey,sender:signer.pubKey,text:'sealed-'+name+(control?'-must-display-once':'-must-not-display')};
   if(kind==='direct')inner.recipient=bobby.pubKey;
   inner.signature=signMessage((kind==='private'?messages.privateSigningPayload:messages.directSigningPayload)(inner),signer.privKey);
   let payload;
   if(kind==='private'){const [encrypted,nonce]=encryptChannelMessage(JSON.stringify(inner),key);payload={encrypted,nonce};}
   else{const [encrypted,nonce,ephemeralPubKey]=encryptDirectMessage(JSON.stringify(inner),bobby.pubKey);payload={encrypted,nonce,ephemeralPubKey};}
   const bobSecret=base64js.fromByteArray(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(66)).secretKey);
   const decrypt=p=>kind==='private'?decryptChannelMessage(p.encrypted,p.nonce,key):decryptDirectMessage(p.encrypted,p.nonce,p.ephemeralPubKey,bobSecret);
   if(decrypt(payload)!==JSON.stringify(inner))throw new Error('Positive probe control failed');
   if(!control){const bytes=base64js.toByteArray(payload[field]);bytes[field==='encrypted'?16:0]^=1;payload[field]=base64js.fromByteArray(bytes);
    if(decrypt(payload)!==null)throw new Error('Damaged probe control failed');}
   frame.message=JSON.stringify(payload);frame.signature=signMessage(signingPayload(frame),proofSecret);
   if(!validEnvelope(frame))throw new Error('Invalid outer probe');
   // A fresh ID per probe prevents prior legitimate-frame deduplication masking it.
   open[0].send(padMessage(new TextEncoder().encode(JSON.stringify(frame))));
   completed.add(name);button.disabled=true;
   await record({probe:name,outerValid:true});
   document.querySelector('#sealedAction').textContent='Sent '+name+' with fresh ID and valid outer signature DIRECT; verify receiver raw count and every conversation';
  }catch{document.querySelector('#sealedAction').textContent='Probe failed or outcome uncertain; stop this run and inspect';}
  finally{busy=false;}
 });
}
