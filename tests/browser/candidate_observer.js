// Observe APIs without editing candidates, SDP, privacy options or signalling.
const browser=new URL(location.href).searchParams.get('browser');
if(!['chrome','safari'].includes(browser))throw new Error('Explicit diagnostic browser label required');
const Native=window.RTCPeerConnection;
let number=0;
const records=[];
const candidateLines=description=>(description?.sdp||'').split(/\r?\n/).filter(v=>v.startsWith('a=candidate:')).map(v=>v.slice(2));
const known=(value,choices)=>choices.includes(value)?value:'other';
const post=(path,value)=>fetch('/__diag__/'+path,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(9000),body:JSON.stringify(value)}).then(r=>{if(!r.ok)throw new Error('diagnostic rejected');return r.json();});
const box=document.createElement('section');box.innerHTML='<h2>Candidate observer v1</h2><div id="candidateFacts"></div>';document.body.append(box);
function say(text){const p=document.createElement('p');p.textContent=text;document.querySelector('#candidateFacts').append(p);}
window.RTCPeerConnection=class extends Native{
 constructor(...args){super(...args);const rec={pc:++number,connection:this,generated:new Set(),applied:new Set(),rejected:0,endEvents:0,midMatch:true,ufragMatch:true};records.push(rec);
  this.addEventListener('icecandidate',event=>{const c=event.candidate;if(!c){rec.endEvents++;return;}rec.generated.add(c.candidate);
   const name=c.candidate.split(/\s+/)[4];if(/^[a-fA-F0-9-]{16,64}\.local$/.test(name))void post('resolve',{name,browser,pc:rec.pc}).then(r=>{if(!r.duplicate)say(`pc${rec.pc} exact generated name OS resolution: ${r.resolved?'resolved '+r.families.join(','):'not resolved'+(r.error?' ('+r.error+')':'')}`);}).catch(()=>say(`pc${rec.pc} resolution probe unavailable`));
  });
  for(const at of [2,8,12])setTimeout(()=>void sample(rec,at),at*1000);
 }
 async addIceCandidate(candidate){const rec=records.find(r=>r.connection===this);
  try{const result=await super.addIceCandidate(candidate);if(candidate?.candidate){rec.applied.add(candidate.candidate);const sdp=this.remoteDescription?.sdp||'';
   rec.midMatch&&=candidate.sdpMid==null||sdp.split(/\r?\n/).includes('a=mid:'+candidate.sdpMid);
   rec.ufragMatch&&=candidate.usernameFragment==null||sdp.split(/\r?\n/).includes('a=ice-ufrag:'+candidate.usernameFragment);
  }return result;}catch(error){rec.rejected++;throw error;}
 }
};
async function sample(rec,at){const pc=rec.connection;if(pc.connectionState==='closed')return;
 try{const stats=await pc.getStats();if(pc.connectionState==='closed')return;const counts={localStats:0,remoteStats:0,pairs:0,localHostUdp:0,localHostTcp:0,otherLocal:0};
  stats.forEach(s=>{if(s.type==='local-candidate'){counts.localStats++;counts[s.candidateType==='host'&&s.protocol==='udp'?'localHostUdp':s.candidateType==='host'&&s.protocol==='tcp'?'localHostTcp':'otherLocal']++;}if(s.type==='remote-candidate')counts.remoteStats++;if(s.type==='candidate-pair')counts.pairs++;});
  const ice=pc.sctp?.transport?.iceTransport;
  const others=records.filter(r=>r!==rec);
  const allDelivered=others.length===1?[...others[0].generated].every(c=>rec.applied.has(c)||candidateLines(pc.remoteDescription).includes(c)):-1;
  const value={browser,pc:rec.pc,at,ice:known(pc.iceConnectionState,['new','checking','connected','completed','failed','disconnected','closed']),connection:known(pc.connectionState,['new','connecting','connected','failed','disconnected','closed']),policy:known(pc.getConfiguration().iceTransportPolicy,['all','relay']),generated:rec.generated.size,applied:rec.applied.size,rejected:rec.rejected,endEvents:rec.endEvents,localSdp:candidateLines(pc.localDescription).length,remoteSdp:candidateLines(pc.remoteDescription).length,remoteApi:ice?.getRemoteCandidates?ice.getRemoteCandidates().length:-1,localApi:ice?.getLocalCandidates?ice.getLocalCandidates().length:-1,midMatch:rec.midMatch,ufragMatch:rec.ufragMatch,allDelivered,...counts};
  await post('snapshot',value);say(`pc${rec.pc} at ${at}s ${JSON.stringify(value)}`);
 }catch{say(`pc${rec.pc} snapshot unavailable`);}
}
if(location.pathname.startsWith('/__test__/'))await import('/__test__/contexts.js?v=3');
else await import('/__diag__/connectivity.js?v=3');
