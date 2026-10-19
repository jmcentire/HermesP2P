// Setup-only passive counts: never persist addresses, candidates, SDP or identity keys.
const credentials=JSON.parse(sessionStorage.getItem('hp2pUiTest')||'null');
if(!credentials)throw new Error('Disposable test setup required');
const Native=window.RTCPeerConnection;
let number=0;
const lines=d=>(d?.sdp||'').split(/\r?\n/).filter(v=>v.startsWith('a=candidate:')).length;
window.RTCPeerConnection=class extends Native{
 constructor(...args){super(...args);const pc=++number,record={generated:0,applied:0,rejected:0},channels=[];
  this.addEventListener('icecandidate',e=>{if(e.candidate)record.generated++;});
  this.addEventListener('datachannel',e=>channels.push(e.channel));
  const create=this.createDataChannel.bind(this);this.createDataChannel=(...a)=>{const c=create(...a);channels.push(c);return c;};
  const add=this.addIceCandidate.bind(this);this.addIceCandidate=async c=>{try{const result=await add(c);if(c?.candidate)record.applied++;return result;}catch(e){record.rejected++;throw e;}};
  for(const at of [2,12])setTimeout(async()=>{
   let remoteStats=-1,pairs=-1;
   if(this.connectionState!=='closed'){try{const stats=await this.getStats();remoteStats=0;pairs=0;stats.forEach(s=>{if(s.type==='remote-candidate')remoteStats++;if(s.type==='candidate-pair')pairs++;});}catch{}}
   const trace={pc,at,...record,connection:this.connectionState,ice:this.iceConnectionState,localSdp:lines(this.localDescription),remoteSdp:lines(this.remoteDescription),remoteStats,pairs,channelsOpen:channels.filter(c=>c.readyState==='open').length};
   try{await fetch('/__four__/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(3000),body:JSON.stringify({...credentials,trace})});}catch{}
  },at*1000);
 }
};
await import('/__ui__/observe.js?v=4');
